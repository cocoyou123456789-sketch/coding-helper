"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  compareMistakeAnswers,
  createCurrentProblemMistake,
  createExternalMistake,
  MAX_MISTAKE_ANSWER_LENGTH,
  MAX_MISTAKE_ANSWER_LINES,
  MAX_MISTAKE_ENTRIES,
  MAX_MISTAKE_PROMPT_LENGTH,
  MAX_MISTAKE_REFLECTION_LENGTH,
  MAX_MISTAKE_SOURCE_URL_LENGTH,
  MAX_MISTAKE_TITLE_LENGTH,
  mergeMistakeEntryDraft,
  mistakeEntryIssue,
  MistakeBookValidationError,
  type CurrentProblemMistakeSeed,
  type MistakeEntry,
  type MistakeEditableField,
  type MistakeLanguage,
  type MistakeStatus,
} from "./mistake-book";
import styles from "./mistake-book-panel.module.css";

export type MistakeBookPanelProps = {
  language: "zh" | "en";
  entries: MistakeEntry[];
  currentProblem?: CurrentProblemMistakeSeed | null;
  selectionRequest?: { entryId: string; sequence: number } | null;
  disabled?: boolean;
  onSave(entry: MistakeEntry): Promise<void>;
  onDelete(entryId: string): Promise<void>;
};

type ImportDraft = {
  title: string;
  sourceUrl: string;
  prompt: string;
  language: MistakeLanguage;
  myAnswer: string;
  referenceAnswer: string;
};

type ReviewDraftState = {
  entry: MistakeEntry;
  sourceEntry: MistakeEntry;
  sourceUpdatedAt: number;
  sourceSignature: string;
  conflictFields: MistakeEditableField[];
};

const EMPTY_IMPORT: ImportDraft = {
  title: "",
  sourceUrl: "",
  prompt: "",
  language: "python",
  myAnswer: "",
  referenceAnswer: "",
};

