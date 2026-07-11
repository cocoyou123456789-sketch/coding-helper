"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import LearningHub, { type LearningProfile } from "./learning-hub";
import { problemDetails } from "./problem-details";
import { problems, type Problem } from "./problems";

export const dynamic = "force-static";

type LearningStatus = "todo" | "learning" | "solved" | "review";

type StudyRecord = {
  code: string;
  lineNotes: string[];
  thinking: string;
  mistakes: string;
  review: string;
  status: LearningStatus;
};

type StudyRecords = Record<number, StudyRecord>;

type WorkerTestResult = {
  index: number;
  name: string;
  expression: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
  duration: number;
  error: { name?: string; message?: string } | null;
};

type RunState =
  | { phase: "idle"; message: string; results: WorkerTestResult[] }
  | { phase: "running"; message: string; results: WorkerTestResult[] }
  | { phase: "done"; message: string; results: WorkerTestResult[]; duration: number; stdout: string }
  | { phase: "error"; message: string; results: WorkerTestResult[]; stdout?: string };

const STORAGE_KEY = "leetcode-hot100-study-notebook-v1";
const FONT_SIZE_KEY = "leetcode-hot100-font-size-v1";
const PROFILE_KEY = "leetcode-hot100-learning-profile-v1";
const MIN_FONT_SIZE = 16;
const MAX_FONT_SIZE = 24;
const DEFAULT_FONT_SIZE = 18;

const EMPTY_PROFILE: LearningProfile = {
  xp: 0,
  todayXp: 0,
  todayDate: "",
  streak: 0,
  lessons: 0,
  sprintBest: 0,
};

const statusLabels: Record<LearningStatus, string> = {
  todo: "未开始",
  learning: "学习中",
  solved: "已掌握",
  review: "待复习",
};

const difficultyLabels: Record<Problem["difficulty"], string> = {
  简单: "简单",
  中等: "中等",
  困难: "困难",
};

const difficultyClasses: Record<Problem["difficulty"], string> = {
  简单: "easy",
  中等: "medium",
  困难: "hard",
};

function blankRecord(problem: Problem): StudyRecord {
  return {
    code: problem.starterCode,
    lineNotes: [],
    thinking: "",
    mistakes: "",
    review: "",
    status: "todo",
  };
}

function mergeRecord(problem: Problem, record?: Partial<StudyRecord>): StudyRecord {
  return { ...blankRecord(problem), ...record };
}

function explainLine(line: string): string {
  const code = line.trim();
  if (!code) return "空行：把不同代码块分开，让结构更清楚。";
  if (code.startsWith("#")) return "注释：写给人看的提醒，Python 不会执行这一行。";
  if (code.startsWith("class ")) return "定义题目要求的类，判题器会从这里找到你的代码。";
  if (code.startsWith("def ")) return "定义函数，并写清它会接收哪些输入。";
  if (code.startsWith("for ")) return "开始循环：依次处理序列里的每个元素。";
  if (code.startsWith("while ")) return "只要条件成立，就继续重复执行下面缩进的代码。";
  if (code.startsWith("if ")) return "判断一个条件；成立时才执行下面缩进的代码。";
  if (code.startsWith("elif ")) return "前面的条件不成立时，再判断这个条件。";
  if (code === "else:" || code.startsWith("else:")) return "上面的条件都不成立时，执行这里。";
  if (code.startsWith("return ") || code === "return") return "结束函数，并把结果交还给判题器。";
  if (code.startsWith("import ") || code.startsWith("from ")) return "导入 Python 已有的工具，后面的代码可以直接使用。";
  if (code.includes("=")) return "创建或更新变量，保存这一步计算得到的值。";
  if (code.endsWith(":")) return "开始一个新的代码块；下一行需要继续缩进。";
  if (code === "pass") return "占位语句：暂时什么都不做，请用你的解法替换它。";
  return "执行这一条语句。可以补充它读取了什么、改变了什么、得到什么。";
}

