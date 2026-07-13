import type { Language } from "./problem-i18n";

type WorkerMessageLike = {
  id?: unknown;
  type?: unknown;
  phase?: unknown;
};

/** Return the first placeholder line only while the user has not changed the starter code. */
export function untouchedStarterLine(code: string, starterCode: string): number | null {
  if (code.replace(/\r\n?/g, "\n").trim() !== starterCode.replace(/\r\n?/g, "\n").trim()) {
    return null;
  }
  const placeholderIndex = code.split(/\r?\n/).findIndex((line) => /^\s*pass\s*(?:#.*)?$/.test(line));
  return placeholderIndex >= 0 ? placeholderIndex + 1 : 1;
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
  const match = value.match(/(?:File\s+)?["']?<solution>["']?,?\s+line\s+(\d+)/i)
    ?? value.match(/\(<solution>,\s*line\s+(\d+)\)/i);
  if (!match) return null;
  const line = Number(match[1]);
  return Number.isInteger(line) && line > 0 ? line : null;
}

export function beginnerPythonErrorHint(value: unknown, language: Language): string {
  const message = typeof value === "string" ? value : "";
  const errorName = message.match(/\b(?:IndentationError|TabError|SyntaxError|NameError|TypeError|AttributeError|IndexError|KeyError)\b/)?.[0] ?? "";

  if (language === "en") {
    const hints: Record<string, string> = {
      IndentationError: "Indentation error: make sure lines in the same block start with the same number of spaces.",
      TabError: "Indentation mixes tabs and spaces. Select the affected lines and indent them again with the editor.",
      SyntaxError: "Syntax error: check the highlighted line and the line before it for a missing colon, bracket, quote, or comma.",
      NameError: "Unknown name: check the spelling and make sure the variable is assigned before this line runs.",
      TypeError: "Type mismatch: check what value each function or operator receives on this line.",
      AttributeError: "This value does not have the method or field being used. Check its type and spelling.",
      IndexError: "The index is outside the list. Check the loop boundary and the list length.",
      KeyError: "The dictionary does not contain this key yet. Check membership before reading it.",
    };
    return hints[errorName] ?? "Start with the first error and its line number. Fix that one, then run again; later errors often disappear with it.";
  }

  const hints: Record<string, string> = {
    IndentationError: "缩进错误：同一个代码块里的每一行，需要使用相同数量的空格。",
    TabError: "缩进混用了 Tab 和空格。选中附近几行，用编辑器重新缩进一次。",
    SyntaxError: "语法错误：先检查高亮行及它的上一行，是否漏了冒号、括号、引号或逗号。",
    NameError: "变量名还不存在：检查拼写，并确认它在执行到这一行之前已经赋值。",
    TypeError: "数据类型不匹配：看看这一行的函数或运算符实际收到了什么值。",
    AttributeError: "这个值没有你调用的方法或属性，请检查它的类型和拼写。",
    IndexError: "下标超出了列表范围，请检查循环边界和列表长度。",
    KeyError: "字典里还没有这个键；读取前先判断它是否存在。",
  };
  return hints[errorName] ?? "先看第一条错误和它提示的行号，只修这一处再运行；后面的错误常会一起消失。";
}
