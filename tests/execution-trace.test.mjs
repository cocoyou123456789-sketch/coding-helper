import assert from "node:assert/strict";
import test from "node:test";

import {
  MAX_EXECUTION_TRACE_EVENTS,
  executionVariableChanges,
  explainExecutionEvent,
  formatExecutionValue,
  normalizeExecutionTraceEvents,
  normalizeExecutionTraceResult,
  normalizeExecutionTraceTestResult,
} from "../app/execution-trace.ts";

const event = (overrides = {}) => ({
  kind: "line",
  line: 1,
  functionName: "solve",
  frameId: "frame-1",
  depth: 0,
  locals: {},
  ...overrides,
});

const result = (overrides = {}) => ({
  index: 0,
  name: "example",
  expression: "solve([1, 2, 3])",
  expected: 6,
  actual: 6,
  hasActual: true,
  passed: true,
  error: null,
  duration: 1,
  ...overrides,
});

const traceMessage = (overrides = {}) => ({
  trace: [event()],
  result: result(),
  stdout: "",
  duration: 2,
  truncated: false,
  stopReason: null,
  ...overrides,
});

const context = {
  source: "mine",
  code: "first = 1\nreturn first",
  testIndex: 0,
};

test("trace events enforce their schema and hard event limit", () => {
  assert.equal(normalizeExecutionTraceEvents("not events"), null);
  assert.equal(normalizeExecutionTraceEvents([event({ kind: "unknown" })]), null);
  assert.equal(normalizeExecutionTraceEvents([event({ line: 0 })]), null);
  assert.equal(normalizeExecutionTraceEvents([event({ locals: Array(3) })]), null);
  assert.equal(normalizeExecutionTraceEvents([event({ kind: "exception" })]), null);
  assert.equal(normalizeExecutionTraceEvents([event({ error: { name: "ValueError", message: "bad" } })]), null);
  assert.equal(normalizeExecutionTraceEvents([event({ kind: "yield" })]), null);
  assert.equal(normalizeExecutionTraceEvents([event({ kind: "return", unwind: true, returnValue: null })]), null);
  assert.equal(normalizeExecutionTraceEvents([event({ kind: "return" })]), null);
  assert.equal(normalizeExecutionTraceEvents([event({ kind: "resume" })])?.[0].kind, "resume");
  assert.equal(normalizeExecutionTraceEvents([event({ kind: "yield", returnValue: 3 })])?.[0].kind, "yield");

  const maximum = Array.from(
    { length: MAX_EXECUTION_TRACE_EVENTS },
    (_, index) => event({ line: index + 1, frameId: `frame-${index}` }),
  );
  assert.equal(normalizeExecutionTraceEvents(maximum)?.length, MAX_EXECUTION_TRACE_EVENTS);
  assert.equal(normalizeExecutionTraceEvents([...maximum, event()]), null);
});

test("test outcomes require an explicit and internally consistent result state", () => {
  const legacy = { ...result() };
  delete legacy.hasActual;
  assert.equal(normalizeExecutionTraceTestResult(legacy), null);
  assert.equal(normalizeExecutionTraceTestResult(result({ hasActual: false, actual: 6 })), null);
  assert.equal(normalizeExecutionTraceTestResult(result({ hasActual: false, actual: null, passed: true })), null);
  assert.equal(normalizeExecutionTraceTestResult(result({ hasActual: true, error: { name: "Error", message: "bad" } })), null);

  const raised = normalizeExecutionTraceTestResult(result({
    actual: null,
    hasActual: false,
    passed: false,
    error: { name: "IndexError", message: "list index out of range" },
  }));
  assert.equal(raised?.hasActual, false);
});

test("typed Python dictionaries keep key types distinct in the learner display", () => {
  const displayValue = {
    __executionTraceType: "dict",
    entries: [[1, "number key"], ["1", "string key"]],
    more: false,
  };
  assert.equal(
    formatExecutionValue(displayValue),
    "{1: \"number key\", \"1\": \"string key\"}",
  );
});

