import type { Language } from "./problem-i18n";

export const MAX_EXECUTION_TRACE_EVENTS = 240;

const MAX_TRACE_VALUE_DEPTH = 12;
const MAX_TRACE_VALUE_ITEMS = 256;
const MAX_TRACE_VALUE_NODES = 30_000;
const MAX_TRACE_VALUE_CHARS = 650_000;
const MAX_TRACE_VALUE_STRING = 30_000;
const INVALID_VALUE = Symbol("invalid execution trace value");

export type ExecutionTraceSource = "mine" | "saved" | "reference" | "mistakeReference";
export type ExecutionTraceEventKind = "call" | "resume" | "line" | "yield" | "return" | "exception";
export type ExecutionTraceStopReason = "event-limit" | "payload-limit";

export type ExecutionTraceEvent = {
  kind: ExecutionTraceEventKind;
  line: number;
  functionName: string;
  frameId: string;
  depth: number;
  locals: Record<string, unknown>;
  returnValue?: unknown;
  error?: { name: string; message: string };
  /** CPython emits a return(None) trace event while an exception leaves a frame. */
  unwind?: boolean;
};

export type ExecutionTraceTestResult = {
  index: number;
  name: string;
  expression: string;
  expected: unknown;
  actual: unknown;
  hasActual: boolean;
  passed: boolean;
  error: { name?: string; message?: string; traceback?: string } | null;
  duration: number;
};

export type ExecutionTraceResult = {
  source: ExecutionTraceSource;
  code: string;
  testIndex: number;
  events: ExecutionTraceEvent[];
  truncated: boolean;
  stopReason: ExecutionTraceStopReason | null;
  test: ExecutionTraceTestResult;
  stdout: string;
  duration: number;
};

export type ExecutionVariableChange = {
  name: string;
  kind: "added" | "changed" | "removed";
  before: unknown;
  after: unknown;
};

type ValueBudget = {
  nodes: number;
  characters: number;
};

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function finiteInteger(value: unknown, minimum: number, maximum: number): number | null {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= minimum
    && value <= maximum
    ? value
    : null;
}

function boundedString(value: unknown, maximum: number): string | null {
  return typeof value === "string" && value.length <= maximum ? value : null;
}

function freshValueBudget(): ValueBudget {
  return { nodes: 0, characters: 0 };
}

function safeProperty(output: Record<string, unknown>, key: string, value: unknown) {
  Object.defineProperty(output, key, {
    configurable: true,
    enumerable: true,
    value,
    writable: true,
  });
}

/** Clone only the bounded JSON-shaped values produced by the isolated worker. */
function normalizeTraceValue(
  value: unknown,
  budget: ValueBudget,
  depth = 0,
  ancestors: Set<object> = new Set(),
): unknown | typeof INVALID_VALUE {
  budget.nodes += 1;
  if (budget.nodes > MAX_TRACE_VALUE_NODES || depth > MAX_TRACE_VALUE_DEPTH) return INVALID_VALUE;

  if (value === null || typeof value === "boolean") return value;
  if (typeof value === "number") return Number.isFinite(value) ? value : INVALID_VALUE;
  if (typeof value === "string") {
    budget.characters += value.length;
    return value.length <= MAX_TRACE_VALUE_STRING && budget.characters <= MAX_TRACE_VALUE_CHARS
      ? value
      : INVALID_VALUE;
  }
  if (typeof value !== "object") return INVALID_VALUE;
  if (ancestors.has(value)) return INVALID_VALUE;

  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      if (value.length > MAX_TRACE_VALUE_ITEMS) return INVALID_VALUE;
      const output: unknown[] = [];
      for (const item of value) {
        const normalized = normalizeTraceValue(item, budget, depth + 1, ancestors);
        if (normalized === INVALID_VALUE) return INVALID_VALUE;
        output.push(normalized);
      }
      return output;
    }

    const source = record(value);
    if (!source) return INVALID_VALUE;
    const entries = Object.entries(source);
    if (entries.length > MAX_TRACE_VALUE_ITEMS) return INVALID_VALUE;
    const output: Record<string, unknown> = {};
    for (const [key, item] of entries) {
      budget.characters += key.length;
      if (key.length > 500 || budget.characters > MAX_TRACE_VALUE_CHARS) return INVALID_VALUE;
      const normalized = normalizeTraceValue(item, budget, depth + 1, ancestors);
      if (normalized === INVALID_VALUE) return INVALID_VALUE;
      safeProperty(output, key, normalized);
    }
    return output;
  } finally {
    ancestors.delete(value);
  }
}

