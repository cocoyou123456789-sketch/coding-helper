import { pythonLanguage } from "@codemirror/lang-python";
import { automaticLayerNotePrefix } from "./code-layer-notes.js";
import type { Language } from "./problem-i18n";

export const MAX_CODE_LAYER_LINES = 600;
export const MAX_CODE_LAYER_CHARACTERS = 20_000;
export const MAX_CODE_LAYER_LINE_CHARACTERS = 2_000;

export type CodeLayerKind =
  | "blank"
  | "comment"
  | "decorator"
  | "import"
  | "class"
  | "function"
  | "loop"
  | "condition"
  | "branch"
  | "exception"
  | "context"
  | "assignment"
  | "mutation"
  | "return"
  | "flow"
  | "call"
  | "continuation"
  | "statement";

export type CodeLayerLine = {
  lineNumber: number;
  text: string;
  code: string;
  indent: number;
  depth: number;
  kind: CodeLayerKind;
  kindLabel: string;
  label: string;
  explanation: string;
  note: string;
  opensBlock: boolean;
  incomplete: boolean;
  parentLine: number | null;
  path: string[];
};

export type CodeLayerSummary = {
  lines: CodeLayerLine[];
  maxDepth: number;
  meaningfulLines: number;
  blockCount: number;
  truncated: boolean;
};

function boundedSource(code: string): { source: string; lines: string[]; truncated: boolean } {
  // CRLF can shrink to one character, so twice the normalized limit is enough
  // to build the complete bounded sample without scanning a huge paste first.
  const rawLimit = MAX_CODE_LAYER_CHARACTERS * 2 + 2;
  const rawSample = code.length > rawLimit ? code.slice(0, rawLimit) : code;
  const normalized = rawSample.replace(/\r\n?/g, "\n");
  const rawLines = normalized.split("\n", MAX_CODE_LAYER_LINES + 1);
  const lines: string[] = [];
  let characters = 0;
  let truncated = rawSample.length < code.length || rawLines.length > MAX_CODE_LAYER_LINES;

  for (const rawLine of rawLines.slice(0, MAX_CODE_LAYER_LINES)) {
    let line = rawLine;
    if (line.length > MAX_CODE_LAYER_LINE_CHARACTERS) {
      line = `${line.slice(0, MAX_CODE_LAYER_LINE_CHARACTERS - 1)}…`;
      truncated = true;
    }
    const separatorLength = lines.length ? 1 : 0;
    const remaining = MAX_CODE_LAYER_CHARACTERS - characters - separatorLength;
    if (remaining <= 0) {
      truncated = true;
      break;
    }
    if (line.length > remaining) {
      line = remaining > 1 ? `${line.slice(0, remaining - 1)}…` : line.slice(0, remaining);
      truncated = true;
    }
    lines.push(line);
    characters += separatorLength + line.length;
    if (characters >= MAX_CODE_LAYER_CHARACTERS) break;
  }

  if (normalized.length > characters) truncated = true;
  return { source: lines.join("\n"), lines, truncated };
}

type BodyRange = {
  from: number;
  to: number;
  ownerLine: number;
  label: string;
  header: string;
  ownerNode: string;
};

function short(value: string, maximum = 74): string {
  const compact = value.trim().replace(/\s+/g, " ");
  return compact.length > maximum ? `${compact.slice(0, maximum - 1)}…` : compact;
}

function indentation(line: string): number {
  let column = 0;
  for (const character of line) {
    if (character === " ") column += 1;
    else if (character === "\t") column += 4 - (column % 4);
    else break;
  }
  return column;
}

function stripTrailingComment(line: string): string {
  let quote = "";
  let escaped = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      continue;
    }
    if (character === "#") return line.slice(0, index).trimEnd();
  }
  return line.trimEnd();
}

type ContinuationReason = "expression" | "string" | null;