const copy = {
  zh: {
    kicker: "MISTAKE REVIEW",
    title: "错题本",
    intro: "把做错、卡住或值得重做的题放进来。先并排看差异，再写清真正原因和下次提醒。",
    count: (count: number) => `${count} / ${MAX_MISTAKE_ENTRIES} 题`,
    currentTitle: "把正在做的题加入错题本",
    currentHelp: "会带入题目、链接和你当前的代码；不会自动填参考答案。",
    addCurrent: "加入当前题",
    openCurrent: "打开已有记录",
    externalTitle: "导入其他题",
    externalHelp: "粘贴题目和答案即可。来源链接只作为书签保存，本页不会抓取或转载网页内容。",
    showImport: "＋ 导入一道题",
    hideImport: "收起导入",
    titleLabel: "题目名称",
    titlePlaceholder: "例如：两数之和",
    urlLabel: "来源链接（可选）",
    urlPlaceholder: "https://leetcode.cn/problems/...",
    promptLabel: "题目内容（可选）",
    promptPlaceholder: "粘贴你有权保存的题目内容或自己的摘要…",
    languageLabel: "代码语言",
    myAnswer: "我的答案",
    myAnswerPlaceholder: "粘贴或修改你当时写的代码…",
    referenceAnswer: "参考答案",
    referencePlaceholder: "粘贴你确认过的正确答案…",
    importButton: "导入并开始复盘",
    importSuccess: "题目已加入错题本。",
    emptyTitle: "错题本还是空的",
    emptyBody: "从当前题加入，或导入一道做错的题。一次只复盘一个具体差异，会更轻松。",
    listTitle: "我的错题",
    unreviewed: "待复盘",
    reviewing: "复盘中",
    mastered: "已掌握",
    currentBadge: "当前题",
    externalBadge: "导入题",
    detailTitle: "复盘工作区",
    source: "查看原题 ↗",
    question: "题目 / 我的摘要",
    status: "复盘状态",
    compareTitle: "逐行对比",
    compareHelp: "只做确定性的逐行 LCS 对比：仅忽略行末多余空格，Python 缩进和字符串里的空格都会保留。它不是 AI，不会判断算法是否正确。",
    needBoth: "填写“我的答案”和“参考答案”后，这里会立即显示差异。",
    comparisonTruncated: `答案超过 ${MAX_MISTAKE_ANSWER_LINES} 行。为保证手机流畅，当前只对比前 ${MAX_MISTAKE_ANSWER_LINES} 行；缩短后才能保存。`,
    common: "共同",
    onlyMine: "仅我的",
    onlyReference: "仅参考",
    similarity: "行相似度",
    noSimilarity: "—",
    analysis: (onlyMine: number, onlyReference: number) => onlyMine === 0 && onlyReference === 0
      ? "两份答案的非空代码行一致。接下来重点检查输入边界、返回格式和复杂度。"
      : onlyReference > 0
        ? `先看右侧标出的 ${onlyReference} 行：参考答案有、你的答案没有。再检查左侧 ${onlyMine} 行是否是多余步骤或不同写法。`
        : `参考答案没有缺失行；重点检查左侧多出的 ${onlyMine} 行是否改变了结果、顺序或复杂度。`,
    mineColumn: "我的",
    referenceColumn: "参考",
    rootCause: "这次为什么出错？",
    rootCauseHelp: "例如：没想到边界条件；把下标和值混了；复杂度判断错了。",
    rootCausePlaceholder: "写事实，不写“我太笨了”…",
    takeaway: "下次看到什么信号，要想到什么？",
    takeawayHelp: "把提醒写得短而可执行，例如：看到“配对 + 快速查找”先想哈希表。",
    takeawayPlaceholder: "下次的识别信号与动作…",
    save: "保存这次复盘",
    saving: "正在保存…",
    saved: "复盘已保存到错题本。",
    delete: "删除这道错题",
    deleteConfirm: "确定删除这道错题和全部复盘内容吗？此操作不能撤销。",
    deleted: "错题已删除。",
    saveFailed: "保存失败，内容仍留在当前页面。请检查本机空间后重试。",
    deleteFailed: "删除失败，请稍后再试。",
    invalidTitle: "请填写题目名称。",
    invalidUrl: "来源链接必须是完整的 http:// 或 https:// 地址，且不能包含账号密码。",
    invalidData: "内容格式或长度不符合安全限制，请缩短后重试。",
    limitReached: `最多保存 ${MAX_MISTAKE_ENTRIES} 道错题，请先删除旧记录。`,
    disabled: "学习数据目前为只读状态，暂时不能修改错题本。",
    selectEntry: "选择一道错题开始复盘",
    discardConfirm: "这道题还有未保存的修改。确定放弃修改并继续吗？",
    conflictConfirm: "这道题在你编辑期间又保存了新内容。当前草稿已尽量合并；仍有同一栏的冲突。确定用当前草稿覆盖冲突内容吗？",
    conflictNotice: "检测到同一题的新保存内容：未冲突的部分已自动合并；保存前会再次确认冲突栏。",
    selectionKept: "失败记录已经加入错题本。为保留当前未保存的修改，暂时没有切换；新记录在左侧列表中。",
  },
  en: {
    kicker: "MISTAKE REVIEW",
    title: "Mistake book",
    intro: "Keep problems you missed, got stuck on, or want to retry. Compare the exact differences, then record the real cause and a useful reminder.",
    count: (count: number) => `${count} / ${MAX_MISTAKE_ENTRIES} problems`,
    currentTitle: "Add the problem you are solving",
    currentHelp: "This carries over the prompt, source link, and your current code. It never invents a reference answer.",
    addCurrent: "Add current problem",
    openCurrent: "Open existing entry",
    externalTitle: "Import another problem",
    externalHelp: "Paste the problem and answers. A source URL is kept only as a bookmark; this page does not scrape or republish it.",
    showImport: "+ Import a problem",
    hideImport: "Close import form",
    titleLabel: "Problem title",
    titlePlaceholder: "For example: Two Sum",
    urlLabel: "Source URL (optional)",
    urlPlaceholder: "https://leetcode.com/problems/...",
    promptLabel: "Problem text (optional)",
    promptPlaceholder: "Paste content you may save, or write your own summary…",
    languageLabel: "Code language",
    myAnswer: "My answer",
    myAnswerPlaceholder: "Paste or edit the code you wrote…",
    referenceAnswer: "Reference answer",
    referencePlaceholder: "Paste a correct answer you have verified…",
    importButton: "Import and review",
    importSuccess: "Problem added to the mistake book.",
    emptyTitle: "Your mistake book is empty",
    emptyBody: "Add the current problem or import one you missed. Reviewing one concrete difference at a time is enough.",
    listTitle: "My problems",
    unreviewed: "To review",
    reviewing: "Reviewing",
    mastered: "Mastered",
    currentBadge: "Current",
    externalBadge: "Imported",
    detailTitle: "Review workspace",
    source: "Open source ↗",
    question: "Problem / my summary",
    status: "Review status",
    compareTitle: "Line-by-line comparison",
    compareHelp: "This is a deterministic LCS comparison. Only trailing whitespace is ignored; Python indentation and spaces inside strings remain significant. It is not AI and cannot judge algorithmic correctness.",
    needBoth: "Add both your answer and a reference answer to see the differences here.",
    comparisonTruncated: `An answer exceeds ${MAX_MISTAKE_ANSWER_LINES} lines. To keep mobile devices responsive, only the first ${MAX_MISTAKE_ANSWER_LINES} lines are compared; shorten it before saving.`,
    common: "Shared",
    onlyMine: "Mine only",
    onlyReference: "Reference only",
    similarity: "Line similarity",
    noSimilarity: "—",
    analysis: (onlyMine: number, onlyReference: number) => onlyMine === 0 && onlyReference === 0
      ? "The non-empty lines match. Check input boundaries, return shape, and complexity next."
      : onlyReference > 0
        ? `Start with the ${onlyReference} highlighted reference lines that your answer lacks, then decide whether the ${onlyMine} mine-only lines are extra work or an alternate approach.`
        : `No reference lines are missing. Check whether the ${onlyMine} mine-only lines change the result, ordering, or complexity.`,
    mineColumn: "Mine",
    referenceColumn: "Reference",
    rootCause: "Why did this go wrong?",
    rootCauseHelp: "For example: missed an edge case, mixed up indexes and values, or misread the complexity.",
    rootCausePlaceholder: "Write a fact, not “I am bad at this”…",
    takeaway: "What signal should trigger what action next time?",
    takeawayHelp: "Keep it short and actionable, such as: pairing + fast lookup → consider a hash map.",
    takeawayPlaceholder: "The recognition signal and next action…",
    save: "Save this review",
    saving: "Saving…",
    saved: "Review saved to the mistake book.",
    delete: "Delete this problem",
    deleteConfirm: "Delete this problem and its entire review? This cannot be undone.",
    deleted: "Problem deleted.",
    saveFailed: "Saving failed. Your draft is still on this page. Check device storage and try again.",
    deleteFailed: "Deletion failed. Please try again.",
    invalidTitle: "Enter a problem title.",
    invalidUrl: "Use a full http:// or https:// source URL without embedded credentials.",
    invalidData: "Some content has an invalid format or exceeds its safe length. Shorten it and try again.",
    limitReached: `You can keep up to ${MAX_MISTAKE_ENTRIES} problems. Delete an old entry first.`,
    disabled: "Study data is read-only right now, so the mistake book cannot be changed.",
    selectEntry: "Choose a problem to start reviewing",
    discardConfirm: "This problem has unsaved changes. Discard them and continue?",
    conflictConfirm: "New saved content arrived while you were editing. Non-conflicting changes were merged. Replace the remaining conflicting fields with this draft?",
    conflictNotice: "New saved content was detected. Non-conflicting fields were merged; you will confirm any conflicting fields before saving.",
    selectionKept: "The failed attempt was added. To preserve this unsaved draft, the view did not switch; the new entry is in the list.",
  },
} as const;

