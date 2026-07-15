export const MISTAKE_BOOK_STORAGE_KEY = "tijiebu-mistake-book-v1";
export const MISTAKE_BOOK_STORE_VERSION = 1;
export const MAX_MISTAKE_ENTRIES = 100;
export const MAX_MISTAKE_TITLE_LENGTH = 160;
export const MAX_MISTAKE_SOURCE_URL_LENGTH = 2_000;
export const MAX_MISTAKE_PROMPT_LENGTH = 30_000;
export const MAX_MISTAKE_ANSWER_LENGTH = 100_000;
export const MAX_MISTAKE_ANSWER_LINES = 600;
export const MAX_MISTAKE_REFLECTION_LENGTH = 12_000;
export const MAX_MISTAKE_STORE_CHARACTERS = 2 * 1024 * 1024;

const SAFE_ENTRY_ID = /^[A-Za-z0-9._-]{1,96}$/;
const ENTRY_KEYS = new Set([
  "id",
  "origin",
  "title",
  "sourceUrl",
  "prompt",
  "language",
  "myAnswer",
  "referenceAnswer",
  "rootCause",
  "takeaway",
  "status",
  "createdAt",
  "updatedAt",
]);

export type MistakeOrigin = "current" | "external";
export type MistakeLanguage = "python" | "javascript" | "typescript" | "java" | "cpp" | "other";
export type MistakeStatus = "unreviewed" | "reviewing" | "mastered";

export const MISTAKE_EDITABLE_FIELDS = [
  "title",
  "sourceUrl",
  "prompt",
  "language",
  "myAnswer",
  "referenceAnswer",
  "rootCause",
  "takeaway",
  "status",
] as const;

export type MistakeEditableField = (typeof MISTAKE_EDITABLE_FIELDS)[number];

export type MistakeEntry = {
  id: string;
  origin: MistakeOrigin;
  title: string;
  sourceUrl: string;
  prompt: string;
  language: MistakeLanguage;
  myAnswer: string;
  referenceAnswer: string;
  rootCause: string;
  takeaway: string;
  status: MistakeStatus;
  createdAt: number;
  updatedAt: number;
};

export type MistakeDraftMerge = {
  entry: MistakeEntry;
  conflictFields: MistakeEditableField[];
};

export type MistakeBookStore = {
  version: typeof MISTAKE_BOOK_STORE_VERSION;
  entries: MistakeEntry[];
};

export type CurrentProblemMistakeSeed = {
  problemId: number | string;
  title: string;
  sourceUrl?: string;
  prompt?: string;
  language?: MistakeLanguage;
  myAnswer?: string;
};

export type ExternalMistakeSeed = {
  title: string;
  sourceUrl?: string;
  prompt?: string;
  language?: MistakeLanguage;
  myAnswer?: string;
  referenceAnswer?: string;
};

export type MistakeBookIssue = {
  code: "invalid" | "too-large" | "duplicate";
  field: string;
};

export type UpsertMistakeResult =
  | { ok: true; store: MistakeBookStore }
  | { ok: false; issue: MistakeBookIssue };

export type AnswerDiffKind = "same" | "mine" | "reference";

export type AnswerDiffLine = {
  kind: AnswerDiffKind;
  mineText: string | null;
  referenceText: string | null;
  mineLineNumber: number | null;
  referenceLineNumber: number | null;
};

export type AnswerComparison = {
  lines: AnswerDiffLine[];
  truncated: {
    mine: boolean;
    reference: boolean;
  };
  summary: {
    common: number;
    onlyMine: number;
    onlyReference: number;
    similarity: number | null;
  };
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasOnlyKeys(value: Record<string, unknown>, keys: ReadonlySet<string>): boolean {
  return Object.keys(value).every((key) => keys.has(key));
}

function safeTimestamp(value: unknown): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= 0;
}

function lineCount(value: string): number {
  return value ? value.replace(/\r\n?/g, "\n").split("\n").length : 0;
}

function validSourceUrl(value: string): boolean {
  if (!value) return true;
  if (value !== value.trim() || value.length > MAX_MISTAKE_SOURCE_URL_LENGTH) return false;
  try {
    const url = new URL(value);
    return (url.protocol === "https:" || url.protocol === "http:")
      && !url.username
      && !url.password;
  } catch {
    return false;
  }
}

function fieldIssue(
  entry: Record<string, unknown>,
  field: "prompt" | "myAnswer" | "referenceAnswer" | "rootCause" | "takeaway",
  maximum: number,
  maximumLines?: number,
): MistakeBookIssue | null {
  const value = entry[field];
  if (typeof value !== "string") return { code: "invalid", field };
  if (value.length > maximum || (maximumLines !== undefined && lineCount(value) > maximumLines)) {
    return { code: "too-large", field };
  }
  return null;
}

