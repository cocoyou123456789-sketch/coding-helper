"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import LearningHub, { type LearningProfile } from "./learning-hub";
import { localizeDetail, localizeProblem, type Language } from "./problem-i18n";
import { problems, type Problem } from "./problems";
import PwaInstaller from "./pwa-installer";

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
const LANGUAGE_KEY = "leetcode-hot100-language-v1";
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

const pageCopy = {
  zh: {
    brandName: "题解簿",
    brandSubtitle: "LeetCode Hot 100 游戏化学习",
    progress: "学习进度",
    autosave: "笔记自动保存在本机",
    freePractice: "刷题",
    learningPath: "路径",
    mobileProblemList: "题库",
    mobileCode: "代码",
    mobileNotes: "笔记",
    mobileWorkspace: "手机刷题导航",
    indent: "缩进",
    outdent: "减少缩进",
    fontSize: "字号",
    decreaseFont: "减小字体",
    increaseFont: "增大字体",
    adjustFont: "调整字体大小",
    guide: "新手怎么用",
    libraryTitle: "Hot 100 题单",
    questionCount: (count: number) => `${count} 题`,
    search: "搜索题目",
    searchPlaceholder: "搜索题号或题名",
    topic: "题型",
    allTopics: "全部题型",
    difficulty: "难度",
    allDifficulties: "全部难度",
    mastered: "已掌握",
    learning: "学习中",
    notMastered: "未掌握",
    noMatch: "没有找到匹配的题目，换个关键词试试。",
    beginnerTipTitle: "先把题目说成人话",
    beginnerTipBody: "能复述输入和输出，再开始写代码。",
    officialProblem: "打开力扣官方原题 ↗",
    statementTitle: "题目原意",
    statementNote: "中文重述 · 完整限制以力扣原题为准",
    collapseProblem: "收起题目",
    expandProblem: "展开题目",
    functionInput: "函数输入",
    example: "示例",
    requirements: "注意事项",
    beginnerHint: "小白提示",
    targetComplexity: "目标复杂度：",
    shortcut: "⌘ / Ctrl + Enter 运行",
    resetCode: "恢复初始代码",
    run: "运行测试",
    running: "运行中…",
    editorLabel: "Python 代码编辑器",
    quickTest: "快速测试",
    testHelp: "检查示例是否通过；最终结果仍以力扣提交为准。",
    input: "输入",
    expected: "预期",
    actual: "实际",
    passed: "✓ 通过",
    failed: "× 未通过",
    test: (index: number) => `测试 ${index}`,
    printOutput: "查看 print 输出",
    notebookLabel: "逐行解释和笔记",
    notebookTitle: "把代码讲给自己听",
    saved: "已自动保存",
    lineNotes: "逐行解释",
    reflection: "思路与复盘",
    linePrompt: "每一行都回答：",
    lineQuestions: "读了什么？做了什么？为什么？",
    fillNotes: "一键补齐基础解释",
    blankLine: "（空行）",
    thinkingTitle: "我的解题思路",
    thinkingHelp: "不用写术语，先用自己的话说明步骤。",
    thinkingPlaceholder: "例如：我先用一个字典记住已经看过的数字……",
    mistakesTitle: "卡住 / 写错的地方",
    mistakesHelp: "记录错误，比只记录正确答案更有用。",
    mistakesPlaceholder: "例如：我把下标和值写反了……",
    reviewTitle: "下次怎么一眼认出来",
    reviewHelp: "写下这道题最明显的模式或信号。",
    reviewPlaceholder: "例如：看到“找两个数”和“目标和”，想到哈希表……",
    problemStatus: "这道题的状态",
    statusLabels: { todo: "未开始", learning: "学习中", solved: "已掌握", review: "待复习" } as Record<LearningStatus, string>,
    difficultyLabels: { 简单: "简单", 中等: "中等", 困难: "困难" } as Record<Problem["difficulty"], string>,
    notRun: "还没有运行测试",
    resetMessage: "代码已恢复，还没有运行测试",
    resetConfirm: "确定恢复这道题的初始代码吗？你的逐行解释会保留。",
    loadingPython: "正在加载 Python 环境…首次运行会稍慢",
    runningCode: "正在运行…",
    timeout: "运行超过 20 秒，已自动停止。请检查是否写了不会结束的循环。",
    allPassed: "快速测试全部通过！",
    someFailed: "还有测试没有通过，看看实际结果和预期结果哪里不同。",
    runFailed: "代码运行失败，请检查语法和缩进。",
    workerFailed: "无法启动 Python 环境，请检查网络后重试。",
    guideTitle: "第一次学习，照着这 4 步来",
    guideSteps: [
      ["先完成今日小课", "先看题意卡，再认题型和核心思路，不需要立刻写代码。"],
      ["用极速挑战练反应", "在 60 秒里快速判断题型、方法和复杂度。"],
      ["用闪卡安排复习", "没记住的内容会回到复习队列，不用自己安排顺序。"],
      ["最后进入完整代码题", "这时再写代码、运行测试并解释每一行，压力会小很多。"],
    ],
    goToPath: "去学习路径",
  },
  en: {
    brandName: "AlgoQuest",
    brandSubtitle: "LeetCode Hot 100 Game-Based Learning",
    progress: "Progress",
    autosave: "Notes save automatically on this device",
    freePractice: "Practice",
    learningPath: "Path",
    mobileProblemList: "Problems",
    mobileCode: "Code",
    mobileNotes: "Notes",
    mobileWorkspace: "Mobile practice navigation",
    indent: "Indent",
    outdent: "Outdent",
    fontSize: "Text",
    decreaseFont: "Decrease text size",
    increaseFont: "Increase text size",
    adjustFont: "Adjust text size",
    guide: "How it works",
    libraryTitle: "Hot 100 Problem Set",
    questionCount: (count: number) => `${count} problems`,
    search: "Search problems",
    searchPlaceholder: "Search by number or title",
    topic: "Topic",
    allTopics: "All topics",
    difficulty: "Difficulty",
    allDifficulties: "All levels",
    mastered: "Mastered",
    learning: "Learning",
    notMastered: "Not mastered",
    noMatch: "No matching problems. Try another search.",
    beginnerTipTitle: "Say the problem in plain language",
    beginnerTipBody: "Explain the input and output before writing code.",
    officialProblem: "Open the official problem ↗",
    statementTitle: "Problem in plain English",
    statementNote: "Original paraphrase · See LeetCode for full numeric limits",
    collapseProblem: "Collapse",
    expandProblem: "Expand",
    functionInput: "Function input",
    example: "Example",
    requirements: "Key rules",
    beginnerHint: "Beginner hint",
    targetComplexity: "Target: ",
    shortcut: "⌘ / Ctrl + Enter to run",
    resetCode: "Reset starter code",
    run: "Run tests",
    running: "Running…",
    editorLabel: "Python code editor",
    quickTest: "Quick tests",
    testHelp: "Check the examples here; LeetCode remains the final judge.",
    input: "Input",
    expected: "Expected",
    actual: "Actual",
    passed: "✓ Passed",
    failed: "× Failed",
    test: (index: number) => `Test ${index}`,
    printOutput: "View print output",
    notebookLabel: "Line explanations and notes",
    notebookTitle: "Explain the code to yourself",
    saved: "Saved",
    lineNotes: "Line by line",
    reflection: "Plan & review",
    linePrompt: "For every line, answer:",
    lineQuestions: "What does it read, do, and why?",
    fillNotes: "Add starter explanations",
    blankLine: "(blank line)",
    thinkingTitle: "My approach",
    thinkingHelp: "Use your own words; technical terms are optional.",
    thinkingPlaceholder: "Example: I store every number I have already seen in a dictionary…",
    mistakesTitle: "Where I got stuck",
    mistakesHelp: "Recording mistakes is more useful than saving only the final answer.",
    mistakesPlaceholder: "Example: I mixed up the index and the value…",
    reviewTitle: "How to recognize this pattern next time",
    reviewHelp: "Write down the strongest clue or recurring pattern.",
    reviewPlaceholder: "Example: when I see two values adding to a target, consider hashing…",
    problemStatus: "Problem status",
    statusLabels: { todo: "Not started", learning: "Learning", solved: "Mastered", review: "Review" } as Record<LearningStatus, string>,
    difficultyLabels: { 简单: "Easy", 中等: "Medium", 困难: "Hard" } as Record<Problem["difficulty"], string>,
    notRun: "No tests run yet",
    resetMessage: "Starter code restored; no tests run yet",
    resetConfirm: "Restore the starter code? Your line notes will be kept.",
    loadingPython: "Loading Python… the first run may take a moment",
    runningCode: "Running…",
    timeout: "Stopped after 20 seconds. Check for a loop that never ends.",
    allPassed: "All quick tests passed!",
    someFailed: "Some tests still fail. Compare the actual and expected results.",
    runFailed: "The code failed to run. Check the syntax and indentation.",
    workerFailed: "Python could not start. Check your connection and try again.",
    guideTitle: "Your first learning session in 4 steps",
    guideSteps: [
      ["Finish the daily lesson", "Read the prompt card, then identify the pattern and core idea before coding."],
      ["Build speed in Sprint", "Use 60-second rounds to recognize topics, methods, and complexity."],
      ["Review with flashcards", "Anything you forget returns to the review queue automatically."],
      ["Finish with a full coding problem", "Write code, run tests, and explain each line after the idea feels familiar."],
    ],
    goToPath: "Go to learning path",
  },
} as const;