function continuationReasons(lines: string[]): ContinuationReason[] {
  const reasons: ContinuationReason[] = [];
  let bracketDepth = 0;
  let continuedByBackslash = false;
  let tripleQuote = "";

  for (const line of lines) {
    reasons.push(tripleQuote ? "string" : bracketDepth > 0 || continuedByBackslash ? "expression" : null);
    continuedByBackslash = false;
    let quote = tripleQuote;
    let escaped = false;
    let commentAt = line.length;

    for (let index = 0; index < line.length; index += 1) {
      const character = line[index];
      if (quote.length === 3) {
        if (line.slice(index, index + 3) === quote) {
          index += 2;
          quote = "";
        }
        continue;
      }
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === quote) {
          quote = "";
        }
        continue;
      }
      const possibleTriple = line.slice(index, index + 3);
      if (possibleTriple === "'''" || possibleTriple === "\"\"\"") {
        quote = possibleTriple;
        index += 2;
        continue;
      }
      if (character === "'" || character === "\"") {
        quote = character;
        continue;
      }
      if (character === "#") {
        commentAt = index;
        break;
      }
      if ("([{".includes(character)) bracketDepth += 1;
      else if (")]}".includes(character)) bracketDepth = Math.max(0, bracketDepth - 1);
    }

    tripleQuote = quote.length === 3 ? quote : "";
    continuedByBackslash = !tripleQuote && line.slice(0, commentAt).trimEnd().endsWith("\\");
  }

  return reasons;
}

function assignmentIndexes(code: string): number[] {
  const indexes: number[] = [];
  let quote = "";
  let escaped = false;
  let bracketDepth = 0;
  let lambdaParameters = false;
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      continue;
    }
    if ("([{".includes(character)) {
      bracketDepth += 1;
      continue;
    }
    if (")]}".includes(character)) {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (
      bracketDepth === 0
      && code.slice(index, index + 6) === "lambda"
      && !/\w/.test(code[index - 1] ?? "")
      && !/\w/.test(code[index + 6] ?? "")
    ) {
      lambdaParameters = true;
      index += 5;
      continue;
    }
    if (bracketDepth === 0 && character === ":" && lambdaParameters) {
      lambdaParameters = false;
      continue;
    }
    if (bracketDepth === 0 && character === ";") break;
    if (character !== "=") continue;
    if (bracketDepth > 0) continue;
    const previous = code[index - 1] ?? "";
    const next = code[index + 1] ?? "";
    if (lambdaParameters || "=!<>:+-*/%@&|^".includes(previous) || next === "=") continue;
    indexes.push(index);
  }
  return indexes;
}

function assignmentIndex(code: string): number {
  return assignmentIndexes(code)[0] ?? -1;
}

const AUGMENTED_ASSIGNMENT_OPERATORS = [
  "**=",
  "//=",
  "<<=",
  ">>=",
  "+=",
  "-=",
  "*=",
  "/=",
  "%=",
  "@=",
  "&=",
  "|=",
  "^=",
] as const;

function augmentedAssignmentParts(code: string): { target: string; operator: string; value: string } | null {
  let quote = "";
  let escaped = false;
  let bracketDepth = 0;
  for (let index = 0; index < code.length; index += 1) {
    const character = code[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      continue;
    }
    if ("([{".includes(character)) {
      bracketDepth += 1;
      continue;
    }
    if (")]}".includes(character)) {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (bracketDepth > 0 || character === ";") {
      if (character === ";") break;
      continue;
    }
    const operator = AUGMENTED_ASSIGNMENT_OPERATORS.find((candidate) => code.startsWith(candidate, index));
    if (!operator) continue;
    const target = code.slice(0, index).trim();
    const value = code.slice(index + operator.length).trim();
    return target && value ? { target, operator, value } : null;
  }
  return null;
}

function normalAssignmentParts(code: string): { targets: string[]; value: string } | null {
  const indexes = assignmentIndexes(code);
  if (!indexes.length) return null;
  const targets: string[] = [];
  let start = 0;
  for (const index of indexes) {
    targets.push(code.slice(start, index).trim());
    start = index + 1;
  }
  return {
    targets: targets.filter(Boolean),
    value: code.slice(start).trim(),
  };
}

function hasTopLevelSemicolon(code: string): boolean {
  let quote = "";
  let escaped = false;
  let bracketDepth = 0;
  for (const character of code) {
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      continue;
    }
    if ("([{".includes(character)) bracketDepth += 1;
    else if (")]}".includes(character)) bracketDepth = Math.max(0, bracketDepth - 1);
    else if (character === ";" && bracketDepth === 0) return true;
  }
  return false;
}

const MUTATING_METHOD_PATTERN = /^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*|\[[^\]\n]+\])*)\.(append|extend|insert|add|update|remove|discard|pop|clear|sort|reverse)\s*\((.*)\)\s*$/;

