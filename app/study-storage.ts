import type { LearningProfile } from "./learning-hub";
import type { Problem } from "./problems";

export type LearningStatus = "todo" | "learning" | "solved" | "review";

export type StudyRecord = {
  code: string;
  lineNotes: string[];
  thinking: string;
  mistakes: string;
  review: string;
  status: LearningStatus;
};

export type StudyRecords = Record<number, StudyRecord>;
export type SaveState = "saved" | "saving" | "error";

export const STUDY_STORAGE_VERSION = 2;

export async function persistWithStatus(operation: () => Promise<void>): Promise<"saved" | "error"> {
  try {
    await operation();
    return "saved";
  } catch {
    return "error";
  }
}

const VALID_STATUSES = new Set<LearningStatus>(["todo", "learning", "solved", "review"]);

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function nonNegativeInteger(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Math.floor(value)
    : 0;
}

export function parseStoredJson(value: string | null): unknown {
  if (!value) return undefined;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return undefined;
  }
}

export function blankStudyRecord(problem: Problem): StudyRecord {
  return {
    code: problem.starterCode,
    lineNotes: [],
    thinking: "",
    mistakes: "",
    review: "",
    status: "todo",
  };
}

export function normalizeStudyRecord(problem: Problem, value: unknown): StudyRecord {
  const fallback = blankStudyRecord(problem);
  const record = objectValue(value);
  if (!record) return fallback;

  return {
    code: text(record.code, fallback.code),
    lineNotes: Array.isArray(record.lineNotes)
      ? record.lineNotes.slice(0, 10_000).map((note) => text(note))
      : [],
    thinking: text(record.thinking),
    mistakes: text(record.mistakes),
    review: text(record.review),
    status: typeof record.status === "string" && VALID_STATUSES.has(record.status as LearningStatus)
      ? record.status as LearningStatus
      : "todo",
  };
}

export function normalizeSavedStudy(value: unknown, problemList: Problem[]): {
  records: StudyRecords;
  selectedId?: number;
} {
  const saved = objectValue(value);
  if (!saved) return { records: {} };
  const knownProblems = new Map(problemList.map((problem) => [problem.id, problem]));
  const savedRecords = objectValue(saved.records);
  const records: StudyRecords = {};

  if (savedRecords) {
    for (const [rawId, rawRecord] of Object.entries(savedRecords)) {
      const id = Number(rawId);
      const problem = knownProblems.get(id);
      if (!problem) continue;
      records[id] = normalizeStudyRecord(problem, rawRecord);
    }
  }

  const selectedId = typeof saved.selectedId === "number" && knownProblems.has(saved.selectedId)
    ? saved.selectedId
    : undefined;
  return { records, selectedId };
}

export function normalizeLearningProfile(value: unknown): LearningProfile {
  const profile = objectValue(value) ?? {};
  return {
    xp: nonNegativeInteger(profile.xp),
    todayXp: nonNegativeInteger(profile.todayXp),
    todayDate: /^\d{4}-\d{2}-\d{2}$/.test(text(profile.todayDate)) ? text(profile.todayDate) : "",
    streak: nonNegativeInteger(profile.streak),
    lessons: nonNegativeInteger(profile.lessons),
    sprintBest: nonNegativeInteger(profile.sprintBest),
  };
}