function pretty(value: unknown): string {
  if (value === undefined) return "—";
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

function localDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function yesterdayKey(): string {
  const date = new Date();
  date.setDate(date.getDate() - 1);
  return localDateKey(date);
}

export default function Home() {
  const [selectedId, setSelectedId] = useState(problems[0].id);
  const [records, setRecords] = useState<StudyRecords>({});
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("全部题型");
  const [noteTab, setNoteTab] = useState<"line" | "review">("line");
  const [runState, setRunState] = useState<RunState>({ phase: "idle", message: "还没有运行测试", results: [] });
  const [hydrated, setHydrated] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showStatement, setShowStatement] = useState(true);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [appMode, setAppMode] = useState<"path" | "workspace">("path");
  const [profile, setProfile] = useState<LearningProfile>(EMPTY_PROFILE);
  const workerRef = useRef<Worker | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);

  const currentProblem = useMemo(
    () => problems.find((problem) => problem.id === selectedId) ?? problems[0],
    [selectedId],
  );
  const currentRecord = mergeRecord(currentProblem, records[currentProblem.id]);
  const currentDetail = problemDetails[currentProblem.id] ?? {
    statement: currentProblem.summary,
    requirements: ["按照题目给出的输入完成函数。", "返回值或原地修改结果需要符合题目要求。"],
  };
  const codeLines = currentRecord.code.split("\n");
  const fontScale = Math.round((fontSize / MIN_FONT_SIZE) * 100);

  const topics = useMemo(
    () => ["全部题型", ...Array.from(new Set(problems.map((problem) => problem.topic)))],
    [],
  );

  const filteredProblems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return problems.filter((problem) => {
      const matchesTopic = topic === "全部题型" || problem.topic === topic;
      const matchesSearch =
        !keyword ||
        String(problem.id).includes(keyword) ||
        problem.title.toLowerCase().includes(keyword) ||
        problem.topic.toLowerCase().includes(keyword);
      return matchesTopic && matchesSearch;
    });
  }, [search, topic]);

  const solvedCount = problems.filter((problem) => records[problem.id]?.status === "solved").length;
  const learningCount = problems.filter((problem) => records[problem.id]?.status === "learning").length;
  const progress = Math.round((solvedCount / problems.length) * 100);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const saved = window.localStorage.getItem(STORAGE_KEY);
        if (saved) {
          const parsed = JSON.parse(saved) as { records?: StudyRecords; selectedId?: number };
          if (parsed.records) setRecords(parsed.records);
          if (parsed.selectedId && problems.some((problem) => problem.id === parsed.selectedId)) {
            setSelectedId(parsed.selectedId);
          }
        }
        const savedFontSize = Number(window.localStorage.getItem(FONT_SIZE_KEY));
        if (Number.isInteger(savedFontSize) && savedFontSize >= MIN_FONT_SIZE && savedFontSize <= MAX_FONT_SIZE) {
          setFontSize(savedFontSize);
        }
        const savedProfile = window.localStorage.getItem(PROFILE_KEY);
        if (savedProfile) {
          const loaded = { ...EMPTY_PROFILE, ...JSON.parse(savedProfile) } as LearningProfile;
          if (loaded.todayDate !== localDateKey()) {
            loaded.todayXp = 0;
            if (loaded.todayDate !== yesterdayKey()) loaded.streak = 0;
          }
          setProfile(loaded);
        }
      } catch {
        // A damaged local note should not stop the site from opening.
      } finally {
        setHydrated(true);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ records, selectedId }));
    }, 250);
    return () => window.clearTimeout(timer);
  }, [hydrated, records, selectedId]);

  useEffect(() => {
    document.documentElement.style.setProperty("--app-font-size", `${fontSize}px`);
    if (!hydrated) return;
    window.localStorage.setItem(FONT_SIZE_KEY, String(fontSize));
  }, [fontSize, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(profile));
  }, [hydrated, profile]);

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  function updateRecord(patch: Partial<StudyRecord>) {
    setRecords((previous) => ({
      ...previous,
      [currentProblem.id]: {
        ...mergeRecord(currentProblem, previous[currentProblem.id]),
        ...patch,
      },
    }));
  }

  function updateProblemStatus(id: number, status: LearningStatus) {
    const problem = problems.find((item) => item.id === id);
    if (!problem) return;
    setRecords((previous) => {
      const previousStatus = previous[id]?.status;
      const nextStatus = previousStatus === "solved" && status !== "review" ? "solved" : status;
      return {
        ...previous,
        [id]: {
          ...mergeRecord(problem, previous[id]),
          status: nextStatus,
        },
      };
    });
  }

  function earnXp(points: number) {
    setProfile((previous) => {
      const today = localDateKey();
      const isSameDay = previous.todayDate === today;
      const nextStreak = isSameDay
        ? Math.max(1, previous.streak)
        : previous.todayDate === yesterdayKey()
          ? previous.streak + 1
          : 1;
      return {
        ...previous,
        xp: previous.xp + points,
        todayXp: (isSameDay ? previous.todayXp : 0) + points,
        todayDate: today,
        streak: nextStreak,
      };
    });
  }

  function finishLearningLesson() {
    setProfile((previous) => ({ ...previous, lessons: previous.lessons + 1 }));
  }

  function updateSprintBest(score: number) {
    setProfile((previous) => score > previous.sprintBest ? { ...previous, sprintBest: score } : previous);
  }

  function openProblemFromPath(id: number) {
    chooseProblem(id);
    setAppMode("workspace");
  }

  function chooseProblem(id: number) {
    setSelectedId(id);
    setRunState({ phase: "idle", message: "还没有运行测试", results: [] });
    setNoteTab("line");
    setShowStatement(true);
  }

  function updateLineNote(index: number, value: string) {
    const next = [...currentRecord.lineNotes];
    next[index] = value;
    updateRecord({ lineNotes: next });
  }

  function fillLineNotes() {
    updateRecord({
      lineNotes: codeLines.map((line, index) => currentRecord.lineNotes[index] || explainLine(line)),
    });
  }

  function resetCode() {
    if (!window.confirm("确定恢复这道题的初始代码吗？你的逐行解释会保留。")) return;
    updateRecord({ code: currentProblem.starterCode, status: "todo" });
    setRunState({ phase: "idle", message: "代码已恢复，还没有运行测试", results: [] });
  }

  function runTests() {
    if (runState.phase === "running") return;

    workerRef.current?.terminate();
    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const worker = new Worker(`${basePath}/python-worker.js`);
    workerRef.current = worker;
    setRunState({ phase: "running", message: "正在加载 Python 环境…首次运行会稍慢", results: [] });
    updateRecord({ status: currentRecord.status === "solved" ? "solved" : "learning" });

    timeoutRef.current = setTimeout(() => {
      worker.terminate();
      workerRef.current = null;
      setRunState({
        phase: "error",
        message: "运行超过 20 秒，已自动停止。请检查是否写了不会结束的循环。",
        results: [],
      });
    }, 20_000);

    worker.onmessage = (event: MessageEvent) => {
      const data = event.data;
      if (data.type === "status") {
        setRunState((previous) => ({
          phase: "running",
          message: data.message ?? "正在运行…",
          results: previous.results,
        }));
        return;
      }

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      worker.terminate();
      workerRef.current = null;

      if (data.type === "result") {
        const results = (data.results ?? []) as WorkerTestResult[];
        const allPassed = results.length > 0 && results.every((result) => result.passed);
        setRunState({
          phase: "done",
          message: allPassed ? "快速测试全部通过！" : "还有测试没有通过，看看实际结果和预期结果哪里不同。",
          results,
          duration: data.duration ?? 0,
          stdout: data.stdout ?? "",
        });
        if (allPassed) updateRecord({ status: "solved" });
        return;
      }

      setRunState({
        phase: "error",
        message: data.error?.message ?? "代码运行失败，请检查语法和缩进。",
        results: [],
        stdout: data.stdout ?? "",
      });
    };

    worker.onerror = (event) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      worker.terminate();
      workerRef.current = null;
      setRunState({
        phase: "error",
        message: event.message || "无法启动 Python 环境，请检查网络后重试。",
        results: [],
      });
    };

    worker.postMessage({
      id: String(currentProblem.id),
      code: currentRecord.code,
      tests: currentProblem.tests,
    });
  }

  function handleEditorKeyDown(event: React.KeyboardEvent<HTMLTextAreaElement>) {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      runTests();
      return;
    }
    if (event.key !== "Tab") return;
    event.preventDefault();
    const editor = editorRef.current;
    if (!editor) return;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;
    const nextCode = `${currentRecord.code.slice(0, start)}    ${currentRecord.code.slice(end)}`;
    updateRecord({ code: nextCode });
    window.requestAnimationFrame(() => {
      editor.selectionStart = editor.selectionEnd = start + 4;
    });
  }

  return (
    <main className="app-shell">
      <header className="site-header">
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">{"{ }"}</span>
          <div>
            <strong>题解簿</strong>
            <span>LeetCode Hot 100 游戏化学习</span>
          </div>
        </div>

        <div className="header-progress" aria-label={`已掌握 ${solvedCount} 道，共 ${problems.length} 道`}>
          <div className="header-progress-copy">
            <span>学习进度</span>
            <strong>{solvedCount} / {problems.length}</strong>
          </div>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          <b>{progress}%</b>
        </div>

        <div className="header-actions">
          <span className="save-state"><i />笔记自动保存在本机</span>
          <button
            className="button mode-toggle"
            type="button"
            onClick={() => setAppMode((current) => current === "path" ? "workspace" : "path")}
          >
            {appMode === "path" ? "自由刷题" : "学习路径"}
          </button>
          <div className="font-size-control" aria-label="字体大小调节">
            <span>字号</span>
            <button
              type="button"
              aria-label="减小字体"
              onClick={() => setFontSize((current) => Math.max(MIN_FONT_SIZE, current - 1))}
              disabled={fontSize === MIN_FONT_SIZE}
            >
              A−
            </button>
            <input
              type="range"
              min={MIN_FONT_SIZE}
              max={MAX_FONT_SIZE}
              step="1"
              value={fontSize}
              onChange={(event) => setFontSize(Number(event.target.value))}
              aria-label="调整字体大小"
              aria-valuetext={`${fontScale}%`}
            />
            <button
              type="button"
              aria-label="增大字体"
              onClick={() => setFontSize((current) => Math.min(MAX_FONT_SIZE, current + 1))}
              disabled={fontSize === MAX_FONT_SIZE}
            >
              A+
            </button>
            <output aria-live="polite">{fontScale}%</output>
          </div>
          <button className="button button-quiet" type="button" onClick={() => setShowGuide(true)}>新手怎么用</button>
        </div>
      </header>

      {appMode === "path" ? (
        <LearningHub
          problems={problems}
          records={records}
          profile={profile}
          onEarnXp={earnXp}
          onFinishLesson={finishLearningLesson}
          onMarkStatus={updateProblemStatus}
          onOpenProblem={openProblemFromPath}
          onSprintBest={updateSprintBest}
        />
      ) : (
        <div className="workspace">
        <aside className="panel library-panel" aria-label="Hot 100 题单">
          <div className="library-head">
            <div className="section-kicker">LEARNING MAP</div>
            <div className="library-title-row">
              <h1>Hot 100 题单</h1>
              <span>{filteredProblems.length} 题</span>
            </div>
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <span className="sr-only">搜索题目</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索题号或题名" />
            </label>
            <label className="topic-field">
              <span>题型</span>
              <select value={topic} onChange={(event) => setTopic(event.target.value)}>
                {topics.map((item) => <option key={item}>{item}</option>)}
              </select>
            </label>
            <div className="mini-stats" aria-label="学习状态统计">
              <div><strong>{solvedCount}</strong><span>已掌握</span></div>
              <div><strong>{learningCount}</strong><span>学习中</span></div>
              <div><strong>{problems.length - solvedCount}</strong><span>未掌握</span></div>
            </div>
          </div>

          <nav className="problem-list" aria-label="题目列表">
            {filteredProblems.length ? filteredProblems.map((problem) => {
              const record = records[problem.id];
              const status = record?.status ?? "todo";
              return (
                <button
                  type="button"
                  key={problem.id}
                  className={`problem-row ${problem.id === currentProblem.id ? "is-active" : ""}`}
                  onClick={() => chooseProblem(problem.id)}
                  aria-current={problem.id === currentProblem.id ? "page" : undefined}
                >
                  <span className={`status-dot status-${status}`} aria-label={statusLabels[status]} />
                  <span className="problem-number">{problem.id}</span>
                  <span className="problem-name">
                    <strong>{problem.title}</strong>
                    <small>{problem.topic}</small>
                  </span>
                  <span className={`difficulty difficulty-${difficultyClasses[problem.difficulty]}`}>
                    {difficultyLabels[problem.difficulty]}
                  </span>
                </button>
              );
            }) : (
              <div className="empty-list">没有找到匹配的题目，换个关键词试试。</div>
            )}
          </nav>

          <div className="library-tip">
            <span aria-hidden="true">01</span>
            <p><strong>先把题目说成人话</strong>能复述输入和输出，再开始写代码。</p>
          </div>
        </aside>

        <section className="panel focus-panel" aria-label="题目与代码">
          <article className="problem-brief">
            <div className="brief-topline">
              <span>HOT 100 / {currentProblem.topic}</span>
              <a href={`https://leetcode.cn/problems/${currentProblem.slug}/`} target="_blank" rel="noreferrer">打开力扣官方原题 ↗</a>
            </div>
            <div className="brief-title-row">
              <h2>{currentProblem.id}. {currentProblem.title}</h2>
              <span className={`brief-difficulty difficulty-${difficultyClasses[currentProblem.difficulty]}`}>
                {difficultyLabels[currentProblem.difficulty]}
              </span>
              <span className="topic-badge">{currentProblem.topic}</span>
            </div>
            <section className={`statement-panel ${showStatement ? "is-open" : ""}`} aria-label="题目原意">
              <div className="statement-head">
                <div>
                  <strong>题目原意</strong>
                  <small>中文重述 · 完整限制以力扣原题为准</small>
                </div>
                <button
                  type="button"
                  aria-expanded={showStatement}
                  onClick={() => setShowStatement((current) => !current)}
                >
                  {showStatement ? "收起题目" : "展开题目"}
                </button>
              </div>

              {showStatement ? (
                <div className="statement-body">
                  <p>{currentDetail.statement}</p>
                  <div className="statement-facts">
                    <div>
                      <span>函数输入</span>
                      <code>{currentProblem.params.join(", ") || "无"}</code>
                    </div>
                    <div>
                      <span>示例</span>
                      <code>{currentProblem.example}</code>
                    </div>
                  </div>
                  <div className="statement-requirements">
                    <span>注意事项</span>
                    <ul>{currentDetail.requirements.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                </div>
              ) : (
                <p className="problem-summary">{currentProblem.summary}</p>
              )}
            </section>
            <div className="hint-row">
              <span>小白提示</span>
              <p>{currentProblem.hint}</p>
              <b>目标复杂度：{currentProblem.complexity}</b>
            </div>
          </article>

          <div className="editor-toolbar">
            <div className="editor-meta">
              <span className="language-pill">Python 3</span>
              <span className="shortcut-label">⌘ / Ctrl + Enter 运行</span>
            </div>
            <div className="editor-actions">
              <button className="dark-button" type="button" onClick={resetCode}>恢复初始代码</button>
              <button className="run-button" type="button" onClick={runTests} disabled={runState.phase === "running"}>
                <span aria-hidden="true">▶</span>{runState.phase === "running" ? "运行中…" : "运行测试"}
              </button>
            </div>
          </div>

          <div className="code-editor-wrap">
            <div className="line-numbers" aria-hidden="true" ref={lineNumbersRef}>
              {codeLines.map((_, index) => <span key={index}>{index + 1}</span>)}
            </div>
            <label className="code-field">
              <span className="sr-only">Python 代码编辑器</span>
              <textarea
                ref={editorRef}
                value={currentRecord.code}
                onChange={(event) => updateRecord({ code: event.target.value })}
                onKeyDown={handleEditorKeyDown}
                onScroll={(event) => {
                  if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
                }}
                spellCheck={false}
                aria-describedby="editor-help"
              />
            </label>
          </div>

          <section className={`test-console test-${runState.phase}`} aria-live="polite">
            <div className="console-head">
              <div>
                <strong>快速测试</strong>
                <span id="editor-help">检查示例是否通过；最终结果仍以力扣提交为准。</span>
              </div>
              <div className="console-status">
                {runState.phase === "running" && <i className="spinner" />}
                <span>{runState.message}</span>
                {runState.phase === "done" && <small>{Math.round(runState.duration)} ms</small>}
              </div>
            </div>

            <div className="test-cases">
              {(runState.results.length ? runState.results : currentProblem.tests).map((test, index) => {
                const result = "passed" in test ? test as WorkerTestResult : null;
                return (
                  <div className={`test-card ${result ? (result.passed ? "is-passed" : "is-failed") : ""}`} key={`${currentProblem.id}-${index}`}>
                    <div className="test-card-title">
                      <strong>{"name" in test && test.name ? test.name : `测试 ${index + 1}`}</strong>
                      {result && <span>{result.passed ? "✓ 通过" : "× 未通过"}</span>}
                    </div>
                    <p><span>输入</span>{"inputLabel" in test ? test.inputLabel : result?.expression}</p>
                    <p><span>预期</span><code>{pretty(test.expected)}</code></p>
                    {result && <p><span>实际</span><code>{result.error?.message ?? pretty(result.actual)}</code></p>}
                  </div>
                );
              })}
            </div>

            {runState.phase === "done" && runState.stdout && (
              <details className="stdout-block"><summary>查看 print 输出</summary><pre>{runState.stdout}</pre></details>
            )}
          </section>
        </section>

        <aside className="panel notes-panel" aria-label="逐行解释和笔记">
          <div className="notes-head">
            <div>
              <div className="section-kicker">MY NOTEBOOK</div>
              <h2>把代码讲给自己听</h2>
            </div>
            <span className="autosave-badge">已自动保存</span>
          </div>

          <div className="note-tabs" role="tablist" aria-label="笔记类型">
            <button type="button" role="tab" aria-selected={noteTab === "line"} className={noteTab === "line" ? "is-active" : ""} onClick={() => setNoteTab("line")}>逐行解释</button>
            <button type="button" role="tab" aria-selected={noteTab === "review"} className={noteTab === "review" ? "is-active" : ""} onClick={() => setNoteTab("review")}>思路与复盘</button>
          </div>

          {noteTab === "line" ? (
            <div className="line-notes-view">
              <div className="line-note-intro">
                <p>每一行都回答：<strong>读了什么？做了什么？为什么？</strong></p>
                <button type="button" onClick={fillLineNotes}>一键补齐基础解释</button>
              </div>
              <div className="line-note-list">
                {codeLines.map((line, index) => (
                  <label className="line-note-card" key={`${index}-${line}`}>
                    <span className="note-line-number">{String(index + 1).padStart(2, "0")}</span>
                    <code>{line || "（空行）"}</code>
                    <textarea
                      value={currentRecord.lineNotes[index] ?? ""}
                      onChange={(event) => updateLineNote(index, event.target.value)}
                      placeholder={explainLine(line)}
                      rows={2}
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="review-notes-view">
              <label>
                <span><b>1</b> 我的解题思路</span>
                <small>不用写术语，先用自己的话说明步骤。</small>
                <textarea rows={6} value={currentRecord.thinking} onChange={(event) => updateRecord({ thinking: event.target.value })} placeholder="例如：我先用一个字典记住已经看过的数字……" />
              </label>
              <label>
                <span><b>2</b> 卡住 / 写错的地方</span>
                <small>记录错误，比只记录正确答案更有用。</small>
                <textarea rows={5} value={currentRecord.mistakes} onChange={(event) => updateRecord({ mistakes: event.target.value })} placeholder="例如：我把下标和值写反了……" />
              </label>
              <label>
                <span><b>3</b> 下次怎么一眼认出来</span>
                <small>写下这道题最明显的模式或信号。</small>
                <textarea rows={5} value={currentRecord.review} onChange={(event) => updateRecord({ review: event.target.value })} placeholder="例如：看到“找两个数”和“目标和”，想到哈希表……" />
              </label>
            </div>
          )}

          <div className="mastery-box">
            <span>这道题的状态</span>
            <div className="status-buttons">
              {(Object.keys(statusLabels) as LearningStatus[]).map((status) => (
                <button
                  type="button"
                  key={status}
                  className={currentRecord.status === status ? "is-active" : ""}
                  onClick={() => updateRecord({ status })}
                >
                  {statusLabels[status]}
                </button>
              ))}
            </div>
          </div>
        </aside>
        </div>
      )}

      {showGuide && (
        <div className="guide-backdrop" role="presentation" onMouseDown={() => setShowGuide(false)}>
          <section className="guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="guide-close" type="button" aria-label="关闭" onClick={() => setShowGuide(false)}>×</button>
            <div className="section-kicker">START HERE</div>
            <h2 id="guide-title">第一次学习，照着这 4 步来</h2>
            <ol>
              <li><b>1</b><div><strong>先完成今日小课</strong><p>先看题意卡，再认题型和核心思路，不需要立刻写代码。</p></div></li>
              <li><b>2</b><div><strong>用极速挑战练反应</strong><p>在 60 秒里快速判断题型、方法和复杂度。</p></div></li>
              <li><b>3</b><div><strong>用闪卡安排复习</strong><p>没记住的内容会回到复习队列，不用自己安排顺序。</p></div></li>
              <li><b>4</b><div><strong>最后进入完整代码题</strong><p>这时再写代码、运行测试并解释每一行，压力会小很多。</p></div></li>
            </ol>
            <button className="button button-primary" type="button" onClick={() => { setAppMode("path"); setShowGuide(false); }}>去学习路径</button>
          </section>
        </div>
      )}
    </main>
  );
}
