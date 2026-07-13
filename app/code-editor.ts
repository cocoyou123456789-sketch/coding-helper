const INDENT = "    ";

const BRACKET_PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
};

const CLOSING_BRACKETS = new Set(Object.values(BRACKET_PAIRS));

export type EditorEdit = {
  code: string;
  selectionStart: number;
  selectionEnd: number;
};

export type LineNoteEdit = {
  start: number;
  end: number;
  insertedText: string;
};

function startOfLine(code: string, position: number): number {
  if (position <= 0) return 0;
  return code.lastIndexOf("\n", Math.max(0, position - 1)) + 1;
}

function endOfSelectedLines(code: string, start: number, end: number): number {
  const effectiveEnd = end > start && code[end - 1] === "\n" ? end - 1 : end;
  const nextBreak = code.indexOf("\n", effectiveEnd);
  return nextBreak === -1 ? code.length : nextBreak;
}

function indentationOf(line: string): string {
  return line.match(/^[ \t]*/)?.[0] ?? "";
}

function removableIndent(line: string): number {
  let column = 0;
  let characters = 0;
  while (characters < line.length && (line[characters] === " " || line[characters] === "\t")) {
    column += line[characters] === "\t" ? INDENT.length - (column % INDENT.length) : 1;
    characters += 1;
    if (column >= INDENT.length) break;
  }
  return characters;
}

function removedIndentBeforePosition(
  lines: string[],
  removedByLine: number[],
  blockStart: number,
  position: number,
): number {
  let lineStart = blockStart;
  let removed = 0;

  for (let index = 0; index < lines.length; index += 1) {
    if (position <= lineStart) break;
    removed += Math.min(removedByLine[index], position - lineStart);
    const lineEnd = lineStart + lines[index].length;
    if (position <= lineEnd) break;
    lineStart = lineEnd + 1;
  }

  return removed;
}

function visualColumn(lineBeforeCaret: string): number {
  let column = 0;
  for (const character of lineBeforeCaret) {
    column += character === "\t" ? INDENT.length - (column % INDENT.length) : 1;
  }
  return column;
}

function pythonLineOpensBlock(codeBeforeCaret: string): boolean {
  let quote = "";
  let escaped = false;
  let comment = false;
  let lastSyntaxCharacter = "";

  for (let index = 0; index < codeBeforeCaret.length; index += 1) {
    const character = codeBeforeCaret[index];
    if (comment) {
      if (character === "\n") {
        comment = false;
        lastSyntaxCharacter = "";
      }
      continue;
    }
    if (escaped) {
      escaped = false;
      continue;
    }
    if (character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === "\n") lastSyntaxCharacter = "";
      if (quote.length === 3 && codeBeforeCaret.slice(index, index + 3) === quote) {
        quote = "";
        index += 2;
      } else if (quote.length === 1 && character === quote) {
        quote = "";
      }
      continue;
    }
    if (character === "\n") {
      lastSyntaxCharacter = "";
      continue;
    }
    if (character === "#") {
      comment = true;
      continue;
    }
    const possibleTripleQuote = codeBeforeCaret.slice(index, index + 3);
    if (possibleTripleQuote === "\"\"\"" || possibleTripleQuote === "'''") {
      quote = possibleTripleQuote;
      index += 2;
      continue;
    }
    if (character === "\"" || character === "'") {
      quote = character;
      continue;
    }
    if (!/\s/.test(character)) lastSyntaxCharacter = character;
  }

  return quote === "" && lastSyntaxCharacter === ":";
}

/** Insert a newline with Python-aware indentation and keep the caret in place. */
export function editForEnter(code: string, selectionStart: number, selectionEnd: number): EditorEdit {
  const before = code.slice(0, selectionStart);
  const after = code.slice(selectionEnd);
  const currentLine = before.slice(startOfLine(code, selectionStart));
  const baseIndent = indentationOf(currentLine);
  const previousCharacter = before.at(-1) ?? "";
  const nextCharacter = after[0] ?? "";

  if (BRACKET_PAIRS[previousCharacter] === nextCharacter) {
    const innerIndent = `${baseIndent}${INDENT}`;
    const insertion = `\n${innerIndent}\n${baseIndent}`;
    const caret = selectionStart + innerIndent.length + 1;
    return {
      code: `${before}${insertion}${after}`,
      selectionStart: caret,
      selectionEnd: caret,
    };
  }

  const shouldIndent = pythonLineOpensBlock(before);
  const nextIndent = shouldIndent ? `${baseIndent}${INDENT}` : baseIndent;
  const insertion = `\n${nextIndent}`;
  const caret = selectionStart + insertion.length;
  return {
    code: `${before}${insertion}${after}`,
    selectionStart: caret,
    selectionEnd: caret,
  };
}