function normalizeError(value: unknown): ExecutionTraceEvent["error"] | undefined {
  const source = record(value);
  if (!source) return undefined;
  const name = boundedString(source.name, 120);
  const message = boundedString(source.message, 1_000);
  return name !== null && message !== null ? { name, message } : undefined;
}

function normalizeEvents(
  value: unknown,
  maximumLine: number,
  budget: ValueBudget,
): ExecutionTraceEvent[] | null {
  if (!Array.isArray(value) || value.length > MAX_EXECUTION_TRACE_EVENTS) return null;
  const output: ExecutionTraceEvent[] = [];
  for (const item of value) {
    const source = record(item);
    if (!source || !["call", "resume", "line", "yield", "return", "exception"].includes(String(source.kind))) return null;
    const kind = source.kind as ExecutionTraceEventKind;
    const line = finiteInteger(source.line, 1, maximumLine);
    const depth = finiteInteger(source.depth, 0, 100);
    const functionName = boundedString(source.functionName, 160);
    const frameId = boundedString(source.frameId, 80);
    const localsSource = record(source.locals);
    if (line === null || depth === null || functionName === null || frameId === null || !localsSource) return null;
    if (Object.keys(localsSource).length > 20) return null;
    const normalizedLocals = normalizeTraceValue(localsSource, budget);
    const locals = normalizedLocals === INVALID_VALUE ? null : record(normalizedLocals);
    if (!locals) return null;
    const error = normalizeError(source.error);
    if (source.error !== undefined && !error) return null;
    if (source.unwind !== undefined && typeof source.unwind !== "boolean") return null;

    let returnValue: unknown = undefined;
    const hasReturnValue = Object.prototype.hasOwnProperty.call(source, "returnValue");
    if (hasReturnValue) {
      returnValue = normalizeTraceValue(source.returnValue, budget);
      if (returnValue === INVALID_VALUE) return null;
    }
    if ((kind === "exception") !== Boolean(error)) return null;
    if (error && kind !== "exception") return null;
    if (source.unwind === true && kind !== "return") return null;
    if (hasReturnValue && kind !== "return" && kind !== "yield") return null;
    if (kind === "yield" && !hasReturnValue) return null;
    if (kind === "return" && source.unwind === true && hasReturnValue) return null;
    if (kind === "return" && source.unwind !== true && !hasReturnValue) return null;

    output.push({
      kind,
      line,
      depth,
      functionName,
      frameId,
      locals,
      ...(hasReturnValue ? { returnValue } : {}),
      ...(error ? { error } : {}),
      ...(source.unwind === true ? { unwind: true } : {}),
    });
  }
  return output;
}

export function normalizeExecutionTraceEvents(value: unknown): ExecutionTraceEvent[] | null {
  return normalizeEvents(value, 1_000_000, freshValueBudget());
}

function normalizeTestResult(value: unknown, budget: ValueBudget): ExecutionTraceTestResult | null {
  const source = record(value);
  if (!source) return null;
  const index = finiteInteger(source.index, 0, 10_000);
  const name = boundedString(source.name, 500);
  const expression = boundedString(source.expression, 30_000);
  const duration = typeof source.duration === "number" && Number.isFinite(source.duration) && source.duration >= 0
    ? source.duration
    : null;
  const expected = normalizeTraceValue(source.expected, budget);
  const actual = normalizeTraceValue(source.actual, budget);
  if (expected === INVALID_VALUE || actual === INVALID_VALUE) return null;

  const rawError = source.error;
  const hasActual = typeof source.hasActual === "boolean" ? source.hasActual : null;
  let error: ExecutionTraceTestResult["error"] = null;
  if (rawError !== null && rawError !== undefined) {
    const errorRecord = record(rawError);
    if (!errorRecord) return null;
    error = {};
    for (const key of ["name", "message", "traceback"] as const) {
      if (errorRecord[key] === undefined) continue;
      const text = boundedString(errorRecord[key], key === "traceback" ? 30_000 : 2_000);
      if (text === null) return null;
      error[key] = text;
    }
  }
  if (index === null || name === null || expression === null || duration === null || hasActual === null || typeof source.passed !== "boolean") return null;
  if (!hasActual && actual !== null) return null;
  if (source.passed && (!hasActual || error !== null)) return null;
  if (error !== null && hasActual) return null;
  return { index, name, expression, expected, actual, hasActual, passed: source.passed, error, duration };
}