type PanelText = typeof copy.zh | typeof copy.en;

const LANGUAGE_OPTIONS: MistakeLanguage[] = ["python", "javascript", "typescript", "java", "cpp", "other"];
const STATUS_OPTIONS: MistakeStatus[] = ["unreviewed", "reviewing", "mastered"];

function actionErrorMessage(error: unknown, text: PanelText): string {
  if (error instanceof MistakeBookValidationError) {
    if (error.issue.field.includes("title")) return text.invalidTitle;
    if (error.issue.field.includes("sourceUrl")) return text.invalidUrl;
    return text.invalidData;
  }
  return text.saveFailed;
}

function statusLabel(status: MistakeStatus, text: PanelText): string {
  return text[status];
}

function inputId(entryId: string, field: string): string {
  return `mistake-${field}-${entryId.replace(/[^A-Za-z0-9_-]/g, "-")}`;
}

function editableEntrySignature(entry: MistakeEntry): string {
  return JSON.stringify({
    title: entry.title,
    sourceUrl: entry.sourceUrl,
    prompt: entry.prompt,
    language: entry.language,
    myAnswer: entry.myAnswer,
    referenceAnswer: entry.referenceAnswer,
    rootCause: entry.rootCause,
    takeaway: entry.takeaway,
    status: entry.status,
  });
}

function reviewDraftState(entry: MistakeEntry): ReviewDraftState {
  return {
    entry: { ...entry },
    sourceEntry: { ...entry },
    sourceUpdatedAt: entry.updatedAt,
    sourceSignature: editableEntrySignature(entry),
    conflictFields: [],
  };
}

function mergeReviewDraftState(state: ReviewDraftState, incoming: MistakeEntry): ReviewDraftState {
  const merged = mergeMistakeEntryDraft(
    state.sourceEntry,
    state.entry,
    incoming,
    state.conflictFields,
  );

  return {
    entry: merged.entry,
    sourceEntry: { ...incoming },
    sourceUpdatedAt: incoming.updatedAt,
    sourceSignature: editableEntrySignature(incoming),
    conflictFields: merged.conflictFields,
  };
}

