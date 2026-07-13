type PracticeProblem = {
  id: number;
  difficulty: string;
};

type PracticeRecord = {
  status?: string;
};

export type PracticeCompletionProgress = {
  explainedKeyLines: number;
  requiredKeyLines: number;
  hasRecognitionSignal: boolean;
  notesReady: boolean;
};

function isKeyCodeLine(line: string): boolean {
  const code = line.trim();
  return Boolean(code)
    && !code.startsWith("#")
    && !code.startsWith("class ")
    && !code.startsWith("def ")
    && code !== "pass";
}

export function practiceKeyLineIndexes(code: string): number[] {
  return code
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .flatMap((line, index) => isKeyCodeLine(line) ? [index] : []);
}

/** Keep the reflection target small enough for a first-time learner to finish. */
export function practiceCompletionProgress(
  code: string,
  lineNotes: string[],
  recognitionSignal: string,
  suggestedLineNotes: readonly (string | readonly string[])[] = [],
): PracticeCompletionProgress {
  const keyLineIndexes = practiceKeyLineIndexes(code);
  const requiredKeyLines = Math.min(2, keyLineIndexes.length);
  const explainedKeyLines = keyLineIndexes.filter((index) => {
    const note = lineNotes[index]?.trim();
    const suggestion = suggestedLineNotes[index];
    const suggestions = Array.isArray(suggestion) ? suggestion : [suggestion];
    const matchesSuggestion = suggestions.some((item) => item?.trim() === note);
    return Boolean(note && !matchesSuggestion);
  }).length;
  const hasRecognitionSignal = Boolean(recognitionSignal.trim());

  return {
    explainedKeyLines,
    requiredKeyLines,
    hasRecognitionSignal,
    notesReady: requiredKeyLines > 0
      && explainedKeyLines >= requiredKeyLines
      && hasRecognitionSignal,
  };
}

/** Prefer an unsolved problem at the same difficulty, continuing forward and wrapping once. */
export function nextRecommendedProblemId(
  problems: PracticeProblem[],
  currentId: number,
  records: Record<number, PracticeRecord | undefined>,
): number | null {
  if (problems.length <= 1) return null;
  const currentIndex = problems.findIndex((problem) => problem.id === currentId);
  const startIndex = currentIndex >= 0 ? currentIndex : -1;
  const currentDifficulty = currentIndex >= 0 ? problems[currentIndex]?.difficulty : undefined;
  const ordered = Array.from({ length: problems.length }, (_, offset) => {
    const index = (startIndex + offset + 1) % problems.length;
    return problems[index];
  }).filter((problem): problem is PracticeProblem => Boolean(problem && problem.id !== currentId));
  const unsolved = ordered.filter((problem) => records[problem.id]?.status !== "solved");
  return unsolved.find((problem) => problem.difficulty === currentDifficulty)?.id
    ?? unsolved[0]?.id
    ?? null;
}