export function mistakeEntryIssue(value: unknown): MistakeBookIssue | null {
  const entry = objectValue(value);
  if (!entry || !hasOnlyKeys(entry, ENTRY_KEYS)) return { code: "invalid", field: "entry" };
  if (typeof entry.id !== "string" || !SAFE_ENTRY_ID.test(entry.id)) {
    return { code: "invalid", field: "id" };
  }
  if (entry.origin !== "current" && entry.origin !== "external") {
    return { code: "invalid", field: "origin" };
  }
  if (typeof entry.title !== "string" || !entry.title.trim()) {
    return { code: "invalid", field: "title" };
  }
  if (entry.title !== entry.title.trim()) return { code: "invalid", field: "title" };
  if (entry.title.length > MAX_MISTAKE_TITLE_LENGTH) return { code: "too-large", field: "title" };
  if (typeof entry.sourceUrl !== "string" || !validSourceUrl(entry.sourceUrl)) {
    return {
      code: typeof entry.sourceUrl === "string" && entry.sourceUrl.length > MAX_MISTAKE_SOURCE_URL_LENGTH
        ? "too-large"
        : "invalid",
      field: "sourceUrl",
    };
  }
  if (!["python", "javascript", "typescript", "java", "cpp", "other"].includes(String(entry.language))) {
    return { code: "invalid", field: "language" };
  }
  if (!["unreviewed", "reviewing", "mastered"].includes(String(entry.status))) {
    return { code: "invalid", field: "status" };
  }
  if (!safeTimestamp(entry.createdAt)
    || !safeTimestamp(entry.updatedAt)
    || entry.updatedAt < entry.createdAt) {
    return { code: "invalid", field: "updatedAt" };
  }

  return fieldIssue(entry, "prompt", MAX_MISTAKE_PROMPT_LENGTH)
    ?? fieldIssue(entry, "myAnswer", MAX_MISTAKE_ANSWER_LENGTH, MAX_MISTAKE_ANSWER_LINES)
    ?? fieldIssue(entry, "referenceAnswer", MAX_MISTAKE_ANSWER_LENGTH, MAX_MISTAKE_ANSWER_LINES)
    ?? fieldIssue(entry, "rootCause", MAX_MISTAKE_REFLECTION_LENGTH)
    ?? fieldIssue(entry, "takeaway", MAX_MISTAKE_REFLECTION_LENGTH);
}

function cloneEntry(entry: MistakeEntry): MistakeEntry {
  return { ...entry };
}

/**
 * Three-way merge a local review draft with a newer saved copy. Fields the
 * learner did not touch follow the saved copy; local edits survive; and only
 * divergent edits to the same field are reported as conflicts.
 */
export function mergeMistakeEntryDraft(
  base: MistakeEntry,
  local: MistakeEntry,
  incoming: MistakeEntry,
  existingConflicts: readonly MistakeEditableField[] = [],
): MistakeDraftMerge {
  if (base.id !== local.id || base.id !== incoming.id) {
    throw new Error("Mistake draft versions must refer to the same entry.");
  }
  const merged = { ...incoming };
  const conflictFields: MistakeEditableField[] = [];

  for (const field of MISTAKE_EDITABLE_FIELDS) {
    const localChanged = local[field] !== base[field];
    if (!localChanged) continue;
    if (incoming[field] !== base[field] && incoming[field] !== local[field]) {
      conflictFields.push(field);
    }
    (merged as unknown as Record<MistakeEditableField, string>)[field] = local[field];
  }

  for (const field of existingConflicts) {
    if (local[field] !== incoming[field] && !conflictFields.includes(field)) {
      conflictFields.push(field);
    }
  }

  return { entry: merged, conflictFields };
}

export function emptyMistakeBookStore(): MistakeBookStore {
  return { version: MISTAKE_BOOK_STORE_VERSION, entries: [] };
}

export function mistakeBookStoreIssue(value: unknown): MistakeBookIssue | null {
  const store = objectValue(value);
  if (!store
    || store.version !== MISTAKE_BOOK_STORE_VERSION
    || !Array.isArray(store.entries)
    || !hasOnlyKeys(store, new Set(["version", "entries"]))) {
    return { code: "invalid", field: "mistakeBook" };
  }
  if (store.entries.length > MAX_MISTAKE_ENTRIES) {
    return { code: "too-large", field: "entries" };
  }

  const seen = new Set<string>();
  for (let index = 0; index < store.entries.length; index += 1) {
    const issue = mistakeEntryIssue(store.entries[index]);
    if (issue) return { ...issue, field: `entries[${index}].${issue.field}` };
    const id = (store.entries[index] as MistakeEntry).id;
    if (seen.has(id)) return { code: "duplicate", field: `entries[${index}].id` };
    seen.add(id);
  }
  try {
    if (JSON.stringify(value).length > MAX_MISTAKE_STORE_CHARACTERS) {
      return { code: "too-large", field: "mistakeBook" };
    }
  } catch {
    return { code: "invalid", field: "mistakeBook" };
  }
  return null;
}

