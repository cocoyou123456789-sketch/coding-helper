"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import {
  executionVariableChanges,
  explainExecutionEvent,
  formatExecutionValue,
  normalizeExecutionTraceResult,
  type ExecutionTraceResult,
  type ExecutionTraceSource,
  type ExecutionTraceTestResult,
} from "./execution-trace";
import type { Language } from "./problem-i18n";
import type { ProblemSignature, ProblemTest } from "./problems";
import { referenceSolutionFor } from "./reference-solutions";
import {
  beginnerPythonErrorHint,
  describeFirstMismatch,
  messageBelongsToRun,
  pythonErrorSummary,
} from "./run-session";
import { useDialogFocus } from "./use-dialog-focus";
import styles from "./execution-visualizer.module.css";

type ActiveRunRef = RefObject<{ id: string; cleanup: () => void } | null>;

type ExecutionVisualizerProps = {
  problemId: number;
  problemTitle: string;
  code: string;
  savedLearnerAnswer: string;
  savedReferenceAnswer: string;
  tests: ProblemTest[];
  signature: ProblemSignature;
  language: Language;
  preferredTestIndex: number;
  disabled: boolean;
  workerRef: RefObject<Worker | null>;
  runtimeReadyRef: RefObject<boolean>;
  timeoutRef: RefObject<ReturnType<typeof setTimeout> | null>;
  runSequenceRef: RefObject<number>;
  activeRunRef: ActiveRunRef;
  onOpenMistakeBook: () => void;
};

type Snapshot = {
  mine: string;
  savedMine: string;
  reference: string;
  mistakeReference: string;
  referenceKind: "saved" | "site" | "none";
};

type Phase = "idle" | "validating" | "tracing" | "ready" | "error";

const PLAYBACK_SPEEDS = [0.5, 1, 1.5, 2] as const;