function mutationCallParts(code: string): { receiver: string; method: string; argumentsText: string } | null {
  const match = code.match(MUTATING_METHOD_PATTERN);
  if (!match || match[1] === "operator") return null;
  return {
    receiver: match[1],
    method: match[2],
    argumentsText: match[3],
  };
}

function isSubscriptAssignmentTarget(target: string): boolean {
  return /^(?:[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)\s*\[.*\]$/.test(target);
}

function blockHeader(code: string): boolean {
  const withoutComment = stripTrailingComment(code).trim();
  if (!withoutComment.endsWith(":")) return false;
  return /^(?:async\s+)?(?:class|def|for|while|if|elif|else|try|except|finally|with|match|case)\b/.test(withoutComment);
}

function withoutFinalHeaderColon(code: string): string {
  const clean = stripTrailingComment(code).trim();
  return clean.endsWith(":") ? clean.slice(0, -1).trimEnd() : clean;
}

function headerRemainder(code: string, keyword: string): string {
  const header = withoutFinalHeaderColon(code);
  return header.startsWith(keyword) ? header.slice(keyword.length).trim() : header;
}

function topLevelKeywordIndex(value: string, keyword: string): number {
  let quote = "";
  let escaped = false;
  let bracketDepth = 0;
  for (let index = 0; index <= value.length - keyword.length; index += 1) {
    const character = value[index];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (quote && character === "\\") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (character === quote) quote = "";
      continue;
    }
    if (character === "'" || character === "\"") {
      quote = character;
      continue;
    }
    if ("([{".includes(character)) {
      bracketDepth += 1;
      continue;
    }
    if (")]}".includes(character)) {
      bracketDepth = Math.max(0, bracketDepth - 1);
      continue;
    }
    if (bracketDepth === 0 && value.slice(index, index + keyword.length) === keyword) return index;
  }
  return -1;
}

function forHeaderParts(code: string): { target: string; iterable: string } | null {
  if (!/^(?:async\s+)?for\b/.test(code)) return null;
  const keyword = code.startsWith("async for") ? "async for" : "for";
  const remainder = headerRemainder(code, keyword);
  const separator = topLevelKeywordIndex(remainder, " in ");
  if (separator < 0) return null;
  return {
    target: remainder.slice(0, separator).trim(),
    iterable: remainder.slice(separator + 4).trim(),
  };
}