export class MistakeBookValidationError extends Error {
  readonly issue: MistakeBookIssue;

  constructor(issue: MistakeBookIssue) {
    super(`Invalid mistake book data at ${issue.field}`);
    this.name = "MistakeBookValidationError";
    this.issue = issue;
  }
}

export function parseMistakeBookStore(value: unknown): MistakeBookStore {
  const issue = mistakeBookStoreIssue(value);
  if (issue) throw new MistakeBookValidationError(issue);
  const store = value as MistakeBookStore;
  return {
    version: MISTAKE_BOOK_STORE_VERSION,
    entries: store.entries.map(cloneEntry),
  };
}

export function serializeMistakeBookStore(store: MistakeBookStore): string {
  const parsed = parseMistakeBookStore(store);
  return JSON.stringify(parsed);
}

function sanitizeCurrentProblemId(value: number | string): string {
  const safe = String(value)
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 76);
  if (!safe) throw new MistakeBookValidationError({ code: "invalid", field: "problemId" });
  return `current-${safe}`;
}

export function createMistakeEntryId(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return `import-${globalThis.crypto.randomUUID()}`;
  }
  if (typeof globalThis.crypto?.getRandomValues !== "function") {
    throw new Error("Secure random IDs are unavailable");
  }
  // iOS 15.0–15.3 predates crypto.randomUUID but supports getRandomValues.
  // Format the same 122 bits of randomness as a standards-shaped v4 UUID so
  // imported entries remain collision-resistant across older supported phones.
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0"));
  return `import-${hex.slice(0, 4).join("")}-${hex.slice(4, 6).join("")}-${hex.slice(6, 8).join("")}-${hex.slice(8, 10).join("")}-${hex.slice(10).join("")}`;
}

function validatedEntry(entry: MistakeEntry): MistakeEntry {
  const issue = mistakeEntryIssue(entry);
  if (issue) throw new MistakeBookValidationError(issue);
  return entry;
}

export function createCurrentProblemMistake(
  seed: CurrentProblemMistakeSeed,
  now = Date.now(),
): MistakeEntry {
  return validatedEntry({
    id: sanitizeCurrentProblemId(seed.problemId),
    origin: "current",
    title: seed.title.trim(),
    sourceUrl: seed.sourceUrl?.trim() ?? "",
    prompt: seed.prompt ?? "",
    language: seed.language ?? "python",
    myAnswer: seed.myAnswer ?? "",
    referenceAnswer: "",
    rootCause: "",
    takeaway: "",
    status: "unreviewed",
    createdAt: now,
    updatedAt: now,
  });
}

export function createExternalMistake(
  seed: ExternalMistakeSeed,
  now = Date.now(),
  id = createMistakeEntryId(),
): MistakeEntry {
  return validatedEntry({
    id,
    origin: "external",
    title: seed.title.trim(),
    sourceUrl: seed.sourceUrl?.trim() ?? "",
    prompt: seed.prompt ?? "",
    language: seed.language ?? "python",
    myAnswer: seed.myAnswer ?? "",
    referenceAnswer: seed.referenceAnswer ?? "",
    rootCause: "",
    takeaway: "",
    status: "unreviewed",
    createdAt: now,
    updatedAt: now,
  });
}

export function upsertMistakeEntry(
  store: MistakeBookStore,
  entry: MistakeEntry,
): UpsertMistakeResult {
  const storeIssue = mistakeBookStoreIssue(store);
  if (storeIssue) return { ok: false, issue: storeIssue };
  const entryIssue = mistakeEntryIssue(entry);
  if (entryIssue) return { ok: false, issue: entryIssue };

  const existingIndex = store.entries.findIndex((candidate) => candidate.id === entry.id);
  if (existingIndex < 0 && store.entries.length >= MAX_MISTAKE_ENTRIES) {
    return { ok: false, issue: { code: "too-large", field: "entries" } };
  }
  const entries = store.entries.map(cloneEntry);
  if (existingIndex >= 0) entries[existingIndex] = cloneEntry(entry);
  else entries.push(cloneEntry(entry));
  entries.sort((first, second) => second.updatedAt - first.updatedAt || first.id.localeCompare(second.id));
  const next: MistakeBookStore = { version: MISTAKE_BOOK_STORE_VERSION, entries };
  const nextIssue = mistakeBookStoreIssue(next);
  return nextIssue ? { ok: false, issue: nextIssue } : { ok: true, store: next };
}