export function normalizeExecutionTraceTestResult(value: unknown): ExecutionTraceTestResult | null {
  return normalizeTestResult(value, freshValueBudget());
}

export function normalizeExecutionTraceTests(value: unknown): ExecutionTraceTestResult[] | null {
  if (!Array.isArray(value) || value.length > 100) return null;
  const budget = freshValueBudget();
  const results = value.map((item) => normalizeTestResult(item, budget));
  return results.every((result): result is ExecutionTraceTestResult => result !== null) ? results : null;
}

export function normalizeExecutionTraceResult(
  value: unknown,
  context: { source: ExecutionTraceSource; code: string; testIndex: number },
): ExecutionTraceResult | null {
  const source = record(value);
  if (!source) return null;
  const budget = freshValueBudget();
  const maximumLine = Math.max(1, context.code.split(/\r?\n/).length);
  const events = normalizeEvents(source.trace, maximumLine, budget);
  const test = normalizeTestResult(source.result, budget);
  const stdout = boundedString(source.stdout ?? "", 100_000);
  const duration = typeof source.duration === "number" && Number.isFinite(source.duration) && source.duration >= 0
    ? source.duration
    : null;
  const stopReason = source.stopReason === null
    ? null
    : source.stopReason === "event-limit" || source.stopReason === "payload-limit"
      ? source.stopReason
      : undefined;
  if (
    !events
    || !test
    || stdout === null
    || duration === null
    || typeof source.truncated !== "boolean"
    || stopReason === undefined
    || (source.truncated && stopReason === null)
    || (!source.truncated && stopReason !== null)
    || test.index !== context.testIndex
  ) return null;
  return { ...context, events, test, stdout, duration, truncated: source.truncated, stopReason };
}

function comparable(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return typeof value;
  }
}

/** Changes caused by the highlighted line, measured at the next event in the same Python frame. */
export function executionVariableChanges(events: ExecutionTraceEvent[], index: number): ExecutionVariableChange[] {
  const current = events[index];
  if (!current) return [];
  const next = events.slice(index + 1).find((event) => event.frameId === current.frameId);
  if (!next) return [];
  const names = new Set([...Object.keys(current.locals), ...Object.keys(next.locals)]);
  return [...names].sort().reduce<ExecutionVariableChange[]>((changes, name) => {
    const beforeExists = Object.prototype.hasOwnProperty.call(current.locals, name);
    const afterExists = Object.prototype.hasOwnProperty.call(next.locals, name);
    const before = current.locals[name];
    const after = next.locals[name];
    if (!beforeExists && afterExists) changes.push({ name, kind: "added", before: undefined, after });
    else if (beforeExists && !afterExists) changes.push({ name, kind: "removed", before, after: undefined });
    else if (comparable(before) !== comparable(after)) changes.push({ name, kind: "changed", before, after });
    return changes;
  }, []);
}

function formatValue(value: unknown, depth: number): string {
  if (value === undefined) return "—";
  if (value === null) return "None";
  if (typeof value === "boolean") return value ? "True" : "False";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "<number>";
  if (typeof value === "string") return JSON.stringify(value);
  if (depth >= 4) return "…";
  if (Array.isArray(value)) return `[${value.map((item) => formatValue(item, depth + 1)).join(", ")}]`;
  const source = record(value);
  if (!source) return "<value>";
  if (source.__executionTraceType === "dict" && Array.isArray(source.entries)) {
    const entries = source.entries
      .filter((entry): entry is unknown[] => Array.isArray(entry) && entry.length === 2)
      .map(([key, item]) => `${formatValue(key, depth + 1)}: ${formatValue(item, depth + 1)}`);
    if (source.more === true) entries.push("…");
    return `{${entries.join(", ")}}`;
  }
  return `{${Object.entries(source)
    .map(([key, item]) => `${JSON.stringify(key)}: ${formatValue(item, depth + 1)}`)
    .join(", ")}}`;
}