function importDraftHasContent(draft: ImportDraft): boolean {
  return draft.language !== EMPTY_IMPORT.language
    || draft.title !== ""
    || draft.sourceUrl !== ""
    || draft.prompt !== ""
    || draft.myAnswer !== ""
    || draft.referenceAnswer !== "";
}

function currentProblemEntryId(problem: CurrentProblemMistakeSeed | null): string | null {
  if (!problem) return null;
  try {
    return createCurrentProblemMistake(problem, 0).id;
  } catch {
    return null;
  }
}

export default function MistakeBookPanel({
  language,
  entries,
  currentProblem = null,
  selectionRequest = null,
  disabled = false,
  onSave,
  onDelete,
}: MistakeBookPanelProps) {
  const text = copy[language];
  const orderedEntries = useMemo(
    () => [...entries].sort((first, second) => second.updatedAt - first.updatedAt || first.title.localeCompare(second.title)),
    [entries],
  );
  const [selectedId, setSelectedId] = useState<string | null>(() => orderedEntries[0]?.id ?? null);
  const selectedEntry = selectedId === null
    ? null
    : entries.find((entry) => entry.id === selectedId) ?? orderedEntries[0] ?? null;
  const activeEntryId = selectedEntry?.id ?? null;
  const [draftState, setDraftState] = useState<ReviewDraftState | null>(
    () => selectedEntry ? reviewDraftState(selectedEntry) : null,
  );
  const draftStateMatchesSelected = Boolean(selectedEntry && draftState?.entry.id === selectedEntry.id);
  const storedDraftDirty = Boolean(
    draftStateMatchesSelected
    && draftState
    && editableEntrySignature(draftState.entry) !== draftState.sourceSignature,
  );
  // A parent refresh may replace the saved entry while this panel is hidden. Keep
  // a locally edited draft instead of silently replacing it with the newer props.
  const usingStoredDraft = Boolean(
    selectedEntry
    && draftStateMatchesSelected
    && draftState
    && (draftState.sourceUpdatedAt === selectedEntry.updatedAt || storedDraftDirty),
  );
  const draft = selectedEntry
    ? usingStoredDraft && draftState
      ? draftState.entry
      : { ...selectedEntry }
    : null;
  const [importOpen, setImportOpen] = useState(entries.length === 0);
  const [importDraft, setImportDraft] = useState<ImportDraft>(EMPTY_IMPORT);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const detailHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const libraryHeadingRef = useRef<HTMLHeadingElement | null>(null);
  const handledSelectionSequenceRef = useRef<number | null>(null);

  const reviewDirty = usingStoredDraft && storedDraftDirty;
  const hasUnsavedDraft = reviewDirty || importDraftHasContent(importDraft);

  useEffect(() => {
    if (!hasUnsavedDraft) return;
    const warnBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warnBeforeUnload);
    return () => window.removeEventListener("beforeunload", warnBeforeUnload);
  }, [hasUnsavedDraft]);

  useEffect(() => {
    if (!selectedEntry
      || !draftStateMatchesSelected
      || !draftState
      || draftState.sourceUpdatedAt === selectedEntry.updatedAt) return;
    const frame = window.requestAnimationFrame(() => {
      if (!storedDraftDirty) {
        setDraftState(reviewDraftState(selectedEntry));
        return;
      }
      const merged = mergeReviewDraftState(draftState, selectedEntry);
      setDraftState(merged);
      if (merged.conflictFields.length) announce(text.conflictNotice, true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [draftState, draftStateMatchesSelected, selectedEntry, storedDraftDirty, text.conflictNotice]);

  useEffect(() => {
    if (!selectionRequest
      || handledSelectionSequenceRef.current === selectionRequest.sequence) return;
    const requestedEntry = entries.find((entry) => entry.id === selectionRequest.entryId);
    // Wait for persisted parent state instead of consuming a request early if
    // React delivers the selection and the updated entry in separate renders.
    if (!requestedEntry) return;
    const frame = window.requestAnimationFrame(() => {
      handledSelectionSequenceRef.current = selectionRequest.sequence;
      if (requestedEntry.id === selectedEntry?.id) {
        detailHeadingRef.current?.focus();
        return;
      }
      if (reviewDirty && !window.confirm(text.discardConfirm)) {
        announce(text.selectionKept);
        return;
      }
      setSelectedId(requestedEntry.id);
      setDraftState(reviewDraftState(requestedEntry));
      announce("");
      window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
    });
    return () => window.cancelAnimationFrame(frame);
  }, [entries, reviewDirty, selectedEntry?.id, selectionRequest, text.discardConfirm, text.selectionKept]);

  const currentEntryId = useMemo(() => currentProblemEntryId(currentProblem), [currentProblem]);
  const currentAlreadySaved = currentEntryId
    ? entries.some((entry) => entry.id === currentEntryId)
    : false;
  const draftId = draft?.id ?? null;
  const draftMyAnswer = draft?.myAnswer ?? "";
  const draftReferenceAnswer = draft?.referenceAnswer ?? "";
  const comparison = useMemo(
    () => draftId ? compareMistakeAnswers(draftMyAnswer, draftReferenceAnswer) : null,
    [draftId, draftMyAnswer, draftReferenceAnswer],
  );
  const canCompare = Boolean(draftMyAnswer.trim() && draftReferenceAnswer.trim());

  function announce(nextMessage: string, error = false) {
    setMessage(nextMessage);
    setMessageIsError(error);
  }

  function canLeaveReview(nextEntryId: string): boolean {
    return nextEntryId === selectedEntry?.id || !reviewDirty || window.confirm(text.discardConfirm);
  }

  function selectEntry(entry: MistakeEntry) {
    if (entry.id === selectedEntry?.id) {
      window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
      return;
    }
    if (!canLeaveReview(entry.id)) return;
    setSelectedId(entry.id);
    setDraftState(reviewDraftState(entry));
    announce("");
    window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
  }

  function updateDraft(entry: MistakeEntry, resolvedField?: MistakeEditableField) {
    if (usingStoredDraft && draftState) {
      setDraftState({
        ...draftState,
        entry,
        conflictFields: resolvedField
          ? draftState.conflictFields.filter((field) => field !== resolvedField)
          : draftState.conflictFields,
      });
      return;
    }
    setDraftState({
      ...reviewDraftState(selectedEntry ?? entry),
      entry,
    });
  }

  async function saveNewEntry(entry: MistakeEntry): Promise<boolean> {
    if (!canLeaveReview(entry.id)) return false;
    setSaving(true);
    announce("");
    try {
      await onSave(entry);
      setSelectedId(entry.id);
      setDraftState(reviewDraftState(entry));
      setImportOpen(false);
      announce(text.importSuccess);
      window.requestAnimationFrame(() => detailHeadingRef.current?.focus());
      return true;
    } catch (error) {
      announce(actionErrorMessage(error, text), true);
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function addCurrentProblem() {
    if (!currentProblem || disabled || saving) return;
    const existing = entries.find((entry) => entry.id === currentEntryId);
    if (existing) {
      selectEntry(existing);
      return;
    }
    if (entries.length >= MAX_MISTAKE_ENTRIES) {
      announce(text.limitReached, true);
      return;
    }
    try {
      await saveNewEntry(createCurrentProblemMistake(currentProblem));
    } catch (error) {
      announce(actionErrorMessage(error, text), true);
    }
  }

  async function importProblem(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled || saving) return;
    if (entries.length >= MAX_MISTAKE_ENTRIES) {
      announce(text.limitReached, true);
      return;
    }
    try {
      const entry = createExternalMistake(importDraft);
      if (await saveNewEntry(entry)) setImportDraft(EMPTY_IMPORT);
    } catch (error) {
      announce(actionErrorMessage(error, text), true);
    }
  }

  async function saveReview() {
    if (!draft || disabled || saving) return;
    if (draftState?.conflictFields.length && !window.confirm(text.conflictConfirm)) return;
    const next: MistakeEntry = {
      ...draft,
      title: draft.title.trim(),
      sourceUrl: draft.sourceUrl.trim(),
      updatedAt: Math.max(Date.now(), draft.updatedAt + 1),
    };
    const issue = mistakeEntryIssue(next);
    if (issue) {
      const error = new MistakeBookValidationError(issue);
      announce(actionErrorMessage(error, text), true);
      return;
    }
    setSaving(true);
    announce("");
    try {
      await onSave(next);
      setDraftState(reviewDraftState(next));
      announce(text.saved);
    } catch {
      announce(text.saveFailed, true);
    } finally {
      setSaving(false);
    }
  }

  async function deleteEntry() {
    if (!draft || disabled || deleting || !window.confirm(text.deleteConfirm)) return;
    setDeleting(true);
    announce("");
    try {
      await onDelete(draft.id);
      const nextEntry = orderedEntries.find((entry) => entry.id !== draft.id) ?? null;
      setSelectedId(nextEntry?.id ?? null);
      setDraftState(nextEntry ? reviewDraftState(nextEntry) : null);
      announce(text.deleted);
      window.requestAnimationFrame(() => {
        if (nextEntry) detailHeadingRef.current?.focus();
        else libraryHeadingRef.current?.focus();
      });
    } catch {
      announce(text.deleteFailed, true);
    } finally {
      setDeleting(false);
    }
  }

  return (
    <section className={styles.panel} aria-labelledby="mistake-book-title">
      <header className={styles.hero}>
        <div>
          <p className={styles.kicker}>{text.kicker}</p>
          <h2 id="mistake-book-title">{text.title}</h2>
          <p>{text.intro}</p>
        </div>
        <span className={styles.total}>{text.count(entries.length)}</span>
      </header>

      {disabled && <p className={styles.errorMessage} role="alert">{text.disabled}</p>}
      {message && (
        <p className={messageIsError ? styles.errorMessage : styles.successMessage} role={messageIsError ? "alert" : "status"}>
          {message}
        </p>
      )}

      <div className={styles.addRow}>
        {currentProblem && (
          <article className={styles.currentCard}>
            <div>
              <strong>{text.currentTitle}</strong>
              <span>{currentProblem.title}</span>
              <small>{text.currentHelp}</small>
            </div>
            <button type="button" disabled={disabled || saving} onClick={() => void addCurrentProblem()}>
              {currentAlreadySaved ? text.openCurrent : text.addCurrent}
            </button>
          </article>
        )}
        <button
          type="button"
          className={styles.importToggle}
          aria-expanded={importOpen}
          aria-controls="mistake-import-form"
          disabled={disabled}
          onClick={() => setImportOpen((open) => !open)}
        >
          {importOpen ? text.hideImport : text.showImport}
        </button>
      </div>

      {importOpen && (
        <form id="mistake-import-form" className={styles.importForm} onSubmit={(event) => void importProblem(event)}>
          <div className={styles.sectionHeading}>
            <div>
              <h3>{text.externalTitle}</h3>
              <p>{text.externalHelp}</p>
            </div>
          </div>
          <div className={styles.formGrid}>
            <label>
              <span>{text.titleLabel}</span>
              <input
                required
                type="text"
                maxLength={MAX_MISTAKE_TITLE_LENGTH}
                value={importDraft.title}
                placeholder={text.titlePlaceholder}
                disabled={disabled || saving}
                onChange={(event) => setImportDraft((current) => ({ ...current, title: event.target.value }))}
              />
            </label>
            <label>
              <span>{text.urlLabel}</span>
              <input
                type="url"
                inputMode="url"
                maxLength={MAX_MISTAKE_SOURCE_URL_LENGTH}
                value={importDraft.sourceUrl}
                placeholder={text.urlPlaceholder}
                disabled={disabled || saving}
                onChange={(event) => setImportDraft((current) => ({ ...current, sourceUrl: event.target.value }))}
              />
            </label>
            <label>
              <span>{text.languageLabel}</span>
              <select
                value={importDraft.language}
                disabled={disabled || saving}
                onChange={(event) => setImportDraft((current) => ({
                  ...current,
                  language: event.target.value as MistakeLanguage,
                }))}
              >
                {LANGUAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
              </select>
            </label>
            <label className={styles.fullField}>
              <span>{text.promptLabel}</span>
              <textarea
                rows={4}
                maxLength={MAX_MISTAKE_PROMPT_LENGTH}
                value={importDraft.prompt}
                placeholder={text.promptPlaceholder}
                disabled={disabled || saving}
                onChange={(event) => setImportDraft((current) => ({ ...current, prompt: event.target.value }))}
              />
            </label>
            <label className={styles.answerField}>
              <span>{text.myAnswer}</span>
              <textarea
                rows={8}
                maxLength={MAX_MISTAKE_ANSWER_LENGTH}
                value={importDraft.myAnswer}
                placeholder={text.myAnswerPlaceholder}
                disabled={disabled || saving}
                spellCheck={false}
                autoCapitalize="off"
                onChange={(event) => setImportDraft((current) => ({ ...current, myAnswer: event.target.value }))}
              />
            </label>
            <label className={styles.answerField}>
              <span>{text.referenceAnswer}</span>
              <textarea
                rows={8}
                maxLength={MAX_MISTAKE_ANSWER_LENGTH}
                value={importDraft.referenceAnswer}
                placeholder={text.referencePlaceholder}
                disabled={disabled || saving}
                spellCheck={false}
                autoCapitalize="off"
                onChange={(event) => setImportDraft((current) => ({ ...current, referenceAnswer: event.target.value }))}
              />
            </label>
          </div>
          <button className={styles.primaryButton} type="submit" disabled={disabled || saving}>
            {saving ? text.saving : text.importButton}
          </button>
        </form>
      )}

      <div className={styles.workspace}>
        <aside className={styles.library} aria-labelledby="mistake-list-title">
          <div className={styles.libraryHeader}>
            <h3 ref={libraryHeadingRef} id="mistake-list-title" tabIndex={-1}>{text.listTitle}</h3>
            <span>{entries.length}</span>
          </div>
          {!orderedEntries.length ? (
            <div className={styles.emptyState}>
              <span aria-hidden="true">↻</span>
              <strong>{text.emptyTitle}</strong>
              <p>{text.emptyBody}</p>
            </div>
          ) : (
            <ul className={styles.entryList}>
              {orderedEntries.map((entry) => (
                <li key={entry.id}>
                  <button
                    type="button"
                    className={entry.id === activeEntryId ? styles.activeEntry : styles.entryButton}
                    aria-current={entry.id === activeEntryId ? "true" : undefined}
                    onClick={() => selectEntry(entry)}
                  >
                    <span className={styles.entryTitle}>{entry.title}</span>
                    <span className={styles.entryMeta}>
                      <span>{entry.origin === "current" ? text.currentBadge : text.externalBadge}</span>
                      <span data-status={entry.status}>{statusLabel(entry.status, text)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </aside>

        <section className={styles.detail}>
          {!draft ? (
            <div className={styles.selectState}>
              <span aria-hidden="true">↔</span>
              <p>{text.selectEntry}</p>
            </div>
          ) : (
            <>
              <div className={styles.detailHeader}>
                <div>
                  <p className={styles.kicker}>{text.detailTitle}</p>
                  <h3 ref={detailHeadingRef} tabIndex={-1}>{draft.title}</h3>
                </div>
                {draft.sourceUrl && (
                  <a href={draft.sourceUrl} target="_blank" rel="noreferrer noopener">{text.source}</a>
                )}
              </div>

              <div className={styles.metaEditor}>
                <label htmlFor={inputId(draft.id, "title")}>
                  <span>{text.titleLabel}</span>
                  <input
                    id={inputId(draft.id, "title")}
                    type="text"
                    required
                    maxLength={MAX_MISTAKE_TITLE_LENGTH}
                    value={draft.title}
                    disabled={disabled || saving}
                    onChange={(event) => updateDraft({ ...draft, title: event.target.value }, "title")}
                  />
                </label>
                <label htmlFor={inputId(draft.id, "status")}>
                  <span>{text.status}</span>
                  <select
                    id={inputId(draft.id, "status")}
                    value={draft.status}
                    disabled={disabled || saving}
                    onChange={(event) => updateDraft({ ...draft, status: event.target.value as MistakeStatus }, "status")}
                  >
                    {STATUS_OPTIONS.map((status) => <option key={status} value={status}>{statusLabel(status, text)}</option>)}
                  </select>
                </label>
                <label htmlFor={inputId(draft.id, "language")}>
                  <span>{text.languageLabel}</span>
                  <select
                    id={inputId(draft.id, "language")}
                    value={draft.language}
                    disabled={disabled || saving}
                    onChange={(event) => updateDraft({ ...draft, language: event.target.value as MistakeLanguage }, "language")}
                  >
                    {LANGUAGE_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                  </select>
                </label>
              </div>

              <label className={styles.stackField} htmlFor={inputId(draft.id, "prompt")}>
                <span>{text.question}</span>
                <textarea
                  id={inputId(draft.id, "prompt")}
                  rows={4}
                  maxLength={MAX_MISTAKE_PROMPT_LENGTH}
                  value={draft.prompt}
                  placeholder={text.promptPlaceholder}
                  disabled={disabled || saving}
                  onChange={(event) => updateDraft({ ...draft, prompt: event.target.value }, "prompt")}
                />
              </label>

              <div className={styles.answers}>
                <label className={styles.stackField} htmlFor={inputId(draft.id, "mine")}>
                  <span>{text.myAnswer}</span>
                  <textarea
                    id={inputId(draft.id, "mine")}
                    rows={12}
                    maxLength={MAX_MISTAKE_ANSWER_LENGTH}
                    value={draft.myAnswer}
                    placeholder={text.myAnswerPlaceholder}
                    disabled={disabled || saving}
                    spellCheck={false}
                    autoCapitalize="off"
                    onChange={(event) => updateDraft({ ...draft, myAnswer: event.target.value }, "myAnswer")}
                  />
                </label>
                <label className={styles.stackField} htmlFor={inputId(draft.id, "reference")}>
                  <span>{text.referenceAnswer}</span>
                  <textarea
                    id={inputId(draft.id, "reference")}
                    rows={12}
                    maxLength={MAX_MISTAKE_ANSWER_LENGTH}
                    value={draft.referenceAnswer}
                    placeholder={text.referencePlaceholder}
                    disabled={disabled || saving}
                    spellCheck={false}
                    autoCapitalize="off"
                    onChange={(event) => updateDraft({ ...draft, referenceAnswer: event.target.value }, "referenceAnswer")}
                  />
                </label>
              </div>

              <section className={styles.comparison} aria-labelledby="mistake-comparison-title">
                <div className={styles.sectionHeading}>
                  <div>
                    <h3 id="mistake-comparison-title">{text.compareTitle}</h3>
                    <p>{text.compareHelp}</p>
                  </div>
                </div>
                {!canCompare || !comparison ? (
                  <p className={styles.compareEmpty}>{text.needBoth}</p>
                ) : (
                  <>
                    {(comparison.truncated.mine || comparison.truncated.reference) && (
                      <p className={styles.compareWarning} role="alert">{text.comparisonTruncated}</p>
                    )}
                    <dl className={styles.summary}>
                      <div><dt>{text.common}</dt><dd>{comparison.summary.common}</dd></div>
                      <div><dt>{text.onlyMine}</dt><dd>{comparison.summary.onlyMine}</dd></div>
                      <div><dt>{text.onlyReference}</dt><dd>{comparison.summary.onlyReference}</dd></div>
                      <div>
                        <dt>{text.similarity}</dt>
                        <dd>{comparison.summary.similarity === null
                          ? text.noSimilarity
                          : `${Math.round(comparison.summary.similarity * 100)}%`}</dd>
                      </div>
                    </dl>
                    <p className={styles.analysisInsight}>
                      {text.analysis(comparison.summary.onlyMine, comparison.summary.onlyReference)}
                    </p>
                    <div className={styles.diffTable} role="table" aria-label={text.compareTitle}>
                      <div className={styles.diffHeader} role="row">
                        <span role="columnheader">{text.mineColumn}</span>
                        <span role="columnheader">{text.referenceColumn}</span>
                      </div>
                      <ol className={styles.diffLines} role="rowgroup">
                        {comparison.lines.map((line, index) => (
                          <li
                            key={`${line.kind}-${line.mineLineNumber}-${line.referenceLineNumber}-${index}`}
                            data-kind={line.kind}
                            role="row"
                          >
                            <div role="cell">
                              <span className={styles.visuallyHidden}>{text.mineColumn} {line.mineLineNumber ?? "—"}: </span>
                              <span className={styles.lineNumber} aria-hidden="true">{line.mineLineNumber ?? "·"}</span>
                              <code>{line.mineText ?? " "}</code>
                            </div>
                            <div role="cell">
                              <span className={styles.visuallyHidden}>{text.referenceColumn} {line.referenceLineNumber ?? "—"}: </span>
                              <span className={styles.lineNumber} aria-hidden="true">{line.referenceLineNumber ?? "·"}</span>
                              <code>{line.referenceText ?? " "}</code>
                            </div>
                          </li>
                        ))}
                      </ol>
                    </div>
                  </>
                )}
              </section>

              <div className={styles.reflectionGrid}>
                <label className={styles.stackField} htmlFor={inputId(draft.id, "cause")}>
                  <span>{text.rootCause}</span>
                  <small>{text.rootCauseHelp}</small>
                  <textarea
                    id={inputId(draft.id, "cause")}
                    rows={5}
                    maxLength={MAX_MISTAKE_REFLECTION_LENGTH}
                    value={draft.rootCause}
                    placeholder={text.rootCausePlaceholder}
                    disabled={disabled || saving}
                    onChange={(event) => updateDraft({ ...draft, rootCause: event.target.value }, "rootCause")}
                  />
                </label>
                <label className={styles.stackField} htmlFor={inputId(draft.id, "takeaway")}>
                  <span>{text.takeaway}</span>
                  <small>{text.takeawayHelp}</small>
                  <textarea
                    id={inputId(draft.id, "takeaway")}
                    rows={5}
                    maxLength={MAX_MISTAKE_REFLECTION_LENGTH}
                    value={draft.takeaway}
                    placeholder={text.takeawayPlaceholder}
                    disabled={disabled || saving}
                    onChange={(event) => updateDraft({ ...draft, takeaway: event.target.value }, "takeaway")}
                  />
                </label>
              </div>

              <div className={styles.actions}>
                <button className={styles.primaryButton} type="button" disabled={disabled || saving || deleting} onClick={() => void saveReview()}>
                  {saving ? text.saving : text.save}
                </button>
                <button className={styles.deleteButton} type="button" disabled={disabled || saving || deleting} onClick={() => void deleteEntry()}>
                  {text.delete}
                </button>
              </div>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
