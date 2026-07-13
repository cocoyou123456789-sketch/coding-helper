import type { Language } from "./problem-i18n";

type WorkerMessageLike = {
  id?: unknown;
  type?: unknown;
  phase?: unknown;
};

/** Treat whitespace and Python comments as an empty attempt before starting the worker. */
export function pythonSourceIsEmpty(value: unknown): boolean {
  if (typeof value !== "string") return true;
  return !value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .some((line) => {
      const trimmed = line.trim();
      return Boolean(trimmed && !trimmed.startsWith("#"));
    });
}

export function starterRecoveryNeedsConfirmation(code: unknown, lineNotes: readonly unknown[]): boolean {
  const hasCodeText = typeof code === "string" && Boolean(code.trim());
  const hasLineNotes = lineNotes.some((note) => typeof note === "string" && Boolean(note.trim()));
  return hasCodeText || hasLineNotes;
}

/**
 * Find a starter `pass` that is still present at the original body indentation.
 * Comments and blank lines may change without hiding the beginner prompt; a nested,
 * intentional `pass` is ignored when its indentation differs from the starter stub.
 */
export function starterPlaceholderLine(code: string, starterCode: string): number | null {
  const starterIndents = new Set(
    starterCode
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .flatMap((line) => {
        const match = line.match(/^(\s*)pass\s*(?:#.*)?$/);
        return match ? [match[1].replace(/\t/g, "    ").length] : [];
      }),
  );
  if (!starterIndents.size) return null;

  const placeholderIndex = code
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .findIndex((line) => {
      const match = line.match(/^(\s*)pass\s*(?:#.*)?$/);
      return Boolean(match && starterIndents.has(match[1].replace(/\t/g, "    ").length));
    });
  return placeholderIndex >= 0 ? placeholderIndex + 1 : null;
}

type Mismatch =
  | { kind: "value"; path: Array<string | number>; expected: unknown; actual: unknown }
  | { kind: "length"; path: Array<string | number>; expected: number; actual: number }
  | { kind: "missing"; path: Array<string | number>; side: "expected" | "actual"; value: unknown };

function objectRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function firstMismatch(
  expected: unknown,
  actual: unknown,
  path: Array<string | number> = [],
  depth = 0,
): Mismatch | null {
  if (Object.is(expected, actual)) return null;
  if (depth >= 8) return { kind: "value", path, expected, actual };

  if (typeof expected === "string" && typeof actual === "string") {
    const sharedLength = Math.min(expected.length, actual.length);
    for (let index = 0; index < sharedLength; index += 1) {
      if (expected[index] !== actual[index]) {
        return { kind: "value", path: [...path, index], expected: expected[index], actual: actual[index] };
      }
    }
    return { kind: "length", path, expected: expected.length, actual: actual.length };
  }

  if (Array.isArray(expected) && Array.isArray(actual)) {
    const sharedLength = Math.min(expected.length, actual.length);
    for (let index = 0; index < sharedLength; index += 1) {
      const mismatch = firstMismatch(expected[index], actual[index], [...path, index], depth + 1);
      if (mismatch) return mismatch;
    }
    return expected.length === actual.length
      ? null
      : { kind: "length", path, expected: expected.length, actual: actual.length };
  }

  const expectedRecord = objectRecord(expected);
  const actualRecord = objectRecord(actual);
  if (expectedRecord && actualRecord) {
    for (const key of Object.keys(expectedRecord)) {
      if (!Object.prototype.hasOwnProperty.call(actualRecord, key)) {
        return { kind: "missing", path: [...path, key], side: "actual", value: expectedRecord[key] };
      }
      const mismatch = firstMismatch(expectedRecord[key], actualRecord[key], [...path, key], depth + 1);
      if (mismatch) return mismatch;
    }
    for (const key of Object.keys(actualRecord)) {
      if (!Object.prototype.hasOwnProperty.call(expectedRecord, key)) {
        return { kind: "missing", path: [...path, key], side: "expected", value: actualRecord[key] };
      }
    }
    return null;
  }

  return { kind: "value", path, expected, actual };
}

function mismatchPath(path: Array<string | number>, language: Language): string {
  return path.reduce<string>((label, part) => {
    if (typeof part === "number") return `${label}[${part}]`;
    return /^[A-Za-z_$][\w$]*$/.test(part) ? `${label}.${part}` : `${label}[${JSON.stringify(part)}]`;
  }, language === "zh" ? "结果" : "result");
}

function compactValue(value: unknown): string {
  if (value === undefined) return "undefined";
  let output: string;
  try {
    output = JSON.stringify(value);
  } catch {
    output = String(value);
  }
  if (output === undefined) output = String(value);
  return output.length > 90 ? `${output.slice(0, 87)}…` : output;
}

/** Explain one concrete difference instead of asking a beginner to inspect the whole result. */
export function describeFirstMismatch(expected: unknown, actual: unknown, language: Language): string {
  if (expected !== null && expected !== undefined && (actual === null || actual === undefined)) {
    return language === "zh"
      ? "实际结果是 null（Python 里的 None），通常表示函数没有返回答案。先检查是否漏写 return，或某个分支没有走到 return。"
      : "The actual result is null (Python None), which usually means the function returned no answer. Check for a missing return or a branch that never reaches return.";
  }

  const mismatch = firstMismatch(expected, actual);
  if (!mismatch) {
    return language === "zh"
      ? "显示结果相同，但判题仍未通过。先检查返回值的数据类型。"
      : "The displayed values match, but the test still failed. Check the return value's type first.";
  }

  const path = mismatchPath(mismatch.path, language);
  if (mismatch.kind === "length") {
    return language === "zh"
      ? `${path} 的长度不同：预期 ${mismatch.expected}，实际 ${mismatch.actual}。先检查循环边界或返回内容。`
      : `${path} has a different length: expected ${mismatch.expected}, got ${mismatch.actual}. Check the loop boundary or returned items first.`;
  }
  if (mismatch.kind === "missing") {
    const value = compactValue(mismatch.value);
    if (language === "zh") {
      return mismatch.side === "actual"
        ? `${path} 缺少了，预期这里是 ${value}。先追踪这个位置应该在哪里写入。`
        : `${path} 是多出来的，实际值是 ${value}。先检查哪里重复加入了内容。`;
    }
    return mismatch.side === "actual"
      ? `${path} is missing; expected ${value}. Trace where this position should be written.`
      : `${path} is extra; its value is ${value}. Check where an item was added twice.`;
  }

  const expectedValue = compactValue(mismatch.expected);
  const actualValue = compactValue(mismatch.actual);
  return language === "zh"
    ? `第一个不同位置是 ${path}：预期 ${expectedValue}，实际 ${actualValue}。先追踪这个位置的值在哪里写入。`
    : `The first difference is at ${path}: expected ${expectedValue}, got ${actualValue}. Trace where that value is written first.`;
}

/** Runtime loading messages are global; every other message must match this exact run. */
export function messageBelongsToRun(message: WorkerMessageLike, requestId: string): boolean {
  if (message.id === requestId) return true;
  if (message.id !== undefined && message.id !== null) return false;
  return (message.type === "status" && message.phase === "runtime")
    || (message.type === "error" && message.phase === "loading");
}

/** Extract only source-code line numbers, never the internal test wrapper's line. */
export function solutionErrorLine(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const matches = value.matchAll(/(?:(?:File\s+)?["']?<solution>["']?,?\s+line\s+(\d+)|\(<solution>,\s*line\s+(\d+)\))/gi);
  let deepestLine: number | null = null;
  for (const match of matches) {
    const line = Number(match[1] ?? match[2]);
    if (Number.isInteger(line) && line > 0) deepestLine = line;
  }
  return deepestLine;
}

/** Hide Pyodide internals and keep only the final Python exception for the learner-facing UI. */
export function pythonErrorSummary(value: unknown): string {
  if (typeof value !== "string") return "";
  const message = value.trim();
  if (!message) return "";

  const matches = Array.from(message.matchAll(/\b([A-Za-z_][A-Za-z0-9_]*(?:Error|Exception)):\s*([^\r\n]*)/g));
  const usefulMatches = matches.filter((match) => match[1] !== "PythonError");
  const match = usefulMatches.at(-1) ?? matches.at(-1);
  if (match) {
    const detail = match[2].trim();
    return detail ? `${match[1]}: ${detail}` : match[1];
  }

  const firstLine = message.split(/\r?\n/, 1)[0].trim();
  return firstLine.length > 240 ? `${firstLine.slice(0, 237)}…` : firstLine;
}

export function beginnerPythonErrorHint(value: unknown, language: Language): string {
  const message = typeof value === "string" ? value : "";
  if (/NoneType[^\r\n]*not iterable|non-iterable NoneType/i.test(message)) {
    return language === "zh"
      ? "这里收到的是 None，通常表示前面的函数没有返回答案。先检查是否漏写 return，或某个分支没有走到 return。"
      : "This received None, which usually means an earlier function returned no answer. Check for a missing return or a branch that never reaches return.";
  }
  if (/\bNoneType\b/.test(message)) {
    return language === "zh"
      ? "这里的值是 None。如果它来自函数，检查 return；否则检查变量或指针为什么提前变成了 None。"
      : "This value is None. If it came from a function, check return; otherwise trace why the variable or pointer became None too early.";
  }
  const errorName = message.match(/\b(?:UnboundLocalError|ZeroDivisionError|IndentationError|RecursionError|AttributeError|SyntaxError|NameError|TypeError|ValueError|IndexError|KeyError|TabError)\b/)?.[0] ?? "";

  if (language === "en") {
    const hints: Record<string, string> = {
      IndentationError: "Indentation error: make sure lines in the same block start with the same number of spaces.",
      TabError: "Indentation mixes tabs and spaces. Select the affected lines and indent them again with the editor.",
      SyntaxError: "Syntax error: check the highlighted line and the line before it for a missing colon, bracket, quote, or comma.",
      NameError: "Unknown name: check the spelling and make sure the variable is assigned before this line runs.",
      UnboundLocalError: "This local variable is read before it receives a value. Make sure every earlier branch assigns it first.",
      TypeError: "Type mismatch: check what value each function or operator receives on this line.",
      ValueError: "The value has the right general type but cannot be converted or used in this form. Check the input value on this line.",
      AttributeError: "This value does not have the method or field being used. Check its type and spelling.",
      IndexError: "The index is outside the list. Check the loop boundary and the list length.",
      KeyError: "The dictionary does not contain this key yet. Check membership before reading it.",
      ZeroDivisionError: "The divisor became zero. Check the value after / or // before doing the calculation.",
      RecursionError: "The function called itself too many times. Check the base case and whether each call gets closer to it.",
    };
    return hints[errorName] ?? "Start with the first error and its line number. Fix that one, then run again; later errors often disappear with it.";
  }

  const hints: Record<string, string> = {
    IndentationError: "缩进错误：同一个代码块里的每一行，需要使用相同数量的空格。",
    TabError: "缩进混用了 Tab 和空格。选中附近几行，用编辑器重新缩进一次。",
    SyntaxError: "语法错误：先检查高亮行及它的上一行，是否漏了冒号、括号、引号或逗号。",
    NameError: "变量名还不存在：检查拼写，并确认它在执行到这一行之前已经赋值。",
    UnboundLocalError: "局部变量还没赋值就被读取了；检查前面的每个分支是否都会给它赋值。",
    TypeError: "数据类型不匹配：看看这一行的函数或运算符实际收到了什么值。",
    ValueError: "值的类型大致正确，但当前内容无法这样转换或使用；先检查这一行收到的具体值。",
    AttributeError: "这个值没有你调用的方法或属性，请检查它的类型和拼写。",
    IndexError: "下标超出了列表范围，请检查循环边界和列表长度。",
    KeyError: "字典里还没有这个键；读取前先判断它是否存在。",
    ZeroDivisionError: "除数变成了 0；先检查 / 或 // 后面的值，再进行计算。",
    RecursionError: "函数调用自己的次数太多；检查终止条件，以及每次调用是否更接近终止条件。",
  };
  return hints[errorName] ?? "先看第一条错误和它提示的行号，只修这一处再运行；后面的错误常会一起消失。";
}