export function formatExecutionValue(value: unknown): string {
  const text = formatValue(value, 0);
  return text.length > 260 ? `${text.slice(0, 257)}…` : text;
}

export function explainExecutionEvent(
  event: ExecutionTraceEvent,
  sourceLine: string,
  language: Language,
): string {
  if (event.kind === "call") {
    return language === "zh"
      ? `进入 ${event.functionName}，先把输入参数放进变量。`
      : `Enter ${event.functionName} and bind its input arguments.`;
  }
  if (event.kind === "resume") {
    return language === "zh"
      ? `继续执行暂停中的 ${event.functionName}。`
      : `Resume the paused ${event.functionName} function.`;
  }
  if (event.kind === "yield") {
    return language === "zh"
      ? `暂时交出 ${formatExecutionValue(event.returnValue)}，下次还会从这里继续。`
      : `Yield ${formatExecutionValue(event.returnValue)} and pause here until the next request.`;
  }
  if (event.kind === "return") {
    if (event.unwind) {
      return language === "zh"
        ? `异常正在离开 ${event.functionName}；这里不是正常返回值。`
        : `The exception is leaving ${event.functionName}; this is not a normal return value.`;
    }
    return language === "zh"
      ? `离开 ${event.functionName}，返回 ${formatExecutionValue(event.returnValue)}。`
      : `Leave ${event.functionName} and return ${formatExecutionValue(event.returnValue)}.`;
  }
  if (event.kind === "exception") {
    const detail = event.error ? `${event.error.name}: ${event.error.message}` : "Python exception";
    return language === "zh"
      ? `这一行抛出了异常：${detail}。下一步会显示它是否被代码捕获。`
      : `This line raised an exception: ${detail}. The next step shows whether it was caught or handled.`;
  }

  const line = sourceLine.trim();
  if (/^(if|elif)\b/.test(line)) {
    return language === "zh" ? "检查这个条件，决定是否进入下面的代码块。" : "Check this condition to choose the next branch.";
  }
  if (/^else\s*:/.test(line)) {
    return language === "zh" ? "前面的条件不成立，所以进入 else 分支。" : "Earlier conditions were false, so enter the else branch.";
  }
  if (/^for\b/.test(line)) {
    return language === "zh" ? "从序列中取出下一项，开始这一轮循环。" : "Take the next item and begin this loop iteration.";
  }
  if (/^while\b/.test(line)) {
    return language === "zh" ? "再次检查循环条件；为真才继续这一轮。" : "Check the loop condition again before another iteration.";
  }
  if (/^return\b/.test(line)) {
    return language === "zh" ? "计算 return 后面的值，并把它交给调用者。" : "Evaluate the return value and give it back to the caller.";
  }
  if (/\.(append|add|push|heappush)\s*\(/.test(line)) {
    return language === "zh" ? "把一个新值加入当前容器。" : "Add a new value to the current container.";
  }
  if (/\+=|-=|\*=|\/=|\/\/=/.test(line)) {
    return language === "zh" ? "用右侧计算结果更新原来的变量。" : "Update the existing variable with the value on the right.";
  }
  if (/^[A-Za-z_][\w.\[\], ]*\s*=\s*[^=]/.test(line)) {
    return language === "zh" ? "先计算等号右边，再把结果保存到左边的变量。" : "Evaluate the right side, then store it in the variable on the left.";
  }
  if (/^(break|continue)\b/.test(line)) {
    return language === "zh" ? "改变循环的正常执行顺序。" : "Change the normal flow of the loop.";
  }
  return language === "zh" ? "执行这一行，然后观察变量发生了什么变化。" : "Execute this line, then inspect how the variables change.";
}