/** Apply Tab or Shift+Tab to the caret or every selected line. */
export function editForTab(
  code: string,
  selectionStart: number,
  selectionEnd: number,
  outdent = false,
): EditorEdit {
  const blockStart = startOfLine(code, selectionStart);

  if (!outdent && selectionStart === selectionEnd) {
    const column = visualColumn(code.slice(blockStart, selectionStart));
    const spaces = INDENT.length - (column % INDENT.length);
    const insertion = " ".repeat(spaces);
    const caret = selectionStart + spaces;
    return {
      code: `${code.slice(0, selectionStart)}${insertion}${code.slice(selectionEnd)}`,
      selectionStart: caret,
      selectionEnd: caret,
    };
  }

  const blockEnd = endOfSelectedLines(code, selectionStart, selectionEnd);
  const lines = code.slice(blockStart, blockEnd).split("\n");

  if (!outdent) {
    const nextBlock = lines.map((line) => `${INDENT}${line}`).join("\n");
    const added = INDENT.length * lines.length;
    return {
      code: `${code.slice(0, blockStart)}${nextBlock}${code.slice(blockEnd)}`,
      selectionStart: selectionStart + INDENT.length,
      selectionEnd: selectionEnd + added,
    };
  }

  const removedByLine = lines.map(removableIndent);
  const nextBlock = lines.map((line, index) => line.slice(removedByLine[index])).join("\n");
  const removedBeforeStart = removedIndentBeforePosition(lines, removedByLine, blockStart, selectionStart);
  const removedBeforeEnd = removedIndentBeforePosition(lines, removedByLine, blockStart, selectionEnd);
  const nextStart = Math.max(blockStart, selectionStart - removedBeforeStart);
  const nextEnd = selectionStart === selectionEnd
    ? nextStart
    : Math.max(nextStart, selectionEnd - removedBeforeEnd);

  return {
    code: `${code.slice(0, blockStart)}${nextBlock}${code.slice(blockEnd)}`,
    selectionStart: nextStart,
    selectionEnd: nextEnd,
  };
}

/** Delete one indentation level or both characters of an empty bracket pair. */
export function editForBackspace(
  code: string,
  selectionStart: number,
  selectionEnd: number,
): EditorEdit | null {
  if (selectionStart !== selectionEnd || selectionStart === 0) return null;

  const previousCharacter = code[selectionStart - 1];
  const nextCharacter = code[selectionStart];
  if (BRACKET_PAIRS[previousCharacter] === nextCharacter) {
    const caret = selectionStart - 1;
    return {
      code: `${code.slice(0, caret)}${code.slice(selectionStart + 1)}`,
      selectionStart: caret,
      selectionEnd: caret,
    };
  }

  const lineStart = startOfLine(code, selectionStart);
  const beforeCaret = code.slice(lineStart, selectionStart);
  if (beforeCaret.endsWith("\t")) {
    const caret = selectionStart - 1;
    return {
      code: `${code.slice(0, caret)}${code.slice(selectionStart)}`,
      selectionStart: caret,
      selectionEnd: caret,
    };
  }
  if (!/^ +$/.test(beforeCaret)) return null;

  const removeCount = ((beforeCaret.length - 1) % INDENT.length) + 1;
  const caret = selectionStart - removeCount;
  return {
    code: `${code.slice(0, caret)}${code.slice(selectionStart)}`,
    selectionStart: caret,
    selectionEnd: caret,
  };
}

/** Pair opening brackets, wrap a selection, or step over an existing closer. */
export function editForBracket(
  code: string,
  selectionStart: number,
  selectionEnd: number,
  key: string,
): EditorEdit | null {
  const closing = BRACKET_PAIRS[key];
  if (closing) {
    const selected = code.slice(selectionStart, selectionEnd);
    const nextCode = `${code.slice(0, selectionStart)}${key}${selected}${closing}${code.slice(selectionEnd)}`;
    if (selectionStart !== selectionEnd) {
      return {
        code: nextCode,
        selectionStart: selectionStart + 1,
        selectionEnd: selectionEnd + 1,
      };
    }
    const caret = selectionStart + 1;
    return { code: nextCode, selectionStart: caret, selectionEnd: caret };
  }

  if (CLOSING_BRACKETS.has(key) && selectionStart === selectionEnd && code[selectionStart] === key) {
    const caret = selectionStart + 1;
    return { code, selectionStart: caret, selectionEnd: caret };
  }

  return null;
}