const difficultyClasses: Record<Problem["difficulty"], string> = {
  简单: "easy",
  中等: "medium",
  困难: "hard",
};

const difficultyOrder: Record<Problem["difficulty"], number> = {
  简单: 0,
  中等: 1,
  困难: 2,
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

function explainLine(line: string, language: Language): string {
  const code = line.trim();
  if (language === "en") {
    if (!code) return "Blank line: separates code blocks so the structure is easier to read.";
    if (code.startsWith("#")) return "Comment: a note for people; Python does not execute it.";
    if (code.startsWith("class ")) return "Defines the class that the judge uses to find your solution.";
    if (code.startsWith("def ")) return "Defines the function and the inputs it receives.";
    if (code.startsWith("for ")) return "Starts a loop that processes each item in a sequence.";
    if (code.startsWith("while ")) return "Repeats the indented block while the condition stays true.";
    if (code.startsWith("if ")) return "Checks a condition and runs the next block when it is true.";
    if (code.startsWith("elif ")) return "Checks another condition when the earlier one was false.";
    if (code === "else:" || code.startsWith("else:")) return "Runs when none of the earlier conditions matched.";
    if (code.startsWith("return ") || code === "return") return "Ends the function and sends a result back to the judge.";
    if (code.startsWith("import ") || code.startsWith("from ")) return "Imports a Python tool that later lines can use.";
    if (code.includes("=")) return "Creates or updates a variable with the value computed here.";
    if (code.endsWith(":")) return "Starts a new code block; the following line must be indented.";
    if (code === "pass") return "Placeholder: it does nothing yet, so replace it with your solution.";
    return "Runs this statement. Note what it reads, changes, and produces.";
  }
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
  const [language, setLanguage] = useState<Language>("zh");
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | Problem["difficulty"]>("all");
  const [noteTab, setNoteTab] = useState<"line" | "review">("line");
  const [runState, setRunState] = useState<RunState>({ phase: "idle", message: "还没有运行测试", results: [] });
  const [hydrated, setHydrated] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [showStatement, setShowStatement] = useState(true);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [appMode, setAppMode] = useState<"path" | "workspace">("path");
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState<"library" | "code" | "notes">("library");
  const [profile, setProfile] = useState<LearningProfile>(EMPTY_PROFILE);
  const workerRef = useRef<Worker | null>(null);
  const runtimeReadyRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const editorRef = useRef<HTMLTextAreaElement | null>(null);
  const lineNumbersRef = useRef<HTMLDivElement | null>(null);

  const copy = pageCopy[language];
  const displayProblems = useMemo(
    () => problems.map((problem) => localizeProblem(problem, language)),
    [language],
  );

  const currentProblem = useMemo(
    () => displayProblems.find((problem) => problem.id === selectedId) ?? displayProblems[0],
    [displayProblems, selectedId],
  );
  const currentRecord = mergeRecord(currentProblem, records[currentProblem.id]);
  const currentDetail = localizeDetail(currentProblem, language);
  const codeLines = currentRecord.code.split("\n");
  const fontScale = Math.round((fontSize / MIN_FONT_SIZE) * 100);

  const topics = useMemo(
    () => ["all", ...Array.from(new Set(displayProblems.map((problem) => problem.topic)))],
    [displayProblems],
  );

  const filteredProblems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return displayProblems.filter((problem) => {
      const matchesTopic = topic === "all" || problem.topic === topic;
      const matchesDifficulty = difficultyFilter === "all" || problem.difficulty === difficultyFilter;
      const matchesSearch =
        !keyword ||
        String(problem.id).includes(keyword) ||
        problem.title.toLowerCase().includes(keyword) ||
        problem.topic.toLowerCase().includes(keyword);
      return matchesTopic && matchesDifficulty && matchesSearch;
    }).sort((first, second) => difficultyOrder[first.difficulty] - difficultyOrder[second.difficulty]);
  }, [difficultyFilter, displayProblems, search, topic]);

  const solvedCount = displayProblems.filter((problem) => records[problem.id]?.status === "solved").length;
  const learningCount = displayProblems.filter((problem) => records[problem.id]?.status === "learning").length;
  const progress = Math.round((solvedCount / displayProblems.length) * 100);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      try {
        const savedLanguage = window.localStorage.getItem(LANGUAGE_KEY);
        if (savedLanguage === "zh" || savedLanguage === "en") {
          setLanguage(savedLanguage);
          setRunState({ phase: "idle", message: pageCopy[savedLanguage].notRun, results: [] });
        }
        const requestedMode = new URLSearchParams(window.location.search).get("mode");
        if (requestedMode === "path" || requestedMode === "workspace") {
          setAppMode(requestedMode);
          if (requestedMode === "workspace") setMobileWorkspaceTab("library");
        }
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
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = language === "zh"
      ? "题解簿｜LeetCode Hot 100 小白学习工作台"
      : "AlgoQuest | LeetCode Hot 100 Learning Path";
    if (!hydrated) return;
    window.localStorage.setItem(LANGUAGE_KEY, language);
  }, [hydrated, language]);

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
    const problem = displayProblems.find((item) => item.id === id);
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
    setMobileWorkspaceTab("code");
  }

  function chooseProblem(id: number) {
    setSelectedId(id);
    setRunState({ phase: "idle", message: copy.notRun, results: [] });
    setNoteTab("line");
    setShowStatement(true);
    setMobileWorkspaceTab("code");
  }

  function toggleAppMode() {
    if (appMode === "path") {
      setAppMode("workspace");
      setMobileWorkspaceTab("library");
      return;
    }
    setAppMode("path");
  }

  function selectLanguage(nextLanguage: Language) {
    setLanguage(nextLanguage);
    setTopic("all");
    setRunState((previous) => previous.phase === "running"
      ? previous
      : { phase: "idle", message: pageCopy[nextLanguage].notRun, results: [] });
  }

  function updateLineNote(index: number, value: string) {
    const next = [...currentRecord.lineNotes];
    next[index] = value;
    updateRecord({ lineNotes: next });
  }

  function fillLineNotes() {
    updateRecord({
      lineNotes: codeLines.map((line, index) => currentRecord.lineNotes[index] || explainLine(line, language)),
    });
  }

  function resetCode() {
    if (!window.confirm(copy.resetConfirm)) return;
    updateRecord({ code: currentProblem.starterCode, status: "todo" });
    setRunState({ phase: "idle", message: copy.resetMessage, results: [] });
  }

  function adjustEditorIndent(direction: "in" | "out") {
    const editor = editorRef.current;
    if (!editor) return;
    const code = currentRecord.code;
    const start = editor.selectionStart;
    const end = editor.selectionEnd;

    if (start === end) {
      if (direction === "in") {
        const nextCode = `${code.slice(0, start)}    ${code.slice(end)}`;
        updateRecord({ code: nextCode });
        window.requestAnimationFrame(() => {
          editor.focus();
          editor.selectionStart = editor.selectionEnd = start + 4;
        });
        return;
      }

      const lineStart = code.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const leadingSpaces = code.slice(lineStart, start).match(/^ {1,4}/)?.[0].length ?? 0;
      if (!leadingSpaces) return;
      const nextCode = `${code.slice(0, lineStart)}${code.slice(lineStart + leadingSpaces)}`;
      updateRecord({ code: nextCode });
      window.requestAnimationFrame(() => {
        editor.focus();
        editor.selectionStart = editor.selectionEnd = Math.max(lineStart, start - leadingSpaces);
      });
      return;
    }

    const blockStart = code.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const selectionEnd = code[end - 1] === "\n" ? end - 1 : end;
    const nextBreak = code.indexOf("\n", selectionEnd);
    const blockEnd = nextBreak === -1 ? code.length : nextBreak;
    const lines = code.slice(blockStart, blockEnd).split("\n");
    let removed = 0;
    const nextLines = lines.map((line) => {
      if (direction === "in") return `    ${line}`;
      const count = line.match(/^ {1,4}/)?.[0].length ?? 0;
      removed += count;
      return line.slice(count);
    });
    const nextCode = `${code.slice(0, blockStart)}${nextLines.join("\n")}${code.slice(blockEnd)}`;
    const firstRemoved = direction === "out" ? (lines[0].match(/^ {1,4}/)?.[0].length ?? 0) : -4;
    const nextStart = Math.max(blockStart, start - firstRemoved);
    const nextEnd = direction === "in" ? end + (lines.length * 4) : Math.max(nextStart, end - removed);
    updateRecord({ code: nextCode });
    window.requestAnimationFrame(() => {
      editor.focus();
      editor.selectionStart = nextStart;
      editor.selectionEnd = nextEnd;
    });
  }

  function runTests() {
    if (runState.phase === "running") return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const worker = workerRef.current ?? new Worker(`${basePath}/python-worker.js`);
    workerRef.current = worker;
    setRunState({ phase: "running", message: copy.loadingPython, results: [] });
    updateRecord({ status: currentRecord.status === "solved" ? "solved" : "learning" });

    function cleanupWorkerListeners() {
      worker.removeEventListener("message", handleWorkerMessage);
      worker.removeEventListener("error", handleWorkerError);
    }

    const armTimeout = (duration: number) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        cleanupWorkerListeners();
        worker.terminate();
        workerRef.current = null;
        runtimeReadyRef.current = false;
        setRunState({
          phase: "error",
          message: copy.timeout,
          results: [],
        });
      }, duration);
    };
    armTimeout(runtimeReadyRef.current ? 20_000 : 90_000);

    function handleWorkerMessage(event: MessageEvent) {
      const data = event.data;
      if (data.type === "status") {
        if (data.status === "ready") {
          runtimeReadyRef.current = true;
          armTimeout(20_000);
        }
        setRunState((previous) => ({
          phase: "running",
          message: language === "en" ? copy.runningCode : (data.message ?? copy.runningCode),
          results: previous.results,
        }));
        return;
      }

      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      cleanupWorkerListeners();

      if (data.type === "result") {
        const results = (data.results ?? []) as WorkerTestResult[];
        const allPassed = results.length > 0 && results.every((result) => result.passed);
        setRunState({
          phase: "done",
          message: allPassed ? copy.allPassed : copy.someFailed,
          results,
          duration: data.duration ?? 0,
          stdout: data.stdout ?? "",
        });
        if (allPassed) updateRecord({ status: "solved" });
        return;
      }

      setRunState({
        phase: "error",
        message: data.error?.message ?? copy.runFailed,
        results: [],
        stdout: data.stdout ?? "",
      });
    }

    function handleWorkerError(event: ErrorEvent) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      cleanupWorkerListeners();
      worker.terminate();
      workerRef.current = null;
      runtimeReadyRef.current = false;
      setRunState({
        phase: "error",
        message: event.message || copy.workerFailed,
        results: [],
      });
    }

    worker.addEventListener("message", handleWorkerMessage);
    worker.addEventListener("error", handleWorkerError);

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
            <strong>{copy.brandName}</strong>
            <span>{copy.brandSubtitle}</span>
          </div>
        </div>

        <div className="header-progress" aria-label={`${copy.mastered} ${solvedCount} / ${displayProblems.length}`}>
          <div className="header-progress-copy">
            <span>{copy.progress}</span>
            <strong>{solvedCount} / {displayProblems.length}</strong>
          </div>
          <div className="progress-track"><span style={{ width: `${progress}%` }} /></div>
          <b>{progress}%</b>
        </div>

        <div className="header-actions">
          <span className="save-state"><i />{copy.autosave}</span>
          <PwaInstaller language={language} />
          <div className="language-toggle" role="group" aria-label="Language / 语言">
            <button type="button" lang="zh-CN" className={language === "zh" ? "is-active" : ""} onClick={() => selectLanguage("zh")}>中文</button>
            <button type="button" lang="en" className={language === "en" ? "is-active" : ""} onClick={() => selectLanguage("en")}>EN</button>
          </div>
          <button
            className="button mode-toggle"
            type="button"
            onClick={toggleAppMode}
          >
            {appMode === "path" ? copy.freePractice : copy.learningPath}
          </button>
          <div className="font-size-control" aria-label={copy.adjustFont}>
            <span>{copy.fontSize}</span>
            <button
              type="button"
              aria-label={copy.decreaseFont}
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
              aria-label={copy.adjustFont}
              aria-valuetext={`${fontScale}%`}
            />
            <button
              type="button"
              aria-label={copy.increaseFont}
              onClick={() => setFontSize((current) => Math.min(MAX_FONT_SIZE, current + 1))}
              disabled={fontSize === MAX_FONT_SIZE}
            >
              A+
            </button>
            <output aria-live="polite">{fontScale}%</output>
          </div>
          <button className="button button-quiet" type="button" onClick={() => setShowGuide(true)}>{copy.guide}</button>
        </div>
      </header>

      {appMode === "path" ? (
        <LearningHub
          problems={displayProblems}
          records={records}
          profile={profile}
          language={language}
          difficultyFilter={difficultyFilter}
          onDifficultyChange={setDifficultyFilter}
          onEarnXp={earnXp}
          onFinishLesson={finishLearningLesson}
          onMarkStatus={updateProblemStatus}
          onOpenProblem={openProblemFromPath}
          onSprintBest={updateSprintBest}
        />
      ) : (
        <div className="workspace">
        <nav className="mobile-workspace-tabs" role="tablist" aria-label={copy.mobileWorkspace}>
          <button type="button" role="tab" aria-selected={mobileWorkspaceTab === "library"} aria-controls="mobile-library-panel" className={mobileWorkspaceTab === "library" ? "is-active" : ""} onClick={() => setMobileWorkspaceTab("library")}>
            <span aria-hidden="true">☷</span>{copy.mobileProblemList}
          </button>
          <button type="button" role="tab" aria-selected={mobileWorkspaceTab === "code"} aria-controls="mobile-code-panel" className={mobileWorkspaceTab === "code" ? "is-active" : ""} onClick={() => setMobileWorkspaceTab("code")}>
            <span aria-hidden="true">{">_"}</span>{copy.mobileCode}
          </button>
          <button type="button" role="tab" aria-selected={mobileWorkspaceTab === "notes"} aria-controls="mobile-notes-panel" className={mobileWorkspaceTab === "notes" ? "is-active" : ""} onClick={() => setMobileWorkspaceTab("notes")}>
            <span aria-hidden="true">✎</span>{copy.mobileNotes}
          </button>
        </nav>
        <aside id="mobile-library-panel" role="tabpanel" className={`panel library-panel mobile-workspace-pane ${mobileWorkspaceTab === "library" ? "is-mobile-active" : ""}`} aria-label={copy.libraryTitle}>
          <div className="library-head">
            <div className="section-kicker">LEARNING MAP</div>
            <div className="library-title-row">
              <h1>{copy.libraryTitle}</h1>
              <span>{copy.questionCount(filteredProblems.length)}</span>
            </div>
            <label className="search-field">
              <span aria-hidden="true">⌕</span>
              <span className="sr-only">{copy.search}</span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder={copy.searchPlaceholder} />
            </label>
            <label className="topic-field">
              <span>{copy.topic}</span>
              <select value={topic} onChange={(event) => setTopic(event.target.value)}>
                {topics.map((item) => <option value={item} key={item}>{item === "all" ? copy.allTopics : item}</option>)}
              </select>
            </label>
            <label className="topic-field difficulty-field">
              <span>{copy.difficulty}</span>
              <select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value as "all" | Problem["difficulty"])}>
                <option value="all">{copy.allDifficulties}</option>
                {(Object.keys(difficultyOrder) as Problem["difficulty"][]).map((item) => <option value={item} key={item}>{copy.difficultyLabels[item]}</option>)}
              </select>
            </label>
            <div className="mini-stats" aria-label={copy.progress}>
              <div><strong>{solvedCount}</strong><span>{copy.mastered}</span></div>
              <div><strong>{learningCount}</strong><span>{copy.learning}</span></div>
              <div><strong>{displayProblems.length - solvedCount}</strong><span>{copy.notMastered}</span></div>
            </div>
          </div>

          <nav className="problem-list" aria-label={copy.libraryTitle}>
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
                  <span className={`status-dot status-${status}`} aria-label={copy.statusLabels[status]} />
                  <span className="problem-number">{problem.id}</span>
                  <span className="problem-name">
                    <strong>{problem.title}</strong>
                    <small>{problem.topic}</small>
                  </span>
                  <span className={`difficulty difficulty-${difficultyClasses[problem.difficulty]}`}>
                    {copy.difficultyLabels[problem.difficulty]}
                  </span>
                </button>
              );
            }) : (
              <div className="empty-list">{copy.noMatch}</div>
            )}
          </nav>

          <div className="library-tip">
            <span aria-hidden="true">01</span>
            <p><strong>{copy.beginnerTipTitle}</strong>{copy.beginnerTipBody}</p>
          </div>
        </aside>

        <section id="mobile-code-panel" role="tabpanel" className={`panel focus-panel mobile-workspace-pane ${mobileWorkspaceTab === "code" ? "is-mobile-active" : ""}`} aria-label={`${currentProblem.title} · Python`}>
          <article className="problem-brief">
            <div className="brief-topline">
              <span>HOT 100 / {currentProblem.topic}</span>
              <a href={`${language === "zh" ? "https://leetcode.cn" : "https://leetcode.com"}/problems/${currentProblem.slug}/`} target="_blank" rel="noreferrer">{copy.officialProblem}</a>
            </div>
            <div className="brief-title-row">
              <h2>{currentProblem.id}. {currentProblem.title}</h2>
              <span className={`brief-difficulty difficulty-${difficultyClasses[currentProblem.difficulty]}`}>
                {copy.difficultyLabels[currentProblem.difficulty]}
              </span>
              <span className="topic-badge">{currentProblem.topic}</span>
            </div>
            <section className={`statement-panel ${showStatement ? "is-open" : ""}`} aria-label={copy.statementTitle}>
              <div className="statement-head">
                <div>
                  <strong>{copy.statementTitle}</strong>
                  <small>{copy.statementNote}</small>
                </div>
                <button
                  type="button"
                  aria-expanded={showStatement}
                  onClick={() => setShowStatement((current) => !current)}
                >
                  {showStatement ? copy.collapseProblem : copy.expandProblem}
                </button>
              </div>

              {showStatement ? (
                <div className="statement-body">
                  <p>{currentDetail.statement}</p>
                  <div className="statement-facts">
                    <div>
                      <span>{copy.functionInput}</span>
                      <code>{currentProblem.params.join(", ") || (language === "zh" ? "无" : "None")}</code>
                    </div>
                    <div>
                      <span>{copy.example}</span>
                      <code>{currentProblem.example}</code>
                    </div>
                  </div>
                  <div className="statement-requirements">
                    <span>{copy.requirements}</span>
                    <ul>{currentDetail.requirements.map((item) => <li key={item}>{item}</li>)}</ul>
                  </div>
                </div>
              ) : (
                <p className="problem-summary">{currentProblem.summary}</p>
              )}
            </section>
            <div className="hint-row">
              <span>{copy.beginnerHint}</span>
              <p>{currentProblem.hint}</p>
              <b>{copy.targetComplexity}{currentProblem.complexity}</b>
            </div>
          </article>

          <div className="editor-toolbar">
            <div className="editor-meta">
              <span className="language-pill">Python 3</span>
              <span className="shortcut-label">{copy.shortcut}</span>
              <div className="mobile-editor-tools" role="group" aria-label={language === "zh" ? "代码缩进工具" : "Code indentation tools"}>
                <button type="button" onClick={() => adjustEditorIndent("out")} aria-label={copy.outdent}>←</button>
                <button type="button" onClick={() => adjustEditorIndent("in")} aria-label={copy.indent}>→</button>
              </div>
            </div>
            <div className="editor-actions">
              <button className="dark-button" type="button" onClick={resetCode}>{copy.resetCode}</button>
              <button className="run-button" type="button" onClick={runTests} disabled={runState.phase === "running"}>
                <span aria-hidden="true">▶</span>{runState.phase === "running" ? copy.running : copy.run}
              </button>
            </div>
          </div>

          <div className="code-editor-wrap">
            <div className="line-numbers" aria-hidden="true" ref={lineNumbersRef}>
              {codeLines.map((_, index) => <span key={index}>{index + 1}</span>)}
            </div>
            <label className="code-field">
              <span className="sr-only">{copy.editorLabel}</span>
              <textarea
                ref={editorRef}
                value={currentRecord.code}
                onChange={(event) => updateRecord({ code: event.target.value })}
                onKeyDown={handleEditorKeyDown}
                onScroll={(event) => {
                  if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop;
                }}
                wrap="off"
                spellCheck={false}
                autoCapitalize="off"
                autoCorrect="off"
                aria-describedby="editor-help"
              />
            </label>
          </div>

          <section className={`test-console test-${runState.phase}`} aria-live="polite">
            <div className="console-head">
              <div>
                <strong>{copy.quickTest}</strong>
                <span id="editor-help">{copy.testHelp}</span>
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
                      <strong>{"name" in test && test.name ? test.name : copy.test(index + 1)}</strong>
                      {result && <span>{result.passed ? copy.passed : copy.failed}</span>}
                    </div>
                    <p><span>{copy.input}</span>{language === "en" ? test.expression : ("inputLabel" in test ? test.inputLabel : result?.expression)}</p>
                    <p><span>{copy.expected}</span><code>{pretty(test.expected)}</code></p>
                    {result && <p><span>{copy.actual}</span><code>{result.error?.message ?? pretty(result.actual)}</code></p>}
                  </div>
                );
              })}
            </div>

            {runState.phase === "done" && runState.stdout && (
              <details className="stdout-block"><summary>{copy.printOutput}</summary><pre>{runState.stdout}</pre></details>
            )}
          </section>
        </section>

        <aside id="mobile-notes-panel" role="tabpanel" className={`panel notes-panel mobile-workspace-pane ${mobileWorkspaceTab === "notes" ? "is-mobile-active" : ""}`} aria-label={copy.notebookLabel}>
          <div className="notes-head">
            <div>
              <div className="section-kicker">MY NOTEBOOK</div>
              <h2>{copy.notebookTitle}</h2>
            </div>
            <span className="autosave-badge">{copy.saved}</span>
          </div>

          <div className="note-tabs" role="tablist" aria-label={copy.notebookLabel}>
            <button type="button" role="tab" aria-selected={noteTab === "line"} className={noteTab === "line" ? "is-active" : ""} onClick={() => setNoteTab("line")}>{copy.lineNotes}</button>
            <button type="button" role="tab" aria-selected={noteTab === "review"} className={noteTab === "review" ? "is-active" : ""} onClick={() => setNoteTab("review")}>{copy.reflection}</button>
          </div>

          {noteTab === "line" ? (
            <div className="line-notes-view">
              <div className="line-note-intro">
                <p>{copy.linePrompt}<strong>{copy.lineQuestions}</strong></p>
                <button type="button" onClick={fillLineNotes}>{copy.fillNotes}</button>
              </div>
              <div className="line-note-list">
                {codeLines.map((line, index) => (
                  <label className="line-note-card" key={`${index}-${line}`}>
                    <span className="note-line-number">{String(index + 1).padStart(2, "0")}</span>
                    <code>{line || copy.blankLine}</code>
                    <textarea
                      value={currentRecord.lineNotes[index] ?? ""}
                      onChange={(event) => updateLineNote(index, event.target.value)}
                      placeholder={explainLine(line, language)}
                      rows={2}
                    />
                  </label>
                ))}
              </div>
            </div>
          ) : (
            <div className="review-notes-view">
              <label>
                <span><b>1</b> {copy.thinkingTitle}</span>
                <small>{copy.thinkingHelp}</small>
                <textarea rows={6} value={currentRecord.thinking} onChange={(event) => updateRecord({ thinking: event.target.value })} placeholder={copy.thinkingPlaceholder} />
              </label>
              <label>
                <span><b>2</b> {copy.mistakesTitle}</span>
                <small>{copy.mistakesHelp}</small>
                <textarea rows={5} value={currentRecord.mistakes} onChange={(event) => updateRecord({ mistakes: event.target.value })} placeholder={copy.mistakesPlaceholder} />
              </label>
              <label>
                <span><b>3</b> {copy.reviewTitle}</span>
                <small>{copy.reviewHelp}</small>
                <textarea rows={5} value={currentRecord.review} onChange={(event) => updateRecord({ review: event.target.value })} placeholder={copy.reviewPlaceholder} />
              </label>
            </div>
          )}

          <div className="mastery-box">
            <span>{copy.problemStatus}</span>
            <div className="status-buttons">
              {(Object.keys(copy.statusLabels) as LearningStatus[]).map((status) => (
                <button
                  type="button"
                  key={status}
                  className={currentRecord.status === status ? "is-active" : ""}
                  onClick={() => updateRecord({ status })}
                >
                  {copy.statusLabels[status]}
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
            <button className="guide-close" type="button" aria-label={language === "zh" ? "关闭" : "Close"} onClick={() => setShowGuide(false)}>×</button>
            <div className="section-kicker">START HERE</div>
            <h2 id="guide-title">{copy.guideTitle}</h2>
            <ol>
              {copy.guideSteps.map(([title, body], index) => (
                <li key={title}><b>{index + 1}</b><div><strong>{title}</strong><p>{body}</p></div></li>
              ))}
            </ol>
            <button className="button button-primary" type="button" onClick={() => { setAppMode("path"); setShowGuide(false); }}>{copy.goToPath}</button>
          </section>
        </div>
      )}
    </main>
  );
}