function classify(code: string): CodeLayerKind {
  if (!code) return "blank";
  if (code.startsWith("#") || /^['"]{3}/.test(code)) return "comment";
  if (code.startsWith("@")) return "decorator";
  if (/^(?:from|import)\b/.test(code)) return "import";
  if (/^class\b/.test(code)) return "class";
  if (/^(?:async\s+)?def\b/.test(code)) return "function";
  if (/^(?:async\s+)?for\b|^while\b/.test(code)) return "loop";
  if (/^(?:if|elif|match|case)\b/.test(code)) return "condition";
  if (/^else\b/.test(code)) return "branch";
  if (/^(?:try|except|finally|raise|assert)\b/.test(code)) return "exception";
  if (/^(?:async\s+)?with\b/.test(code)) return "context";
  if (/^(?:return|yield)\b/.test(code)) return "return";
  if (/^(?:break|continue|pass)\b/.test(code)) return "flow";
  if (augmentedAssignmentParts(code)) return "assignment";
  if (assignmentIndex(code) >= 0) return "assignment";
  if (/^heapq\.(?:heappush|heappop|heapify|heapreplace|heappushpop)\s*\(/.test(code)) return "mutation";
  if (mutationCallParts(code)) return "mutation";
  if (/^(?:await\s+)?[A-Za-z_][\w.]*\s*\(/.test(code)) return "call";
  return "statement";
}

function kindLabel(kind: CodeLayerKind, language: Language): string {
  const labels: Record<Language, Record<CodeLayerKind, string>> = {
    zh: {
      blank: "空行",
      comment: "说明",
      decorator: "装饰器",
      import: "导入",
      class: "类",
      function: "函数",
      loop: "循环",
      condition: "判断",
      branch: "分支",
      exception: "异常处理",
      context: "上下文",
      assignment: "变量",
      mutation: "容器方法",
      return: "返回",
      flow: "流程控制",
      call: "函数调用",
      continuation: "续写",
      statement: "语句",
    },
    en: {
      blank: "Blank",
      comment: "Note",
      decorator: "Decorator",
      import: "Import",
      class: "Class",
      function: "Function",
      loop: "Loop",
      condition: "Condition",
      branch: "Branch",
      exception: "Error handling",
      context: "Context",
      assignment: "Variable",
      mutation: "Container method",
      return: "Return",
      flow: "Flow control",
      call: "Function call",
      continuation: "Continuation",
      statement: "Statement",
    },
  };
  return labels[language][kind];
}

function labelFor(code: string, kind: CodeLayerKind, language: Language): string {
  const classMatch = code.match(/^class\s+([A-Za-z_]\w*)/);
  if (classMatch) return language === "zh" ? `类 ${classMatch[1]}` : `Class ${classMatch[1]}`;

  const functionMatch = code.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)/);
  if (functionMatch) return language === "zh" ? `函数 ${functionMatch[1]}` : `Function ${functionMatch[1]}`;

  const forParts = forHeaderParts(code);
  if (forParts) return language === "zh" ? `遍历 ${short(forParts.iterable, 32)}` : `Loop over ${short(forParts.iterable, 32)}`;

  if (/^while\b/.test(code)) {
    const condition = headerRemainder(code, "while");
    return language === "zh" ? `重复检查 ${short(condition, 32)}` : `Repeat while ${short(condition, 32)}`;
  }

  if (/^(?:if|elif)\b/.test(code)) {
    const keyword = code.startsWith("elif") ? "elif" : "if";
    const condition = headerRemainder(code, keyword);
    return language === "zh" ? `判断 ${short(condition, 34)}` : `Check ${short(condition, 34)}`;
  }
  if (/^else\b/.test(code)) return language === "zh" ? "否则分支" : "Fallback branch";
  if (/^try\b/.test(code)) return language === "zh" ? "尝试执行" : "Try block";
  if (/^except\b/.test(code)) return language === "zh" ? "捕获异常" : "Catch an error";
  if (/^finally\b/.test(code)) return language === "zh" ? "最后执行" : "Always finish";
  if (/^(?:return|yield)\b/.test(code)) return language === "zh" ? "交出结果" : "Produce a result";
  if (kind === "assignment") {
    const augmented = augmentedAssignmentParts(code);
    const normal = normalAssignmentParts(code);
    const targets = augmented?.target || normal?.targets.join(", ") || code;
    return language === "zh" ? `更新 ${short(targets, 32)}` : `Update ${short(targets, 32)}`;
  }
  if (kind === "continuation") return language === "zh" ? "续写上一行" : "Continue the previous line";
  if (!code) return language === "zh" ? "留出间隔" : "Visual spacing";
  return short(code, 48);
}

function explain(code: string, kind: CodeLayerKind, language: Language): string {
  if (language === "en") {
    if (!code) return "This blank line separates ideas. Python skips it.";
    if (kind === "comment") return "This is written for the reader. Python does not run a normal # comment.";
    if (kind === "decorator") return `Apply ${short(code)} to the definition immediately below it.`;
    if (kind === "import") return `Load ${short(code.replace(/^(?:from|import)\s+/, ""), 50)} so later lines can use it.`;
    if (kind === "continuation") return `Continue the longer expression from the previous line with ${short(code)}. Python treats the whole group as one statement.`;
    if (hasTopLevelSemicolon(code)) return "This physical line contains multiple statements separated by semicolons. Python runs them left to right; placing each on its own line will be easier to learn and debug.";

    const classMatch = code.match(/^class\s+([A-Za-z_]\w*)/);
    if (classMatch) return `Create the ${classMatch[1]} class. LeetCode usually enters your solution through this wrapper.`;

    const functionMatch = code.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\((.*)\)/);
    if (functionMatch) {
      const parameters = short(functionMatch[2] || "no parameters", 58);
      return `Define ${functionMatch[1]} and name the inputs it receives: ${parameters}. The indented lines form its recipe.`;
    }

    const forParts = forHeaderParts(code);
    if (forParts) return `Take the next value from ${short(forParts.iterable)}, place it in ${short(forParts.target, 34)}, then run the nested block once.`;

    if (/^while\b/.test(code)) {
      const condition = headerRemainder(code, "while");
      return `Check ${short(condition)} before every round. Repeat the nested block only while it is true.`;
    }

    if (/^(?:if|elif)\b/.test(code)) {
      const keyword = code.startsWith("elif") ? "elif" : "if";
      return `Evaluate ${short(headerRemainder(code, keyword))}. Enter this nested branch only when the condition is true.`;
    }
    if (/^else\b/.test(code)) return "Run this nested branch only when the preceding if/elif choices did not match.";
    if (/^match\b/.test(code)) return `Compare ${short(headerRemainder(code, "match"))} against the case branches below.`;
    if (/^case\b/.test(code)) return `Enter this branch when the value matches ${short(headerRemainder(code, "case"))}.`;
    if (/^try\b/.test(code)) return "Run the nested lines and allow a matching except block to handle an error.";
    if (/^except\b/.test(code)) return `Handle the matching error${code === "except:" ? "" : ` described by ${short(code.replace(/^except\s*/, "").replace(/:\s*$/, ""))}`}.`;
    if (/^finally\b/.test(code)) return "Run the nested cleanup lines whether the try block succeeded or raised an error.";
    if (/^raise\b/.test(code)) return `Create an error here: ${short(code.replace(/^raise\s*/, ""))}.`;
    if (/^assert\b/.test(code)) return `Require ${short(code.replace(/^assert\s+/, ""))} to be true; otherwise Python raises an AssertionError.`;
    if (/^(?:async\s+)?with\b/.test(code)) return "Open this resource for the nested block and clean it up automatically afterward.";

    const returnMatch = code.match(/^return(?:\s+(.+))?$/);
    if (returnMatch) return returnMatch[1]
      ? `Finish the current function and send ${short(returnMatch[1])} back to its caller.`
      : "Finish the current function and return None.";
    const yieldMatch = code.match(/^yield(?:\s+(.+))?$/);
    if (yieldMatch) return `Pause the generator and give ${short(yieldMatch[1] || "None")} to its caller.`;
    if (code === "break") return "Stop the nearest loop immediately and continue after that loop.";
    if (code === "continue") return "Skip the rest of this loop round and begin the next round.";
    if (code === "pass") return "Do nothing. This is a placeholder for a block that has not been implemented yet.";

    const augmented = augmentedAssignmentParts(code);
    if (augmented) return `Read ${short(augmented.target)}, apply ${augmented.operator} with ${short(augmented.value)}, then save the updated value back.`;

    const assignment = normalAssignmentParts(code);
    if (assignment) {
      const target = assignment.targets[0] ?? code;
      const value = assignment.value;
      if (assignment.targets.length > 1) {
        return `Compute ${short(value)} once, then save that same result as ${short(assignment.targets.join(", "))}.`;
      }
      if (isSubscriptAssignmentTarget(target)) return `Compute ${short(value)}, then store it in the selected position or key ${short(target)}.`;
      return `Compute ${short(value)}, then save the result as ${short(target)} for later lines to use.`;
    }

    const heapMutation = code.match(/^heapq\.(heappush|heappop|heapify|heapreplace|heappushpop)\s*\((.*)\)/);
    if (heapMutation) {
      const separator = topLevelKeywordIndex(heapMutation[2], ",");
      const heap = short(separator < 0 ? heapMutation[2] : heapMutation[2].slice(0, separator), 34);
      return `Call heapq.${heapMutation[1]} and mutate the heap stored in ${heap}.`;
    }
    const mutation = mutationCallParts(code);
    if (mutation) return `Call ${mutation.method} on ${short(mutation.receiver, 34)}${mutation.argumentsText ? ` using ${short(mutation.argumentsText, 42)}` : ""}. For Python's standard mutable containers this changes the container in place; a custom object's type decides its exact behavior.`;
    if (kind === "call") return `Call ${short(code)} now, then use or ignore the value that call produces.`;
    return `Run ${short(code)}. Watch which values it reads and what the next line can observe.`;
  }

  if (!code) return "这一行用来隔开不同思路，Python 会直接跳过。";
  if (kind === "comment") return "这是写给学习者看的说明；普通的 # 注释不会被 Python 执行。";
  if (kind === "decorator") return `把 ${short(code)} 的功能套到紧接着定义的类或函数上。`;
  if (kind === "import") return `载入 ${short(code.replace(/^(?:from|import)\s+/, ""), 50)}，让后面的代码可以使用现成工具。`;
  if (kind === "continuation") return `用 ${short(code)} 续写上一行的长表达式；Python 会把这一组内容当成同一条语句。`;
  if (hasTopLevelSemicolon(code)) return "这一行用分号连写了多条语句，Python 会从左到右执行。为了更容易学习和排错，建议把每条语句单独换一行。";

  const classMatch = code.match(/^class\s+([A-Za-z_]\w*)/);
  if (classMatch) return `建立 ${classMatch[1]} 类。LeetCode 通常通过这个外壳找到你的解法。`;

  const functionMatch = code.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\((.*)\)/);
  if (functionMatch) {
    const parameters = short(functionMatch[2] || "没有参数", 58);
    return `定义 ${functionMatch[1]} 函数，并给收到的输入起名：${parameters}。下面缩进的代码就是它的做题步骤。`;
  }

  const forParts = forHeaderParts(code);
  if (forParts) return `从 ${short(forParts.iterable)} 取出下一项，放进 ${short(forParts.target, 34)}，再把下面缩进的代码执行一轮。`;

  if (/^while\b/.test(code)) {
    const condition = headerRemainder(code, "while");
    return `每一轮开始前检查 ${short(condition)}；只有条件为真，才继续执行下面缩进的代码。`;
  }

  if (/^(?:if|elif)\b/.test(code)) {
    const keyword = code.startsWith("elif") ? "elif" : "if";
    return `计算条件 ${short(headerRemainder(code, keyword))}；只有结果为真，才进入这一层缩进代码。`;
  }
  if (/^else\b/.test(code)) return "前面的 if / elif 都没有命中时，才进入这一层备用分支。";
  if (/^match\b/.test(code)) return `拿 ${short(headerRemainder(code, "match"))} 和下面的 case 分支逐个匹配。`;
  if (/^case\b/.test(code)) return `当值符合 ${short(headerRemainder(code, "case"))} 时，进入这一层分支。`;
  if (/^try\b/.test(code)) return "先执行这一层代码；如果出错，可以交给后面的 except 分支处理。";
  if (/^except\b/.test(code)) return `捕获符合条件的异常${code === "except:" ? "" : `：${short(code.replace(/^except\s*/, "").replace(/:\s*$/, ""))}`}。`;
  if (/^finally\b/.test(code)) return "无论 try 成功还是出错，最后都会执行这一层清理代码。";
  if (/^raise\b/.test(code)) return `主动抛出异常：${short(code.replace(/^raise\s*/, ""))}。`;
  if (/^assert\b/.test(code)) return `要求 ${short(code.replace(/^assert\s+/, ""))} 必须为真，否则抛出 AssertionError。`;
  if (/^(?:async\s+)?with\b/.test(code)) return "为下面代码打开一个资源，并在这一层结束后自动清理它。";

  const returnMatch = code.match(/^return(?:\s+(.+))?$/);
  if (returnMatch) return returnMatch[1]
    ? `结束当前函数，把 ${short(returnMatch[1])} 作为结果交还给调用它的地方。`
    : "结束当前函数，并返回 None。";
  const yieldMatch = code.match(/^yield(?:\s+(.+))?$/);
  if (yieldMatch) return `暂时暂停生成器，把 ${short(yieldMatch[1] || "None")} 交给调用者，下次还能继续。`;
  if (code === "break") return "立刻结束最近的一层循环，接着执行循环后面的代码。";
  if (code === "continue") return "跳过这一轮剩余代码，马上开始下一轮循环。";
  if (code === "pass") return "暂时什么都不做；这是还没有写入真实解法的占位符。";

  const augmented = augmentedAssignmentParts(code);
  if (augmented) return `读出 ${short(augmented.target)}，用 ${augmented.operator} 和 ${short(augmented.value)} 计算，再把新结果存回原变量。`;

  const assignment = normalAssignmentParts(code);
  if (assignment) {
    const target = assignment.targets[0] ?? code;
    const value = assignment.value;
    if (assignment.targets.length > 1) {
      return `先把 ${short(value)} 计算一次，再把同一个结果依次保存成 ${short(assignment.targets.join("、"))}。`;
    }
    if (isSubscriptAssignmentTarget(target)) return `先计算 ${short(value)}，再把结果存进指定位置或键 ${short(target)}。`;
    return `先计算 ${short(value)}，再把结果保存成 ${short(target)}，供后面的代码继续使用。`;
  }

  const heapMutation = code.match(/^heapq\.(heappush|heappop|heapify|heapreplace|heappushpop)\s*\((.*)\)/);
  if (heapMutation) {
    const separator = topLevelKeywordIndex(heapMutation[2], ",");
    const heap = short(separator < 0 ? heapMutation[2] : heapMutation[2].slice(0, separator), 34);
    return `调用 heapq.${heapMutation[1]}，直接修改 ${heap} 里保存的堆。`;
  }
  const mutation = mutationCallParts(code);
  if (mutation) return `对 ${short(mutation.receiver, 34)} 调用 ${mutation.method}${mutation.argumentsText ? `，传入 ${short(mutation.argumentsText, 42)}` : ""}。如果它是 Python 标准可变容器，这通常会原地修改；自定义对象的准确行为由它的类型决定。`;
  if (kind === "call") return `现在调用 ${short(code)}，然后使用或忽略它产生的结果。`;
  return `执行 ${short(code)}；重点观察它读取了哪些值，以及下一行能看到什么变化。`;
}