function visualizerCopy(language: Language) {
  if (language === "en") {
    return {
      trigger: "Animate each line",
      mobileTrigger: "Steps",
      triggerHint: "See what Python actually does",
      title: "Beginner line-by-line animation",
      close: "Close animation",
      mine: "My code",
      savedMine: "Saved wrong version",
      savedMineNote: "This is the earlier answer saved in your mistake book. It may be right or wrong, so compare its steps with the reference.",
      reference: "One reference solution",
      mistakeReference: "Mistake-book reference",
      savedReference: "Saved mistake-book reference",
      siteReference: "Site demonstration solution",
      noReference: "No reference solution has been saved for this problem yet.",
      addReference: "Open mistake book to add one",
      noCode: "Write some Python first, then come back to animate it.",
      validating: "Checking every quick test first…",
      tracing: "Running this example again and recording each Python line…",
      runtimeLoading: "Loading the Python runtime…",
      busy: "Another code run is still active. Close this window and wait for it to finish.",
      timeoutCold: "The Python runtime took too long to load. Check the connection and try again.",
      timeoutWarm: "This run took too long. Try a smaller example or inspect the loop condition.",
      workerFailed: "The Python runner stopped unexpectedly. Please try again.",
      malformed: "The runner returned an animation that could not be read safely.",
      retry: "Generate again",
      latestChanged: "Your code changed after this animation opened. This playback still uses the earlier snapshot.",
      reloadLatest: "Reload latest code",
      testLabel: "Example to animate",
      validation: "Demo case",
      testsPassed: (passed: number, total: number) => `${passed} / ${total} quick tests passed`,
      sourceDisclaimer: "This is one real Python run for the selected example. It does not prove every possible input; your code and playback stay on this device.",
      savedDisclaimer: "This reference was saved in your mistake book. It is not an official answer or the only solution.",
      siteDisclaimer: "This is a site demonstration, not an official LeetCode answer and not the only solution.",
      step: (current: number, total: number) => `Step ${current} of ${total}`,
      line: (line: number) => `Line ${line}`,
      play: "Play",
      pause: "Pause",
      previous: "Previous line",
      next: "Next line",
      restart: "Restart",
      speed: "Playback speed",
      timeline: "Animation progress",
      currentAction: "What this step means",
      variablesNow: "Variables before this line runs",
      noVariables: "No local variables are visible yet.",
      changesAfter: "What changes after this line",
      noChanges: "No visible local variable changes at the next step.",
      added: "created",
      changed: "changed",
      removed: "removed",
      before: "before",
      after: "after",
      outcome: "This example's result",
      expected: "Expected",
      actual: "Actual",
      noActual: "No result was produced",
      passedCase: "This selected quick test passed.",
      failedCase: "This selected quick test did not match.",
      errorCase: "This selected run raised an error.",
      incompleteCase: "Animation stopped at its safety limit. The partial steps are useful, but this is not a pass or fail result.",
      noSteps: "Python did not reach a traceable line in your solution.",
      currentLine: "currently highlighted",
      errorHelp: "Try this first",
    };
  }

  return {
    trigger: "逐行动画",
    mobileTrigger: "演示",
    triggerHint: "看看 Python 真正做了什么",
    title: "小白逐行动画",
    close: "关闭动画",
    mine: "我的代码",
    savedMine: "错题本旧代码",
    savedMineNote: "这是错题本里保存的旧作答，可能正确也可能错误；可以和参考解法逐步对照。",
    reference: "一份参考解法",
    mistakeReference: "错题本参考",
    savedReference: "错题本保存的参考解法",
    siteReference: "本站示范解法",
    noReference: "这道题还没有保存参考解法。",
    addReference: "去错题本添加",
    noCode: "先写一点 Python 代码，再回来生成逐行动画。",
    validating: "先检查全部快速测试…",
    tracing: "正在重新运行这个例子，并记录每一行 Python…",
    runtimeLoading: "正在加载 Python 运行环境…",
    busy: "还有一次代码运行没有结束。请先关闭这里，等它运行完成。",
    timeoutCold: "Python 环境加载太久了。请检查网络后再试一次。",
    timeoutWarm: "这次运行时间太久。可以换一个更小的例子，或检查循环条件。",
    workerFailed: "Python 运行器意外停止了，请再试一次。",
    malformed: "运行器返回的动画无法被安全读取。",
    retry: "重新生成",
    latestChanged: "打开动画后，你的代码发生了变化。当前动画仍使用打开时的代码快照。",
    reloadLatest: "载入最新代码",
    testLabel: "选择要演示的例子",
    validation: "演示用例",
    testsPassed: (passed: number, total: number) => `${passed} / ${total} 个快速测试通过`,
    sourceDisclaimer: "这是所选例子的一次真实 Python 执行，只能说明这个例子，不能代表所有输入；代码和动画数据只留在这台设备。",
    savedDisclaimer: "这份参考来自你的错题本，不是官方答案，也不是唯一解法。",
    siteDisclaimer: "这是本站示范解法，不是 LeetCode 官方答案，也不是唯一解法。",
    step: (current: number, total: number) => `第 ${current} / ${total} 步`,
    line: (line: number) => `第 ${line} 行`,
    play: "播放",
    pause: "暂停",
    previous: "上一行",
    next: "下一行",
    restart: "重新开始",
    speed: "播放速度",
    timeline: "动画进度",
    currentAction: "这一小步在做什么",
    variablesNow: "执行这一行之前的变量",
    noVariables: "现在还没有能看到的局部变量。",
    changesAfter: "执行这一行之后的变化",
    noChanges: "到下一步时，没有可见的局部变量变化。",
    added: "新建",
    changed: "改变",
    removed: "移除",
    before: "之前",
    after: "之后",
    outcome: "这个例子的结果",
    expected: "预期",
    actual: "实际",
    noActual: "未产生返回结果",
    passedCase: "所选快速测试通过了。",
    failedCase: "所选快速测试的结果没有对上。",
    errorCase: "所选例子运行时出现了错误。",
    incompleteCase: "动画碰到安全上限后停止了。这些步骤仍可学习，但不能据此判断正确或错误。",
    noSteps: "Python 没有执行到解法里可记录的代码行。",
    currentLine: "当前高亮行",
    errorHelp: "先试着这样改",
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function errorDetails(value: unknown): { message: string; traceback: string } {
  if (!isRecord(value)) return { message: "", traceback: "" };
  return {
    message: typeof value.message === "string" ? value.message : "",
    traceback: typeof value.traceback === "string" ? value.traceback : "",
  };
}

function sourceCode(snapshot: Snapshot | null, source: ExecutionTraceSource): string {
  if (!snapshot) return "";
  if (source === "mine") return snapshot.mine;
  if (source === "saved") return snapshot.savedMine;
  if (source === "mistakeReference") return snapshot.mistakeReference;
  return snapshot.reference;
}

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(query.matches);
    update();
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);

  return reduced;
}

