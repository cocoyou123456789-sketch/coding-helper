"use client";

import { lazy, Suspense, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  syncLineNotes,
  type LineNoteEdit,
} from "./code-editor";
import { COURSE_NOTES_STORAGE_KEY } from "./course-notes-model";
import headerStyles from "./header.module.css";
import type { LeetCodeCodeEditorHandle } from "./leetcode-code-editor";
import LearningHub, { type LearningProfile } from "./learning-hub";
import {
  clearStoredStudyData,
  configureNativeAppearance,
  getStoredValue,
  isNativeAppBuild,
  loadDailyReminder,
  openExternalPage,
  playSelectionHaptic,
  playTestHaptic,
  saveDailyReminder,
  setStoredValue,
  shareStudyNote,
  type DailyReminder,
  type ReminderSaveResult,
} from "./native-app";
import { localizeDetail, localizeProblem, type Language } from "./problem-i18n";
import { problems, type Problem } from "./problems";
import ideStyles from "./practice-ide.module.css";
import PwaInstaller from "./pwa-installer";
import { beginnerPythonErrorHint, messageBelongsToRun, solutionErrorLine, untouchedStarterLine } from "./run-session";
import {
  STUDY_STORAGE_VERSION,
  normalizeLearningProfile,
  normalizeSavedStudy,
  normalizeStudyRecord,
  parseStoredJson,
  persistWithStatus,
  type LearningStatus,
  type SaveState,
  type StudyRecord,
  type StudyRecords,
} from "./study-storage";
import { nextTabIndex } from "./tab-navigation";
import { useDialogFocus } from "./use-dialog-focus";

const loadCourseNotes = () => import("./course-notes");
const loadCodeEditor = () => import("./leetcode-code-editor");
const CourseNotes = lazy(loadCourseNotes);
const LeetCodeCodeEditor = lazy(loadCodeEditor);

export const dynamic = "force-static";

