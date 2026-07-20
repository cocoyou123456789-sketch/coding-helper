const AUTO_LAYER_PREFIXES = Object.freeze({
  zh: "【自动分层解释】",
  en: "[Automatic layer explanation]",
});

/** @param {"zh" | "en"} language */
export function automaticLayerNotePrefix(language) {
  return AUTO_LAYER_PREFIXES[language];
}

/** @param {string} value */
export function isAutomaticLayerNote(value) {
  const note = value.trim();
  return Object.values(AUTO_LAYER_PREFIXES).some((prefix) => note.startsWith(prefix));
}

/** @param {string} value */
export function stripAutomaticLayerNotePrefix(value) {
  const leadingSpace = value.match(/^\s*/)?.[0] ?? "";
  const content = value.slice(leadingSpace.length);
  const prefix = Object.values(AUTO_LAYER_PREFIXES).find((candidate) => content.startsWith(candidate));
  return prefix ? `${leadingSpace}${content.slice(prefix.length).trimStart()}` : value;
}

/**
 * Fill generated explanations only where the learner has not written anything.
 * @param {string} code
 * @param {string[]} currentNotes
 * @param {string[]} generatedNotes
 */
export function fillEmptyLayerNotes(code, currentNotes, generatedNotes) {
  let filled = 0;
  const codeLines = code.replace(/\r\n?/g, "\n").split("\n");
  const lineNotes = codeLines.map((line, index) => {
    const current = currentNotes[index] ?? "";
    const generated = generatedNotes[index] ?? "";
    if (!line.trim() || !generated.trim()) return current;
    if (!current.trim()) {
      filled += 1;
      return generated;
    }
    if (isAutomaticLayerNote(current) && current !== generated) {
      filled += 1;
      return generated;
    }
    return current;
  });
  return { filled, lineNotes };
}

/**
 * Remove automatic notes from code lines that changed so stale explanations
 * never look like the learner's current understanding.
 * @param {string} previousCode
 * @param {string} nextCode
 * @param {string[]} syncedNotes
 */
export function invalidateChangedAutomaticLayerNotes(previousCode, nextCode, syncedNotes) {
  const previousLines = previousCode.replace(/\r\n?/g, "\n").split("\n");
  const nextLines = nextCode.replace(/\r\n?/g, "\n").split("\n");
  return nextLines.map((line, index) => {
    const note = syncedNotes[index] ?? "";
    return isAutomaticLayerNote(note) && previousLines[index] !== line ? "" : note;
  });
}