function explainElse(ownerNode: string, language: Language): string {
  if (ownerNode === "ForStatement" || ownerNode === "WhileStatement") {
    return language === "zh"
      ? "只有循环自然结束、没有被 break 提前打断时，才进入这一层 else。"
      : "Enter this else block only when the loop finishes normally without hitting break.";
  }
  if (ownerNode === "TryStatement") {
    return language === "zh"
      ? "只有 try 里的代码没有抛出异常时，才进入这一层 else。"
      : "Enter this else block only when the try block finishes without raising an exception.";
  }
  return language === "zh"
    ? "前面的 if / elif 都没有命中时，才进入这一层备用分支。"
    : "Run this nested branch only when the preceding if/elif choices did not match.";
}

function noteFor(
  explanation: string,
  depth: number,
  path: string[],
  language: Language,
): string {
  const context = path.length ? path.join(" → ") : language === "zh" ? "最外层" : "top level";
  return language === "zh"
    ? `${automaticLayerNotePrefix(language)}第 ${depth} 层（${context}）：${explanation}`
    : `${automaticLayerNotePrefix(language)} Layer ${depth} (${context}): ${explanation}`;
}

const STRUCTURAL_NODES = new Set([
  "ClassDefinition",
  "FunctionDefinition",
  "ForStatement",
  "WhileStatement",
  "IfStatement",
  "TryStatement",
  "WithStatement",
  "MatchStatement",
  "MatchClause",
]);