function resultName(test: ProblemTest, index: number, language: Language): string {
  const label = test.inputLabel.trim();
  return label || (language === "zh" ? `测试 ${index + 1}` : `Test ${index + 1}`);
}

function outcomeClassName(result: ExecutionTraceResult | null): string {
  if (!result) return styles.outcomeNeutral;
  if (result.truncated) return styles.outcomeIncomplete;
  if (result.test.error) return styles.outcomeError;
  return result.test.passed ? styles.outcomePassed : styles.outcomeFailed;
}

export default function ExecutionVisualizer({
  problemId,
  problemTitle,
  code,
  savedLearnerAnswer,
  savedReferenceAnswer,
  tests,
  signature,
  language,
  preferredTestIndex,
  disabled,
  workerRef,
  runtimeReadyRef,
  timeoutRef,
  runSequenceRef,
  activeRunRef,
  onOpenMistakeBook,
}: ExecutionVisualizerProps) {
  const copy = useMemo(() => visualizerCopy(language), [language]);
  const reducedMotion = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [source, setSource] = useState<ExecutionTraceSource>("mine");
  const [testIndex, setTestIndex] = useState(0);
  const [phase, setPhase] = useState<Phase>("idle");
  const [statusMessage, setStatusMessage] = useState("");
  const [validation, setValidation] = useState<ExecutionTraceTestResult[]>([]);
  const [trace, setTrace] = useState<ExecutionTraceResult | null>(null);
  const [stepIndex, setStepIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<(typeof PLAYBACK_SPEEDS)[number]>(1);
  const [errorMessage, setErrorMessage] = useState("");
  const [errorHint, setErrorHint] = useState("");
  const ownRunIdRef = useRef<string | null>(null);
  const activeLineRef = useRef<HTMLDivElement | null>(null);
  const codeScrollerRef = useRef<HTMLDivElement | null>(null);

  const closeVisualizerRef = useRef<() => void>(() => undefined);
  const dialogRef = useDialogFocus<HTMLDivElement>(open, () => closeVisualizerRef.current());

  const cancelOwnRun = useCallback(() => {
    const ownRunId = ownRunIdRef.current;
    if (!ownRunId || activeRunRef.current?.id !== ownRunId) return;
    activeRunRef.current.cleanup();
    activeRunRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    runtimeReadyRef.current = false;
    ownRunIdRef.current = null;
  }, [activeRunRef, runtimeReadyRef, timeoutRef, workerRef]);

  const closeVisualizer = useCallback(() => {
    cancelOwnRun();
    setPlaying(false);
    setOpen(false);
  }, [cancelOwnRun]);

  useEffect(() => {
    closeVisualizerRef.current = closeVisualizer;
  }, [closeVisualizer]);

  useEffect(() => () => cancelOwnRun(), [cancelOwnRun]);

  const resetPlayback = useCallback(() => {
    setPlaying(false);
    setStepIndex(0);
    setTrace(null);
    setValidation([]);
    setErrorMessage("");
    setErrorHint("");
    setStatusMessage("");
  }, []);

  const captureSnapshot = useCallback(() => {
    const saved = savedReferenceAnswer.trim();
    const demonstration = referenceSolutionFor(problemId).trim();
    setSnapshot({
      mine: code,
      savedMine: savedLearnerAnswer,
      reference: demonstration || saved,
      mistakeReference: demonstration && saved && saved !== demonstration ? saved : "",
      referenceKind: demonstration ? "site" : saved ? "saved" : "none",
    });
    setSource("mine");
    setTestIndex(Number.isInteger(preferredTestIndex) && preferredTestIndex >= 0 && preferredTestIndex < tests.length
      ? preferredTestIndex
      : 0);
    resetPlayback();
    setPhase("idle");
  }, [code, preferredTestIndex, problemId, resetPlayback, savedLearnerAnswer, savedReferenceAnswer, tests.length]);

  function openVisualizer() {
    if (disabled || activeRunRef.current) return;
    captureSnapshot();
    setOpen(true);
  }

  function reloadLatestCode() {
    cancelOwnRun();
    captureSnapshot();
  }

  const fail = useCallback((message: string, details = "") => {
    setPlaying(false);
    setPhase("error");
    setErrorMessage(message);
    setErrorHint(beginnerPythonErrorHint(details || message, language));
  }, [language]);

  const generate = useCallback(() => {
    if (!open || !snapshot || phase !== "idle") return;
    const selectedCode = sourceCode(snapshot, source);
    if (!selectedCode.trim() || tests.length === 0) return;
    if (activeRunRef.current) {
      fail(copy.busy);
      return;
    }

    const requestId = `trace:${problemId}:${++runSequenceRef.current}`;
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    let worker: Worker;
    try {
      worker = workerRef.current ?? new Worker(`${basePath}/python-worker-trace-v2.js`);
    } catch {
      fail(copy.workerFailed);
      return;
    }
    workerRef.current = worker;
    ownRunIdRef.current = requestId;
    const traceTargetIndex = testIndex;
    setPhase("tracing");
    setStatusMessage(copy.tracing);
    setValidation([]);
    setTrace(null);
    setPlaying(false);
    setStepIndex(0);
    setErrorMessage("");
    setErrorHint("");

    function cleanupWorkerListeners() {
      worker.removeEventListener("message", handleWorkerMessage);
      worker.removeEventListener("error", handleWorkerError);
    }

    function finishActiveRequest(): boolean {
      if (activeRunRef.current?.id !== requestId) return false;
      cleanupWorkerListeners();
      activeRunRef.current = null;
      ownRunIdRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      return true;
    }

    function failAndFinish(message: string, details = "", resetWorker = false) {
      if (!finishActiveRequest()) return;
      if (resetWorker) {
        worker.terminate();
        workerRef.current = null;
        runtimeReadyRef.current = false;
      }
      fail(message, details);
    }

    function armTimeout(duration: number, cold: boolean) {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (activeRunRef.current?.id !== requestId) return;
        cleanupWorkerListeners();
        activeRunRef.current = null;
        ownRunIdRef.current = null;
        timeoutRef.current = null;
        worker.terminate();
        workerRef.current = null;
        runtimeReadyRef.current = false;
        fail(cold ? copy.timeoutCold : copy.timeoutWarm);
      }, duration);
    }

    function handleWorkerMessage(event: MessageEvent) {
      const data: unknown = event.data;
      if (!isRecord(data) || activeRunRef.current?.id !== requestId || !messageBelongsToRun(data, requestId)) return;

      if (data.type === "status") {
        if (data.status === "ready") {
          runtimeReadyRef.current = true;
          armTimeout(20_000, false);
        }
        if (data.phase === "runtime") {
          setStatusMessage(data.status === "ready"
            ? copy.tracing
            : copy.runtimeLoading);
        }
        else if (data.status === "tracing") setStatusMessage(copy.tracing);
        else setStatusMessage(copy.tracing);
        return;
      }

      if (data.type === "trace-result") {
        const result = normalizeExecutionTraceResult(data, {
          source,
          code: selectedCode,
          testIndex: traceTargetIndex,
        });
        if (!result) {
          failAndFinish(copy.malformed);
          return;
        }
        if (!finishActiveRequest()) return;
        setTrace(result);
        setValidation([result.test]);
        setTestIndex(result.testIndex);
        setStepIndex(0);
        setPlaying(false);
        setPhase("ready");
        setStatusMessage("");
        return;
      }

      // A stale protocol-v1 worker answers trace requests with a normal result.
      // Reject it instead of leaving the dialog in a loading loop.
      if (data.type === "result") {
        failAndFinish(copy.malformed, "", true);
        return;
      }

      if (data.type === "error") {
        const details = errorDetails(data.error);
        const summary = pythonErrorSummary(`${details.message}\n${details.traceback}`) || copy.workerFailed;
        const runtimeFailure = data.phase === "loading";
        failAndFinish(summary, `${details.message}\n${details.traceback}`, runtimeFailure);
      }
    }

    function handleWorkerError() {
      failAndFinish(copy.workerFailed, "", true);
    }

    worker.addEventListener("message", handleWorkerMessage);
    worker.addEventListener("error", handleWorkerError);
    activeRunRef.current = { id: requestId, cleanup: cleanupWorkerListeners };
    armTimeout(runtimeReadyRef.current ? 20_000 : 90_000, !runtimeReadyRef.current);
    worker.postMessage({
      id: requestId,
      mode: "trace",
      traceTestIndex: traceTargetIndex,
      code: selectedCode,
      signature,
      tests,
    });
  }, [
    activeRunRef,
    copy,
    fail,
    open,
    phase,
    problemId,
    runSequenceRef,
    runtimeReadyRef,
    signature,
    snapshot,
    source,
    testIndex,
    tests,
    timeoutRef,
    workerRef,
  ]);

  useEffect(() => {
    if (!open || phase !== "idle") return;
    const selectedCode = sourceCode(snapshot, source);
    if (!selectedCode.trim() || tests.length === 0) return;
    const generationTimer = window.setTimeout(generate, 0);
    return () => window.clearTimeout(generationTimer);
  }, [generate, open, phase, snapshot, source, tests.length]);

  useEffect(() => {
    if (!playing || phase !== "ready" || !trace) return undefined;
    if (stepIndex >= trace.events.length - 1) return undefined;
    const timer = window.setTimeout(() => {
      const nextStep = Math.min(trace.events.length - 1, stepIndex + 1);
      setStepIndex(nextStep);
      if (nextStep >= trace.events.length - 1) setPlaying(false);
    }, Math.max(260, 900 / speed));
    return () => window.clearTimeout(timer);
  }, [phase, playing, speed, stepIndex, trace]);

  useEffect(() => {
    if (!open) return undefined;
    const pauseWhenHidden = () => {
      if (document.visibilityState === "hidden") setPlaying(false);
    };
    document.addEventListener("visibilitychange", pauseWhenHidden);
    return () => document.removeEventListener("visibilitychange", pauseWhenHidden);
  }, [open]);

  useEffect(() => {
    if (!open || phase !== "ready") return;
    const activeLine = activeLineRef.current;
    const scroller = codeScrollerRef.current;
    if (!activeLine || !scroller) return;
    const lineRect = activeLine.getBoundingClientRect();
    const scrollerRect = scroller.getBoundingClientRect();
    if (lineRect.top >= scrollerRect.top && lineRect.bottom <= scrollerRect.bottom) return;
    const centeredTop = scroller.scrollTop
      + lineRect.top
      - scrollerRect.top
      - (scroller.clientHeight - activeLine.clientHeight) / 2;
    scroller.scrollTo({
      top: Math.max(0, centeredTop),
      behavior: reducedMotion ? "auto" : "smooth",
    });
  }, [open, phase, reducedMotion, stepIndex]);

  const selectedCode = sourceCode(snapshot, source);
  const lines = useMemo(() => selectedCode.replace(/\r\n?/g, "\n").split("\n"), [selectedCode]);
  const currentEvent = trace?.events[stepIndex] ?? null;
  const changes = useMemo(
    () => trace && currentEvent ? executionVariableChanges(trace.events, stepIndex) : [],
    [currentEvent, stepIndex, trace],
  );
  const currentResult = trace?.test ?? validation.find((result) => result.index === testIndex) ?? null;
  const codeChanged = Boolean(open && snapshot && snapshot.mine !== code);
  const generating = phase === "validating" || phase === "tracing";
  const noReference = source === "reference" && !selectedCode.trim();
  const eventCount = trace?.events.length ?? 0;

  function sourceLabel(selectedSource: ExecutionTraceSource): string {
    if (selectedSource === "mine") return copy.mine;
    if (selectedSource === "saved") return copy.savedMine;
    if (selectedSource === "mistakeReference") return copy.mistakeReference;
    return copy.reference;
  }

  function chooseSource(nextSource: ExecutionTraceSource) {
    if (generating || source === nextSource) return;
    setSource(nextSource);
    resetPlayback();
    setPhase("idle");
  }

  function chooseTest(nextIndex: number) {
    if (generating || nextIndex === testIndex || nextIndex < 0 || nextIndex >= tests.length) return;
    setTestIndex(nextIndex);
    resetPlayback();
    setPhase("idle");
  }

  function retry() {
    if (generating) return;
    resetPlayback();
    setPhase("idle");
  }

  function outcomeMessage(result: ExecutionTraceResult | null, testResult: ExecutionTraceTestResult | null): string {
    if (result?.truncated) return copy.incompleteCase;
    if (testResult?.error) return copy.errorCase;
    if (testResult?.passed) return copy.passedCase;
    if (testResult) return copy.failedCase;
    return "";
  }

  return (
    <>
      <button
        type="button"
        className={styles.trigger}
        onClick={openVisualizer}
        disabled={disabled}
        aria-haspopup="dialog"
      >
        <span className={styles.triggerIcon} aria-hidden="true">▶</span>
        <span>
          <strong>
            <span className={styles.desktopTriggerLabel}>{copy.trigger}</span>
            <span className={styles.mobileTriggerLabel}>{copy.mobileTrigger}</span>
          </strong>
          <small>{copy.triggerHint}</small>
        </span>
      </button>

      {open ? createPortal((
        <div className={styles.backdrop}>
          <div
            ref={dialogRef}
            className={styles.dialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="execution-visualizer-title"
            tabIndex={-1}
          >
            <header className={styles.header}>
              <div className={styles.headingGroup}>
                <span className={styles.eyebrow}>Python · {problemId}</span>
                <h2 id="execution-visualizer-title">{copy.title}</h2>
                <p>{problemTitle}</p>
              </div>
              <button type="button" className={styles.closeButton} onClick={closeVisualizer} aria-label={copy.close}>×</button>
            </header>

            {codeChanged ? (
              <div className={styles.snapshotWarning} role="status">
                <span>{copy.latestChanged}</span>
                <button type="button" onClick={reloadLatestCode}>{copy.reloadLatest}</button>
              </div>
            ) : null}

            <div className={styles.toolbar}>
              <div className={styles.sourceTabs} role="group" aria-label={language === "zh" ? "选择代码来源" : "Choose code source"}>
                <button
                  type="button"
                  aria-pressed={source === "mine"}
                  className={source === "mine" ? styles.activeTab : ""}
                  disabled={generating}
                  onClick={() => chooseSource("mine")}
                >
                  {copy.mine}
                </button>
                {snapshot?.savedMine.trim() && snapshot.savedMine.trim() !== snapshot.mine.trim() ? (
                  <button
                    type="button"
                    aria-pressed={source === "saved"}
                    className={source === "saved" ? styles.activeTab : ""}
                    disabled={generating}
                    onClick={() => chooseSource("saved")}
                  >
                    {copy.savedMine}
                  </button>
                ) : null}
                <button
                  type="button"
                  aria-pressed={source === "reference"}
                  className={source === "reference" ? styles.activeTab : ""}
                  disabled={generating}
                  onClick={() => chooseSource("reference")}
                >
                  {copy.reference}
                </button>
                {snapshot?.mistakeReference.trim() ? (
                  <button
                    type="button"
                    aria-pressed={source === "mistakeReference"}
                    className={source === "mistakeReference" ? styles.activeTab : ""}
                    disabled={generating}
                    onClick={() => chooseSource("mistakeReference")}
                  >
                    {copy.mistakeReference}
                  </button>
                ) : null}
              </div>

              <label className={styles.testPicker}>
                <span>{copy.testLabel}</span>
                <select
                  value={testIndex}
                  disabled={generating || tests.length < 2}
                  onChange={(event) => chooseTest(Number(event.target.value))}
                >
                  {tests.map((test, index) => (
                    <option value={index} key={`${test.expression}:${index}`}>
                      {index + 1}. {resultName(test, index, language)}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {source === "saved" ? (
              <div className={styles.referenceNote}>
                <strong>{copy.savedMine}</strong>
                <span>{copy.savedMineNote}</span>
              </div>
            ) : (source === "reference" || source === "mistakeReference") && snapshot?.referenceKind !== "none" ? (
              <div className={styles.referenceNote}>
                <strong>{source === "mistakeReference" || snapshot?.referenceKind === "saved" ? copy.savedReference : copy.siteReference}</strong>
                <span>{source === "mistakeReference" || snapshot?.referenceKind === "saved" ? copy.savedDisclaimer : copy.siteDisclaimer}</span>
              </div>
            ) : null}

            <p className={styles.disclaimer}>{copy.sourceDisclaimer}</p>

            {noReference ? (
              <section className={styles.emptyState}>
                <div aria-hidden="true">✎</div>
                <h3>{copy.noReference}</h3>
                <button type="button" onClick={() => { closeVisualizer(); onOpenMistakeBook(); }}>
                  {copy.addReference}
                </button>
              </section>
            ) : !selectedCode.trim() ? (
              <section className={styles.emptyState}>
                <div aria-hidden="true">{"{ }"}</div>
                <h3>{copy.noCode}</h3>
              </section>
            ) : (
              <div className={styles.workspace}>
                <section className={styles.codePanel} aria-label={language === "zh" ? "只读代码动画" : "Read-only code animation"}>
                  <div className={styles.panelTopline}>
                    <div>
                      <span className={styles.panelDot} aria-hidden="true" />
                      <strong>{sourceLabel(source)}</strong>
                    </div>
                    {currentEvent ? <span>{copy.line(currentEvent.line)}</span> : null}
                  </div>
                  <div ref={codeScrollerRef} className={styles.codeScroller} role="list" aria-label={language === "zh" ? "Python 代码行" : "Python source lines"}>
                    {lines.map((line, index) => {
                      const lineNumber = index + 1;
                      const active = currentEvent?.line === lineNumber;
                      return (
                        <div
                          key={lineNumber}
                          ref={active ? activeLineRef : undefined}
                          role="listitem"
                          aria-current={active ? "step" : undefined}
                          className={`${styles.codeLine} ${active ? styles.activeCodeLine : ""}`}
                        >
                          <span className={styles.lineArrow} aria-hidden="true">{active ? "▶" : ""}</span>
                          <span className={styles.lineNumber} aria-hidden="true">{lineNumber}</span>
                          <code>{line || " "}</code>
                          {active ? <span className={styles.srOnly}>{copy.currentLine}</span> : null}
                        </div>
                      );
                    })}
                  </div>
                </section>

                <aside className={styles.learningPanel}>
                  {generating ? (
                    <div className={styles.loadingCard} role="status" aria-live="polite">
                      <span className={styles.loader} aria-hidden="true" />
                  <strong>{phase === "validating" ? copy.validating : copy.tracing}</strong>
                      <p>{statusMessage}</p>
                    </div>
                  ) : phase === "error" ? (
                    <div className={styles.errorCard} role="alert">
                      <strong>{errorMessage}</strong>
                      {errorHint ? <><span>{copy.errorHelp}</span><p>{errorHint}</p></> : null}
                      <button type="button" onClick={retry}>{copy.retry}</button>
                    </div>
                  ) : currentEvent && trace ? (
                    <>
                      <section className={styles.explanationCard} aria-live={playing ? "off" : "polite"}>
                        <span>{copy.step(stepIndex + 1, eventCount)} · {copy.line(currentEvent.line)}</span>
                        <h3>{copy.currentAction}</h3>
                        <p>{explainExecutionEvent(currentEvent, lines[currentEvent.line - 1] ?? "", language)}</p>
                      </section>

                      <section className={styles.dataCard}>
                        <h3>{copy.variablesNow}</h3>
                        {Object.keys(currentEvent.locals).length ? (
                          <dl className={styles.variableList}>
                            {Object.entries(currentEvent.locals).map(([name, value]) => (
                              <div key={name}>
                                <dt>{name}</dt>
                                <dd>{formatExecutionValue(value)}</dd>
                              </div>
                            ))}
                          </dl>
                        ) : <p className={styles.muted}>{copy.noVariables}</p>}
                      </section>

                      <section className={styles.dataCard}>
                        <h3>{copy.changesAfter}</h3>
                        {changes.length ? (
                          <ul className={styles.changeList}>
                            {changes.map((change) => (
                              <li key={change.name}>
                                <div>
                                  <code>{change.name}</code>
                                  <span className={styles[`change_${change.kind}`]}>
                                    {copy[change.kind]}
                                  </span>
                                </div>
                                <p>
                                  <span>{copy.before}: <code>{formatExecutionValue(change.before)}</code></span>
                                  <span aria-hidden="true">→</span>
                                  <span>{copy.after}: <code>{formatExecutionValue(change.after)}</code></span>
                                </p>
                              </li>
                            ))}
                          </ul>
                        ) : <p className={styles.muted}>{copy.noChanges}</p>}
                      </section>
                    </>
                  ) : phase === "ready" ? (
                    <div className={styles.emptyTrace} role="status">{copy.noSteps}</div>
                  ) : null}
                </aside>
              </div>
            )}

            {!noReference && selectedCode.trim() ? (
              <footer className={styles.footer}>
                <div className={styles.validationSummary}>
                  <span>{copy.validation}</span>
                  <strong>{tests[testIndex] ? resultName(tests[testIndex], testIndex, language) : "—"}</strong>
                </div>

                <div className={styles.playbackControls}>
                  <button
                    type="button"
                    onClick={() => { setPlaying(false); setStepIndex(0); }}
                    disabled={!trace || !eventCount || stepIndex === 0}
                    aria-label={copy.restart}
                    title={copy.restart}
                  >
                    <span aria-hidden="true">↺</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPlaying(false); setStepIndex((current) => Math.max(0, current - 1)); }}
                    disabled={!trace || !eventCount || stepIndex === 0}
                    aria-label={copy.previous}
                    title={copy.previous}
                  >
                    <span aria-hidden="true">‹</span>
                  </button>
                  <button
                    type="button"
                    className={styles.playButton}
                    onClick={() => {
                      if (!trace || !eventCount) return;
                      if (eventCount === 1) {
                        setPlaying(false);
                        return;
                      }
                      if (stepIndex >= eventCount - 1) setStepIndex(0);
                      setPlaying((current) => !current);
                    }}
                    disabled={!trace || !eventCount}
                    aria-label={playing ? copy.pause : copy.play}
                  >
                    <span aria-hidden="true">{playing ? "Ⅱ" : "▶"}</span>
                    <strong>{playing ? copy.pause : copy.play}</strong>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPlaying(false);
                      setStepIndex((current) => Math.min(Math.max(0, eventCount - 1), current + 1));
                    }}
                    disabled={!trace || !eventCount || stepIndex >= eventCount - 1}
                    aria-label={copy.next}
                    title={copy.next}
                  >
                    <span aria-hidden="true">›</span>
                  </button>
                </div>

                <label className={styles.timeline}>
                  <span>{eventCount ? copy.step(stepIndex + 1, eventCount) : copy.timeline}</span>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(0, eventCount - 1)}
                    value={Math.min(stepIndex, Math.max(0, eventCount - 1))}
                    disabled={!trace || eventCount < 2}
                    aria-label={copy.timeline}
                    onChange={(event) => {
                      setPlaying(false);
                      setStepIndex(Number(event.target.value));
                    }}
                  />
                </label>

                <label className={styles.speedPicker}>
                  <span>{copy.speed}</span>
                  <select value={speed} onChange={(event) => setSpeed(Number(event.target.value) as typeof speed)}>
                    {PLAYBACK_SPEEDS.map((item) => <option value={item} key={item}>{item}×</option>)}
                  </select>
                </label>

                {currentResult ? (
                  <section className={`${styles.outcome} ${outcomeClassName(trace)}`} aria-live="polite">
                    <div>
                      <span>{copy.outcome}</span>
                      <strong>{outcomeMessage(trace, currentResult)}</strong>
                    </div>
                    <dl>
                      <div><dt>{copy.expected}</dt><dd>{formatExecutionValue(currentResult.expected)}</dd></div>
                      <div><dt>{copy.actual}</dt><dd>{currentResult.hasActual ? formatExecutionValue(currentResult.actual) : copy.noActual}</dd></div>
                    </dl>
                    {!trace?.truncated && currentResult.error ? (
                      <p>{beginnerPythonErrorHint(`${currentResult.error.message ?? ""}\n${currentResult.error.traceback ?? ""}`, language)}</p>
                    ) : !trace?.truncated && !currentResult.passed && currentResult.hasActual ? (
                      <p>{describeFirstMismatch(currentResult.expected, currentResult.actual, language)}</p>
                    ) : null}
                  </section>
                ) : null}
              </footer>
            ) : null}
          </div>
        </div>
      ), document.body) : null}
    </>
  );
}