test("a normalized trace cannot point outside the supplied source", () => {
  const valid = normalizeExecutionTraceResult(
    traceMessage({ trace: [event({ line: 2 })] }),
    context,
  );
  assert.equal(valid?.events[0].line, 2);

  assert.equal(
    normalizeExecutionTraceResult(traceMessage({ trace: [event({ line: 3 })] }), context),
    null,
  );
});

test("recursive trace values reject cycles, excessive depth, width, and strings", () => {
  const cyclic = {};
  cyclic.self = cyclic;

  let deeplyNested = "leaf";
  for (let depth = 0; depth < 80; depth += 1) deeplyNested = [deeplyNested];

  const hostileValues = [
    cyclic,
    deeplyNested,
    Array.from({ length: 10_000 }, (_, index) => index),
    "x".repeat(1_000_000),
  ];

  for (const value of hostileValues) {
    assert.equal(
      normalizeExecutionTraceEvents([event({ locals: { suspicious: value } })]),
      null,
    );
    assert.equal(
      normalizeExecutionTraceEvents([event({ kind: "return", returnValue: value })]),
      null,
    );
    assert.equal(
      normalizeExecutionTraceTestResult(result({ expected: value })),
      null,
    );
    assert.equal(
      normalizeExecutionTraceTestResult(result({ actual: value })),
      null,
    );
  }
});

test("variable changes compare against the next event in the same frame", () => {
  const events = [
    event({
      frameId: "outer",
      locals: { changed: 1, kept: "same", removed: 9 },
    }),
    event({
      frameId: "inner",
      depth: 1,
      locals: { changed: "belongs to another frame" },
    }),
    event({
      frameId: "outer",
      line: 2,
      locals: { added: [3], changed: 2, kept: "same" },
    }),
  ];

  assert.deepEqual(executionVariableChanges(events, 0), [
    { name: "added", kind: "added", before: undefined, after: [3] },
    { name: "changed", kind: "changed", before: 1, after: 2 },
    { name: "removed", kind: "removed", before: 9, after: undefined },
  ]);
  assert.deepEqual(executionVariableChanges(events, 1), []);
  assert.deepEqual(executionVariableChanges(events, 99), []);
});

test("exception explanations stay neutral because a later frame may catch them", () => {
  const exception = event({
    kind: "exception",
    error: { name: "ValueError", message: "bad input" },
  });
  const chinese = explainExecutionEvent(exception, "raise ValueError('bad input')", "zh");
  const english = explainExecutionEvent(exception, "raise ValueError('bad input')", "en");

  assert.match(chinese, /(?:异常|抛出)/);
  assert.match(chinese, /捕获/);
  assert.doesNotMatch(chinese, /(?:停止|终止)/);
  assert.match(english, /(?:exception|raised)/i);
  assert.match(english, /(?:caught|handled)/i);
  assert.doesNotMatch(english, /(?:stops?|terminates?)/i);
});

test("trace truncation preserves a trusted stop reason", () => {
  const limited = normalizeExecutionTraceResult(
    traceMessage({ truncated: true, stopReason: "event-limit" }),
    context,
  );
  assert.equal(limited?.truncated, true);
  assert.equal(limited?.stopReason, "event-limit");

  const payloadLimited = normalizeExecutionTraceResult(
    traceMessage({ truncated: true, stopReason: "payload-limit" }),
    context,
  );
  assert.equal(payloadLimited?.stopReason, "payload-limit");

  const complete = normalizeExecutionTraceResult(traceMessage(), context);
  assert.equal(complete?.truncated, false);
  assert.equal(complete?.stopReason, null);
  assert.equal(
    normalizeExecutionTraceResult(traceMessage({ stopReason: "untrusted-reason" }), context),
    null,
  );
});