type WorkerTestResult = {
  index: number;
  name: string;
  expression: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
  duration: number;
  error: { name?: string; message?: string; traceback?: string } | null;
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
const PRIVACY_URL = "https://cocoyou123456789-sketch.github.io/coding-helper/privacy/";
const SUPPORT_URL = "https://cocoyou123456789-sketch.github.io/coding-helper/support/";
const LICENSES_URL = "https://cocoyou123456789-sketch.github.io/coding-helper/licenses/";
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
    brandSubtitle: "LeetCode Hot 100 + 加练学习手账",
    nativeBrandSubtitle: "101 道经典算法题学习手账",
    progress: "学习进度",
    autosave: "笔记自动保存在本机",
    nativeAutosave: "代码和笔记已保存在这台设备",
    saving: "正在保存…",
    saveFailed: "保存失败，请先复制重要笔记",
    saveRecovery: "浏览器没有保存刚才的更改。请先复制重要笔记，并清理一些本机存储空间。",
    freePractice: "完整题练习",
    learningPath: "学习首页",
    courseNotes: "课程笔记",
    appNavigation: "主要页面",
    mobileProblemList: "选题",
    mobileCode: "原题 + 代码",
    mobileNotes: "笔记",
    mobileWorkspace: "手机刷题导航",
    indent: "缩进",
    outdent: "减少缩进",
    fontSize: "字号",
    decreaseFont: "减小字体",
    increaseFont: "增大字体",
    adjustFont: "调整字体大小",
    guide: "新手怎么用",
    practiceWorkspaceTitle: "完整题目练习工作台",
    practiceWorkspaceBody: "左侧阅读题意整理、示例和关键限制，右侧用专业编辑器写代码并运行测试；官方原文和正式提交仍在 LeetCode 完成。",
    practiceSteps: ["读题", "写代码", "记笔记"],
    currentPractice: "当前练习",
    libraryTitle: "Hot 100 + 加练",
    nativeLibraryTitle: "经典算法练习题库",
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
    officialProblem: (id: number, title: string) => `来源：LeetCode ${id}《${title}》↗`,
    statementTitle: "题目内容",
    statementNote: "题意、示例与关键限制已整理；官方原文见 LeetCode",
    nativeStatementNote: "题意整理、示例和测试已离线收录",
    collapseProblem: "收起题目",
    expandProblem: "展开题目",
    functionInput: "函数输入",
    example: "示例",
    requirements: "限制与要求",
    exampleInput: "输入",
    exampleOutput: "输出",
    exampleExplanation: "说明",
    beginnerHint: "小白提示",
    targetComplexity: "目标复杂度：",
    shortcut: "Enter 自动缩进 · Tab 调整缩进 · ⌘ / Ctrl + Enter 运行",
    resetCode: "恢复初始代码",
    run: "运行测试",
    running: "运行中…",
    nextReview: "测试通过，下一步：解释关键代码 →",
    markMastered: "完成本题，标记为已掌握",
    editorLabel: "Python 代码编辑器",
    quickTest: "快速测试",
    testHelp: "检查示例是否通过；最终结果仍以力扣提交为准。",
    nativeTestHelp: "先用本机快速测试检查思路，再继续补充边界情况。",
    input: "输入",
    expected: "预期",
    actual: "实际",
    passed: "✓ 通过",
    failed: "× 未通过",
    test: (index: number) => `测试 ${index}`,
    printOutput: "查看 print 输出",
    notebookLabel: "每一行代码说明和笔记",
    notebookTitle: "本题练习笔记",
    notesForProblem: "正在记录",
    viewProblemAndCode: "查看题目和代码",
    saved: "已自动保存",
    lineNotes: "写的每一行都是什么意思",
    reflection: "思路与复盘",
    linePrompt: "写的每一行都是什么意思？",
    lineQuestions: "用自己的话说明：这一行做了什么，为什么这样写。",
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
    resetConfirm: "确定恢复初始代码吗？逐行解释会清空，解题思路和复盘会保留。",
    starterPrompt: (line: number) => `先把第 ${line} 行的 pass 换成你的解法，再运行测试。`,
    loadingPython: "正在加载 Python 环境…首次运行会稍慢",
    runningCode: "正在运行…",
    timeout: "运行超过 20 秒，已自动停止。请检查是否写了不会结束的循环。",
    allPassed: "快速测试全部通过！",
    someFailed: "还有测试没有通过，看看实际结果和预期结果哪里不同。",
    runFailed: "代码运行失败，请检查语法和缩进。",
    workerFailed: "无法启动 Python 环境，请检查网络后重试。",
    guideTitle: "第一次学习，照着这 4 步来",
    guideSteps: [
      ["选择难度", "第一次建议从简单开始，之后再逐渐提高。"],
      ["完成一节小课", "先看懂题意和题型，不需要立刻写代码。"],
      ["进入完整题练习", "在同一个界面读题、写代码并运行测试。"],
      ["写下复盘", "解释关键代码和错误原因，下次更容易认出来。"],
    ],
    goToPath: "去学习路径",
    studyReminder: "学习提醒",
    nativeSettingsTitle: "我的学习提醒",
    nativeSettingsBody: "选择一个适合你的时间。提醒由手机本地发送，不需要注册账号。",
    reminderEnabled: "每天提醒我学习",
    reminderTime: "提醒时间",
    reminderOffline: "Python 运行环境已随 App 安装，断网也可以写代码和运行测试。",
    saveReminder: "保存设置",
    savingReminder: "正在保存…",
    closeSettings: "关闭",
    reminderScheduled: "已设置每天的学习提醒。",
    reminderDisabled: "已关闭学习提醒。",
    reminderDenied: "通知权限没有开启，可以稍后在 iPhone 设置中允许通知。",
    reminderUnsupported: "当前环境不支持手机提醒。",
    reminderError: "提醒暂时没有保存成功，请稍后重试。",
    shareNotes: "分享笔记",
    shareSuccess: "已打开分享菜单。",
    shareCopied: "笔记已复制。",
    shareUnavailable: "当前设备暂时无法分享。",
    shareTitle: "题解簿学习笔记",
    privacyPolicy: "隐私政策",
    support: "帮助与联系",
    licenses: "开源许可",
    deleteData: "删除本机学习数据",
    deleteConfirm: "确定删除这台设备上的全部代码、笔记、进度和提醒吗？这个操作无法撤销。",
    deleteDone: "本机学习数据已删除。",
  },
  en: {
    brandName: "AlgoQuest",
    brandSubtitle: "LeetCode Hot 100 + Extra Practice Notebook",
    nativeBrandSubtitle: "A study notebook for 101 classic algorithm problems",
    progress: "Progress",
    autosave: "Notes save automatically on this device",
    nativeAutosave: "Code and notes are saved on this device",
    saving: "Saving…",
    saveFailed: "Save failed — copy important notes now",
    saveRecovery: "Your latest change was not saved. Copy important notes now and free some storage on this device.",
    freePractice: "Full Practice",
    learningPath: "Study Home",
    courseNotes: "Course Notes",
    appNavigation: "Main pages",
    mobileProblemList: "Choose",
    mobileCode: "Prompt + Code",
    mobileNotes: "Notes",
    mobileWorkspace: "Mobile practice navigation",
    indent: "Indent",
    outdent: "Outdent",
    fontSize: "Text",
    decreaseFont: "Decrease text size",
    increaseFont: "Increase text size",
    adjustFont: "Adjust text size",
    guide: "How it works",
    practiceWorkspaceTitle: "Full Problem Practice Workspace",
    practiceWorkspaceBody: "Read the summarized prompt, examples, and key constraints beside a professional editor; use LeetCode for the official statement and final submission.",
    practiceSteps: ["Read", "Code", "Take notes"],
    currentPractice: "Current problem",
    libraryTitle: "Hot 100 + Extra Practice",
    nativeLibraryTitle: "Classic Algorithm Practice Set",
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
    officialProblem: (id: number, title: string) => `Source: LeetCode ${id} “${title}” ↗`,
    statementTitle: "Problem",
    statementNote: "Summary, examples, and key constraints; see LeetCode for the official text",
    nativeStatementNote: "Prompt summary, examples, and tests are available offline",
    collapseProblem: "Collapse",
    expandProblem: "Expand",
    functionInput: "Function input",
    example: "Example",
    requirements: "Constraints & requirements",
    exampleInput: "Input",
    exampleOutput: "Output",
    exampleExplanation: "Explanation",
    beginnerHint: "Beginner hint",
    targetComplexity: "Target: ",
    shortcut: "Enter auto-indents · Tab adjusts indent · ⌘ / Ctrl + Enter to run",
    resetCode: "Reset starter code",
    run: "Run tests",
    running: "Running…",
    nextReview: "Tests passed — next: explain key lines →",
    markMastered: "Finish and mark as mastered",
    editorLabel: "Python code editor",
    quickTest: "Quick tests",
    testHelp: "Check the examples here; LeetCode remains the final judge.",
    nativeTestHelp: "Use the on-device quick tests first, then add more edge cases to your reasoning.",
    input: "Input",
    expected: "Expected",
    actual: "Actual",
    passed: "✓ Passed",
    failed: "× Failed",
    test: (index: number) => `Test ${index}`,
    printOutput: "View print output",
    notebookLabel: "Line meanings and notes",
    notebookTitle: "Practice notes",
    notesForProblem: "Taking notes for",
    viewProblemAndCode: "View prompt & code",
    saved: "Saved",
    lineNotes: "What each line means",
    reflection: "Plan & review",
    linePrompt: "What does each line of your code mean?",
    lineQuestions: "Explain in your own words what this line does and why it is here.",
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
    resetConfirm: "Restore the starter code? Line explanations will be cleared; your approach and review will stay.",
    starterPrompt: (line: number) => `Replace pass on line ${line} with your solution before running tests.`,
    loadingPython: "Loading Python… the first run may take a moment",
    runningCode: "Running…",
    timeout: "Stopped after 20 seconds. Check for a loop that never ends.",
    allPassed: "All quick tests passed!",
    someFailed: "Some tests still fail. Compare the actual and expected results.",
    runFailed: "The code failed to run. Check the syntax and indentation.",
    workerFailed: "Python could not start. Check your connection and try again.",
    guideTitle: "Your first learning session in 4 steps",
    guideSteps: [
      ["Choose a level", "Easy is the best place to begin, then move up gradually."],
      ["Finish one short lesson", "Understand the prompt and pattern before coding."],
      ["Open full practice", "Read the problem, write code, and run tests in one workspace."],
      ["Write a review", "Explain key lines and mistakes so the pattern is easier next time."],
    ],
    goToPath: "Go to learning path",
    studyReminder: "Study reminder",
    nativeSettingsTitle: "My study reminder",
    nativeSettingsBody: "Pick a time that works for you. The reminder is scheduled locally on this device; no account is required.",
    reminderEnabled: "Remind me every day",
    reminderTime: "Reminder time",
    reminderOffline: "Python is bundled with the app, so you can write code and run tests offline.",
    saveReminder: "Save settings",
    savingReminder: "Saving…",
    closeSettings: "Close",
    reminderScheduled: "Your daily study reminder is set.",
    reminderDisabled: "Your study reminder is off.",
    reminderDenied: "Notifications are not allowed. You can enable them later in iPhone Settings.",
    reminderUnsupported: "Study reminders are not supported in this environment.",
    reminderError: "The reminder could not be saved. Please try again.",
    shareNotes: "Share notes",
    shareSuccess: "The share sheet is open.",
    shareCopied: "Notes copied.",
    shareUnavailable: "Sharing is not available on this device.",
    shareTitle: "Algo notebook study note",
    privacyPolicy: "Privacy policy",
    support: "Help & support",
    licenses: "Open-source licenses",
    deleteData: "Delete on-device study data",
    deleteConfirm: "Delete all code, notes, progress, and reminders stored on this device? This cannot be undone.",
    deleteDone: "On-device study data deleted.",
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

const MOBILE_WORKSPACE_TABS = ["library", "code", "notes"] as const;
const NOTE_TABS = ["line", "review"] as const;
const COMPACT_WORKSPACE_QUERY = "(max-width: 760px)";

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

const DRAWER_FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function trapDrawerFocus(event: ReactKeyboardEvent<HTMLElement>, close: () => void) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (event.key !== "Tab") return;

  const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>(DRAWER_FOCUSABLE))
    .filter((element) => element.getClientRects().length > 0 && !element.hasAttribute("hidden") && element.getAttribute("aria-hidden") !== "true");
  if (!focusable.length) return;
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus();
  }
}

