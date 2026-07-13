import type { LearningStatus } from "./study-storage";

export type PracticeLearningStatus = LearningStatus;
export type PracticeStatusFilter = "all" | PracticeLearningStatus;
export type PracticeActivity = "edit" | "run" | "reset" | "open";

type PracticeProblem = {
  id: number;
};

type PracticeRecord = {
  status?: unknown;
};

const CONTINUE_PRIORITY: readonly PracticeLearningStatus[] = ["learning", "review", "todo"];

export function practiceRecordStatus(record: PracticeRecord | undefined): PracticeLearningStatus {
  switch (record?.status) {
    case "learning":
    case "solved":
    case "review":
      return record.status;
    default:
      return "todo";
  }
}

export function practiceStatusAfterActivity(
  status: unknown,
  activity: PracticeActivity,
): PracticeLearningStatus {
  const currentStatus = practiceRecordStatus({ status });
  if ((activity === "edit" || activity === "run") && currentStatus === "todo") return "learning";
  return currentStatus;
}

export function filterProblemsByStatus<T extends PracticeProblem>(
  problems: readonly T[],
  records: Record<number, PracticeRecord | undefined>,
  statusFilter: PracticeStatusFilter,
): T[] {
  if (statusFilter === "all") return [...problems];
  return problems.filter((problem) => practiceRecordStatus(records[problem.id]) === statusFilter);
}

export function practiceStatusCounts(
  problems: readonly PracticeProblem[],
  records: Record<number, PracticeRecord | undefined>,
): Record<PracticeStatusFilter, number> {
  const counts: Record<PracticeStatusFilter, number> = {
    all: problems.length,
    todo: 0,
    learning: 0,
    solved: 0,
    review: 0,
  };
  for (const problem of problems) counts[practiceRecordStatus(records[problem.id])] += 1;
  return counts;
}

/** The caller supplies the level/topic scope; continue work, then review, then start new. */
export function recommendedPracticeProblemId(
  problems: readonly PracticeProblem[],
  records: Record<number, PracticeRecord | undefined>,
  currentId: number,
): number | null {
  const currentProblem = problems.find((problem) => problem.id === currentId);
  for (const status of CONTINUE_PRIORITY) {
    if (currentProblem && practiceRecordStatus(records[currentProblem.id]) === status) return currentProblem.id;
    const next = problems.find((problem) => practiceRecordStatus(records[problem.id]) === status);
    if (next) return next.id;
  }
  return null;
}
