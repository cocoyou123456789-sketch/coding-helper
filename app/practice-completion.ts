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