function handleTabListKeyDown<T extends string>(
  event: ReactKeyboardEvent<HTMLElement>,
  values: readonly T[],
  currentValue: T,
  onSelect: (value: T) => void,
) {
  const nextIndex = nextTabIndex(values.indexOf(currentValue), values.length, event.key);
  if (nextIndex === null) return;
  const nextValue = values[nextIndex];
  if (!nextValue) return;
  event.preventDefault();
  onSelect(nextValue);
  const tabs = event.currentTarget.querySelectorAll<HTMLElement>('[role="tab"]');
  window.requestAnimationFrame(() => tabs[nextIndex]?.focus());
}

export default function Home() {
  const nativeApp = isNativeAppBuild();
  const [selectedId, setSelectedId] = useState(problems[0].id);
  const [records, setRecords] = useState<StudyRecords>({});
  const [language, setLanguage] = useState<Language>("zh");
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("all");
  const [difficultyFilter, setDifficultyFilter] = useState<"all" | Problem["difficulty"]>("简单");
  const [noteTab, setNoteTab] = useState<"line" | "review">("line");
  const [noteLineMode, setNoteLineMode] = useState<"current" | "all">("current");
  const [activeCodeLine, setActiveCodeLine] = useState(1);
  const [runState, setRunState] = useState<RunState>({ phase: "idle", message: "还没有运行测试", results: [] });
  const [hydrated, setHydrated] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [showGuide, setShowGuide] = useState(false);
  const [showStatement, setShowStatement] = useState(true);
  const [showProblemList, setShowProblemList] = useState(false);
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [appMode, setAppMode] = useState<"path" | "workspace" | "course">("path");
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState<"library" | "code" | "notes">("library");
  const [profile, setProfile] = useState<LearningProfile>(EMPTY_PROFILE);
  const [showNativeSettings, setShowNativeSettings] = useState(false);
  const [dailyReminder, setDailyReminder] = useState<DailyReminder>({ enabled: false, time: "20:00" });
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const workerRef = useRef<Worker | null>(null);
  const runtimeReadyRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSequenceRef = useRef(0);
  const saveSequenceRef = useRef(0);
  const activeRunRef = useRef<{ id: string; cleanup: () => void } | null>(null);
  const codeEditorRef = useRef<LeetCodeCodeEditorHandle | null>(null);
  const problemMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const notesButtonRef = useRef<HTMLButtonElement | null>(null);
  const libraryDrawerRef = useRef<HTMLElement | null>(null);
  const notesDrawerRef = useRef<HTMLElement | null>(null);
  const nativeSettingsDialogRef = useDialogFocus<HTMLElement>(showNativeSettings, () => setShowNativeSettings(false));
  const guideDialogRef = useDialogFocus<HTMLElement>(showGuide, () => setShowGuide(false));

  const copy = pageCopy[language];
  const brandSubtitle = nativeApp ? copy.nativeBrandSubtitle : copy.brandSubtitle;
  const autosaveLabel = nativeApp ? copy.nativeAutosave : copy.autosave;
  const visibleSaveLabel = saveState === "saving" ? copy.saving : saveState === "error" ? copy.saveFailed : autosaveLabel;
  const libraryTitle = nativeApp ? copy.nativeLibraryTitle : copy.libraryTitle;
  const statementNote = nativeApp ? copy.nativeStatementNote : copy.statementNote;
  const testHelp = nativeApp ? copy.nativeTestHelp : copy.testHelp;
  const displayProblems = useMemo(
    () => problems.map((problem) => localizeProblem(problem, language)),
    [language],
  );

  const currentProblem = useMemo(
    () => displayProblems.find((problem) => problem.id === selectedId) ?? displayProblems[0],
    [displayProblems, selectedId],
  );
  const currentRecord = normalizeStudyRecord(currentProblem, records[currentProblem.id]);
  const currentDetail = localizeDetail(currentProblem, language);
  const codeLines = currentRecord.code.split("\n");
  const safeActiveCodeLine = Math.min(Math.max(1, activeCodeLine), codeLines.length);
  const noteLineIndexes = noteLineMode === "current"
    ? [safeActiveCodeLine - 1]
    : codeLines.map((_, index) => index);
  const noteEligibleLines = codeLines.filter((line) => line.trim()).length;
  const explainedLines = codeLines.filter((line, index) => line.trim() && currentRecord.lineNotes[index]?.trim()).length;
  const allQuickTestsPassed = runState.phase === "done"
    && runState.results.length > 0
    && runState.results.every((result) => result.passed);
  const runErrorForCoaching = runState.phase === "error"
    ? runState.message
    : runState.results.find((result) => result.error)?.error?.message;
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
    let cancelled = false;

    async function loadSavedStudy() {
      try {
        await configureNativeAppearance();
        const [savedLanguage, saved, savedFontSizeValue, savedProfile, savedReminder] = await Promise.all([
          getStoredValue(LANGUAGE_KEY),
          getStoredValue(STORAGE_KEY),
          getStoredValue(FONT_SIZE_KEY),
          getStoredValue(PROFILE_KEY),
          loadDailyReminder(),
        ]);
        if (cancelled) return;

        if (savedLanguage === "zh" || savedLanguage === "en") {
          setLanguage(savedLanguage);
          setRunState({ phase: "idle", message: pageCopy[savedLanguage].notRun, results: [] });
        }
        const requestedMode = new URLSearchParams(window.location.search).get("mode");
        if (requestedMode === "path" || requestedMode === "workspace" || requestedMode === "course") {
          if (requestedMode === "workspace") void loadCodeEditor();
          if (requestedMode === "course") void loadCourseNotes();
          setAppMode(requestedMode);
          if (requestedMode === "workspace") setMobileWorkspaceTab("library");
        }
        if (saved) {
          const normalized = normalizeSavedStudy(parseStoredJson(saved), problems);
          setRecords(normalized.records);
          if (normalized.selectedId) setSelectedId(normalized.selectedId);
        }
        const savedFontSize = Number(savedFontSizeValue);
        if (Number.isInteger(savedFontSize) && savedFontSize >= MIN_FONT_SIZE && savedFontSize <= MAX_FONT_SIZE) {
          setFontSize(savedFontSize);
        }
        if (savedProfile) {
          const loaded = normalizeLearningProfile(parseStoredJson(savedProfile));
          if (loaded.todayDate !== localDateKey()) {
            loaded.todayXp = 0;
            if (loaded.todayDate !== yesterdayKey()) loaded.streak = 0;
          }
          setProfile(loaded);
        }
        setDailyReminder(savedReminder);
      } catch {
        // A damaged local note should not stop the site from opening.
      } finally {
        if (!cancelled) setHydrated(true);
      }
    }

    void loadSavedStudy();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const sequence = ++saveSequenceRef.current;
    let cancelled = false;
    const savingTimer = window.setTimeout(() => {
      if (saveSequenceRef.current === sequence) setSaveState("saving");
    }, 0);
    const timer = window.setTimeout(() => {
      void persistWithStatus(() => setStoredValue(STORAGE_KEY, JSON.stringify({ version: STUDY_STORAGE_VERSION, records, selectedId })))
        .then((result) => {
          if (!cancelled && saveSequenceRef.current === sequence) setSaveState(result);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(savingTimer);
      window.clearTimeout(timer);
    };
  }, [hydrated, records, selectedId]);

  useEffect(() => {
    document.documentElement.style.setProperty("--app-font-size", `${fontSize}px`);
    if (!hydrated) return;
    void persistWithStatus(() => setStoredValue(FONT_SIZE_KEY, String(fontSize)));
  }, [fontSize, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    void persistWithStatus(() => setStoredValue(PROFILE_KEY, JSON.stringify(profile)));
  }, [hydrated, profile]);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = nativeApp
      ? (language === "zh" ? "题解簿｜算法学习手账" : "AlgoQuest | Algorithm Study Notebook")
      : (language === "zh" ? "题解簿｜LeetCode Hot 100 小白学习工作台" : "AlgoQuest | LeetCode Hot 100 Learning Path");
    if (!hydrated) return;
    void persistWithStatus(() => setStoredValue(LANGUAGE_KEY, language));
  }, [hydrated, language, nativeApp]);

  useEffect(() => {
    return () => {
      activeRunRef.current?.cleanup();
      activeRunRef.current = null;
      workerRef.current?.terminate();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!showProblemList) return;
    const frame = window.requestAnimationFrame(() => {
      const drawer = libraryDrawerRef.current;
      (drawer?.querySelector<HTMLElement>("input") ?? drawer?.querySelector<HTMLElement>("button"))?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showProblemList]);

  useEffect(() => {
    if (!showNotesDrawer) return;
    const frame = window.requestAnimationFrame(() => {
      notesDrawerRef.current?.querySelector<HTMLElement>("button, textarea")?.focus();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [showNotesDrawer]);

  useEffect(() => {
    if (!showProblemList && !showNotesDrawer) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (showProblemList) {
        setShowProblemList(false);
        window.requestAnimationFrame(() => problemMenuButtonRef.current?.focus());
      } else {
        setShowNotesDrawer(false);
        window.requestAnimationFrame(() => notesButtonRef.current?.focus());
      }
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [showNotesDrawer, showProblemList]);

  useEffect(() => {
    const compactWorkspace = window.matchMedia(COMPACT_WORKSPACE_QUERY);
    function closeDesktopDrawersOnCompactLayout() {
      if (!compactWorkspace.matches) return;
      setShowProblemList(false);
      setShowNotesDrawer(false);
    }
    closeDesktopDrawersOnCompactLayout();
    compactWorkspace.addEventListener("change", closeDesktopDrawersOnCompactLayout);
    return () => compactWorkspace.removeEventListener("change", closeDesktopDrawersOnCompactLayout);
  }, []);

  function updateRecord(patch: Partial<StudyRecord>) {
    setRecords((previous) => ({
      ...previous,
      [currentProblem.id]: {
        ...normalizeStudyRecord(currentProblem, previous[currentProblem.id]),
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
          ...normalizeStudyRecord(problem, previous[id]),
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

  function cancelActiveRun() {
    const activeRun = activeRunRef.current;
    if (!activeRun) return;
    activeRun.cleanup();
    activeRunRef.current = null;
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    runtimeReadyRef.current = false;
  }

  function selectMobileWorkspacePane(pane: typeof MOBILE_WORKSPACE_TABS[number]) {
    setShowProblemList(false);
    setShowNotesDrawer(false);
    setMobileWorkspaceTab(pane);
  }

  function openProblemListDrawer() {
    if (window.matchMedia(COMPACT_WORKSPACE_QUERY).matches) {
      selectMobileWorkspacePane("library");
      return;
    }
    setShowNotesDrawer(false);
    setShowProblemList(true);
    setMobileWorkspaceTab("library");
  }

  function closeProblemListDrawer(restoreFocus = true) {
    setShowProblemList(false);
    if (restoreFocus) window.requestAnimationFrame(() => problemMenuButtonRef.current?.focus());
  }

  function openNotesDrawer() {
    if (window.matchMedia(COMPACT_WORKSPACE_QUERY).matches) {
      selectMobileWorkspacePane("notes");
      return;
    }
    setShowProblemList(false);
    setShowNotesDrawer(true);
    setMobileWorkspaceTab("notes");
  }

  function closeNotesDrawer(restoreFocus = true) {
    setShowNotesDrawer(false);
    if (restoreFocus) window.requestAnimationFrame(() => notesButtonRef.current?.focus());
  }

  function openProblemFromPath(id: number) {
    void loadCodeEditor();
    chooseProblem(id);
    setAppMode("workspace");
    setMobileWorkspaceTab("code");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }

  function chooseProblem(id: number) {
    void playSelectionHaptic();
    cancelActiveRun();
    setSelectedId(id);
    setRunState({ phase: "idle", message: copy.notRun, results: [] });
    setNoteTab("line");
    setNoteLineMode("current");
    setActiveCodeLine(1);
    setShowStatement(true);
    closeProblemListDrawer(false);
    setMobileWorkspaceTab("code");
    window.requestAnimationFrame(() => codeEditorRef.current?.focus());
  }

  function showAppMode(nextMode: "path" | "workspace" | "course") {
    void playSelectionHaptic();
    if (nextMode === "workspace") void loadCodeEditor();
    if (nextMode === "course") void loadCourseNotes();
    if (nextMode !== "workspace") cancelActiveRun();
    setAppMode(nextMode);
    setShowProblemList(false);
    setShowNotesDrawer(false);
    if (nextMode === "workspace" && appMode !== "workspace") setMobileWorkspaceTab("library");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }

  function selectLanguage(nextLanguage: Language) {
    void playSelectionHaptic();
    cancelActiveRun();
    setLanguage(nextLanguage);
    setTopic("all");
    setRunState({ phase: "idle", message: pageCopy[nextLanguage].notRun, results: [] });
  }

  function reminderResultMessage(result: ReminderSaveResult): string {
    const messages: Record<ReminderSaveResult, string> = {
      scheduled: copy.reminderScheduled,
      disabled: copy.reminderDisabled,
      denied: copy.reminderDenied,
      unsupported: copy.reminderUnsupported,
      error: copy.reminderError,
    };
    return messages[result];
  }

  async function handleSaveReminder() {
    setReminderSaving(true);
    setReminderMessage("");
    const result = await saveDailyReminder(dailyReminder, language);
    if (result === "denied") setDailyReminder((current) => ({ ...current, enabled: false }));
    setReminderMessage(reminderResultMessage(result));
    setReminderSaving(false);
    if (result === "scheduled" || result === "disabled") void playTestHaptic(true);
  }

  function studyNoteForSharing(): string {
    const lineNotes = codeLines
      .map((line, index) => {
        const note = currentRecord.lineNotes[index]?.trim();
        return note ? `${index + 1}. ${line || copy.blankLine}\n   ${note}` : "";
      })
      .filter(Boolean)
      .join("\n");
    const headings = language === "zh"
      ? { code: "我的代码", lines: "每一行代码是什么意思", thinking: "解题思路", mistakes: "卡住或写错", review: "下次识别信号" }
      : { code: "My code", lines: "What each line means", thinking: "Approach", mistakes: "Mistakes", review: "Pattern to recognize" };

    return [
      `${currentProblem.id}. ${currentProblem.title}`,
      `${copy.difficultyLabels[currentProblem.difficulty]} · ${currentProblem.topic}`,
      `\n${headings.code}\n\n${currentRecord.code}`,
      lineNotes ? `\n${headings.lines}\n\n${lineNotes}` : "",
      currentRecord.thinking.trim() ? `\n${headings.thinking}\n\n${currentRecord.thinking.trim()}` : "",
      currentRecord.mistakes.trim() ? `\n${headings.mistakes}\n\n${currentRecord.mistakes.trim()}` : "",
      currentRecord.review.trim() ? `\n${headings.review}\n\n${currentRecord.review.trim()}` : "",
    ].filter(Boolean).join("\n");
  }

  async function handleShareNotes() {
    setShareMessage("");
    const result = await shareStudyNote(
      `${copy.shareTitle} · ${currentProblem.id}. ${currentProblem.title}`,
      studyNoteForSharing(),
    );
    setShareMessage(result === "shared" ? copy.shareSuccess : result === "copied" ? copy.shareCopied : copy.shareUnavailable);
  }

  async function handleDeleteStudyData() {
    if (!window.confirm(copy.deleteConfirm)) return;
    setAppMode("path");
    await clearStoredStudyData([STORAGE_KEY, FONT_SIZE_KEY, PROFILE_KEY, LANGUAGE_KEY, COURSE_NOTES_STORAGE_KEY]);
    setRecords({});
    setSelectedId(problems[0].id);
    setProfile(EMPTY_PROFILE);
    setFontSize(DEFAULT_FONT_SIZE);
    setLanguage("zh");
    setDailyReminder({ enabled: false, time: "20:00" });
    setRunState({ phase: "idle", message: pageCopy.zh.notRun, results: [] });
    setReminderMessage(pageCopy.zh.deleteDone);
    void playTestHaptic(true);
  }

  function updateLineNote(index: number, value: string) {
    const next = [...currentRecord.lineNotes];
    next[index] = value;
    updateRecord({ lineNotes: next });
  }

  function selectCodeLine(lineNumber: number) {
    const nextLine = Math.min(Math.max(1, lineNumber), codeLines.length);
    setActiveCodeLine(nextLine);
    window.requestAnimationFrame(() => codeEditorRef.current?.revealLine(nextLine));
  }

  function fillLineNotes() {
    updateRecord({
      lineNotes: codeLines.map((line, index) => currentRecord.lineNotes[index] || explainLine(line, language)),
    });
  }

  function resetCode() {
    if (!window.confirm(copy.resetConfirm)) return;
    cancelActiveRun();
    updateRecord({ code: currentProblem.starterCode, lineNotes: [], status: "todo" });
    setNoteLineMode("current");
    selectCodeLine(1);
    setRunState({ phase: "idle", message: copy.resetMessage, results: [] });
  }

  function markCurrentProblemSolved() {
    updateRecord({ status: "solved" });
    void playTestHaptic(true);
  }

  function updateEditorCode(nextCode: string, lineNoteEdit?: LineNoteEdit) {
    cancelActiveRun();
    setRunState({ phase: "idle", message: copy.notRun, results: [] });
    setRecords((previous) => {
      const previousRecord = normalizeStudyRecord(currentProblem, previous[currentProblem.id]);
      return {
        ...previous,
        [currentProblem.id]: {
          ...previousRecord,
          code: nextCode,
          lineNotes: syncLineNotes(previousRecord.code, nextCode, previousRecord.lineNotes, lineNoteEdit),
        },
      };
    });
  }

  function adjustEditorIndent(direction: "in" | "out") {
    if (direction === "out") codeEditorRef.current?.outdent();
    else codeEditorRef.current?.indent();
  }

  function runTests() {
    if (runState.phase === "running" || activeRunRef.current) return;

    const placeholderLine = untouchedStarterLine(currentRecord.code, currentProblem.starterCode);
    if (placeholderLine !== null) {
      setRunState({ phase: "idle", message: copy.starterPrompt(placeholderLine), results: [] });
      selectCodeLine(placeholderLine);
      return;
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const requestId = `${currentProblem.id}:${++runSequenceRef.current}`;
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const worker = workerRef.current ?? new Worker(`${basePath}/python-worker.js`);
    workerRef.current = worker;
    setRunState({ phase: "running", message: copy.loadingPython, results: [] });
    updateRecord({ status: currentRecord.status === "solved" ? "solved" : "learning" });

    function cleanupWorkerListeners() {
      worker.removeEventListener("message", handleWorkerMessage);
      worker.removeEventListener("error", handleWorkerError);
    }

    function finishActiveRequest(): boolean {
      if (activeRunRef.current?.id !== requestId) return false;
      cleanupWorkerListeners();
      activeRunRef.current = null;
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      return true;
    }

    const armTimeout = (duration: number) => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (!finishActiveRequest()) return;
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
      if (activeRunRef.current?.id !== requestId || !messageBelongsToRun(data, requestId)) return;
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

      if (!finishActiveRequest()) return;

      if (data.type === "result") {
        const results = (data.results ?? []) as WorkerTestResult[];
        const allPassed = results.length > 0 && results.every((result) => result.passed);
        const firstError = results.find((result) => result.error)?.error;
        const errorLine = solutionErrorLine(`${firstError?.message ?? ""}\n${firstError?.traceback ?? ""}`);
        if (errorLine) window.requestAnimationFrame(() => codeEditorRef.current?.revealLine(errorLine));
        void playTestHaptic(allPassed);
        setRunState({
          phase: "done",
          message: allPassed ? copy.allPassed : copy.someFailed,
          results,
          duration: data.duration ?? 0,
          stdout: data.stdout ?? "",
        });
        return;
      }

      const errorMessage = data.error?.message ?? copy.runFailed;
      const errorLine = solutionErrorLine(`${errorMessage}\n${data.error?.traceback ?? ""}`);
      if (errorLine) window.requestAnimationFrame(() => codeEditorRef.current?.revealLine(errorLine));
      setRunState({
        phase: "error",
        message: errorMessage,
        results: [],
        stdout: data.stdout ?? "",
      });
    }

    function handleWorkerError(event: ErrorEvent) {
      if (!finishActiveRequest()) return;
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
    activeRunRef.current = { id: requestId, cleanup: cleanupWorkerListeners };

    worker.postMessage({
      id: requestId,
      code: currentRecord.code,
      tests: currentProblem.tests,
    });
  }

  return (
    <main className={`app-shell ${nativeApp ? "is-native-app" : ""}`}>
      <header className={`site-header ${headerStyles.responsiveHeader}`}>
        <div className="brand-block">
          <span className="brand-mark" aria-hidden="true">{"{ }"}</span>
          <div>
            <strong>{copy.brandName}</strong>
            <span>{brandSubtitle}</span>
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
          <span className={`save-state ${saveState === "saving" ? headerStyles.saveSaving : saveState === "error" ? headerStyles.saveError : ""}`} role="status"><i />{visibleSaveLabel}</span>
          <nav className="app-mode-nav" aria-label={copy.appNavigation}>
            <button type="button" className={appMode === "path" ? "is-active" : ""} aria-current={appMode === "path" ? "page" : undefined} onClick={() => showAppMode("path")}>{copy.learningPath}</button>
            <button type="button" className={appMode === "workspace" ? "is-active" : ""} aria-current={appMode === "workspace" ? "page" : undefined} onMouseEnter={() => { void loadCodeEditor(); }} onFocus={() => { void loadCodeEditor(); }} onClick={() => showAppMode("workspace")}>{copy.freePractice}</button>
            <button type="button" className={appMode === "course" ? "is-active" : ""} aria-current={appMode === "course" ? "page" : undefined} onMouseEnter={() => { void loadCourseNotes(); }} onFocus={() => { void loadCourseNotes(); }} onClick={() => showAppMode("course")}>{copy.courseNotes}</button>
          </nav>
          <div className="language-toggle" role="group" aria-label="Language / 语言">
            <button type="button" lang="zh-CN" className={language === "zh" ? "is-active" : ""} onClick={() => selectLanguage("zh")}>中文</button>
            <button type="button" lang="en" className={language === "en" ? "is-active" : ""} onClick={() => selectLanguage("en")}>EN</button>
          </div>
          <PwaInstaller language={language} />
          {nativeApp && (
            <button className="button native-tools-trigger" type="button" onClick={() => { setReminderMessage(""); setShowNativeSettings(true); }}>
              <span aria-hidden="true">◷</span>{copy.studyReminder}
            </button>
          )}
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

      {saveState === "error" && (
        <div className={headerStyles.saveErrorBanner} role="alert">
          <strong>{copy.saveFailed}</strong>
          <span>{copy.saveRecovery}</span>
        </div>
      )}

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
      ) : appMode === "course" ? (
        <Suspense fallback={<div className={headerStyles.modeLoading} role="status">{language === "zh" ? "正在打开课程笔记…" : "Opening course notes…"}</div>}>
          <CourseNotes language={language} nativeApp={nativeApp} />
        </Suspense>
      ) : (
        <div className={`workspace ${ideStyles.workspace}`}>
        <section className={ideStyles.topbar} aria-labelledby="practice-workspace-title">
          <h1 id="practice-workspace-title" className="sr-only">{copy.practiceWorkspaceTitle}</h1>
          <div className={ideStyles.topbarPrimary}>
            <button
              ref={problemMenuButtonRef}
              type="button"
              className={ideStyles.problemMenuButton}
              aria-expanded={showProblemList}
              aria-controls="mobile-library-panel"
              onClick={openProblemListDrawer}
            >
              <span className={ideStyles.problemMenuIcon} aria-hidden="true">☰</span>
              <span>{language === "zh" ? "题目列表" : "Problem list"}</span>
            </button>
            <div className={ideStyles.currentProblem}>
              <strong>{currentProblem.id}. {currentProblem.title}</strong>
              <span>{copy.difficultyLabels[currentProblem.difficulty]} · {currentProblem.topic}</span>
            </div>
          </div>
          <div className={ideStyles.topbarActions}>
            <button
              ref={notesButtonRef}
              type="button"
              className={ideStyles.notesButton}
              aria-expanded={showNotesDrawer}
              aria-controls="mobile-notes-panel"
              onClick={openNotesDrawer}
            >
              <span aria-hidden="true">✎</span>
              <span>{language === "zh" ? "笔记" : "Notes"}</span>
            </button>
            {!nativeApp && (
              <a
                className={ideStyles.officialButton}
                href={`${language === "zh" ? "https://leetcode.cn" : "https://leetcode.com"}/problems/${currentProblem.slug}/description/`}
                target="_blank"
                rel="noreferrer"
              >
                {language === "zh" ? "去 LeetCode 提交" : "Submit on LeetCode"}<span aria-hidden="true">↗</span>
              </a>
            )}
          </div>
        </section>
        {(showProblemList || showNotesDrawer) && (
          <button
            type="button"
            className={ideStyles.drawerBackdrop}
            aria-label={language === "zh" ? "关闭侧栏" : "Close drawer"}
            onClick={() => { if (showProblemList) closeProblemListDrawer(); else closeNotesDrawer(); }}
          />
        )}
        <nav
          className="mobile-workspace-tabs"
          role="tablist"
          aria-label={copy.mobileWorkspace}
          onKeyDown={(event) => handleTabListKeyDown(event, MOBILE_WORKSPACE_TABS, mobileWorkspaceTab, selectMobileWorkspacePane)}
        >
          <button id="mobile-library-tab" type="button" role="tab" tabIndex={mobileWorkspaceTab === "library" ? 0 : -1} aria-selected={mobileWorkspaceTab === "library"} aria-controls="mobile-library-panel" className={mobileWorkspaceTab === "library" ? "is-active" : ""} onClick={() => selectMobileWorkspacePane("library")}>
            <span aria-hidden="true">☷</span>{copy.mobileProblemList}
          </button>
          <button id="mobile-code-tab" type="button" role="tab" tabIndex={mobileWorkspaceTab === "code" ? 0 : -1} aria-selected={mobileWorkspaceTab === "code"} aria-controls="mobile-code-panel" className={mobileWorkspaceTab === "code" ? "is-active" : ""} onClick={() => selectMobileWorkspacePane("code")}>
            <span aria-hidden="true">{">_"}</span>{copy.mobileCode}
          </button>
          <button id="mobile-notes-tab" type="button" role="tab" tabIndex={mobileWorkspaceTab === "notes" ? 0 : -1} aria-selected={mobileWorkspaceTab === "notes"} aria-controls="mobile-notes-panel" className={mobileWorkspaceTab === "notes" ? "is-active" : ""} onClick={() => selectMobileWorkspacePane("notes")}>
            <span aria-hidden="true">✎</span>{copy.mobileNotes}
          </button>
        </nav>
        <aside
          id="mobile-library-panel"
          ref={libraryDrawerRef}
          role={showProblemList ? "dialog" : "tabpanel"}
          aria-modal={showProblemList ? true : undefined}
          aria-labelledby={showProblemList ? undefined : "mobile-library-tab"}
          className={`panel library-panel mobile-workspace-pane ${ideStyles.libraryDrawer} ${showProblemList ? ideStyles.drawerOpen : ""} ${mobileWorkspaceTab === "library" ? "is-mobile-active" : ""}`}
          aria-label={showProblemList ? libraryTitle : undefined}
          onKeyDown={showProblemList ? (event) => trapDrawerFocus(event, closeProblemListDrawer) : undefined}
        >
          <button type="button" className={ideStyles.drawerClose} aria-label={language === "zh" ? "关闭题目列表" : "Close problem list"} onClick={() => { closeProblemListDrawer(); setMobileWorkspaceTab("code"); }}>×</button>
          <div className="library-head">
            <div className="section-kicker">LEARNING MAP</div>
            <div className="library-title-row">
              <h1>{libraryTitle}</h1>
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

          <nav className="problem-list" aria-label={libraryTitle}>
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

        <section id="mobile-code-panel" role="tabpanel" aria-labelledby="mobile-code-tab" className={`panel focus-panel mobile-workspace-pane ${ideStyles.focusPanel} ${mobileWorkspaceTab === "code" ? "is-mobile-active" : ""}`}>
          <article className={`problem-brief ${ideStyles.problemPane}`}>
            <div className={ideStyles.problemTabs}><span>{language === "zh" ? "题目描述" : "Description"}</span></div>
            <div className={ideStyles.problemContent}>
            <div className="brief-topline">
              <span>{nativeApp ? "ALGORITHM 101" : "HOT 100 + EXTRA"} / {currentProblem.topic}</span>
              {!nativeApp && (
                <cite className="problem-source">
                  <a href={`${language === "zh" ? "https://leetcode.cn" : "https://leetcode.com"}/problems/${currentProblem.slug}/description/`} target="_blank" rel="noreferrer">
                    {copy.officialProblem(currentProblem.id, currentProblem.title)}
                  </a>
                </cite>
              )}
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
                  <small>{statementNote}</small>
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
                      {currentDetail.examples?.length ? (
                        <ol className="statement-example-list">
                          {currentDetail.examples.map((example) => (
                            <li key={`${example.input}-${example.output}`}>
                              <div><b>{copy.exampleInput}</b><code>{example.input}</code></div>
                              <div><b>{copy.exampleOutput}</b><code>{example.output}</code></div>
                              {example.explanation ? <p><b>{copy.exampleExplanation}</b>{example.explanation}</p> : null}
                            </li>
                          ))}
                        </ol>
                      ) : (
                        <code>{currentProblem.example}</code>
                      )}
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
            </div>
          </article>

          <div className={`editor-toolbar ${ideStyles.editorToolbar}`}>
            <div className="editor-meta">
              <label className={ideStyles.languageWrap}>
                <span className="sr-only">{language === "zh" ? "编程语言" : "Programming language"}</span>
                <select className={ideStyles.languageSelect} value="python" onChange={() => undefined} aria-label={language === "zh" ? "编程语言，目前支持 Python 3" : "Programming language, currently Python 3"}>
                  <option value="python">Python 3</option>
                </select>
              </label>
              <span className={`shortcut-label ${ideStyles.shortcut}`}>{copy.shortcut}</span>
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
              {!nativeApp && (
                <a className={`${ideStyles.officialButton} ${ideStyles.editorSubmit}`} href={`${language === "zh" ? "https://leetcode.cn" : "https://leetcode.com"}/problems/${currentProblem.slug}/description/`} target="_blank" rel="noreferrer">
                  {language === "zh" ? "提交" : "Submit"}<span aria-hidden="true">↗</span>
                </a>
              )}
            </div>
          </div>

          <div className={`code-editor-wrap ${ideStyles.editorHost}`}>
            <Suspense fallback={<div className={ideStyles.editorLoading} role="status">{language === "zh" ? "正在准备代码编辑器…" : "Preparing code editor…"}</div>}>
              <LeetCodeCodeEditor
                key={currentProblem.id}
                ref={codeEditorRef}
                value={currentRecord.code}
                onChange={updateEditorCode}
                onRun={runTests}
                fontSize={fontSize}
                language={language}
                ariaLabel={copy.editorLabel}
                onCursorLineChange={setActiveCodeLine}
              />
            </Suspense>
          </div>

          <section className={`test-console test-${runState.phase} ${ideStyles.testConsole}`} aria-live="polite">
            <div className="console-head">
              <div>
                <strong>{copy.quickTest}</strong>
                <span id="editor-help">{testHelp}</span>
              </div>
              <div className="console-status">
                {runState.phase === "running" && <i className="spinner" />}
                <span>{runState.message}</span>
                {runState.phase === "done" && <small>{Math.round(runState.duration)} ms</small>}
              </div>
            </div>

            {runErrorForCoaching && (
              <div className={ideStyles.errorCoach} role="note">
                <strong>{language === "zh" ? "先修第一处错误" : "Fix the first error first"}</strong>
                <span>{beginnerPythonErrorHint(runErrorForCoaching, language)}</span>
              </div>
            )}

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

            {allQuickTestsPassed && (
              <button className="next-review-button" type="button" onClick={() => { setNoteTab("line"); openNotesDrawer(); }}>
                {copy.nextReview}
              </button>
            )}

            {runState.phase === "done" && runState.stdout && (
              <details className="stdout-block"><summary>{copy.printOutput}</summary><pre>{runState.stdout}</pre></details>
            )}
          </section>
        </section>

        <aside
          id="mobile-notes-panel"
          ref={notesDrawerRef}
          role={showNotesDrawer ? "dialog" : "tabpanel"}
          aria-modal={showNotesDrawer ? true : undefined}
          aria-labelledby={showNotesDrawer ? undefined : "mobile-notes-tab"}
          className={`panel notes-panel mobile-workspace-pane ${ideStyles.notesDrawer} ${showNotesDrawer ? ideStyles.drawerOpen : ""} ${mobileWorkspaceTab === "notes" ? "is-mobile-active" : ""}`}
          aria-label={showNotesDrawer ? copy.notebookLabel : undefined}
          onKeyDown={showNotesDrawer ? (event) => trapDrawerFocus(event, closeNotesDrawer) : undefined}
        >
          <button type="button" className={ideStyles.drawerClose} aria-label={language === "zh" ? "关闭笔记" : "Close notes"} onClick={() => { closeNotesDrawer(); setMobileWorkspaceTab("code"); }}>×</button>
          <div className="notes-head">
            <div>
              <div className="section-kicker">MY NOTEBOOK</div>
              <h2>{copy.notebookTitle}</h2>
              <span className="notes-problem-label">{copy.notesForProblem} <strong>{currentProblem.id}. {currentProblem.title}</strong></span>
            </div>
            <div className="notes-head-actions">
              {nativeApp && <button type="button" className="share-note-button" onClick={handleShareNotes}><span aria-hidden="true">↗</span>{copy.shareNotes}</button>}
              <span className="autosave-badge">{copy.saved}</span>
            </div>
          </div>
          {shareMessage && <p className="native-action-message" role="status">{shareMessage}</p>}

          <div
            className="note-tabs"
            role="tablist"
            aria-label={copy.notebookLabel}
            onKeyDown={(event) => handleTabListKeyDown(event, NOTE_TABS, noteTab, setNoteTab)}
          >
            <button id="line-notes-tab" type="button" role="tab" tabIndex={noteTab === "line" ? 0 : -1} aria-selected={noteTab === "line"} aria-controls="line-notes-panel" className={noteTab === "line" ? "is-active" : ""} onClick={() => setNoteTab("line")}>{copy.lineNotes}</button>
            <button id="review-notes-tab" type="button" role="tab" tabIndex={noteTab === "review" ? 0 : -1} aria-selected={noteTab === "review"} aria-controls="review-notes-panel" className={noteTab === "review" ? "is-active" : ""} onClick={() => setNoteTab("review")}>{copy.reflection}</button>
          </div>

          <div className="mobile-notes-context">
            <div>
              <strong>{currentProblem.id}. {currentProblem.title}</strong>
              <span>{copy.difficultyLabels[currentProblem.difficulty]} · {currentProblem.topic}</span>
            </div>
            <button type="button" onClick={() => { closeNotesDrawer(); setMobileWorkspaceTab("code"); }}>{copy.viewProblemAndCode}</button>
          </div>

          {noteTab === "line" ? (
            <div id="line-notes-panel" role="tabpanel" aria-labelledby="line-notes-tab" className="line-notes-view">
              <div className="line-note-intro">
                <p>{copy.linePrompt}<strong>{copy.lineQuestions}</strong></p>
                <button type="button" onClick={fillLineNotes}>{copy.fillNotes}</button>
              </div>
              <div className={ideStyles.lineNoteNavigator}>
                <div>
                  <strong>{language === "zh" ? `当前第 ${safeActiveCodeLine} 行` : `Current line ${safeActiveCodeLine}`}</strong>
                  <span>{language === "zh" ? `已解释 ${explainedLines} / ${noteEligibleLines} 行` : `${explainedLines} / ${noteEligibleLines} lines explained`}</span>
                </div>
                <div role="group" aria-label={language === "zh" ? "选择要解释的代码行" : "Choose code line to explain"}>
                  <button
                    type="button"
                    aria-label={language === "zh" ? "上一行" : "Previous line"}
                    disabled={safeActiveCodeLine <= 1}
                    onClick={() => selectCodeLine(safeActiveCodeLine - 1)}
                  >
                    ←
                  </button>
                  <button
                    type="button"
                    aria-label={language === "zh" ? "下一行" : "Next line"}
                    disabled={safeActiveCodeLine >= codeLines.length}
                    onClick={() => selectCodeLine(safeActiveCodeLine + 1)}
                  >
                    →
                  </button>
                  <button
                    type="button"
                    aria-pressed={noteLineMode === "current"}
                    className={noteLineMode === "current" ? ideStyles.navigatorActive : ""}
                    onClick={() => setNoteLineMode("current")}
                  >
                    {language === "zh" ? "当前行" : "Current"}
                  </button>
                  <button
                    type="button"
                    aria-pressed={noteLineMode === "all"}
                    className={noteLineMode === "all" ? ideStyles.navigatorActive : ""}
                    onClick={() => setNoteLineMode("all")}
                  >
                    {language === "zh" ? "全部行" : "All"}
                  </button>
                </div>
              </div>
              <div className="line-note-list">
                {noteLineIndexes.map((index) => {
                  const line = codeLines[index];
                  return (
                    <label className="line-note-card" key={index}>
                      <span className="note-line-number">{String(index + 1).padStart(2, "0")}</span>
                      <code>{line || copy.blankLine}</code>
                      <textarea
                        value={currentRecord.lineNotes[index] ?? ""}
                        onChange={(event) => updateLineNote(index, event.target.value)}
                        placeholder={explainLine(line, language)}
                        rows={2}
                      />
                    </label>
                  );
                })}
              </div>
            </div>
          ) : (
            <div id="review-notes-panel" role="tabpanel" aria-labelledby="review-notes-tab" className="review-notes-view">
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
            {allQuickTestsPassed && currentRecord.status !== "solved" && (
              <button className={`next-review-button ${ideStyles.masteryAction}`} type="button" onClick={markCurrentProblemSolved}>
                ✓ {copy.markMastered}
              </button>
            )}
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

      {nativeApp && showNativeSettings && (
        <div className="native-settings-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowNativeSettings(false); }}>
          <section ref={nativeSettingsDialogRef} tabIndex={-1} className="native-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="native-settings-title">
            <div className="native-settings-handle" aria-hidden="true" />
            <button className="guide-close" type="button" aria-label={copy.closeSettings} onClick={() => setShowNativeSettings(false)}>×</button>
            <div className="section-kicker">ON-DEVICE STUDY</div>
            <h2 id="native-settings-title">{copy.nativeSettingsTitle}</h2>
            <p>{copy.nativeSettingsBody}</p>

            <label className="native-reminder-toggle">
              <span><strong>{copy.reminderEnabled}</strong><small>{dailyReminder.enabled ? dailyReminder.time : "—"}</small></span>
              <input
                type="checkbox"
                checked={dailyReminder.enabled}
                onChange={(event) => { setReminderMessage(""); setDailyReminder((current) => ({ ...current, enabled: event.target.checked })); }}
              />
            </label>

            <label className="native-reminder-time">
              <span>{copy.reminderTime}</span>
              <input
                type="time"
                value={dailyReminder.time}
                disabled={!dailyReminder.enabled}
                onChange={(event) => setDailyReminder((current) => ({ ...current, time: event.target.value }))}
              />
            </label>

            <div className="native-offline-note"><span aria-hidden="true">✓</span><p>{copy.reminderOffline}</p></div>
            {reminderMessage && <p className="native-settings-message" role="status">{reminderMessage}</p>}

            <button className="button button-primary native-reminder-save" type="button" onClick={handleSaveReminder} disabled={reminderSaving}>
              {reminderSaving ? copy.savingReminder : copy.saveReminder}
            </button>

            <div className="native-settings-links">
              <button type="button" onClick={() => void openExternalPage(PRIVACY_URL)}>{copy.privacyPolicy}<span aria-hidden="true">↗</span></button>
              <button type="button" onClick={() => void openExternalPage(SUPPORT_URL)}>{copy.support}<span aria-hidden="true">↗</span></button>
              <button type="button" onClick={() => void openExternalPage(LICENSES_URL)}>{copy.licenses}<span aria-hidden="true">↗</span></button>
            </div>
            <button className="native-delete-data" type="button" onClick={handleDeleteStudyData}>{copy.deleteData}</button>
          </section>
        </div>
      )}

      {showGuide && (
        <div className="guide-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowGuide(false); }}>
          <section ref={guideDialogRef} tabIndex={-1} className="guide-dialog" role="dialog" aria-modal="true" aria-labelledby="guide-title">
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