function lineStartsFor(code: string): number[] {
  const starts = [0];
  for (let index = 0; index < code.length; index += 1) {
    if (code[index] === "\n") starts.push(index + 1);
  }
  return starts;
}

function lineNumberAt(starts: number[], offset: number): number {
  let low = 0;
  let high = starts.length - 1;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (starts[middle] <= offset) low = middle + 1;
    else high = middle - 1;
  }
  return Math.max(1, high + 1);
}

function sourceLineAt(code: string, starts: number[], lineNumber: number): string {
  const from = starts[Math.max(0, lineNumber - 1)] ?? 0;
  const to = starts[lineNumber] === undefined ? code.length : Math.max(from, starts[lineNumber] - 1);
  return code.slice(from, to);
}

function structuralHeader(
  code: string,
  from: number,
  to: number,
): string {
  return code
    .slice(from, to)
    .replace(/\r?\n/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bodyRangesFor(code: string, language: Language): {
  ranges: BodyRange[];
  errorLines: Set<number>;
} {
  const starts = lineStartsFor(code);
  const tree = pythonLanguage.parser.parse(code);
  const cursor = tree.cursor();
  const ranges: BodyRange[] = [];
  const errorLines = new Set<number>();

  function visit(owner: { from: number; line: number; label: string; nodeName: string } | null) {
    const name = cursor.name;
    const nodeFrom = cursor.from;
    const nodeTo = cursor.to;
    let childOwner = owner;

    if (cursor.type.isError) {
      const firstLine = lineNumberAt(starts, nodeFrom);
      const lastLine = lineNumberAt(starts, Math.max(nodeFrom, nodeTo - 1));
      for (let line = firstLine; line <= lastLine; line += 1) errorLines.add(line);
    }

    if (STRUCTURAL_NODES.has(name)) {
      const line = lineNumberAt(starts, nodeFrom);
      const firstLine = sourceLineAt(code, starts, line).trim();
      childOwner = {
        from: nodeFrom,
        line,
        label: labelFor(firstLine, classify(firstLine), language),
        nodeName: name,
      };
    }

    if ((name === "Body" || name === "MatchBody") && owner) {
      const colonLine = lineNumberAt(starts, nodeFrom);
      const colonHeader = sourceLineAt(code, starts, colonLine).trim();
      const branchHeader = /^(?:elif|else|except|finally|case)\b/.test(colonHeader)
        ? colonHeader
        : "";
      const fallbackHeader = structuralHeader(code, owner.from, nodeFrom + 1);
      const header = branchHeader || fallbackHeader;
      ranges.push({
        from: nodeFrom,
        to: nodeTo,
        ownerLine: branchHeader ? colonLine : owner.line,
        label: labelFor(header, classify(header), language),
        header,
        ownerNode: owner.nodeName,
      });
    }

    if (!cursor.firstChild()) return;
    do {
      visit(childOwner);
    } while (cursor.nextSibling());
    cursor.parent();
  }

  visit(null);
  return { ranges, errorLines };
}

export function analyzePythonCodeLayers(code: string, language: Language): CodeLayerSummary {
  const bounded = boundedSource(code);
  const boundedCode = bounded.source;
  const visibleLines = bounded.lines;
  const continuations = continuationReasons(visibleLines);
  const starts = lineStartsFor(boundedCode);
  const syntax = bodyRangesFor(boundedCode, language);
  const visibleEndOffset = starts[visibleLines.length] ?? boundedCode.length;
  const bodyRanges = syntax.ranges.filter((body) => body.from < visibleEndOffset);
  const output: CodeLayerLine[] = [];
  let maxDepth = 0;
  let meaningfulLines = 0;

  visibleLines.forEach((text, index) => {
    const codeText = text.trim();
    const indent = indentation(text);
    const isMeaningful = Boolean(codeText);
    const lineOffset = starts[index] ?? boundedCode.length;
    const parents = bodyRanges
      .filter((body) => body.from < lineOffset && lineOffset < body.to)
      .sort((first, second) => first.from - second.from || second.to - first.to);

    const ownedBodies = bodyRanges.filter((body) => body.ownerLine === index + 1);
    const rawSemanticCode = ownedBodies[0]?.header ?? codeText;
    const semanticCode = rawSemanticCode.startsWith("#")
      ? rawSemanticCode
      : stripTrailingComment(rawSemanticCode).trim();
    const continuation = continuations[index];
    const kind = continuation === "expression" && !ownedBodies.length
      ? "continuation"
      : continuation === "string"
        ? "comment"
        : classify(semanticCode);
    const depth = Math.max(1, parents.length + 1);
    const label = continuation === "string"
      ? language === "zh" ? "多行文字" : "Multiline text"
      : labelFor(semanticCode, kind, language);
    const path = parents.map((body) => body.label);
    const incomplete = syntax.errorLines.has(index + 1);
    const explanation = incomplete
      ? language === "zh"
        ? "这行 Python 还没写完整，请先检查冒号、括号、缩进，或是否缺少表达式。"
        : "This Python line is incomplete. Check its colon, brackets, indentation, or a missing expression first."
      : /^else\b/.test(semanticCode) && ownedBodies[0]
      ? explainElse(ownedBodies[0].ownerNode, language)
      : continuation === "string"
      ? language === "zh"
        ? "这是从上一行延续下来的多行文字内容；它属于同一个字符串。"
        : "This is another physical line of the multiline string that began above."
      : explain(semanticCode, kind, language);
    const opensBlock = ownedBodies.length > 0 || blockHeader(codeText);

    output.push({
      lineNumber: index + 1,
      text,
      code: codeText,
      indent,
      depth,
      kind,
      kindLabel: incomplete
        ? language === "zh" ? `待补全 · ${kindLabel(kind, language)}` : `Incomplete · ${kindLabel(kind, language)}`
        : kindLabel(kind, language),
      label,
      explanation,
      note: noteFor(explanation, depth, path, language),
      opensBlock,
      incomplete,
      parentLine: parents[parents.length - 1]?.ownerLine ?? null,
      path,
    });

    maxDepth = Math.max(maxDepth, depth);
    if (isMeaningful) meaningfulLines += 1;
  });

  return {
    lines: output,
    maxDepth,
    meaningfulLines,
    blockCount: bodyRanges.filter((body) => body.ownerLine <= visibleLines.length).length,
    truncated: bounded.truncated,
  };
}

export function pythonLayerNotes(code: string, language: Language): string[] {
  return analyzePythonCodeLayers(code, language).lines.map((line) => line.note);
}