export function removeMistakeEntry(store: MistakeBookStore, entryId: string): MistakeBookStore {
  const parsed = parseMistakeBookStore(store);
  return {
    version: MISTAKE_BOOK_STORE_VERSION,
    entries: parsed.entries.filter((entry) => entry.id !== entryId),
  };
}

export function normalizeAnswerLine(line: string): string {
  // Ignore only accidental trailing whitespace. Leading indentation and
  // spaces inside string literals can change program behavior and must remain
  // visible as real differences, especially for Python beginners.
  return line.replace(/[ \t]+$/u, "");
}

function boundedLines(value: string): { lines: string[]; truncated: boolean } {
  if (!value) return { lines: [], truncated: false };
  const allLines = value.replace(/\r\n?/g, "\n").split("\n");
  return {
    lines: allLines.slice(0, MAX_MISTAKE_ANSWER_LINES),
    truncated: allLines.length > MAX_MISTAKE_ANSWER_LINES,
  };
}

function lcsTable(first: readonly string[], second: readonly string[]): Uint16Array[] {
  const rows = Array.from(
    { length: first.length + 1 },
    () => new Uint16Array(second.length + 1),
  );
  for (let firstIndex = first.length - 1; firstIndex >= 0; firstIndex -= 1) {
    for (let secondIndex = second.length - 1; secondIndex >= 0; secondIndex -= 1) {
      rows[firstIndex][secondIndex] = first[firstIndex] === second[secondIndex]
        ? rows[firstIndex + 1][secondIndex + 1] + 1
        : Math.max(rows[firstIndex + 1][secondIndex], rows[firstIndex][secondIndex + 1]);
    }
  }
  return rows;
}

function meaningfulSummary(mine: readonly string[], reference: readonly string[]) {
  const meaningfulMine = mine.map(normalizeAnswerLine).filter(Boolean);
  const meaningfulReference = reference.map(normalizeAnswerLine).filter(Boolean);
  const common = lcsTable(meaningfulMine, meaningfulReference)[0][0];
  const total = meaningfulMine.length + meaningfulReference.length;
  return {
    common,
    onlyMine: meaningfulMine.length - common,
    onlyReference: meaningfulReference.length - common,
    similarity: total ? (2 * common) / total : null,
  };
}

/**
 * A deterministic line comparison that ignores trailing whitespace only.
 * This deliberately makes no claim about semantic or algorithmic correctness:
 * it is not AI.
 */
export function compareMistakeAnswers(myAnswer: string, referenceAnswer: string): AnswerComparison {
  const mineInput = boundedLines(myAnswer);
  const referenceInput = boundedLines(referenceAnswer);
  const mine = mineInput.lines;
  const reference = referenceInput.lines;
  const mineTokens = mine.map(normalizeAnswerLine);
  const referenceTokens = reference.map(normalizeAnswerLine);
  const table = lcsTable(mineTokens, referenceTokens);
  const lines: AnswerDiffLine[] = [];
  let mineIndex = 0;
  let referenceIndex = 0;

  while (mineIndex < mine.length || referenceIndex < reference.length) {
    if (mineIndex < mine.length
      && referenceIndex < reference.length
      && mineTokens[mineIndex] === referenceTokens[referenceIndex]) {
      lines.push({
        kind: "same",
        mineText: mine[mineIndex],
        referenceText: reference[referenceIndex],
        mineLineNumber: mineIndex + 1,
        referenceLineNumber: referenceIndex + 1,
      });
      mineIndex += 1;
      referenceIndex += 1;
    } else if (referenceIndex < reference.length
      && (mineIndex >= mine.length
        || table[mineIndex][referenceIndex + 1] > table[mineIndex + 1][referenceIndex])) {
      lines.push({
        kind: "reference",
        mineText: null,
        referenceText: reference[referenceIndex],
        mineLineNumber: null,
        referenceLineNumber: referenceIndex + 1,
      });
      referenceIndex += 1;
    } else if (mineIndex < mine.length) {
      lines.push({
        kind: "mine",
        mineText: mine[mineIndex],
        referenceText: null,
        mineLineNumber: mineIndex + 1,
        referenceLineNumber: null,
      });
      mineIndex += 1;
    }
  }

  return {
    lines,
    truncated: { mine: mineInput.truncated, reference: referenceInput.truncated },
    summary: meaningfulSummary(mine, reference),
  };
}