/** Keep per-line notes attached when code lines are inserted, removed, or edited. */
export function syncLineNotes(
  previousCode: string,
  nextCode: string,
  previousNotes: string[],
  edit?: LineNoteEdit,
): string[] {
  const previousLines = previousCode.split("\n");
  const nextLines = nextCode.split("\n");
  const nextNotes = Array.from({ length: nextLines.length }, () => "");

  if (
    edit
    && edit.start === edit.end
    && edit.insertedText.includes("\n")
    && `${previousCode.slice(0, edit.start)}${edit.insertedText}${previousCode.slice(edit.end)}` === nextCode
  ) {
    const insertedLines = edit.insertedText.match(/\n/g)?.length ?? 0;
    const currentLine = previousCode.slice(0, edit.start).split("\n").length - 1;
    const insertionColumn = edit.start - startOfLine(previousCode, edit.start);
    const noteInsertionIndex = currentLine + (insertionColumn === 0 ? 0 : 1);
    const normalizedNotes = previousLines.map((_, index) => previousNotes[index] ?? "");
    normalizedNotes.splice(noteInsertionIndex, 0, ...Array.from({ length: insertedLines }, () => ""));
    return normalizedNotes;
  }

  let prefixLength = 0;
  while (
    prefixLength < previousLines.length
    && prefixLength < nextLines.length
    && previousLines[prefixLength] === nextLines[prefixLength]
  ) {
    nextNotes[prefixLength] = previousNotes[prefixLength] ?? "";
    prefixLength += 1;
  }

  let suffixLength = 0;
  while (
    suffixLength < previousLines.length - prefixLength
    && suffixLength < nextLines.length - prefixLength
    && previousLines[previousLines.length - 1 - suffixLength] === nextLines[nextLines.length - 1 - suffixLength]
  ) {
    const previousIndex = previousLines.length - 1 - suffixLength;
    const nextIndex = nextLines.length - 1 - suffixLength;
    nextNotes[nextIndex] = previousNotes[previousIndex] ?? "";
    suffixLength += 1;
  }

  const previousChangedEnd = previousLines.length - suffixLength;
  const nextChangedEnd = nextLines.length - suffixLength;
  const previousChangedCount = previousChangedEnd - prefixLength;
  const nextChangedCount = nextChangedEnd - prefixLength;
  const matches = Array.from(
    { length: previousChangedCount + 1 },
    () => new Uint16Array(nextChangedCount + 1),
  );

  for (let previousIndex = previousChangedCount - 1; previousIndex >= 0; previousIndex -= 1) {
    for (let nextIndex = nextChangedCount - 1; nextIndex >= 0; nextIndex -= 1) {
      matches[previousIndex][nextIndex] = previousLines[prefixLength + previousIndex]
        === nextLines[prefixLength + nextIndex]
        ? matches[previousIndex + 1][nextIndex + 1] + 1
        : Math.max(matches[previousIndex + 1][nextIndex], matches[previousIndex][nextIndex + 1]);
    }
  }

  const anchors: Array<[number, number]> = [];
  let previousOffset = 0;
  let nextOffset = 0;
  while (previousOffset < previousChangedCount && nextOffset < nextChangedCount) {
    if (previousLines[prefixLength + previousOffset] === nextLines[prefixLength + nextOffset]) {
      anchors.push([prefixLength + previousOffset, prefixLength + nextOffset]);
      previousOffset += 1;
      nextOffset += 1;
    } else if (matches[previousOffset + 1][nextOffset] >= matches[previousOffset][nextOffset + 1]) {
      previousOffset += 1;
    } else {
      nextOffset += 1;
    }
  }

  let previousCursor = prefixLength;
  let nextCursor = prefixLength;
  for (const [previousAnchor, nextAnchor] of anchors) {
    const reusableCount = Math.min(previousAnchor - previousCursor, nextAnchor - nextCursor);
    for (let index = 0; index < reusableCount; index += 1) {
      nextNotes[nextCursor + index] = previousNotes[previousCursor + index] ?? "";
    }
    nextNotes[nextAnchor] = previousNotes[previousAnchor] ?? "";
    previousCursor = previousAnchor + 1;
    nextCursor = nextAnchor + 1;
  }

  const trailingReusableCount = Math.min(
    previousChangedEnd - previousCursor,
    nextChangedEnd - nextCursor,
  );
  for (let index = 0; index < trailingReusableCount; index += 1) {
    nextNotes[nextCursor + index] = previousNotes[previousCursor + index] ?? "";
  }

  return nextNotes;
}
