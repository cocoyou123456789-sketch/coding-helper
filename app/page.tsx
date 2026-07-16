"use client";

import { lazy, Suspense, useEffect, useLayoutEffect, useMemo, useRef, useState, type ChangeEvent as ReactChangeEvent, type KeyboardEvent as ReactKeyboardEvent, type RefObject } from "react";
import backupStyles from "./backup-settings.module.css";
import {
  syncLineNotes,
  type LineNoteEdit,
} from "./code-editor";
import { COURSE_NOTES_STORAGE_KEY, normalizeCourseStore } from "./course-notes-model";
import { drainCourseStoreWrites, latestCourseStoreSnapshot } from "./course-storage";
import headerStyles from "./header.module.css";
import type { LeetCodeCodeEditorHandle } from "./leetcode-code-editor";
import LearningHub, { type LearningProfile } from "./learning-hub";
import {
  createCurrentProblemMistake,
  emptyMistakeBookStore,
  MISTAKE_BOOK_STORAGE_KEY,
  parseMistakeBookStore,
  removeMistakeEntry,
  upsertMistakeEntry,
  type CurrentProblemMistakeSeed,
  type MistakeBookStore,
  type MistakeEntry,
} from "./mistake-book";
import {
  drainMistakeBookStoreWrites,
  latestMistakeBookStoreSnapshot,
  markMistakeBookStoreLoaded,
  queueMistakeBookStoreMutation,
} from "./mistake-book-storage";
import {
  addNoteImage,
  emptyNoteImageStore,
  NOTE_IMAGE_CAPTION_DRAFTS_STORAGE_KEY,
  NOTE_IMAGES_STORAGE_KEY,
  noteImageCount,
  noteImagesForProblem,
  parseNoteImageStore,
  removeNoteImage,
  updateNoteImageCaption,
  type NoteImageAttachment,
  type NoteImageStore,
} from "./note-images";
import {
  drainNoteImageStoreWrites,
  latestNoteImageStoreSnapshot,
  markNoteImageStoreLoaded,
  queueNoteImageStoreMutation,
} from "./note-image-storage";
import type { NoteImageActionFailure, NoteImageActionResult } from "./note-image-panel";
import {
  navigationHref,
  parseNavigationState,
  type AppMode,
  type NavigationState,
} from "./navigation-state";
import {
  clearStoredStudyData,
  cancelReminderAfterRestore,
  captureMountedStudyData,
  configureNativeAppearance,
  exportStudyBackupFile,
  flushMountedStudyData,
  getLargeStoredValue,
  getStoredValue,
  isNativeAppBuild,
  loadDailyReminder,
  openExternalPage,
  playSelectionHaptic,
  playTestHaptic,
  pauseMountedStudyData,
  resumeMountedStudyData,
  saveDailyReminder,
  setStoredValue,
  shareStudyNote,
  stageNativeStoredValueForBackground,
  writeStoredStudySnapshot,
  type DailyReminder,
  type ReminderSaveResult,
  type StoredStudySnapshot,
} from "./native-app";
import { localizeDetail, localizeProblem, type Language } from "./problem-i18n";
import { problems, type Problem } from "./problems";
import { practiceCompletionProgress, practiceKeyLineIndexes } from "./practice-completion";
import {
  filterProblemsByStatus,
  practiceRecordStatus,
  practiceStatusAfterActivity,
  practiceStatusCounts,
  recommendedPracticeProblemId,
  type PracticeStatusFilter,
} from "./practice-library";
import ideStyles from "./practice-ide.module.css";
import PwaInstaller from "./pwa-installer";
import { beginnerPythonErrorHint, describeFirstMismatch, messageBelongsToRun, normalizeSignatureIssue, pythonErrorSummary, pythonSourceIsEmpty, solutionErrorLine, starterPlaceholderLine, starterRecoveryNeedsConfirmation, type PythonSignatureIssue } from "./run-session";
import {
  createStudyBackup,
  MAX_STUDY_BACKUP_BYTES,
  parseStudyBackup,
  restoreStudySnapshot,
  stringifyStudyBackup,
  StudyBackupError,
  type StudyBackup,
} from "./study-backup";
import {
  advanceStudyDataRevision,
  assertStudyDataSessionCurrent,
  hasOtherActiveStudyTab,
  registerStudyDataTab,
  StudyDataLockUnavailableError,
  STUDY_DATA_STALE_EVENT,
  supportsSafeStudyDataWrites,
  withExclusiveStudyDataOperation,
  withInitialStudyDataReadLock,
  withStudyDataReadLock,
  withStudyDataRescueReadLock,
  withStudyDataWriteLock,
} from "./study-data-session";
import {
  STUDY_STORAGE_VERSION,
  normalizeLearningProfile,
  normalizeSavedStudy,
  normalizeStudyRecord,
  parseStoredJson,
  persistLatestSerializedValue,
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
const loadMistakeBookPanel = () => import("./mistake-book-panel");
const loadNoteImagePanel = () => import("./note-image-panel");
const CourseNotes = lazy(loadCourseNotes);
const LeetCodeCodeEditor = lazy(loadCodeEditor);
const MistakeBookPanel = lazy(loadMistakeBookPanel);
const NoteImagePanel = lazy(loadNoteImagePanel);

export const dynamic = "force-static";

type WorkerTestResult = {
  index: number;
  name: string;
  expression: string;
  expected: unknown;
  actual: unknown;
  passed: boolean;
  duration: number;
  error: { name?: string; message?: string; traceback?: string; code?: string; symbol?: string } | null;
};

type RunState =
  | { phase: "idle"; message: string; results: WorkerTestResult[] }
  | { phase: "running"; message: string; results: WorkerTestResult[] }
  | { phase: "done"; message: string; results: WorkerTestResult[]; duration: number; stdout: string; errorLine?: number }
  | { phase: "error"; kind: "code" | "timeout" | "runtime"; message: string; results: WorkerTestResult[]; stdout?: string; errorLine?: number; signatureIssue?: PythonSignatureIssue };

type BackupOperation = "idle" | "exporting" | "checking" | "restoring";

class NoteImageMutationError extends Error {
  readonly reason: NoteImageActionFailure;

  constructor(reason: NoteImageActionFailure) {
    super(reason);
    this.name = "NoteImageMutationError";
    this.reason = reason;
  }
}

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
const KNOWN_PROBLEM_IDS = new Set(problems.map((problem) => problem.id));

function writeNavigationState(nextNavigation: NavigationState, action: "push" | "replace") {
  const nextHref = navigationHref(window.location.href, nextNavigation);
  const currentHref = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  if (nextHref === currentHref) return;
  if (action === "push") {
    window.history.pushState(nextNavigation, "", nextHref);
  } else {
    window.history.replaceState(nextNavigation, "", nextHref);
  }
}

function replaceNavigationState(nextNavigation: NavigationState) {
  writeNavigationState(nextNavigation, "replace");
}

function queueStorageWrite(
  queue: { current: Promise<void> },
  operation: () => Promise<void>,
): Promise<void> {
  const pending = queue.current.catch(() => undefined).then(() => withStudyDataWriteLock(async () => {
    advanceStudyDataRevision();
    await operation();
  }));
  queue.current = pending;
  return pending;
}

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
    nativeBrandSubtitle: "105 道经典算法题学习手账",
    progress: "学习进度",
    autosave: "笔记自动保存在本机",
    nativeAutosave: "代码和笔记已保存在这台设备",
    saving: "正在保存…",
    saveFailed: "保存失败，请先复制重要笔记",
    saveRecovery: "浏览器没有保存刚才的更改。请先复制重要笔记，并清理一些本机存储空间。",
    storageLoadFailed: "暂时无法安全读取这台设备上的学习记录。为防止覆盖原笔记，本页已停止保存。请重新加载后再试。",
    retryLoad: "重新加载",
    readOnlyTitle: "当前浏览器为只读模式",
    readOnlyBody: "这个浏览器版本缺少安全保存所需的标签页锁。为避免覆盖笔记，本页只允许导出备份；请升级 Safari、Chrome 或 Edge 后再编辑。",
    staleTitle: "学习记录已在另一个标签页更新",
    staleBody: "本页已停止编辑，防止覆盖新记录。若这里还有未保存内容，请先导出救援备份，再重新加载。",
    rescueBackup: "导出本页救援备份",
    rescueBackupDone: "救援备份已导出，请保存好文件后重新加载。",
    freePractice: "完整题练习",
    learningPath: "学习首页",
    courseNotes: "课程笔记",
    mistakeBook: "错题本",
    mistakeBookLoading: "正在打开错题本…",
    mistakeBookLoadFailed: "错题本暂时无法安全读取。为避免覆盖原记录，本页只读；请先导出其他重要笔记并重新加载。",
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
    statusFilter: "学习状态",
    allStatuses: "全部",
    statusFilterLabel: "按学习状态筛选题目",
    resultSummary: (label: string, count: number) => `${label} · ${count} 题`,
    continuePractice: "继续学习",
    continueRule: "在当前难度和题型中：先续学，再复习，最后开新题。",
    continueProblem: (status: LearningStatus, id: number, title: string) => `${status === "learning" ? "继续" : status === "review" ? "复习" : "开始"} ${id}. ${title}`,
    scopeComplete: "当前筛选范围已全部掌握。",
    allProblemsComplete: "全部题目都已掌握，可以回学习首页安排复习。",
    clearFilters: "清除筛选",
    showAllStatuses: "显示全部状态",
    noStatusMatch: (label: string) => `当前没有“${label}”题目。`,
    currentProblemHidden: (id: number, title: string) => `当前题 ${id}. ${title} 被筛选隐藏了。`,
    showCurrentProblem: "显示当前题",
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
    coreIdea: "核心思路",
    showCoreIdea: "我卡住了，看核心思路",
    hideCoreIdea: "先收起核心思路",
    shortcut: "Enter 自动缩进 · Tab 调整缩进 · ⌘ / Ctrl + Enter 运行",
    resetCode: "恢复初始代码",
    run: "运行测试",
    running: "运行中…",
    nextReview: "本机测试通过，完成 3 步巩固 →",
    completionTitle: "本机测试通过，别急着结束",
    completionBody: "随附用例通过不等于力扣 Accepted。写下真正理解的部分，再去正式提交。",
    nativeCompletionBody: "随附用例通过只是第一步。写下真正理解的部分，再完成正式题库验证。",
    completionNotes: (done: number, required: number) => `解释关键代码 ${Math.min(done, required)} / ${required}`,
    completionSignal: "写 1 条“下次怎么认出来”",
    completionSubmit: "去力扣正式提交并确认 Accepted",
    openOfficialProblem: "打开正式题目",
    nativeCompletionSubmit: "完成正式题库验证",
    goExplain: "去解释",
    goWriteSignal: "去填写",
    continueReflection: "先完成复盘",
    reflectionReady: "复盘已完成，可以确认正式结果。",
    reflectionNeeded: "先完成前两项；每项只需要写一小段。",
    confirmAccepted: "我已在力扣 Accepted，标记掌握",
    confirmValidated: "我已通过正式验证，标记掌握",
    masteredTitle: "这道题真正完成了！",
    masteredBody: "本题已标记为掌握。请留意旁边的保存状态；接着趁思路还热，练下一道合适的题。",
    nextRecommended: (id: number, title: string) => `推荐下一题：${id}. ${title}`,
    practiceNext: "练下一题",
    backToStudyHome: "回学习首页",
    allMastered: "当前题库都已掌握，可以回首页选择复习。",
    statusHelp: "“已掌握”由上方完成流程自动点亮；掌握后如需重学，请先标为待复习。",
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
    imageNotes: (count: number) => count > 0 ? `图片 ${count}` : "图片",
    imageNotesLoading: "正在打开图片笔记…",
    linePrompt: "写的每一行都是什么意思？",
    lineQuestions: "用自己的话说明：这一行做了什么，为什么这样写。",
    fillNotes: "插入基础解释（请改成自己的话）",
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
    resetConfirm: "确定恢复初始代码吗？当前代码（包括注释）和逐行解释会被替换，解题思路和复盘会保留。",
    emptyCodeMessage: "代码还是空的，先恢复题目给你的函数外壳。",
    emptyCodeTitle: "先把代码外壳找回来",
    emptyCodeBody: "空白或只有注释时，测试不知道该调用哪个函数。恢复初始代码后，从 pass 那一行开始写。",
    restoreStarter: "恢复初始代码",
    backToEditor: "回到代码编辑器",
    starterPrompt: (line: number) => `先把第 ${line} 行的 pass 换成你的解法，再运行测试。`,
    starterCoachTitle: "这行还是占位符",
    starterCoachBody: "pass 不会返回答案。可以先看一步思路，也可以继续运行，亲眼看看它会得到什么结果。",
    editStarterLine: (line: number) => `去第 ${line} 行写代码`,
    runAnyway: "仍然运行",
    wrongAnswerTitle: "代码能运行，先只修第一个不同",
    wrongAnswerBody: "用这个输入手算一遍，再追踪差异位置的值在哪里写入，不用同时检查整份代码。",
    saveFailedReview: "加入错题本并对比",
    backToErrorLine: (line: number) => `回到第 ${line} 行`,
    signatureStatus: "题目要求的代码入口被改了",
    signatureTitle: "先恢复原题要求的代码入口",
    signatureBody: (symbol: string) => `力扣会按原题寻找 ${symbol}。类名、函数名或参数数量不一致时，算法还没有开始运行；只检查入口这一行，下面的解法可以保留。`,
    signatureExpected: "原题要求保留",
    checkSignatureLine: (line: number) => `检查第 ${line} 行入口`,
    checkSignatureClass: (line: number) => `回到第 ${line} 行 class`,
    backToSignatureCode: "回到代码检查入口",
    failedTestNote: (index: number, input: string, expected: string, actual: string, detail: string) => `【测试 ${index} 未通过】\n输入：${input}\n预期：${expected}\n实际：${actual}\n先修：${detail}`,
    loadingPython: "正在加载 Python 环境…首次运行会稍慢",
    runningCode: "正在运行…",
    timeout: "运行超过 20 秒，已自动停止。请检查是否写了不会结束的循环。",
    timeoutTitle: "代码运行太久，先检查循环",
    timeoutBody: "Python 已经正常启动。回到代码，只检查 while / for 是否会结束、指针是否每轮更新，或递归是否有终止条件。",
    runtimeTimeout: "Python 环境加载时间过长，代码尚未执行。请重新运行；网页首次使用若仍失败，再检查网络。",
    runtimeFailureTitle: "Python 环境还没启动",
    runtimeFailureBody: "你的代码还没有执行，也没有丢失。请重新运行；网页首次使用若仍失败，再检查网络。",
    retryRun: "重新运行",
    allPassed: "快速测试全部通过！",
    someFailed: "还有测试没有通过，看看实际结果和预期结果哪里不同。",
    runFailed: "代码运行失败，请检查语法和缩进。",
    workerFailed: "Python 环境暂时无法启动，请重新运行。",
    guideTitle: "第一次学习，照着这 4 步来",
    guideSteps: [
      ["选择难度", "第一次建议从简单开始，之后再逐渐提高。"],
      ["完成一节小课", "先看懂题意和题型，不需要立刻写代码。"],
      ["进入完整题练习", "在同一个界面读题、写代码并运行测试。"],
      ["写下复盘", "解释关键代码和错误原因，下次更容易认出来。"],
    ],
    goToPath: "去学习路径",
    settings: "设置",
    studyReminder: "学习提醒",
    nativeSettingsTitle: "设置与本机数据",
    nativeSettingsBody: "代码、笔记和进度默认只保存在这台设备，不需要注册账号。",
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
    fullBackup: "完整备份",
    backupBody: "导出代码、逐行解释、复盘、错题本、图片笔记、课程听写、学习进度和偏好设置。",
    exportBackup: "导出备份",
    restoreBackup: "从文件恢复",
    backupPrivacy: "备份文件是可阅读的明文，包含你的代码、错题本、图片笔记、课程链接、听写文字和笔记。只保存到你信任的位置；题解簿不会上传它。",
    backupPreparing: "正在整理备份…",
    localLibraryBackupBlocked: "图片笔记或错题本暂时无法安全读取，因此没有导出不完整备份。请先分享重要文字笔记并重新加载。",
    backupDownloaded: "备份已下载。",
    backupShared: "已打开分享菜单，请选择“存储到文件”或其他可信位置。",
    backupFailed: "备份没有导出成功，请检查本机存储空间后重试。",
    otherTabOpen: "另一个题解簿标签页正在打开。请先关闭它，再导出、恢复或删除，避免覆盖笔记。",
    dataChangedOtherTab: "学习数据已在另一个标签页改变。请重新加载本页后继续。",
    safeRestoreUnavailable: "当前浏览器无法安全锁定多个标签页。请使用最新版 Safari、Chrome 或 Edge 后再恢复或删除。",
    backupChecking: "正在检查备份…",
    backupReady: "备份已检查，请确认是否替换本机数据。",
    backupInvalid: "这不是可用的题解簿备份文件，本机数据没有改变。",
    backupTooLarge: "备份内容超过 24 MB，或有单项笔记过长，无法在不丢内容的情况下处理。",
    backupNewer: "此备份来自更新版本，请先更新题解簿。",
    reviewBackup: "检查备份",
    backupCreated: "备份时间",
    backupContains: (problems: number, courses: number, images: number, mistakes: number, xp: number) => `包含：${problems} 道题的学习记录 · ${courses} 节课程 · ${images} 张图片 · ${mistakes} 道错题 · ${xp} XP`,
    currentContains: (problems: number, courses: number, images: number, mistakes: number) => `本机当前：${problems} 道题的学习记录 · ${courses} 节课程 · ${images} 张图片 · ${mistakes} 道错题`,
    restoreWarning: "恢复会替换这台设备现有的全部学习数据，不会合并。导入的学习提醒默认关闭。",
    exportCurrentFirst: "先导出本机数据",
    cancelRestore: "取消",
    confirmRestore: "替换并恢复",
    restoringBackup: "正在恢复，请不要关闭页面…",
    restoreSuccess: (problems: number, courses: number, images: number, mistakes: number) => `恢复完成：${problems} 道题、${courses} 节课程、${images} 张图片、${mistakes} 道错题。正在重新打开…`,
    restoreRolledBack: "恢复失败，本机原数据已还原。请检查存储空间后再试。",
    restoreRollbackFailed: "恢复未完成，部分数据可能已改变。请保留备份文件并重新打开后再试。",
    shareNotes: "分享文字笔记",
    shareSuccess: "已打开分享菜单。",
    shareCopied: "笔记已复制。",
    shareUnavailable: "当前设备暂时无法分享。",
    shareTitle: "题解簿学习笔记",
    privacyPolicy: "隐私政策",
    support: "帮助与联系",
    licenses: "开源许可",
    deleteData: "删除本机学习数据",
    deleteConfirm: "确定删除这台设备上的全部代码、错题本、文字与图片笔记、进度和提醒吗？这个操作无法撤销。",
    deletingData: "正在删除本机学习数据…",
    deleteDone: "本机学习数据已删除。",
    deleteReminderWarning: "学习数据已删除，但系统提醒可能仍存在。请在 iPhone 设置 → 通知 → 题解簿中关闭它。",
    deleteFailed: "删除没有完成，请检查本机存储空间后重试。",
  },
  en: {
    brandName: "AlgoQuest",
    brandSubtitle: "LeetCode Hot 100 + Extra Practice Notebook",
    nativeBrandSubtitle: "A study notebook for 105 classic algorithm problems",
    progress: "Progress",
    autosave: "Notes save automatically on this device",
    nativeAutosave: "Code and notes are saved on this device",
    saving: "Saving…",
    saveFailed: "Save failed — copy important notes now",
    saveRecovery: "Your latest change was not saved. Copy important notes now and free some storage on this device.",
    storageLoadFailed: "Study data could not be read safely, so saving is paused to protect your existing notes. Reload and try again.",
    retryLoad: "Reload",
    readOnlyTitle: "This browser is in read-only mode",
    readOnlyBody: "This browser version lacks the tab lock required for safe saving. To protect your notes, this page only allows backup export; update Safari, Chrome, or Edge before editing.",
    staleTitle: "Study data changed in another tab",
    staleBody: "Editing is paused so this tab cannot overwrite newer work. If this tab has unsaved work, export a rescue backup before reloading.",
    rescueBackup: "Export this tab’s rescue backup",
    rescueBackupDone: "Rescue backup exported. Keep the file, then reload this tab.",
    freePractice: "Full Practice",
    learningPath: "Study Home",
    courseNotes: "Course Notes",
    mistakeBook: "Mistake Book",
    mistakeBookLoading: "Opening the mistake book…",
    mistakeBookLoadFailed: "The mistake book could not be read safely. It is read-only to avoid overwriting existing entries; export other important notes and reload first.",
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
    statusFilter: "Study status",
    allStatuses: "All",
    statusFilterLabel: "Filter problems by study status",
    resultSummary: (label: string, count: number) => `${label} · ${count} problems`,
    continuePractice: "Continue learning",
    continueRule: "Within this level and topic: resume, review, then start something new.",
    continueProblem: (status: LearningStatus, id: number, title: string) => `${status === "learning" ? "Continue" : status === "review" ? "Review" : "Start"} ${id}. ${title}`,
    scopeComplete: "Everything in the current filter is mastered.",
    allProblemsComplete: "Every problem is mastered. Return to Study Home to plan a review.",
    clearFilters: "Clear filters",
    showAllStatuses: "Show every status",
    noStatusMatch: (label: string) => `There are no “${label}” problems here yet.`,
    currentProblemHidden: (id: number, title: string) => `Current problem ${id}. ${title} is hidden by the filters.`,
    showCurrentProblem: "Show current problem",
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
    coreIdea: "Core idea",
    showCoreIdea: "I'm stuck — show the core idea",
    hideCoreIdea: "Hide the core idea",
    shortcut: "Enter auto-indents · Tab adjusts indent · ⌘ / Ctrl + Enter to run",
    resetCode: "Reset starter code",
    run: "Run tests",
    running: "Running…",
    nextReview: "Quick tests passed — finish 3 learning steps →",
    completionTitle: "Quick tests passed — do not stop here",
    completionBody: "Passing the included cases is not a LeetCode Accepted result. Capture what you understand, then submit to the official judge.",
    nativeCompletionBody: "Passing the included cases is only step one. Capture what you understand, then verify with the full problem set.",
    completionNotes: (done: number, required: number) => `Explain key code ${Math.min(done, required)} / ${required}`,
    completionSignal: "Write one clue for recognizing this pattern",
    completionSubmit: "Submit on LeetCode and confirm Accepted",
    openOfficialProblem: "Open the official problem",
    nativeCompletionSubmit: "Verify with the full problem set",
    goExplain: "Explain lines",
    goWriteSignal: "Write the clue",
    continueReflection: "Finish the reflection first",
    reflectionReady: "Reflection complete — confirm the official result when ready.",
    reflectionNeeded: "Finish the first two items; each needs only a short note.",
    confirmAccepted: "I got Accepted on LeetCode — mark mastered",
    confirmValidated: "I passed the full verification — mark mastered",
    masteredTitle: "You truly finished this problem!",
    masteredBody: "This problem is marked as mastered. Check the save status beside it, then practice another suitable problem while the idea is fresh.",
    nextRecommended: (id: number, title: string) => `Recommended next: ${id}. ${title}`,
    practiceNext: "Practice next problem",
    backToStudyHome: "Back to study home",
    allMastered: "Every problem in this set is mastered. Return home to choose a review.",
    statusHelp: "Mastered is unlocked by the completion steps above. To relearn it later, mark it for review first.",
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
    imageNotes: (count: number) => count > 0 ? `Images ${count}` : "Images",
    imageNotesLoading: "Opening image notes…",
    linePrompt: "What does each line of your code mean?",
    lineQuestions: "Explain in your own words what this line does and why it is here.",
    fillNotes: "Insert basic explanations (rewrite them in your own words)",
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
    resetConfirm: "Restore the starter code? Current code (including comments) and line explanations will be replaced; your approach and review will stay.",
    emptyCodeMessage: "The editor is empty. Restore the function shell before running tests.",
    emptyCodeTitle: "Restore the code shell first",
    emptyCodeBody: "With only whitespace or comments, the tests do not know which function to call. Restore the starter, then begin at pass.",
    restoreStarter: "Restore starter code",
    backToEditor: "Back to the editor",
    starterPrompt: (line: number) => `Replace pass on line ${line} with your solution before running tests.`,
    starterCoachTitle: "This line is still a placeholder",
    starterCoachBody: "pass returns no answer. Reveal one step of the idea, or run it anyway to see exactly what the placeholder produces.",
    editStarterLine: (line: number) => `Edit line ${line}`,
    runAnyway: "Run anyway",
    wrongAnswerTitle: "The code runs — fix only the first difference",
    wrongAnswerBody: "Work through this input once, then trace where the differing value is written. You do not need to inspect the whole solution at once.",
    saveFailedReview: "Add to mistake book",
    backToErrorLine: (line: number) => `Go to line ${line}`,
    signatureStatus: "The required problem entry was changed",
    signatureTitle: "Restore the entry required by the problem",
    signatureBody: (symbol: string) => `LeetCode looks for ${symbol} exactly as specified. If the class, function, or argument count changes, the algorithm never starts; check only this entry line and keep the solution below it.`,
    signatureExpected: "Required declaration",
    checkSignatureLine: (line: number) => `Check entry on line ${line}`,
    checkSignatureClass: (line: number) => `Go to class on line ${line}`,
    backToSignatureCode: "Return to the code entry",
    failedTestNote: (index: number, input: string, expected: string, actual: string, detail: string) => `【Test ${index} failed】\nInput: ${input}\nExpected: ${expected}\nActual: ${actual}\nFix first: ${detail}`,
    loadingPython: "Loading Python… the first run may take a moment",
    runningCode: "Running…",
    timeout: "Stopped after 20 seconds. Check for a loop that never ends.",
    timeoutTitle: "The code ran too long — check the loop",
    timeoutBody: "Python started correctly. Return to the code and check whether each while / for loop can end, each pointer moves, and recursion has a base case.",
    runtimeTimeout: "Python took too long to load, so your code did not run. Try again; on the web, check the connection if the first run still fails.",
    runtimeFailureTitle: "Python did not start yet",
    runtimeFailureBody: "Your code did not run and has not been lost. Try again; on the web, check the connection if the first run still fails.",
    retryRun: "Run again",
    allPassed: "All quick tests passed!",
    someFailed: "Some tests still fail. Compare the actual and expected results.",
    runFailed: "The code failed to run. Check the syntax and indentation.",
    workerFailed: "Python could not start yet. Try running it again.",
    guideTitle: "Your first learning session in 4 steps",
    guideSteps: [
      ["Choose a level", "Easy is the best place to begin, then move up gradually."],
      ["Finish one short lesson", "Understand the prompt and pattern before coding."],
      ["Open full practice", "Read the problem, write code, and run tests in one workspace."],
      ["Write a review", "Explain key lines and mistakes so the pattern is easier next time."],
    ],
    goToPath: "Go to learning path",
    settings: "Settings",
    studyReminder: "Study reminder",
    nativeSettingsTitle: "Settings & on-device data",
    nativeSettingsBody: "Code, notes, and progress stay on this device by default. No account is required.",
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
    fullBackup: "Full backup",
    backupBody: "Export your code, line explanations, reviews, mistake book, image notes, course transcripts, progress, and preferences.",
    exportBackup: "Export backup",
    restoreBackup: "Restore from file",
    backupPrivacy: "Backup files are readable plain text and include your code, mistake book, image notes, course links, transcripts, and notes. Save them only in a trusted location; AlgoQuest never uploads them.",
    backupPreparing: "Preparing backup…",
    localLibraryBackupBlocked: "Image notes or the mistake book could not be read safely, so an incomplete backup was not exported. Share important text notes and reload first.",
    backupDownloaded: "Backup downloaded.",
    backupShared: "The share sheet is open. Choose Save to Files or another trusted location.",
    backupFailed: "The backup could not be exported. Check device storage and try again.",
    otherTabOpen: "AlgoQuest is open in another tab. Close that tab before exporting, restoring, or deleting so notes are not overwritten.",
    dataChangedOtherTab: "Study data changed in another tab. Reload this page before continuing.",
    safeRestoreUnavailable: "This browser cannot safely lock study data across tabs. Use a current Safari, Chrome, or Edge before restoring or deleting.",
    backupChecking: "Checking backup…",
    backupReady: "Backup checked. Review it before replacing on-device data.",
    backupInvalid: "This is not a usable AlgoQuest backup. On-device data was not changed.",
    backupTooLarge: "This backup exceeds 24 MB, or one saved item is too long to process without losing content.",
    backupNewer: "This backup was made by a newer version. Update AlgoQuest first.",
    reviewBackup: "Review backup",
    backupCreated: "Backup created",
    backupContains: (problems: number, courses: number, images: number, mistakes: number, xp: number) => `Contains: ${problems} problem records · ${courses} courses · ${images} images · ${mistakes} mistakes · ${xp} XP`,
    currentContains: (problems: number, courses: number, images: number, mistakes: number) => `On this device: ${problems} problem records · ${courses} courses · ${images} images · ${mistakes} mistakes`,
    restoreWarning: "Restoring replaces all study data on this device. It will not merge the two sets. Imported reminders stay off.",
    exportCurrentFirst: "Export current data first",
    cancelRestore: "Cancel",
    confirmRestore: "Replace & restore",
    restoringBackup: "Restoring — keep this page open…",
    restoreSuccess: (problems: number, courses: number, images: number, mistakes: number) => `Restored ${problems} problem records, ${courses} courses, ${images} images, and ${mistakes} mistakes. Reopening…`,
    restoreRolledBack: "Restore failed, and the original on-device data was restored. Check storage space and try again.",
    restoreRollbackFailed: "Restore did not finish and some data may have changed. Keep the backup file and reopen the app before trying again.",
    shareNotes: "Share text notes",
    shareSuccess: "The share sheet is open.",
    shareCopied: "Notes copied.",
    shareUnavailable: "Sharing is not available on this device.",
    shareTitle: "Algo notebook study note",
    privacyPolicy: "Privacy policy",
    support: "Help & support",
    licenses: "Open-source licenses",
    deleteData: "Delete on-device study data",
    deleteConfirm: "Delete all code, mistake-book entries, text and image notes, progress, and reminders stored on this device? This cannot be undone.",
    deletingData: "Deleting on-device study data…",
    deleteDone: "On-device study data deleted.",
    deleteReminderWarning: "Study data was deleted, but a system reminder may remain. Turn it off in iPhone Settings → Notifications → AlgoQuest.",
    deleteFailed: "Deletion did not finish. Check device storage and try again.",
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
const NOTE_TABS = ["line", "review", "images"] as const;
const PRACTICE_STATUS_FILTERS = ["all", "learning", "review", "todo", "solved"] as const satisfies readonly PracticeStatusFilter[];
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
  const [statusFilter, setStatusFilter] = useState<PracticeStatusFilter>("all");
  const [noteTab, setNoteTab] = useState<(typeof NOTE_TABS)[number]>("line");
  const [noteImageStore, setNoteImageStore] = useState<NoteImageStore>(() => emptyNoteImageStore());
  const [noteImagesLoadFailed, setNoteImagesLoadFailed] = useState(false);
  const [mistakeBookStore, setMistakeBookStore] = useState<MistakeBookStore>(() => emptyMistakeBookStore());
  const [mistakeBookLoadFailed, setMistakeBookLoadFailed] = useState(false);
  const [showMistakeBook, setShowMistakeBook] = useState(false);
  const [mistakeBookMounted, setMistakeBookMounted] = useState(false);
  const [mistakeBookSelectionRequest, setMistakeBookSelectionRequest] = useState<{
    entryId: string;
    sequence: number;
  } | null>(null);
  const [noteLineMode, setNoteLineMode] = useState<"current" | "all">("current");
  const [activeCodeLine, setActiveCodeLine] = useState(1);
  const [runState, setRunState] = useState<RunState>({ phase: "idle", message: "还没有运行测试", results: [] });
  const [hydrated, setHydrated] = useState(false);
  const [storageLoadFailed, setStorageLoadFailed] = useState(false);
  const [storageReadOnly, setStorageReadOnly] = useState(false);
  const [staleStudyData, setStaleStudyData] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [showGuide, setShowGuide] = useState(false);
  const [showStatement, setShowStatement] = useState(true);
  const [coreIdeaLocation, setCoreIdeaLocation] = useState<"problem" | "starter" | "wrong" | null>(null);
  const [starterPromptLine, setStarterPromptLine] = useState<number | null>(null);
  const [sourceIssue, setSourceIssue] = useState<"empty" | null>(null);
  const [showProblemList, setShowProblemList] = useState(false);
  const [showNotesDrawer, setShowNotesDrawer] = useState(false);
  const [fontSize, setFontSize] = useState(DEFAULT_FONT_SIZE);
  const [appMode, setAppMode] = useState<AppMode>("path");
  const [mobileWorkspaceTab, setMobileWorkspaceTab] = useState<"library" | "code" | "notes">("library");
  const [profile, setProfile] = useState<LearningProfile>(EMPTY_PROFILE);
  const [showNativeSettings, setShowNativeSettings] = useState(false);
  const [dailyReminder, setDailyReminder] = useState<DailyReminder>({ enabled: false, time: "20:00" });
  const [reminderSaving, setReminderSaving] = useState(false);
  const [reminderMessage, setReminderMessage] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [backupOperation, setBackupOperation] = useState<BackupOperation>("idle");
  const [backupMessage, setBackupMessage] = useState("");
  const [backupMessageIsError, setBackupMessageIsError] = useState(false);
  const [pendingBackup, setPendingBackup] = useState<StudyBackup | null>(null);
  const [currentCourseCount, setCurrentCourseCount] = useState(0);
  const [currentImageCount, setCurrentImageCount] = useState(0);
  const [currentMistakeCount, setCurrentMistakeCount] = useState(0);
  const workerRef = useRef<Worker | null>(null);
  const runtimeReadyRef = useRef(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const runSequenceRef = useRef(0);
  const runFeedbackFrameRef = useRef<number | null>(null);
  const workspaceFocusFrameRef = useRef<number | null>(null);
  const runFeedbackGenerationRef = useRef(0);
  const saveSequenceRef = useRef(0);
  const dataOperationRef = useRef(false);
  const dataStaleRef = useRef(false);
  const staleCapturePromiseRef = useRef<Promise<Record<string, string>> | null>(null);
  const storageWritesRef = useRef<Promise<void>>(Promise.resolve());
  const localLibraryWritesRef = useRef<Promise<void>>(Promise.resolve());
  const libraryMutationsPausedRef = useRef(false);
  const mistakeBookSelectionSequenceRef = useRef(0);
  const queuedStudyValueRef = useRef<string | null>(null);
  const latestStudyValueRef = useRef("");
  const hydratedRef = useRef(false);
  const queuedFontValueRef = useRef<string | null>(null);
  const queuedProfileValueRef = useRef<string | null>(null);
  const queuedLanguageValueRef = useRef<string | null>(null);
  const activeRunRef = useRef<{ id: string; cleanup: () => void } | null>(null);
  const codeEditorRef = useRef<LeetCodeCodeEditorHandle | null>(null);
  const studyHomeRef = useRef<HTMLDivElement | null>(null);
  const problemHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const libraryHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const notesHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const lineNotesPanelRef = useRef<HTMLDivElement | null>(null);
  const recognitionSignalRef = useRef<HTMLTextAreaElement | null>(null);
  const completionStatusRef = useRef<HTMLDivElement | null>(null);
  const testConsoleRef = useRef<HTMLElement | null>(null);
  const runStatusRef = useRef<HTMLDivElement | null>(null);
  const problemMenuButtonRef = useRef<HTMLButtonElement | null>(null);
  const notesButtonRef = useRef<HTMLButtonElement | null>(null);
  const libraryDrawerRef = useRef<HTMLElement | null>(null);
  const notesDrawerRef = useRef<HTMLElement | null>(null);
  const backupFileInputRef = useRef<HTMLInputElement | null>(null);
  const backupReviewHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const restoreBackupButtonRef = useRef<HTMLButtonElement | null>(null);
  const backupBusy = backupOperation !== "idle";
  const settingsBusy = backupBusy || reminderSaving;
  const studyEditingBlocked = storageReadOnly || staleStudyData;
  const localLibraryEditingBlocked = studyEditingBlocked || settingsBusy;
  const nativeSettingsDialogRef = useDialogFocus<HTMLElement>(showNativeSettings, () => {
    if (!settingsBusy) setShowNativeSettings(false);
  });
  const guideDialogRef = useDialogFocus<HTMLElement>(showGuide, () => setShowGuide(false));

  const copy = pageCopy[language];
  const brandSubtitle = nativeApp ? copy.nativeBrandSubtitle : copy.brandSubtitle;
  const autosaveLabel = nativeApp ? copy.nativeAutosave : copy.autosave;
  const visibleSaveLabel = staleStudyData
    ? copy.staleTitle
    : storageReadOnly
      ? copy.readOnlyTitle
      : saveState === "saving" ? copy.saving : saveState === "error" ? copy.saveFailed : autosaveLabel;
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
  const currentNoteImages = noteImagesForProblem(noteImageStore, currentProblem.id);
  const totalNoteImages = noteImageCount(noteImageStore);
  const currentDetail = localizeDetail(currentProblem, language);
  const officialProblemUrl = `${language === "zh" ? "https://leetcode.cn" : "https://leetcode.com"}/problems/${currentProblem.slug}/description/`;
  const currentMistakeSeed: CurrentProblemMistakeSeed = {
    problemId: currentProblem.id,
    title: `${currentProblem.id}. ${currentProblem.title}`,
    sourceUrl: officialProblemUrl,
    prompt: [
      currentDetail.statement,
      currentDetail.requirements.length
        ? `${language === "zh" ? "要求" : "Requirements"}:\n${currentDetail.requirements.map((item) => `- ${item}`).join("\n")}`
        : "",
      `${language === "zh" ? "示例" : "Example"}: ${currentProblem.example}`,
    ].filter(Boolean).join("\n\n"),
    language: "python",
    myAnswer: currentRecord.code,
  };
  const serializedStudyValue = JSON.stringify({ version: STUDY_STORAGE_VERSION, records, selectedId });
  const codeLines = currentRecord.code.split("\n");
  const emptyRecoveryNeedsConfirmation = starterRecoveryNeedsConfirmation(currentRecord.code, currentRecord.lineNotes);
  const safeActiveCodeLine = Math.min(Math.max(1, activeCodeLine), codeLines.length);
  const noteLineIndexes = noteLineMode === "current"
    ? [safeActiveCodeLine - 1]
    : codeLines.map((_, index) => index);
  const noteEligibleLines = codeLines.filter((line) => line.trim()).length;
  const suggestedLineNotes = codeLines.map((line) => explainLine(line, language));
  const generatedLineNoteAlternatives = codeLines.map((line) => [explainLine(line, "zh"), explainLine(line, "en")]);
  const explainedLines = codeLines.filter((line, index) => {
    const note = currentRecord.lineNotes[index]?.trim();
    return line.trim() && note && !generatedLineNoteAlternatives[index]?.some((suggestion) => suggestion.trim() === note);
  }).length;
  const allQuickTestsPassed = runState.phase === "done"
    && runState.results.length > 0
    && runState.results.every((result) => result.passed);
  const keyLineIndexes = practiceKeyLineIndexes(currentRecord.code);
  const completionProgress = practiceCompletionProgress(
    currentRecord.code,
    currentRecord.lineNotes,
    currentRecord.review,
    generatedLineNoteAlternatives,
  );
  const noteSaveLabel = staleStudyData
    ? copy.staleTitle
    : storageReadOnly
      ? copy.readOnlyTitle
      : saveState === "saving" ? copy.saving : saveState === "error" ? copy.saveFailed : copy.saved;
  const noteSaveIsError = staleStudyData || storageReadOnly || saveState === "error";
  const firstFailedResult = runState.results.find((result) => !result.passed);
  const runErrorForCoaching = runState.phase === "error" && runState.kind === "code"
    ? runState.message
    : firstFailedResult?.error?.message;
  const runtimeFailure = runState.phase === "error" && runState.kind === "runtime";
  const executionTimeout = runState.phase === "error" && runState.kind === "timeout";
  const signatureIssue = runState.phase === "error" ? runState.signatureIssue : undefined;
  const runErrorLine = runState.phase === "done" || runState.phase === "error"
    ? runState.errorLine
    : undefined;
  const firstWrongAnswer = runState.phase === "done" && firstFailedResult && !firstFailedResult.error
    ? firstFailedResult
    : undefined;
  const firstWrongAnswerHint = firstWrongAnswer
    ? describeFirstMismatch(firstWrongAnswer.expected, firstWrongAnswer.actual, language)
    : "";
  const fontScale = Math.round((fontSize / MIN_FONT_SIZE) * 100);

  const topics = useMemo(
    () => ["all", ...Array.from(new Set(displayProblems.map((problem) => problem.topic)))],
    [displayProblems],
  );

  const continuationScopeProblems = useMemo(() => {
    return displayProblems.filter((problem) => {
      const matchesTopic = topic === "all" || problem.topic === topic;
      const matchesDifficulty = difficultyFilter === "all" || problem.difficulty === difficultyFilter;
      return matchesTopic && matchesDifficulty;
    }).sort((first, second) => difficultyOrder[first.difficulty] - difficultyOrder[second.difficulty]);
  }, [difficultyFilter, displayProblems, topic]);
  const scopedProblems = useMemo(() => {
    const keyword = search.trim().toLowerCase();
    return continuationScopeProblems.filter((problem) => {
      const matchesSearch =
        !keyword ||
        String(problem.id).includes(keyword) ||
        problem.title.toLowerCase().includes(keyword) ||
        problem.topic.toLowerCase().includes(keyword);
      return matchesSearch;
    });
  }, [continuationScopeProblems, search]);
  const statusCounts = useMemo(
    () => practiceStatusCounts(scopedProblems, records),
    [records, scopedProblems],
  );
  const filteredProblems = useMemo(
    () => filterProblemsByStatus(scopedProblems, records, statusFilter),
    [records, scopedProblems, statusFilter],
  );
  const recommendedLibraryProblemId = recommendedPracticeProblemId(continuationScopeProblems, records, currentProblem.id);
  const recommendedLibraryProblem = recommendedLibraryProblemId
    ? continuationScopeProblems.find((problem) => problem.id === recommendedLibraryProblemId)
    : undefined;
  const recommendedLibraryStatus = recommendedLibraryProblem
    ? practiceRecordStatus(records[recommendedLibraryProblem.id])
    : null;
  const hasPracticeScopeFilters = Boolean(search.trim()) || topic !== "all" || difficultyFilter !== "all";
  const activeStatusLabel = statusFilter === "all" ? copy.allStatuses : copy.statusLabels[statusFilter];
  const currentProblemVisible = filteredProblems.some((problem) => problem.id === currentProblem.id);
  const completionRecommendationScope = continuationScopeProblems.filter((problem) => problem.id !== currentProblem.id);
  const nextProblemId = recommendedPracticeProblemId(completionRecommendationScope, records, currentProblem.id);
  const nextPracticeProblem = nextProblemId
    ? displayProblems.find((problem) => problem.id === nextProblemId)
    : undefined;

  const fullStatusCounts = useMemo(
    () => practiceStatusCounts(displayProblems, records),
    [displayProblems, records],
  );
  const solvedCount = fullStatusCounts.solved;
  const learningCount = fullStatusCounts.learning;
  const allProblemsMastered = solvedCount === displayProblems.length;
  const progress = Math.round((solvedCount / displayProblems.length) * 100);

  useEffect(() => {
    let cancelled = false;

    async function loadSavedStudy() {
      try {
        let requestedNavigation = parseNavigationState(window.location.search, KNOWN_PROBLEM_IDS);
        if (requestedNavigation.mode === "workspace") void loadCodeEditor();
        if (requestedNavigation.mode === "course") void loadCourseNotes();
        setAppMode(requestedNavigation.mode);
        if (requestedNavigation.mode === "workspace") {
          setMobileWorkspaceTab(requestedNavigation.problemId ? "code" : "library");
          if (requestedNavigation.problemId) setSelectedId(requestedNavigation.problemId);
        }

        const [savedLanguage, saved, savedFontSizeValue, savedProfile, savedReminder, savedNoteImages, savedMistakeBook] = await withInitialStudyDataReadLock(async () => {
          await configureNativeAppearance();
          return Promise.all([
            getStoredValue(LANGUAGE_KEY),
            getStoredValue(STORAGE_KEY),
            getStoredValue(FONT_SIZE_KEY),
            getStoredValue(PROFILE_KEY),
            loadDailyReminder(),
            getLargeStoredValue(NOTE_IMAGES_STORAGE_KEY),
            getLargeStoredValue(MISTAKE_BOOK_STORAGE_KEY),
          ]);
        });
        if (cancelled) return;
        if (dataOperationRef.current) return;

        const resolvedLanguage: Language = savedLanguage === "en" ? "en" : "zh";
        if (savedLanguage === "zh" || savedLanguage === "en") {
          setLanguage(resolvedLanguage);
          setRunState({ phase: "idle", message: pageCopy[resolvedLanguage].notRun, results: [] });
        }
        requestedNavigation = parseNavigationState(window.location.search, KNOWN_PROBLEM_IDS);
        let savedSelectedId: number | undefined;
        let loadedRecords: StudyRecords = {};
        if (saved) {
          const normalized = normalizeSavedStudy(parseStoredJson(saved), problems);
          loadedRecords = normalized.records;
          setRecords(loadedRecords);
          savedSelectedId = normalized.selectedId;
        }
        const resolvedSelectedId = requestedNavigation.mode === "workspace" && requestedNavigation.problemId
          ? requestedNavigation.problemId
          : savedSelectedId ?? problems[0].id;
        setSelectedId(resolvedSelectedId);
        replaceNavigationState({
          mode: requestedNavigation.mode,
          problemId: requestedNavigation.mode === "workspace" ? resolvedSelectedId : undefined,
        });
        const savedFontSize = Number(savedFontSizeValue);
        let resolvedFontSize = DEFAULT_FONT_SIZE;
        if (Number.isInteger(savedFontSize) && savedFontSize >= MIN_FONT_SIZE && savedFontSize <= MAX_FONT_SIZE) {
          resolvedFontSize = savedFontSize;
          setFontSize(resolvedFontSize);
        }
        let loadedProfile = EMPTY_PROFILE;
        if (savedProfile) {
          const loaded = normalizeLearningProfile(parseStoredJson(savedProfile));
          if (loaded.todayDate !== localDateKey()) {
            loaded.todayXp = 0;
            if (loaded.todayDate !== yesterdayKey()) loaded.streak = 0;
          }
          loadedProfile = loaded;
          setProfile(loaded);
        }
        try {
          const loadedNoteImages = savedNoteImages === null
            ? emptyNoteImageStore()
            : parseNoteImageStore(JSON.parse(savedNoteImages), KNOWN_PROBLEM_IDS);
          setNoteImageStore(loadedNoteImages);
          markNoteImageStoreLoaded(loadedNoteImages);
        } catch {
          // Never normalize-and-overwrite a damaged image library. Keep it read-only
          // so the user can rescue text notes without losing the original value.
          setNoteImagesLoadFailed(true);
        }
        try {
          const loadedMistakeBook = savedMistakeBook === null
            ? emptyMistakeBookStore()
            : parseMistakeBookStore(JSON.parse(savedMistakeBook));
          setMistakeBookStore(loadedMistakeBook);
          markMistakeBookStoreLoaded(loadedMistakeBook);
        } catch {
          // Keep a malformed library untouched instead of silently repairing it.
          setMistakeBookLoadFailed(true);
        }
        setDailyReminder(savedReminder);
        queuedStudyValueRef.current = JSON.stringify({
          version: STUDY_STORAGE_VERSION,
          records: loadedRecords,
          selectedId: resolvedSelectedId,
        });
        queuedFontValueRef.current = String(resolvedFontSize);
        queuedProfileValueRef.current = JSON.stringify(loadedProfile);
        queuedLanguageValueRef.current = resolvedLanguage;
        if (!supportsSafeStudyDataWrites()) {
          dataOperationRef.current = true;
          setStorageReadOnly(true);
        }
        setHydrated(true);
      } catch {
        if (cancelled) return;
        dataOperationRef.current = true;
        setStorageLoadFailed(true);
        setSaveState("error");
      }
    }

    void loadSavedStudy();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let unregister: () => void = () => undefined;
    try {
      unregister = registerStudyDataTab();
    } catch {
      dataOperationRef.current = true;
      const failureTimer = window.setTimeout(() => {
        setStorageLoadFailed(true);
        setHydrated(false);
        setSaveState("error");
      }, 0);
      return () => window.clearTimeout(failureTimer);
    }
    const handleStaleStudyData = () => {
      if (dataStaleRef.current) return;
      staleCapturePromiseRef.current = captureMountedStudyData().catch(() => ({}));
      dataStaleRef.current = true;
      setStaleStudyData(true);
      dataOperationRef.current = true;
      saveSequenceRef.current += 1;
      pauseMountedStudyData();
      setSaveState("error");
      setBackupMessageIsError(true);
      setBackupMessage(copy.dataChangedOtherTab);
    };
    window.addEventListener(STUDY_DATA_STALE_EVENT, handleStaleStudyData);
    return () => {
      window.removeEventListener(STUDY_DATA_STALE_EVENT, handleStaleStudyData);
      unregister();
    };
  }, [copy.dataChangedOtherTab]);

  useEffect(() => {
    function restoreNavigationFromHistory() {
      const navigation = parseNavigationState(window.location.search, KNOWN_PROBLEM_IDS);
      if (navigation.mode === "workspace") void loadCodeEditor();
      if (navigation.mode === "course") void loadCourseNotes();

      activeRunRef.current?.cleanup();
      activeRunRef.current = null;
      if (timeoutRef.current) window.clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
      workerRef.current?.terminate();
      workerRef.current = null;
      runtimeReadyRef.current = false;
      runFeedbackGenerationRef.current += 1;
      if (runFeedbackFrameRef.current !== null) window.cancelAnimationFrame(runFeedbackFrameRef.current);
      runFeedbackFrameRef.current = null;

      setAppMode(navigation.mode);
      setShowMistakeBook(false);
      if (navigation.problemId) setSelectedId(navigation.problemId);
      setRunState({
        phase: "idle",
        message: document.documentElement.lang.startsWith("en") ? pageCopy.en.notRun : pageCopy.zh.notRun,
        results: [],
      });
      setNoteTab("line");
      setNoteLineMode("current");
      setActiveCodeLine(1);
      setShowStatement(true);
      setStarterPromptLine(null);
      setSourceIssue(null);
      setCoreIdeaLocation(null);
      setShowProblemList(false);
      setShowNotesDrawer(false);
      setMobileWorkspaceTab(navigation.mode === "workspace" && navigation.problemId ? "code" : "library");
      window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
    }

    window.addEventListener("popstate", restoreNavigationFromHistory);
    return () => window.removeEventListener("popstate", restoreNavigationFromHistory);
  }, []);

  useLayoutEffect(() => {
    latestStudyValueRef.current = serializedStudyValue;
    hydratedRef.current = hydrated;
  }, [hydrated, serializedStudyValue]);

  useEffect(() => {
    if (!hydrated || dataOperationRef.current) return;
    const serialized = serializedStudyValue;
    if (serialized === queuedStudyValueRef.current) return;
    queuedStudyValueRef.current = serialized;
    const sequence = ++saveSequenceRef.current;
    let cancelled = false;
    const savingTimer = window.setTimeout(() => {
      if (dataOperationRef.current) return;
      if (saveSequenceRef.current === sequence) setSaveState("saving");
    }, 0);
    const timer = window.setTimeout(() => {
      if (dataOperationRef.current) return;
      void persistWithStatus(() => queueStorageWrite(storageWritesRef, async () => {
        await persistLatestSerializedValue(
          serialized,
          () => latestStudyValueRef.current,
          (value) => setStoredValue(STORAGE_KEY, value),
        );
      }))
        .then((result) => {
          if (!cancelled && saveSequenceRef.current === sequence) setSaveState(result);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(savingTimer);
      window.clearTimeout(timer);
    };
  }, [hydrated, serializedStudyValue]);

  useEffect(() => {
    const flushLatestStudyValue = async () => {
      if (!hydratedRef.current || dataOperationRef.current || !latestStudyValueRef.current) return;
      const serialized = latestStudyValueRef.current;
      queuedStudyValueRef.current = serialized;
      stageNativeStoredValueForBackground(STORAGE_KEY, serialized);
      const sequence = saveSequenceRef.current;
      const result = await persistWithStatus(() => queueStorageWrite(storageWritesRef, async () => {
        await setStoredValue(STORAGE_KEY, serialized);
      }));
      if (saveSequenceRef.current === sequence) setSaveState(result);
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") void flushLatestStudyValue();
    };
    const flushOnPageHide = () => {
      void flushLatestStudyValue();
    };

    window.addEventListener("pagehide", flushOnPageHide);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushOnPageHide);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      void flushLatestStudyValue();
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.setProperty("--app-font-size", `${fontSize}px`);
    if (!hydrated || dataOperationRef.current) return;
    const serialized = String(fontSize);
    if (serialized === queuedFontValueRef.current) return;
    queuedFontValueRef.current = serialized;
    void persistWithStatus(() => queueStorageWrite(storageWritesRef, async () => {
      await setStoredValue(FONT_SIZE_KEY, serialized);
    }));
  }, [fontSize, hydrated]);

  useEffect(() => {
    if (!hydrated || dataOperationRef.current) return;
    const serialized = JSON.stringify(profile);
    if (serialized === queuedProfileValueRef.current) return;
    queuedProfileValueRef.current = serialized;
    void persistWithStatus(() => queueStorageWrite(storageWritesRef, async () => {
      await setStoredValue(PROFILE_KEY, serialized);
    }));
  }, [hydrated, profile]);

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
    document.title = nativeApp
      ? (language === "zh" ? "题解簿｜算法学习手账" : "AlgoQuest | Algorithm Study Notebook")
      : (language === "zh" ? "题解簿｜LeetCode Hot 100 小白学习工作台" : "AlgoQuest | LeetCode Hot 100 Learning Path");
    if (!hydrated || dataOperationRef.current) return;
    if (language === queuedLanguageValueRef.current) return;
    queuedLanguageValueRef.current = language;
    void persistWithStatus(() => queueStorageWrite(storageWritesRef, async () => {
      await setStoredValue(LANGUAGE_KEY, language);
    }));
  }, [hydrated, language, nativeApp]);

  useEffect(() => {
    return () => {
      activeRunRef.current?.cleanup();
      activeRunRef.current = null;
      workerRef.current?.terminate();
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      if (runFeedbackFrameRef.current !== null) window.cancelAnimationFrame(runFeedbackFrameRef.current);
      if (workspaceFocusFrameRef.current !== null) window.cancelAnimationFrame(workspaceFocusFrameRef.current);
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

  function markStudyDirty() {
    if (hydrated && !dataOperationRef.current && !studyEditingBlocked) setSaveState("saving");
  }

  function updateRecord(patch: Partial<StudyRecord>) {
    const changesRecord = (Object.keys(patch) as (keyof StudyRecord)[]).some((key) => (
      JSON.stringify(currentRecord[key]) !== JSON.stringify(patch[key])
    ));
    if (!changesRecord) return;
    markStudyDirty();
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
    const previousStatus = normalizeStudyRecord(problem, records[id]).status;
    const requestedStatus = previousStatus === "solved" && status !== "review" ? "solved" : status;
    if (previousStatus === requestedStatus) return;
    markStudyDirty();
    setRecords((previous) => {
      const normalizedStatus = normalizeStudyRecord(problem, previous[id]).status;
      const nextStatus = normalizedStatus === "solved" && status !== "review" ? "solved" : status;
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
    runFeedbackGenerationRef.current += 1;
    if (runFeedbackFrameRef.current !== null) window.cancelAnimationFrame(runFeedbackFrameRef.current);
    runFeedbackFrameRef.current = null;
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
    if (pane === "code") {
      window.requestAnimationFrame(() => {
        codeEditorRef.current?.revealLine(safeActiveCodeLine, { focus: false });
      });
    }
  }

  function focusMobileWorkspaceHeading<T extends HTMLElement>(target: RefObject<T | null>) {
    if (!window.matchMedia(COMPACT_WORKSPACE_QUERY).matches) return;
    if (workspaceFocusFrameRef.current !== null) window.cancelAnimationFrame(workspaceFocusFrameRef.current);
    workspaceFocusFrameRef.current = window.requestAnimationFrame(() => {
      workspaceFocusFrameRef.current = null;
      target.current?.scrollIntoView({ block: "start", behavior: "auto" });
      target.current?.focus({ preventScroll: true });
    });
  }

  function openProblemListDrawer() {
    if (window.matchMedia(COMPACT_WORKSPACE_QUERY).matches) {
      selectMobileWorkspacePane("library");
      focusMobileWorkspaceHeading(libraryHeadingRef);
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
      focusMobileWorkspaceHeading(notesHeadingRef);
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

  function showCodeFromNotes() {
    selectMobileWorkspacePane("code");
    focusMobileWorkspaceHeading(problemHeadingRef);
  }

  function openOfficialProblemPage() {
    void openExternalPage(officialProblemUrl);
  }

  function openProblemFromPath(id: number) {
    void loadCodeEditor();
    setShowMistakeBook(false);
    chooseProblem(id, false);
    setAppMode("workspace");
    writeNavigationState({ mode: "workspace", problemId: id }, "push");
    setMobileWorkspaceTab("code");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }

  function focusPracticeStart() {
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      if (window.matchMedia(COMPACT_WORKSPACE_QUERY).matches) {
        problemHeadingRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
        problemHeadingRef.current?.focus({ preventScroll: true });
        return;
      }
      if (codeEditorRef.current) codeEditorRef.current.focus();
      else problemHeadingRef.current?.focus({ preventScroll: true });
    }));
  }

  function chooseProblem(id: number, updateHistory = true) {
    if (!KNOWN_PROBLEM_IDS.has(id)) return;
    void playSelectionHaptic();
    cancelActiveRun();
    setSelectedId(id);
    if (updateHistory) writeNavigationState({ mode: "workspace", problemId: id }, "push");
    setRunState({ phase: "idle", message: copy.notRun, results: [] });
    setStarterPromptLine(null);
    setSourceIssue(null);
    setCoreIdeaLocation(null);
    setNoteTab("line");
    setNoteLineMode("current");
    setActiveCodeLine(1);
    setShowStatement(true);
    closeProblemListDrawer(false);
    setMobileWorkspaceTab("code");
    focusPracticeStart();
  }

  function focusLibraryAfterFilterReset() {
    window.requestAnimationFrame(() => {
      libraryHeadingRef.current?.scrollIntoView({ block: "start", behavior: "auto" });
      libraryHeadingRef.current?.focus({ preventScroll: true });
    });
  }

  function clearPracticeFilters() {
    setSearch("");
    setTopic("all");
    setDifficultyFilter("all");
    setStatusFilter("all");
    focusLibraryAfterFilterReset();
  }

  function clearPracticeStatusFilter() {
    setStatusFilter("all");
    focusLibraryAfterFilterReset();
  }

  function showCurrentProblemInLibrary() {
    setSearch("");
    setTopic("all");
    setDifficultyFilter(currentProblem.difficulty);
    setStatusFilter(practiceRecordStatus(records[currentProblem.id]));
    focusLibraryAfterFilterReset();
  }

  function openRecommendedPractice() {
    if (studyEditingBlocked || !recommendedLibraryProblem || !recommendedLibraryStatus) return;
    if (recommendedLibraryStatus === "todo") updateProblemStatus(recommendedLibraryProblem.id, "learning");
    chooseProblem(recommendedLibraryProblem.id);
  }

  function showAppMode(nextMode: AppMode) {
    void playSelectionHaptic();
    if (nextMode === "workspace") void loadCodeEditor();
    if (nextMode === "course") void loadCourseNotes();
    if (nextMode !== "workspace") cancelActiveRun();
    setShowMistakeBook(false);
    setAppMode(nextMode);
    writeNavigationState({
      mode: nextMode,
      problemId: nextMode === "workspace" ? selectedId : undefined,
    }, "push");
    setShowProblemList(false);
    setShowNotesDrawer(false);
    if (nextMode === "workspace" && appMode !== "workspace") setMobileWorkspaceTab("library");
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }

  function openMistakeBook() {
    void playSelectionHaptic();
    void loadMistakeBookPanel();
    cancelActiveRun();
    setMistakeBookMounted(true);
    setShowMistakeBook(true);
    setShowProblemList(false);
    setShowNotesDrawer(false);
    window.requestAnimationFrame(() => window.scrollTo({ top: 0, left: 0, behavior: "auto" }));
  }

  function selectLanguage(nextLanguage: Language) {
    void playSelectionHaptic();
    cancelActiveRun();
    setLanguage(nextLanguage);
    setTopic("all");
    setStarterPromptLine(null);
    setSourceIssue(null);
    setCoreIdeaLocation(null);
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
    if (backupBusy) return;
    setReminderSaving(true);
    setReminderMessage("");
    let result: ReminderSaveResult = "error";
    try {
      result = await withStudyDataWriteLock(async () => {
        const saved = await saveDailyReminder(dailyReminder, language);
        if (saved === "scheduled" || saved === "disabled" || saved === "denied") {
          advanceStudyDataRevision();
        }
        return saved;
      });
    } catch {
      result = "error";
    }
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
      ? { code: "我的代码", lines: "每一行代码是什么意思", thinking: "解题思路", mistakes: "卡住或写错", review: "下次识别信号", images: "图片笔记" }
      : { code: "My code", lines: "What each line means", thinking: "Approach", mistakes: "Mistakes", review: "Pattern to recognize", images: "Image notes" };

    return [
      `${currentProblem.id}. ${currentProblem.title}`,
      `${copy.difficultyLabels[currentProblem.difficulty]} · ${currentProblem.topic}`,
      `\n${headings.code}\n\n${currentRecord.code}`,
      lineNotes ? `\n${headings.lines}\n\n${lineNotes}` : "",
      currentRecord.thinking.trim() ? `\n${headings.thinking}\n\n${currentRecord.thinking.trim()}` : "",
      currentRecord.mistakes.trim() ? `\n${headings.mistakes}\n\n${currentRecord.mistakes.trim()}` : "",
      currentRecord.review.trim() ? `\n${headings.review}\n\n${currentRecord.review.trim()}` : "",
      currentNoteImages.length
        ? `\n${headings.images}\n\n${language === "zh" ? `${currentNoteImages.length} 张（文字分享不含图片；完整备份会包含）` : `${currentNoteImages.length} (images are excluded from text sharing and included in full backups)`}`
        : "",
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

  function currentStoredSnapshot(
    courseValue: string,
    noteImagesValue: string,
    mistakeBookValue: string,
    captionDraftsValue: string | null,
  ): StoredStudySnapshot {
    return {
      values: {
        [STORAGE_KEY]: JSON.stringify({ version: STUDY_STORAGE_VERSION, records, selectedId }),
        [PROFILE_KEY]: JSON.stringify(profile),
        [FONT_SIZE_KEY]: String(fontSize),
        [LANGUAGE_KEY]: language,
        [NOTE_IMAGE_CAPTION_DRAFTS_STORAGE_KEY]: captionDraftsValue,
      },
      largeValues: {
        [COURSE_NOTES_STORAGE_KEY]: courseValue,
        [NOTE_IMAGES_STORAGE_KEY]: noteImagesValue,
        [MISTAKE_BOOK_STORAGE_KEY]: mistakeBookValue,
      },
      reminder: dailyReminder,
    };
  }

  function importedStoredSnapshot(backup: StudyBackup): StoredStudySnapshot {
    return {
      values: {
        [STORAGE_KEY]: JSON.stringify(backup.study),
        [PROFILE_KEY]: JSON.stringify(backup.profile),
        [FONT_SIZE_KEY]: String(backup.font),
        [LANGUAGE_KEY]: backup.language,
        [NOTE_IMAGE_CAPTION_DRAFTS_STORAGE_KEY]: null,
      },
      largeValues: {
        [COURSE_NOTES_STORAGE_KEY]: JSON.stringify(backup.course),
        [NOTE_IMAGES_STORAGE_KEY]: JSON.stringify(backup.noteImages),
        [MISTAKE_BOOK_STORAGE_KEY]: JSON.stringify(backup.mistakeBook),
      },
      reminder: backup.reminder,
    };
  }

  function backupFromStoredValues(
    courseValue: string | null,
    images: NoteImageStore,
    mistakes: MistakeBookStore = latestMistakeBookStoreSnapshot() ?? mistakeBookStore,
  ): StudyBackup {
    return createStudyBackup({
      study: { version: STUDY_STORAGE_VERSION, records, selectedId },
      profile,
      font: fontSize,
      language,
      reminder: dailyReminder,
      course: parseStoredJson(courseValue),
      noteImages: images,
      mistakeBook: mistakes,
    }, problems);
  }

  function backupErrorMessage(error: unknown): string {
    if (!(error instanceof StudyBackupError)) return copy.backupInvalid;
    if (error.code === "too-large") return copy.backupTooLarge;
    if (error.code === "unsupported-version") return copy.backupNewer;
    return copy.backupInvalid;
  }

  async function ensureSingleStudyTab(): Promise<boolean> {
    try {
      assertStudyDataSessionCurrent();
    } catch {
      setBackupMessageIsError(true);
      setBackupMessage(copy.dataChangedOtherTab);
      return false;
    }
    if (!await hasOtherActiveStudyTab()) return true;
    setBackupMessageIsError(true);
    setBackupMessage(copy.otherTabOpen);
    return false;
  }

  async function handleExportBackup() {
    if (!hydrated || settingsBusy) return;
    const rescueMode = dataStaleRef.current;
    libraryMutationsPausedRef.current = true;
    setBackupOperation("exporting");
    setBackupMessageIsError(false);
    setBackupMessage(copy.backupPreparing);
    try {
      if (noteImagesLoadFailed || mistakeBookLoadFailed) {
        setBackupMessageIsError(true);
        setBackupMessage(copy.localLibraryBackupBlocked);
        return;
      }
      if (!rescueMode && !await ensureSingleStudyTab()) return;
      await storageWritesRef.current.catch(() => undefined);
      await localLibraryWritesRef.current.catch(() => undefined);
      const mountedValues = rescueMode
        ? await (staleCapturePromiseRef.current ?? Promise.resolve<Record<string, string>>({}))
        : await captureMountedStudyData();
      await drainCourseStoreWrites().catch(() => undefined);
      await drainNoteImageStoreWrites().catch(() => undefined);
      await drainMistakeBookStoreWrites().catch(() => undefined);
      const courseValue = mountedValues[COURSE_NOTES_STORAGE_KEY]
        ?? latestCourseStoreSnapshot()
        ?? (rescueMode
          ? await withStudyDataRescueReadLock(() => getLargeStoredValue(COURSE_NOTES_STORAGE_KEY))
          : await withStudyDataReadLock(() => getLargeStoredValue(COURSE_NOTES_STORAGE_KEY)));
      const imageStore = latestNoteImageStoreSnapshot() ?? noteImageStore;
      const mistakeStore = latestMistakeBookStoreSnapshot() ?? mistakeBookStore;
      const backup = backupFromStoredValues(courseValue, imageStore, mistakeStore);
      const result = await exportStudyBackupFile(
        `tijiebu-${rescueMode ? "rescue" : "backup"}-${backup.exportedAt.slice(0, 10)}.json`,
        stringifyStudyBackup(backup),
      );
      setBackupMessage(rescueMode
        ? copy.rescueBackupDone
        : result === "shared" ? copy.backupShared : copy.backupDownloaded);
      void playTestHaptic(true);
    } catch (error) {
      setBackupMessageIsError(true);
      setBackupMessage(error instanceof StudyBackupError ? backupErrorMessage(error) : copy.backupFailed);
    } finally {
      libraryMutationsPausedRef.current = false;
      setBackupOperation("idle");
    }
  }

  async function handleBackupFile(event: ReactChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || !hydrated || settingsBusy) return;
    setPendingBackup(null);
    setBackupOperation("checking");
    setBackupMessageIsError(false);
    setBackupMessage(copy.backupChecking);
    try {
      if (file.size > MAX_STUDY_BACKUP_BYTES) {
        throw new StudyBackupError("too-large", "Backup file is too large.");
      }
      const backup = parseStudyBackup(await file.text(), problems);
      const mountedValues = await captureMountedStudyData();
      await drainCourseStoreWrites().catch(() => undefined);
      await drainNoteImageStoreWrites().catch(() => undefined);
      await drainMistakeBookStoreWrites().catch(() => undefined);
      const currentCourseValue = mountedValues[COURSE_NOTES_STORAGE_KEY]
        ?? latestCourseStoreSnapshot()
        ?? await withStudyDataReadLock(() => getLargeStoredValue(COURSE_NOTES_STORAGE_KEY));
      setCurrentCourseCount(normalizeCourseStore(parseStoredJson(currentCourseValue)).courses.length);
      setCurrentImageCount(noteImageCount(latestNoteImageStoreSnapshot() ?? noteImageStore));
      setCurrentMistakeCount((latestMistakeBookStoreSnapshot() ?? mistakeBookStore).entries.length);
      setPendingBackup(backup);
      setBackupMessage(copy.backupReady);
      window.requestAnimationFrame(() => backupReviewHeadingRef.current?.focus());
    } catch (error) {
      setBackupMessageIsError(true);
      setBackupMessage(backupErrorMessage(error));
      window.requestAnimationFrame(() => restoreBackupButtonRef.current?.focus());
    } finally {
      setBackupOperation("idle");
    }
  }

  async function handleRestoreBackup() {
    if (!pendingBackup || !hydrated || settingsBusy) return;
    const backup = pendingBackup;
    let paused = false;

    libraryMutationsPausedRef.current = true;
    setBackupOperation("restoring");
    setBackupMessageIsError(false);
    setBackupMessage(copy.restoringBackup);
    try {
      if (!await ensureSingleStudyTab()) {
        libraryMutationsPausedRef.current = false;
        setBackupOperation("idle");
        return;
      }
      dataOperationRef.current = true;
      saveSequenceRef.current += 1;
      await storageWritesRef.current;
      await localLibraryWritesRef.current;
      await flushMountedStudyData();
      await drainCourseStoreWrites();
      await drainNoteImageStoreWrites();
      await drainMistakeBookStoreWrites();
      pauseMountedStudyData();
      paused = true;
      const restoreResult = await withExclusiveStudyDataOperation(async () => {
        advanceStudyDataRevision();
        const previousCourseValue = await getLargeStoredValue(COURSE_NOTES_STORAGE_KEY)
          ?? JSON.stringify(normalizeCourseStore(undefined));
        const previousNoteImagesValue = await getLargeStoredValue(NOTE_IMAGES_STORAGE_KEY)
          ?? JSON.stringify(emptyNoteImageStore());
        const previousMistakeBookValue = await getLargeStoredValue(MISTAKE_BOOK_STORAGE_KEY)
          ?? JSON.stringify(emptyMistakeBookStore());
        const previousCaptionDraftsValue = await getStoredValue(NOTE_IMAGE_CAPTION_DRAFTS_STORAGE_KEY);
        return restoreStudySnapshot(
          importedStoredSnapshot(backup),
          currentStoredSnapshot(
            previousCourseValue,
            previousNoteImagesValue,
            previousMistakeBookValue,
            previousCaptionDraftsValue,
          ),
          {
            write: writeStoredStudySnapshot,
            finalize: cancelReminderAfterRestore,
          },
        );
      });
      if (!restoreResult.restored) {
        setBackupMessageIsError(true);
        if (restoreResult.rolledBack) {
          dataOperationRef.current = false;
          resumeMountedStudyData();
          paused = false;
          libraryMutationsPausedRef.current = false;
          setSaveState("saved");
          setBackupOperation("idle");
          setBackupMessage(copy.restoreRolledBack);
        } else {
          setBackupMessage(copy.restoreRollbackFailed);
          window.setTimeout(() => window.location.reload(), 1800);
        }
        return;
      }

      replaceNavigationState({ mode: "path" });
      setBackupMessage(copy.restoreSuccess(
        Object.keys(backup.study.records).length,
        backup.course.courses.length,
        noteImageCount(backup.noteImages),
        backup.mistakeBook.entries.length,
      ));
      void playTestHaptic(true);
      window.setTimeout(() => window.location.reload(), 650);
    } catch (error) {
      if (!dataStaleRef.current) {
        dataOperationRef.current = false;
        libraryMutationsPausedRef.current = false;
        if (paused) resumeMountedStudyData();
        setSaveState("saved");
      }
      setBackupOperation("idle");
      setBackupMessageIsError(true);
      setBackupMessage(dataStaleRef.current
        ? copy.dataChangedOtherTab
        : error instanceof StudyDataLockUnavailableError
          ? copy.safeRestoreUnavailable
          : copy.restoreRolledBack);
    }
  }

  async function handleDeleteStudyData() {
    if (!hydrated || settingsBusy || !window.confirm(copy.deleteConfirm)) return;
    libraryMutationsPausedRef.current = true;
    setBackupOperation("restoring");
    setBackupMessageIsError(false);
    setBackupMessage(copy.deletingData);
    try {
      if (!await ensureSingleStudyTab()) {
        libraryMutationsPausedRef.current = false;
        setBackupOperation("idle");
        return;
      }
      dataOperationRef.current = true;
      saveSequenceRef.current += 1;
      await storageWritesRef.current;
      await localLibraryWritesRef.current;
      await flushMountedStudyData();
      await drainCourseStoreWrites();
      await drainNoteImageStoreWrites();
      await drainMistakeBookStoreWrites();
      pauseMountedStudyData();
      const result = await withExclusiveStudyDataOperation(async () => {
        advanceStudyDataRevision();
        return clearStoredStudyData(
          [STORAGE_KEY, FONT_SIZE_KEY, PROFILE_KEY, LANGUAGE_KEY, COURSE_NOTES_STORAGE_KEY, NOTE_IMAGES_STORAGE_KEY, NOTE_IMAGE_CAPTION_DRAFTS_STORAGE_KEY, MISTAKE_BOOK_STORAGE_KEY],
          language,
        );
      });
      replaceNavigationState({ mode: "path" });
      setBackupMessageIsError(!result.reminderCancelled);
      setBackupMessage(result.reminderCancelled ? copy.deleteDone : copy.deleteReminderWarning);
      void playTestHaptic(true);
      window.setTimeout(() => window.location.reload(), result.reminderCancelled ? 500 : 2_400);
    } catch (error) {
      if (!dataStaleRef.current) {
        dataOperationRef.current = false;
        libraryMutationsPausedRef.current = false;
        resumeMountedStudyData();
        setSaveState("saved");
      }
      setBackupOperation("idle");
      setBackupMessageIsError(true);
      setBackupMessage(dataStaleRef.current
        ? copy.dataChangedOtherTab
        : error instanceof StudyDataLockUnavailableError
          ? copy.safeRestoreUnavailable
          : copy.deleteFailed);
    }
  }

  function noteImageFailure(error: unknown): NoteImageActionResult {
    if (error instanceof NoteImageMutationError) return { ok: false, reason: error.reason };
    if (error instanceof StudyDataLockUnavailableError) return { ok: false, reason: "blocked" };
    return { ok: false, reason: "save-failed" };
  }

  function queueLocalLibraryAction<T>(operation: () => Promise<T>): Promise<T> {
    const result = localLibraryWritesRef.current.catch(() => undefined).then(operation);
    localLibraryWritesRef.current = result.then(() => undefined, () => undefined);
    return result;
  }

  async function handleAddNoteImage(image: NoteImageAttachment): Promise<NoteImageActionResult> {
    if (localLibraryEditingBlocked || libraryMutationsPausedRef.current || noteImagesLoadFailed) {
      return { ok: false, reason: "blocked" };
    }
    try {
      return await queueLocalLibraryAction(async () => {
        const next = await queueNoteImageStoreMutation(async (current) => {
          const result = addNoteImage(current, currentProblem.id, image);
          if (!result.ok) throw new NoteImageMutationError(result.reason);
          const courseValue = latestCourseStoreSnapshot()
            ?? await withStudyDataReadLock(() => getLargeStoredValue(COURSE_NOTES_STORAGE_KEY));
          try {
            backupFromStoredValues(courseValue, result.store);
          } catch (error) {
            if (error instanceof StudyBackupError && error.code === "too-large") {
              throw new NoteImageMutationError("backup-limit");
            }
            throw error;
          }
          return result.store;
        });
        setNoteImageStore(next);
        updateRecord({ status: practiceStatusAfterActivity(currentRecord.status, "edit") });
        return { ok: true };
      });
    } catch (error) {
      return noteImageFailure(error);
    }
  }

  async function handleNoteImageCaption(imageId: string, caption: string): Promise<NoteImageActionResult> {
    if (localLibraryEditingBlocked || libraryMutationsPausedRef.current || noteImagesLoadFailed) {
      return { ok: false, reason: "blocked" };
    }
    try {
      return await queueLocalLibraryAction(async () => {
        const next = await queueNoteImageStoreMutation(async (current) => {
          const result = updateNoteImageCaption(current, currentProblem.id, imageId, caption);
          if (result === current) return current;
          const courseValue = latestCourseStoreSnapshot()
            ?? await withStudyDataReadLock(() => getLargeStoredValue(COURSE_NOTES_STORAGE_KEY));
          try {
            backupFromStoredValues(courseValue, result);
          } catch (error) {
            if (error instanceof StudyBackupError && error.code === "too-large") {
              throw new NoteImageMutationError("backup-limit");
            }
            throw error;
          }
          return result;
        });
        setNoteImageStore(next);
        return { ok: true };
      });
    } catch (error) {
      return noteImageFailure(error);
    }
  }

  async function handleRemoveNoteImage(imageId: string): Promise<NoteImageActionResult> {
    if (localLibraryEditingBlocked || libraryMutationsPausedRef.current || noteImagesLoadFailed) {
      return { ok: false, reason: "blocked" };
    }
    try {
      return await queueLocalLibraryAction(async () => {
        const next = await queueNoteImageStoreMutation((current) => (
          removeNoteImage(current, currentProblem.id, imageId)
        ));
        setNoteImageStore(next);
        return { ok: true };
      });
    } catch (error) {
      return noteImageFailure(error);
    }
  }

  async function handleSaveMistakeEntry(entry: MistakeEntry): Promise<void> {
    if (localLibraryEditingBlocked || libraryMutationsPausedRef.current || mistakeBookLoadFailed) {
      throw new Error("The mistake book is read-only.");
    }
    await queueLocalLibraryAction(async () => {
      const next = await queueMistakeBookStoreMutation(async (current) => {
        const result = upsertMistakeEntry(current, entry);
        if (!result.ok) throw new Error(`Invalid mistake entry at ${result.issue.field}.`);
        const courseValue = latestCourseStoreSnapshot()
          ?? await withStudyDataReadLock(() => getLargeStoredValue(COURSE_NOTES_STORAGE_KEY));
        backupFromStoredValues(
          courseValue,
          latestNoteImageStoreSnapshot() ?? noteImageStore,
          result.store,
        );
        return result.store;
      });
      setMistakeBookStore(next);
    });
  }

  async function handleDeleteMistakeEntry(entryId: string): Promise<void> {
    if (localLibraryEditingBlocked || libraryMutationsPausedRef.current || mistakeBookLoadFailed) {
      throw new Error("The mistake book is read-only.");
    }
    await queueLocalLibraryAction(async () => {
      const next = await queueMistakeBookStoreMutation((current) => removeMistakeEntry(current, entryId));
      setMistakeBookStore(next);
    });
  }

  function updateLineNote(index: number, value: string) {
    const next = [...currentRecord.lineNotes];
    next[index] = value;
    updateRecord({
      lineNotes: next,
      status: practiceStatusAfterActivity(currentRecord.status, "edit"),
    });
  }

  function selectCodeLine(lineNumber: number) {
    const nextLine = Math.min(Math.max(1, lineNumber), codeLines.length);
    setActiveCodeLine(nextLine);
    window.requestAnimationFrame(() => codeEditorRef.current?.revealLine(nextLine, { focus: false }));
  }

  function focusCodeLine(lineNumber: number) {
    const nextLine = Math.min(Math.max(1, lineNumber), codeLines.length);
    setActiveCodeLine(nextLine);
    window.requestAnimationFrame(() => codeEditorRef.current?.revealLine(nextLine));
  }

  function scrollRunFeedbackIntoView() {
    if (!window.matchMedia(COMPACT_WORKSPACE_QUERY).matches) return;
    const behavior: ScrollBehavior = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth";
    const generation = runFeedbackGenerationRef.current;
    if (runFeedbackFrameRef.current !== null) window.cancelAnimationFrame(runFeedbackFrameRef.current);
    runFeedbackFrameRef.current = window.requestAnimationFrame(() => {
      runFeedbackFrameRef.current = null;
      if (generation !== runFeedbackGenerationRef.current) return;
      testConsoleRef.current?.scrollIntoView({ block: "start", behavior });
      runStatusRef.current?.focus({ preventScroll: true });
    });
  }

  function revealRunOutcome(lineNumber?: number) {
    const compact = window.matchMedia(COMPACT_WORKSPACE_QUERY).matches;
    const generation = runFeedbackGenerationRef.current;
    if (lineNumber) {
      const safeLine = Math.min(Math.max(1, lineNumber), codeLines.length);
      setActiveCodeLine(safeLine);
      window.requestAnimationFrame(() => {
        if (generation !== runFeedbackGenerationRef.current) return;
        codeEditorRef.current?.revealLine(safeLine, { focus: !compact });
      });
    }
    if (compact) scrollRunFeedbackIntoView();
  }

  function failedTestReviewNote(result: WorkerTestResult): string {
    const sourceTest = currentProblem.tests[result.index];
    const input = language === "en"
      ? result.expression
      : (sourceTest?.inputLabel ?? result.expression);
    const detail = describeFirstMismatch(result.expected, result.actual, language);
    return copy.failedTestNote(result.index + 1, input, pretty(result.expected), pretty(result.actual), detail);
  }

  function saveFailedTestToReview(result: WorkerTestResult) {
    const note = failedTestReviewNote(result);
    const existing = currentRecord.mistakes.trim();
    updateRecord({
      mistakes: existing.includes(note) ? existing : [existing, note].filter(Boolean).join("\n\n"),
      status: practiceStatusAfterActivity(currentRecord.status, "edit"),
    });
    setNoteTab("review");
    openNotesDrawer();
  }

  async function saveFailedTestToMistakeBook(result: WorkerTestResult) {
    try {
      // A panel save may already be queued while the learner returns to the
      // failed test. Build from the last verified store so this shortcut never
      // restores an older root-cause or reference-answer draft.
      await localLibraryWritesRef.current;
      const note = failedTestReviewNote(result);
      const fresh = createCurrentProblemMistake(currentMistakeSeed);
      const currentMistakes = latestMistakeBookStoreSnapshot() ?? mistakeBookStore;
      const existing = currentMistakes.entries.find((entry) => entry.id === fresh.id);
      const entry: MistakeEntry = existing
        ? {
          ...existing,
          title: fresh.title,
          sourceUrl: fresh.sourceUrl,
          prompt: fresh.prompt,
          myAnswer: currentRecord.code,
          rootCause: existing.rootCause.trim() ? existing.rootCause : note,
          status: existing.status === "mastered" ? "reviewing" : existing.status,
          updatedAt: Math.max(fresh.updatedAt, existing.updatedAt + 1),
        }
        : { ...fresh, rootCause: note, status: "reviewing" };
      await handleSaveMistakeEntry(entry);
      setMistakeBookSelectionRequest({
        entryId: entry.id,
        sequence: ++mistakeBookSelectionSequenceRef.current,
      });
      openMistakeBook();
    } catch {
      saveFailedTestToReview(result);
    }
  }

  function fillLineNotes() {
    updateRecord({
      lineNotes: suggestedLineNotes.map((suggestion, index) => currentRecord.lineNotes[index] || suggestion),
      status: practiceStatusAfterActivity(currentRecord.status, "edit"),
    });
  }

  function focusLineReflection() {
    setNoteTab("line");
    setNoteLineMode("all");
    openNotesDrawer();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      const textareas = keyLineIndexes
        .map((index) => lineNotesPanelRef.current?.querySelector<HTMLTextAreaElement>(`textarea[data-line-index="${index}"]`))
        .filter((textarea): textarea is HTMLTextAreaElement => Boolean(textarea));
      const unfinished = textareas.find((textarea) => {
        const index = Number(textarea.dataset.lineIndex);
        const note = textarea.value.trim();
        return !note || generatedLineNoteAlternatives[index]?.some((suggestion) => suggestion.trim() === note);
      });
      (unfinished ?? textareas[0])?.focus();
    }));
  }

  function focusRecognitionSignal() {
    setNoteTab("review");
    openNotesDrawer();
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => recognitionSignalRef.current?.focus()));
  }

  function continueCompletionReflection() {
    if (completionProgress.explainedKeyLines < completionProgress.requiredKeyLines) {
      focusLineReflection();
      return;
    }
    focusRecognitionSignal();
  }

  function restoreStarterCode(askForConfirmation: boolean, focusStarter: boolean) {
    if (askForConfirmation && !window.confirm(copy.resetConfirm)) return;
    cancelActiveRun();
    updateRecord({ code: currentProblem.starterCode, lineNotes: [] });
    setStarterPromptLine(null);
    setSourceIssue(null);
    setCoreIdeaLocation(null);
    setNoteLineMode("current");
    const starterLine = starterPlaceholderLine(currentProblem.starterCode, currentProblem.starterCode) ?? 1;
    setActiveCodeLine(focusStarter ? starterLine : 1);
    setRunState({ phase: "idle", message: copy.resetMessage, results: [] });
    window.requestAnimationFrame(() => codeEditorRef.current?.revealLine(focusStarter ? starterLine : 1, { focus: focusStarter }));
  }

  function resetCode() {
    restoreStarterCode(true, false);
  }

  function markCurrentProblemSolved() {
    if (!allQuickTestsPassed || !completionProgress.notesReady || currentRecord.status === "solved") return;
    updateRecord({ status: "solved" });
    void playTestHaptic(true);
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => completionStatusRef.current?.focus()));
  }

  function openNextPracticeProblem() {
    if (!nextPracticeProblem) return;
    closeNotesDrawer(false);
    chooseProblem(nextPracticeProblem.id);
  }

  function returnToStudyHome() {
    closeNotesDrawer(false);
    showAppMode("path");
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => studyHomeRef.current?.focus()));
  }

  function updateCurrentPracticeStatus(status: LearningStatus) {
    if (status === "solved" && currentRecord.status !== "solved") return;
    if (currentRecord.status === "solved" && status !== "solved" && status !== "review") return;
    updateRecord({ status });
  }

  function updateEditorCode(nextCode: string, lineNoteEdit?: LineNoteEdit) {
    const nextLineNotes = syncLineNotes(currentRecord.code, nextCode, currentRecord.lineNotes, lineNoteEdit);
    if (nextCode === currentRecord.code && JSON.stringify(nextLineNotes) === JSON.stringify(currentRecord.lineNotes)) return;
    cancelActiveRun();
    markStudyDirty();
    setStarterPromptLine(null);
    setSourceIssue(null);
    setCoreIdeaLocation((current) => current === "problem" ? current : null);
    setRunState({ phase: "idle", message: copy.notRun, results: [] });
    setRecords((previous) => {
      const previousRecord = normalizeStudyRecord(currentProblem, previous[currentProblem.id]);
      return {
        ...previous,
        [currentProblem.id]: {
          ...previousRecord,
          code: nextCode,
          lineNotes: syncLineNotes(previousRecord.code, nextCode, previousRecord.lineNotes, lineNoteEdit),
          status: practiceStatusAfterActivity(previousRecord.status, "edit"),
        },
      };
    });
  }

  function adjustEditorIndent(direction: "in" | "out") {
    if (direction === "out") codeEditorRef.current?.outdent();
    else codeEditorRef.current?.indent();
  }

  function retryTests() {
    runTests();
    window.requestAnimationFrame(() => runStatusRef.current?.focus({ preventScroll: true }));
  }

  function runTests(options?: { allowPlaceholder?: boolean }) {
    if (runState.phase === "running" || activeRunRef.current) return;

    if (pythonSourceIsEmpty(currentRecord.code)) {
      setStarterPromptLine(null);
      setSourceIssue("empty");
      setCoreIdeaLocation(null);
      setRunState({ phase: "idle", message: copy.emptyCodeMessage, results: [] });
      revealRunOutcome();
      return;
    }

    const placeholderLine = starterPlaceholderLine(currentRecord.code, currentProblem.starterCode);
    if (placeholderLine !== null && options?.allowPlaceholder !== true) {
      setStarterPromptLine(placeholderLine);
      setCoreIdeaLocation((current) => current === "problem" || current === "starter" ? "starter" : null);
      setRunState({ phase: "idle", message: copy.starterPrompt(placeholderLine), results: [] });
      revealRunOutcome(placeholderLine);
      return;
    }

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    const requestId = `${currentProblem.id}:${++runSequenceRef.current}`;
    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const worker = workerRef.current ?? new Worker(`${basePath}/python-worker-signature-v1.js`);
    workerRef.current = worker;
    setStarterPromptLine(null);
    setSourceIssue(null);
    setCoreIdeaLocation((current) => current === "problem" ? current : null);
    setRunState({ phase: "running", message: copy.loadingPython, results: [] });
    updateRecord({ status: practiceStatusAfterActivity(currentRecord.status, "run") });

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

    const armTimeout = (duration: number, kind: "timeout" | "runtime") => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
      timeoutRef.current = setTimeout(() => {
        if (!finishActiveRequest()) return;
        worker.terminate();
        workerRef.current = null;
        runtimeReadyRef.current = false;
        setRunState({
          phase: "error",
          kind,
          message: kind === "runtime" ? copy.runtimeTimeout : copy.timeout,
          results: [],
        });
        scrollRunFeedbackIntoView();
      }, duration);
    };
    armTimeout(runtimeReadyRef.current ? 20_000 : 90_000, runtimeReadyRef.current ? "timeout" : "runtime");

    function handleWorkerMessage(event: MessageEvent) {
      const data = event.data;
      if (activeRunRef.current?.id !== requestId || !messageBelongsToRun(data, requestId)) return;
      if (data.type === "status") {
        if (data.status === "ready") {
          runtimeReadyRef.current = true;
          armTimeout(20_000, "timeout");
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
        const results = ((data.results ?? []) as WorkerTestResult[]).map((result) => result.error
          ? {
              ...result,
              error: {
                ...result.error,
                message: pythonErrorSummary(result.error.message) || result.error.message,
              },
            }
          : result);
        const allPassed = results.length > 0 && results.every((result) => result.passed);
        const firstError = results.find((result) => !result.passed)?.error;
        const errorLine = solutionErrorLine(`${firstError?.message ?? ""}\n${firstError?.traceback ?? ""}`);
        void playTestHaptic(allPassed);
        setRunState({
          phase: "done",
          message: allPassed ? copy.allPassed : copy.someFailed,
          results,
          duration: data.duration ?? 0,
          stdout: data.stdout ?? "",
          errorLine: errorLine ?? undefined,
        });
        revealRunOutcome(errorLine ?? undefined);
        return;
      }

      const kind = data.phase === "loading" ? "runtime" : "code";
      if (kind === "runtime") {
        worker.terminate();
        workerRef.current = null;
        runtimeReadyRef.current = false;
      }
      const structuredSignatureIssue = kind === "code"
        ? normalizeSignatureIssue(data.error, currentProblem.signature, currentRecord.code)
        : null;
      const errorMessage = kind === "runtime"
        ? copy.workerFailed
        : structuredSignatureIssue
          ? copy.signatureStatus
          : pythonErrorSummary(data.error?.message) || copy.runFailed;
      const errorLine = structuredSignatureIssue?.focusLine
        ?? (kind === "code"
          ? solutionErrorLine(`${data.error?.message ?? ""}\n${data.error?.traceback ?? ""}`)
          : null);
      setRunState({
        phase: "error",
        kind,
        message: errorMessage,
        results: [],
        stdout: data.stdout ?? "",
        errorLine: errorLine ?? undefined,
        signatureIssue: structuredSignatureIssue ?? undefined,
      });
      revealRunOutcome(errorLine ?? undefined);
    }

    function handleWorkerError() {
      if (!finishActiveRequest()) return;
      worker.terminate();
      workerRef.current = null;
      runtimeReadyRef.current = false;
      setRunState({
        phase: "error",
        kind: "runtime",
        message: copy.workerFailed,
        results: [],
      });
      scrollRunFeedbackIntoView();
    }

    worker.addEventListener("message", handleWorkerMessage);
    worker.addEventListener("error", handleWorkerError);
    activeRunRef.current = { id: requestId, cleanup: cleanupWorkerListeners };

    worker.postMessage({
      id: requestId,
      code: currentRecord.code,
      signature: currentProblem.signature,
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
            <button type="button" className={!showMistakeBook && appMode === "path" ? "is-active" : ""} aria-current={!showMistakeBook && appMode === "path" ? "page" : undefined} disabled={studyEditingBlocked} onClick={() => showAppMode("path")}>{copy.learningPath}</button>
            <button type="button" className={!showMistakeBook && appMode === "workspace" ? "is-active" : ""} aria-current={!showMistakeBook && appMode === "workspace" ? "page" : undefined} disabled={studyEditingBlocked} onMouseEnter={() => { void loadCodeEditor(); }} onFocus={() => { void loadCodeEditor(); }} onClick={() => showAppMode("workspace")}>{copy.freePractice}</button>
            <button type="button" className={!showMistakeBook && appMode === "course" ? "is-active" : ""} aria-current={!showMistakeBook && appMode === "course" ? "page" : undefined} disabled={studyEditingBlocked} onMouseEnter={() => { void loadCourseNotes(); }} onFocus={() => { void loadCourseNotes(); }} onClick={() => showAppMode("course")}>{copy.courseNotes}</button>
            <button type="button" className={showMistakeBook ? "is-active" : ""} aria-current={showMistakeBook ? "page" : undefined} disabled={studyEditingBlocked} onMouseEnter={() => { void loadMistakeBookPanel(); }} onFocus={() => { void loadMistakeBookPanel(); }} onClick={openMistakeBook}>{copy.mistakeBook}</button>
          </nav>
          <div className="language-toggle" role="group" aria-label="Language / 语言">
            <button type="button" lang="zh-CN" className={language === "zh" ? "is-active" : ""} disabled={studyEditingBlocked} onClick={() => selectLanguage("zh")}>中文</button>
            <button type="button" lang="en" className={language === "en" ? "is-active" : ""} disabled={studyEditingBlocked} onClick={() => selectLanguage("en")}>EN</button>
          </div>
          <PwaInstaller language={language} />
          <button className="button native-tools-trigger" type="button" disabled={!hydrated} onClick={() => { setReminderMessage(""); if (!studyEditingBlocked) setBackupMessage(""); setPendingBackup(null); setShowNativeSettings(true); }}>
            <span aria-hidden="true">⚙</span>{copy.settings}
          </button>
          <div className="font-size-control" aria-label={copy.adjustFont}>
            <span>{copy.fontSize}</span>
            <button
              type="button"
              aria-label={copy.decreaseFont}
              onClick={() => setFontSize((current) => Math.max(MIN_FONT_SIZE, current - 1))}
              disabled={studyEditingBlocked || fontSize === MIN_FONT_SIZE}
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
              disabled={studyEditingBlocked}
            />
            <button
              type="button"
              aria-label={copy.increaseFont}
              onClick={() => setFontSize((current) => Math.min(MAX_FONT_SIZE, current + 1))}
              disabled={studyEditingBlocked || fontSize === MAX_FONT_SIZE}
            >
              A+
            </button>
            <output aria-live="polite">{fontScale}%</output>
          </div>
          <button className="button button-quiet" type="button" onClick={() => setShowGuide(true)}>{copy.guide}</button>
        </div>
      </header>

      {staleStudyData && (
        <section className={backupStyles.safetyBanner} role="alert" aria-labelledby="stale-study-data-title">
          <div>
            <strong id="stale-study-data-title">{copy.staleTitle}</strong>
            <span>{copy.staleBody}</span>
            {backupMessage && <small className={backupMessageIsError ? backupStyles.safetyError : backupStyles.safetySuccess}>{backupMessage}</small>}
          </div>
          <div className={backupStyles.safetyActions}>
            <button className="button button-primary" type="button" onClick={() => void handleExportBackup()} disabled={backupBusy}>{copy.rescueBackup}</button>
            <button className="button button-quiet" type="button" onClick={() => window.location.reload()} disabled={backupBusy}>{copy.retryLoad}</button>
          </div>
        </section>
      )}

      {storageReadOnly && !staleStudyData && (
        <section className={backupStyles.safetyBanner} role="alert" aria-labelledby="read-only-study-data-title">
          <div>
            <strong id="read-only-study-data-title">{copy.readOnlyTitle}</strong>
            <span>{copy.readOnlyBody}</span>
            {backupMessage && <small className={backupMessageIsError ? backupStyles.safetyError : backupStyles.safetySuccess}>{backupMessage}</small>}
          </div>
          <div className={backupStyles.safetyActions}>
            <button className="button button-primary" type="button" onClick={() => void handleExportBackup()} disabled={backupBusy}>{copy.exportBackup}</button>
            <button className="button button-quiet" type="button" onClick={() => setShowNativeSettings(true)} disabled={backupBusy}>{copy.settings}</button>
          </div>
        </section>
      )}

      {saveState === "error" && !staleStudyData && !storageReadOnly && (
        <div className={headerStyles.saveErrorBanner} role="alert">
          <strong>{copy.saveFailed}</strong>
          <span>{storageLoadFailed ? copy.storageLoadFailed : copy.saveRecovery}</span>
        </div>
      )}

      {!hydrated && (
        <div className={headerStyles.restoreNotice} role={storageLoadFailed ? "alert" : "status"} aria-live="polite">
          <span>{storageLoadFailed
            ? copy.storageLoadFailed
            : language === "zh" ? "正在恢复这台设备上的学习记录…" : "Restoring study data on this device…"}</span>
          {storageLoadFailed && <button className="button" type="button" onClick={() => window.location.reload()}>{copy.retryLoad}</button>}
        </div>
      )}

      {hydrated && mistakeBookMounted && (
        <div hidden={!showMistakeBook}>
          <Suspense fallback={<div className={headerStyles.modeLoading} role="status">{copy.mistakeBookLoading}</div>}>
            {mistakeBookLoadFailed && <p className={backupStyles.safetyBanner} role="alert">{copy.mistakeBookLoadFailed}</p>}
            <MistakeBookPanel
              language={language}
              entries={mistakeBookStore.entries}
              currentProblem={currentMistakeSeed}
              selectionRequest={mistakeBookSelectionRequest}
              disabled={localLibraryEditingBlocked || mistakeBookLoadFailed}
              onSave={handleSaveMistakeEntry}
              onDelete={handleDeleteMistakeEntry}
            />
          </Suspense>
        </div>
      )}

      {hydrated && !studyEditingBlocked && !showMistakeBook && (
      <div>
      {appMode === "path" ? (
        <div ref={studyHomeRef} tabIndex={-1} role="region" aria-label={copy.learningPath}>
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
        </div>
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
            {nativeApp ? (
              <button type="button" className={ideStyles.officialButton} onClick={openOfficialProblemPage}>
                {copy.openOfficialProblem}<span aria-hidden="true">↗</span>
              </button>
            ) : (
              <a
                className={ideStyles.officialButton}
                href={officialProblemUrl}
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
              <h1 ref={libraryHeadingRef} tabIndex={-1}>{libraryTitle}</h1>
              <span role="status" aria-live="polite" aria-atomic="true">
                {copy.resultSummary(activeStatusLabel, filteredProblems.length)}
              </span>
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
            <div className={ideStyles.libraryStatusFilters}>
              <span>{copy.statusFilter}</span>
              <div role="group" aria-label={copy.statusFilterLabel}>
                {PRACTICE_STATUS_FILTERS.map((status) => {
                  const label = status === "all" ? copy.allStatuses : copy.statusLabels[status];
                  return (
                    <button
                      type="button"
                      key={status}
                      aria-pressed={statusFilter === status}
                      className={statusFilter === status ? ideStyles.libraryFilterActive : ""}
                      onClick={() => setStatusFilter(status)}
                    >
                      <span>{label}</span><b>{statusCounts[status]}</b>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className={ideStyles.libraryContinueCard}>
              <div>
                <strong>{copy.continuePractice}</strong>
                <small>{copy.continueRule}</small>
              </div>
              {recommendedLibraryProblem && recommendedLibraryStatus ? (
                <button
                  type="button"
                  disabled={studyEditingBlocked}
                  aria-label={`${copy.continueProblem(recommendedLibraryStatus, recommendedLibraryProblem.id, recommendedLibraryProblem.title)} · ${copy.statusLabels[recommendedLibraryStatus]}`}
                  onClick={openRecommendedPractice}
                >
                  <span>{copy.continueProblem(recommendedLibraryStatus, recommendedLibraryProblem.id, recommendedLibraryProblem.title)}</span>
                  <small>{copy.statusLabels[recommendedLibraryStatus]} <span aria-hidden="true">→</span></small>
                </button>
              ) : (
                <div className={ideStyles.libraryScopeComplete}>
                  <span>{allProblemsMastered ? copy.allProblemsComplete : scopedProblems.length ? copy.scopeComplete : copy.noMatch}</span>
                  {allProblemsMastered ? (
                    <button type="button" onClick={returnToStudyHome}>{copy.backToStudyHome}</button>
                  ) : hasPracticeScopeFilters && (
                    <button type="button" onClick={clearPracticeFilters}>{copy.clearFilters}</button>
                  )}
                </div>
              )}
            </div>
          </div>

          {filteredProblems.length > 0 && !currentProblemVisible && (
            <div className={ideStyles.currentProblemHidden} role="note">
              <span>{copy.currentProblemHidden(currentProblem.id, currentProblem.title)}</span>
              <button type="button" onClick={showCurrentProblemInLibrary}>{copy.showCurrentProblem}</button>
            </div>
          )}

          <nav className="problem-list" aria-label={libraryTitle}>
            {filteredProblems.length ? filteredProblems.map((problem) => {
              const status = practiceRecordStatus(records[problem.id]);
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
              <div className={`empty-list ${ideStyles.libraryEmpty}`}>
                <p>{scopedProblems.length ? copy.noStatusMatch(activeStatusLabel) : copy.noMatch}</p>
                <button type="button" onClick={scopedProblems.length ? clearPracticeStatusFilter : clearPracticeFilters}>
                  {scopedProblems.length ? copy.showAllStatuses : copy.clearFilters}
                </button>
              </div>
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
              <span>{nativeApp ? "ALGORITHM 105" : "HOT 100 + EXTRA"} / {currentProblem.topic}</span>
              {!nativeApp && (
                <cite className="problem-source">
                  <a href={officialProblemUrl} target="_blank" rel="noreferrer">
                    {copy.officialProblem(currentProblem.id, currentProblem.title)}
                  </a>
                </cite>
              )}
            </div>
            <div className="brief-title-row">
              <h2 ref={problemHeadingRef} tabIndex={-1}>{currentProblem.id}. {currentProblem.title}</h2>
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
            <div className={ideStyles.hintCoach}>
              <div className="hint-row">
                <span>{copy.beginnerHint}</span>
                <p>{currentProblem.hint}</p>
                <b>{copy.targetComplexity}{currentProblem.complexity}</b>
              </div>
              <button
                type="button"
                className={ideStyles.methodToggle}
                aria-expanded={coreIdeaLocation === "problem"}
                aria-controls={`problem-core-idea-${currentProblem.id}`}
                onClick={() => setCoreIdeaLocation((current) => current === "problem" ? null : "problem")}
              >
                {coreIdeaLocation === "problem" ? copy.hideCoreIdea : copy.showCoreIdea}
              </button>
              {coreIdeaLocation === "problem" && (
                <div id={`problem-core-idea-${currentProblem.id}`} className={ideStyles.methodDisclosure}>
                  <strong>{copy.coreIdea}</strong>
                  <p>{currentProblem.method}</p>
                </div>
              )}
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
              <button className="run-button" type="button" onClick={() => runTests()} disabled={runState.phase === "running"}>
                <span aria-hidden="true">▶</span>{runState.phase === "running" ? copy.running : copy.run}
              </button>
              {nativeApp ? (
                <button type="button" className={`${ideStyles.officialButton} ${ideStyles.editorSubmit}`} onClick={openOfficialProblemPage}>
                  {language === "zh" ? "原题" : "Official"}<span aria-hidden="true">↗</span>
                </button>
              ) : (
                <a className={`${ideStyles.officialButton} ${ideStyles.editorSubmit}`} href={officialProblemUrl} target="_blank" rel="noreferrer">
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
                onRun={() => runTests()}
                fontSize={fontSize}
                language={language}
                ariaLabel={copy.editorLabel}
                onCursorLineChange={setActiveCodeLine}
              />
            </Suspense>
          </div>

          <section ref={testConsoleRef} className={`test-console test-${runState.phase} ${ideStyles.testConsole}`} aria-live="polite">
            <div className="console-head">
              <div>
                <strong>{copy.quickTest}</strong>
                <span id="editor-help">{testHelp}</span>
              </div>
              <div ref={runStatusRef} className={`console-status ${ideStyles.consoleStatusFocus}`} tabIndex={-1}>
                {runState.phase === "running" && <i className="spinner" />}
                <span>{runState.message}</span>
                {runState.phase === "done" && <small>{Math.round(runState.duration)} ms</small>}
              </div>
            </div>

            {sourceIssue === "empty" && (
              <div className={`${ideStyles.errorCoach} ${ideStyles.emptySourceCoach}`} role="note">
                <strong>{copy.emptyCodeTitle}</strong>
                <span>{copy.emptyCodeBody}</span>
                <div className={ideStyles.coachActions}>
                  <button type="button" onClick={() => restoreStarterCode(emptyRecoveryNeedsConfirmation, true)}>{copy.restoreStarter}</button>
                  <button type="button" onClick={() => focusCodeLine(1)}>{copy.backToEditor}</button>
                </div>
              </div>
            )}

            {starterPromptLine !== null && (
              <div className={`${ideStyles.errorCoach} ${ideStyles.starterCoach}`} role="note">
                <strong>{copy.starterCoachTitle}</strong>
                <span>{copy.starterCoachBody}</span>
                {coreIdeaLocation === "starter" && <p id={`starter-core-idea-${currentProblem.id}`} className={ideStyles.coachMethod}><b>{copy.coreIdea}{language === "zh" ? "：" : ": "}</b>{currentProblem.method}</p>}
                <div className={ideStyles.coachActions}>
                  <button type="button" onClick={() => focusCodeLine(starterPromptLine)}>{copy.editStarterLine(starterPromptLine)}</button>
                  <button type="button" aria-expanded={coreIdeaLocation === "starter"} aria-controls={`starter-core-idea-${currentProblem.id}`} onClick={() => setCoreIdeaLocation((current) => current === "starter" ? null : "starter")}>{coreIdeaLocation === "starter" ? copy.hideCoreIdea : copy.showCoreIdea}</button>
                  <button type="button" onClick={() => runTests({ allowPlaceholder: true })}>{copy.runAnyway}</button>
                </div>
              </div>
            )}

            {runtimeFailure && (
              <div className={`${ideStyles.errorCoach} ${ideStyles.runtimeCoach}`} role="note">
                <strong>{copy.runtimeFailureTitle}</strong>
                <span>{copy.runtimeFailureBody}</span>
                <div className={ideStyles.coachActions}>
                  <button type="button" onClick={retryTests}>{copy.retryRun}</button>
                  <button type="button" onClick={() => focusCodeLine(safeActiveCodeLine)}>{copy.backToEditor}</button>
                </div>
              </div>
            )}

            {executionTimeout && (
              <div className={`${ideStyles.errorCoach} ${ideStyles.timeoutCoach}`} role="note">
                <strong>{copy.timeoutTitle}</strong>
                <span>{copy.timeoutBody}</span>
                <div className={ideStyles.coachActions}>
                  <button type="button" onClick={() => focusCodeLine(safeActiveCodeLine)}>{copy.backToEditor}</button>
                </div>
              </div>
            )}

            {runErrorForCoaching && (
              <div className={`${ideStyles.errorCoach} ${signatureIssue ? ideStyles.signatureCoach : ""}`} role="note">
                <strong>{signatureIssue ? copy.signatureTitle : language === "zh" ? "先修第一处错误" : "Fix the first error first"}</strong>
                <span>{signatureIssue
                  ? copy.signatureBody(signatureIssue.symbol)
                  : beginnerPythonErrorHint(runErrorForCoaching, language)}</span>
                {signatureIssue && (
                  <div className={ideStyles.signatureDeclaration}>
                    <small>{copy.signatureExpected}</small>
                    <code>{signatureIssue.declaration}</code>
                  </div>
                )}
                <div className={ideStyles.coachActions}>
                  <button type="button" onClick={() => focusCodeLine(signatureIssue?.focusLine ?? runErrorLine ?? safeActiveCodeLine)}>
                    {signatureIssue
                      ? signatureIssue.focusLine === undefined
                        ? copy.backToSignatureCode
                        : signatureIssue.focusKind === "class"
                          ? copy.checkSignatureClass(signatureIssue.focusLine)
                          : copy.checkSignatureLine(signatureIssue.focusLine)
                      : runErrorLine ? copy.backToErrorLine(runErrorLine) : copy.backToEditor}
                  </button>
                </div>
              </div>
            )}

            {firstWrongAnswer && (
              <div className={`${ideStyles.errorCoach} ${ideStyles.wrongAnswerCoach}`} role="note">
                <strong>{copy.wrongAnswerTitle}</strong>
                <span>{firstWrongAnswerHint}</span>
                <small>{copy.wrongAnswerBody}</small>
                {coreIdeaLocation === "wrong" && <p id={`wrong-core-idea-${currentProblem.id}`} className={ideStyles.coachMethod}><b>{copy.coreIdea}{language === "zh" ? "：" : ": "}</b>{currentProblem.method}</p>}
                <div className={ideStyles.coachActions}>
                  <button type="button" onClick={() => focusCodeLine(safeActiveCodeLine)}>{copy.backToEditor}</button>
                  <button type="button" aria-expanded={coreIdeaLocation === "wrong"} aria-controls={`wrong-core-idea-${currentProblem.id}`} onClick={() => setCoreIdeaLocation((current) => current === "wrong" ? null : "wrong")}>{coreIdeaLocation === "wrong" ? copy.hideCoreIdea : copy.showCoreIdea}</button>
                  <button type="button" onClick={() => void saveFailedTestToMistakeBook(firstWrongAnswer)}>{copy.saveFailedReview}</button>
                </div>
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

            {allQuickTestsPassed && currentRecord.status !== "solved" && (
              <button className="next-review-button" type="button" onClick={focusLineReflection}>
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
              <h2 ref={notesHeadingRef} tabIndex={-1}>{copy.notebookTitle}</h2>
              <span className="notes-problem-label">{copy.notesForProblem} <strong>{currentProblem.id}. {currentProblem.title}</strong></span>
            </div>
            <div className="notes-head-actions">
              {nativeApp && <button type="button" className="share-note-button" onClick={handleShareNotes}><span aria-hidden="true">↗</span>{copy.shareNotes}</button>}
              <span
                className={`autosave-badge ${noteSaveIsError ? ideStyles.noteSaveError : ""}`}
                role={noteSaveIsError ? "alert" : undefined}
              >
                {noteSaveLabel}
              </span>
            </div>
          </div>
          {shareMessage && <p className="native-action-message" role="status">{shareMessage}</p>}

          {allQuickTestsPassed && (
            <section
              className={`${ideStyles.completionGuide} ${currentRecord.status === "solved" ? ideStyles.completionSuccess : ""}`}
              aria-labelledby={`completion-guide-title-${currentProblem.id}`}
            >
              {currentRecord.status === "solved" ? (
                <div ref={completionStatusRef} tabIndex={-1} role="status" className={ideStyles.completionStatus}>
                  <span className={ideStyles.completionCelebration} aria-hidden="true">✓</span>
                  <div>
                    <h3 id={`completion-guide-title-${currentProblem.id}`}>{copy.masteredTitle}</h3>
                    <p>{copy.masteredBody}</p>
                    <strong>
                      {nextPracticeProblem
                        ? copy.nextRecommended(nextPracticeProblem.id, nextPracticeProblem.title)
                        : copy.allMastered}
                    </strong>
                  </div>
                  <div className={ideStyles.completionActions}>
                    {nextPracticeProblem && <button type="button" onClick={openNextPracticeProblem}>{copy.practiceNext}</button>}
                    <button type="button" onClick={returnToStudyHome}>{copy.backToStudyHome}</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={ideStyles.completionHeading}>
                    <span aria-hidden="true">✓</span>
                    <div>
                      <h3 id={`completion-guide-title-${currentProblem.id}`}>{copy.completionTitle}</h3>
                      <p>{nativeApp ? copy.nativeCompletionBody : copy.completionBody}</p>
                    </div>
                  </div>
                  <ol className={ideStyles.completionSteps}>
                    <li className={completionProgress.explainedKeyLines >= completionProgress.requiredKeyLines ? ideStyles.completionDone : ""}>
                      <span className={ideStyles.completionMarker} aria-hidden="true">
                        {completionProgress.explainedKeyLines >= completionProgress.requiredKeyLines ? "✓" : "1"}
                      </span>
                      <div>
                        <strong>{copy.completionNotes(completionProgress.explainedKeyLines, completionProgress.requiredKeyLines)}</strong>
                        {completionProgress.explainedKeyLines < completionProgress.requiredKeyLines && (
                          <button type="button" onClick={focusLineReflection}>{copy.goExplain}</button>
                        )}
                      </div>
                    </li>
                    <li className={completionProgress.hasRecognitionSignal ? ideStyles.completionDone : ""}>
                      <span className={ideStyles.completionMarker} aria-hidden="true">{completionProgress.hasRecognitionSignal ? "✓" : "2"}</span>
                      <div>
                        <strong>{copy.completionSignal}</strong>
                        {!completionProgress.hasRecognitionSignal && (
                          <button type="button" onClick={focusRecognitionSignal}>{copy.goWriteSignal}</button>
                        )}
                      </div>
                    </li>
                    <li>
                      <span className={ideStyles.completionMarker} aria-hidden="true">3</span>
                      <div>
                        <strong>{nativeApp ? copy.nativeCompletionSubmit : copy.completionSubmit}</strong>
                        {nativeApp ? (
                          <button type="button" onClick={openOfficialProblemPage}>
                            {copy.openOfficialProblem}<span aria-hidden="true"> ↗</span>
                          </button>
                        ) : (
                          <a
                            href={officialProblemUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {copy.openOfficialProblem}<span aria-hidden="true"> ↗</span>
                          </a>
                        )}
                      </div>
                    </li>
                  </ol>
                  <p className={ideStyles.completionReadiness} role="status">
                    {completionProgress.notesReady ? copy.reflectionReady : copy.reflectionNeeded}
                  </p>
                  <button
                    className={ideStyles.completionPrimary}
                    type="button"
                    onClick={completionProgress.notesReady ? markCurrentProblemSolved : continueCompletionReflection}
                  >
                    {completionProgress.notesReady
                      ? (nativeApp ? copy.confirmValidated : copy.confirmAccepted)
                      : copy.continueReflection}
                  </button>
                </>
              )}
            </section>
          )}

          <div
            className="note-tabs"
            role="tablist"
            aria-label={copy.notebookLabel}
            onKeyDown={(event) => handleTabListKeyDown(event, NOTE_TABS, noteTab, setNoteTab)}
          >
            <button id="line-notes-tab" type="button" role="tab" tabIndex={noteTab === "line" ? 0 : -1} aria-selected={noteTab === "line"} aria-controls="line-notes-panel" className={noteTab === "line" ? "is-active" : ""} onClick={() => setNoteTab("line")}>{copy.lineNotes}</button>
            <button id="review-notes-tab" type="button" role="tab" tabIndex={noteTab === "review" ? 0 : -1} aria-selected={noteTab === "review"} aria-controls="review-notes-panel" className={noteTab === "review" ? "is-active" : ""} onClick={() => setNoteTab("review")}>{copy.reflection}</button>
            <button
              id="image-notes-tab"
              type="button"
              role="tab"
              tabIndex={noteTab === "images" ? 0 : -1}
              aria-selected={noteTab === "images"}
              aria-controls="image-notes-panel"
              className={noteTab === "images" ? "is-active" : ""}
              onMouseEnter={() => { void loadNoteImagePanel(); }}
              onFocus={() => { void loadNoteImagePanel(); }}
              onClick={() => { void loadNoteImagePanel(); setNoteTab("images"); }}
            >
              {copy.imageNotes(currentNoteImages.length)}
            </button>
          </div>

          <div className="mobile-notes-context">
            <div>
              <strong>{currentProblem.id}. {currentProblem.title}</strong>
              <span>{copy.difficultyLabels[currentProblem.difficulty]} · {currentProblem.topic}</span>
            </div>
            <button type="button" onClick={showCodeFromNotes}>{copy.viewProblemAndCode}</button>
          </div>

          {noteTab === "line" ? (
            <div ref={lineNotesPanelRef} id="line-notes-panel" role="tabpanel" aria-labelledby="line-notes-tab" className="line-notes-view">
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
                        data-line-index={index}
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
          ) : noteTab === "review" ? (
            <div id="review-notes-panel" role="tabpanel" aria-labelledby="review-notes-tab" className="review-notes-view">
              <label>
                <span><b>1</b> {copy.thinkingTitle}</span>
                <small>{copy.thinkingHelp}</small>
                <textarea rows={6} value={currentRecord.thinking} onChange={(event) => updateRecord({ thinking: event.target.value, status: practiceStatusAfterActivity(currentRecord.status, "edit") })} placeholder={copy.thinkingPlaceholder} />
              </label>
              <label>
                <span><b>2</b> {copy.mistakesTitle}</span>
                <small>{copy.mistakesHelp}</small>
                <textarea rows={5} value={currentRecord.mistakes} onChange={(event) => updateRecord({ mistakes: event.target.value, status: practiceStatusAfterActivity(currentRecord.status, "edit") })} placeholder={copy.mistakesPlaceholder} />
              </label>
              <label>
                <span><b>3</b> {copy.reviewTitle}</span>
                <small>{copy.reviewHelp}</small>
                <textarea ref={recognitionSignalRef} rows={5} value={currentRecord.review} onChange={(event) => updateRecord({ review: event.target.value, status: practiceStatusAfterActivity(currentRecord.status, "edit") })} placeholder={copy.reviewPlaceholder} />
              </label>
            </div>
          ) : (
            <div id="image-notes-panel" role="tabpanel" aria-labelledby="image-notes-tab">
              <Suspense fallback={<p role="status">{copy.imageNotesLoading}</p>}>
                <NoteImagePanel
                  language={language}
                  problemTitle={`${currentProblem.id}. ${currentProblem.title}`}
                  images={currentNoteImages}
                  totalImages={totalNoteImages}
                  disabled={localLibraryEditingBlocked}
                  unavailable={noteImagesLoadFailed}
                  onAdd={handleAddNoteImage}
                  onCaption={handleNoteImageCaption}
                  onRemove={handleRemoveNoteImage}
                />
              </Suspense>
            </div>
          )}

          <div className="mastery-box">
            <span>{copy.problemStatus}</span>
            <small id={`practice-status-help-${currentProblem.id}`} className={ideStyles.statusHelp}>{copy.statusHelp}</small>
            <div className="status-buttons" aria-describedby={`practice-status-help-${currentProblem.id}`}>
              {(Object.keys(copy.statusLabels) as LearningStatus[]).map((status) => (
                <button
                  type="button"
                  key={status}
                  className={currentRecord.status === status ? "is-active" : ""}
                  disabled={(status === "solved" && currentRecord.status !== "solved")
                    || (currentRecord.status === "solved" && status !== "solved" && status !== "review")}
                  onClick={() => updateCurrentPracticeStatus(status)}
                >
                  {copy.statusLabels[status]}
                </button>
              ))}
            </div>
          </div>
        </aside>
        </div>
      )}
      </div>
      )}

      {showNativeSettings && (
        <div className="native-settings-backdrop" role="presentation" onMouseDown={(event) => { if (!settingsBusy && event.target === event.currentTarget) setShowNativeSettings(false); }}>
          <section ref={nativeSettingsDialogRef} tabIndex={-1} className="native-settings-dialog" role="dialog" aria-modal="true" aria-labelledby="native-settings-title" aria-busy={settingsBusy}>
            <div className="native-settings-handle" aria-hidden="true" />
            <button className={`guide-close ${backupStyles.closeButton}`} type="button" aria-label={copy.closeSettings} onClick={() => setShowNativeSettings(false)} disabled={settingsBusy}>×</button>
            <div className="section-kicker">ON-DEVICE STUDY</div>
            <h2 id="native-settings-title">{copy.nativeSettingsTitle}</h2>
            <p>{copy.nativeSettingsBody}</p>

            {nativeApp && (
              <section className={backupStyles.reminderSection} aria-labelledby="study-reminder-title">
                <h3 id="study-reminder-title">{copy.studyReminder}</h3>
                <label className="native-reminder-toggle">
                  <span><strong>{copy.reminderEnabled}</strong><small>{dailyReminder.enabled ? dailyReminder.time : "—"}</small></span>
                  <input
                    type="checkbox"
                    checked={dailyReminder.enabled}
                    disabled={settingsBusy || studyEditingBlocked}
                    onChange={(event) => { setReminderMessage(""); setDailyReminder((current) => ({ ...current, enabled: event.target.checked })); }}
                  />
                </label>

                <label className="native-reminder-time">
                  <span>{copy.reminderTime}</span>
                  <input
                    type="time"
                    value={dailyReminder.time}
                    disabled={settingsBusy || studyEditingBlocked || !dailyReminder.enabled}
                    onChange={(event) => setDailyReminder((current) => ({ ...current, time: event.target.value }))}
                  />
                </label>

                <div className="native-offline-note"><span aria-hidden="true">✓</span><p>{copy.reminderOffline}</p></div>
                {reminderMessage && <p className="native-settings-message" role="status">{reminderMessage}</p>}

                <button className="button button-primary native-reminder-save" type="button" onClick={handleSaveReminder} disabled={settingsBusy || studyEditingBlocked}>
                  {reminderSaving ? copy.savingReminder : copy.saveReminder}
                </button>
              </section>
            )}

            <section className={backupStyles.backupSection} aria-labelledby="full-backup-title">
              <div className={backupStyles.sectionHeading}>
                <span aria-hidden="true">↥</span>
                <div>
                  <h3 id="full-backup-title" ref={pendingBackup ? backupReviewHeadingRef : undefined} tabIndex={pendingBackup ? -1 : undefined}>{pendingBackup ? copy.reviewBackup : copy.fullBackup}</h3>
                  {!pendingBackup && <p>{copy.backupBody}</p>}
                </div>
              </div>

              {pendingBackup ? (
                <div className={backupStyles.reviewPanel}>
                  <dl>
                    <div><dt>{copy.backupCreated}</dt><dd>{new Intl.DateTimeFormat(language === "zh" ? "zh-CN" : "en", { dateStyle: "medium", timeStyle: "short" }).format(new Date(pendingBackup.exportedAt))}</dd></div>
                  </dl>
                  <p>{copy.backupContains(Object.keys(pendingBackup.study.records).length, pendingBackup.course.courses.length, noteImageCount(pendingBackup.noteImages), pendingBackup.mistakeBook.entries.length, pendingBackup.profile.xp)}</p>
                  <p>{copy.currentContains(Object.keys(records).length, currentCourseCount, currentImageCount, currentMistakeCount)}</p>
                  <strong className={backupStyles.warning}>{copy.restoreWarning}</strong>
                  <div className={backupStyles.reviewActions}>
                    <button type="button" className="button button-quiet" onClick={handleExportBackup} disabled={settingsBusy}>{copy.exportCurrentFirst}</button>
                    <button type="button" className="button button-quiet" onClick={() => { setPendingBackup(null); setBackupMessage(""); window.requestAnimationFrame(() => restoreBackupButtonRef.current?.focus()); }} disabled={settingsBusy}>{copy.cancelRestore}</button>
                    <button type="button" className="button button-primary" onClick={handleRestoreBackup} disabled={settingsBusy || studyEditingBlocked}>{copy.confirmRestore}</button>
                  </div>
                </div>
              ) : (
                <>
                  <div className={backupStyles.backupActions}>
                    <button type="button" className="button button-primary" onClick={handleExportBackup} disabled={settingsBusy}>
                      {backupOperation === "exporting" ? copy.backupPreparing : copy.exportBackup}
                    </button>
                    <button ref={restoreBackupButtonRef} type="button" className="button button-quiet" onClick={() => backupFileInputRef.current?.click()} disabled={settingsBusy || studyEditingBlocked} aria-describedby="backup-privacy-note">
                      {backupOperation === "checking" ? copy.backupChecking : copy.restoreBackup}
                    </button>
                  </div>
                  <p id="backup-privacy-note" className={backupStyles.privacyNote}>{copy.backupPrivacy}</p>
                </>
              )}

              <input
                ref={backupFileInputRef}
                className="sr-only"
                type="file"
                accept=".json,application/json"
                tabIndex={-1}
                aria-label={copy.restoreBackup}
                onChange={handleBackupFile}
                disabled={settingsBusy || studyEditingBlocked}
              />
              {backupMessage && (
                <p className={backupMessageIsError ? backupStyles.errorMessage : backupStyles.statusMessage} role={backupMessageIsError ? "alert" : "status"}>
                  {backupMessage}
                </p>
              )}
            </section>

            <div className="native-settings-links">
              <button type="button" disabled={settingsBusy} onClick={() => void openExternalPage(PRIVACY_URL)}>{copy.privacyPolicy}<span aria-hidden="true">↗</span></button>
              <button type="button" disabled={settingsBusy} onClick={() => void openExternalPage(SUPPORT_URL)}>{copy.support}<span aria-hidden="true">↗</span></button>
              <button type="button" disabled={settingsBusy} onClick={() => void openExternalPage(LICENSES_URL)}>{copy.licenses}<span aria-hidden="true">↗</span></button>
            </div>
            <button className="native-delete-data" type="button" onClick={handleDeleteStudyData} disabled={settingsBusy || studyEditingBlocked}>{copy.deleteData}</button>
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
            <button className="button button-primary" type="button" onClick={() => { showAppMode("path"); setShowGuide(false); }}>{copy.goToPath}</button>
          </section>
        </div>
      )}
    </main>
  );
}
