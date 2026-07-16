import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { loadPyodide } from "pyodide";

import {
  animatedReferenceProblemIds,
  referenceSolutionFor,
} from "../app/reference-solutions.ts";
import { normalizeExecutionTraceResult } from "../app/execution-trace.ts";
import { problems } from "../app/problems.ts";

const expectedIds = [15, 16, 18, 167, 611, 2824];
const pyodidePromise = loadPyodide();
const workerSource = await readFile(new URL("../public/python-worker-trace-v2.js", import.meta.url), "utf8");

function rawPythonConstant(name) {
  const declaration = `const ${name} = String.raw\``;
  const start = workerSource.indexOf(declaration);
  assert.ok(start >= 0, `${name} declaration`);
  const bodyStart = workerSource.indexOf("`", start) + 1;
  const end = workerSource.indexOf("\n`;", bodyStart);
  assert.ok(end > bodyStart, `${name} terminator`);
  return workerSource.slice(bodyStart, end);
}

const pythonPrelude = rawPythonConstant("PYTHON_PRELUDE");
const pythonTraceSupport = rawPythonConstant("PYTHON_TRACE_SUPPORT");

test("the animation library contains exactly the imported two-pointer references", () => {
  assert.deepEqual([...animatedReferenceProblemIds].toSorted((left, right) => left - right), expectedIds);
  assert.equal(referenceSolutionFor(1), "");

  for (const id of expectedIds) {
    const problem = problems.find((candidate) => candidate.id === id);
    const code = referenceSolutionFor(id);
    assert.ok(problem, `problem ${id}`);
    assert.ok(code.trim(), `reference ${id}`);
    assert.doesNotMatch(code, /\bpass\b/, `reference ${id}`);
    assert.match(code, /^class Solution:/, `reference ${id}`);

    const method = problem.signature.methods[0];
    const declaration = `def ${method.name}(self, ${method.params.join(", ")}):`;
    assert.match(code, new RegExp(`^ {4}${declaration.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "m"), `reference ${id}`);
  }
});

test("every bundled reference passes every quick test shown by the site", { timeout: 30_000 }, async () => {
  const pyodide = await pyodidePromise;

  for (const id of expectedIds) {
    const problem = problems.find((candidate) => candidate.id === id);
    assert.ok(problem, `problem ${id}`);
    const methodName = problem.signature.methods[0].name;
    const globals = pyodide.runPython("dict()");

    try {
      globals.set("__reference_code", referenceSolutionFor(id));
      globals.set("__method_name", methodName);
      await pyodide.runPythonAsync(
        [
          "import json",
          "exec(compile(__reference_code, '<solution>', 'exec'), globals(), globals())",
          "__solution = Solution()",
          "globals()[__method_name] = getattr(__solution, __method_name)",
        ].join("\n"),
        { globals },
      );

      for (const [index, quickTest] of problem.tests.entries()) {
        globals.set("__expression", quickTest.expression);
        globals.set("__expected_json", JSON.stringify(quickTest.expected));
        const passed = pyodide.runPython(
          [
            "__actual = eval(__expression, globals(), globals())",
            "__expected = json.loads(__expected_json)",
            "__actual == __expected",
          ].join("\n"),
          { globals },
        );
        const actual = String(pyodide.runPython("repr(__actual)", { globals }));
        assert.equal(
          passed,
          true,
          `problem ${id}, quick test ${index + 1} (${quickTest.inputLabel}): got ${actual}`,
        );
      }
    } finally {
      globals.destroy();
    }
  }
});

async function traceCode(pyodide, code, expression, expected) {
  const globals = pyodide.runPython("dict()");
  try {
    await pyodide.runPythonAsync(pythonPrelude, { globals });
    globals.set("__user_code", code);
    await pyodide.runPythonAsync(
      [
        "exec(compile(__user_code, '<solution>', 'exec'), globals(), globals())",
        "__solution_instance = Solution()",
        "for __method_name in dir(__solution_instance):",
        "    if not __method_name.startswith('_'):",
        "        __method = getattr(__solution_instance, __method_name)",
        "        if callable(__method): globals()[__method_name] = __method",
      ].join("\n"),
      { globals },
    );
    await pyodide.runPythonAsync(pythonTraceSupport, { globals });
    globals.set("__test_expression", expression);
    globals.set("__expected_json", JSON.stringify(expected));
    await pyodide.runPythonAsync(
      [
        "__trace_support['reset']()",
        "__trace_error = None",
        "__trace_has_actual = False",
        "__trace_limited = False",
        "try:",
        "    __trace_support['enable']()",
        "    with redirect_stdout(__stdout_buffer):",
        "        __actual = eval(compile(__test_expression, '<test-expression>', 'eval'), globals(), globals())",
        "    __trace_has_actual = True",
        "except __trace_support['limit']:",
        "    __trace_limited = True",
        "except __trace_support['baseException'] as __caught_error:",
        "    __trace_error = {'name': __trace_support['typeName'](__caught_error), 'message': __trace_support['errorMessage'](__caught_error, 2000), 'traceback': ''}",
        "finally:",
        "    __trace_support['disable']()",
        "__trace_actual_snapshot = None",
        "__trace_actual_complete = False",
        "if __trace_has_actual:",
        "    __trace_result_payload = __trace_support['resultSnapshot'](__actual)",
        "    __trace_actual_snapshot = __trace_result_payload['value']",
        "    __trace_actual_complete = bool(__trace_result_payload['complete'])",
        "__expected = json.loads(__expected_json)",
        "__passed = bool(__trace_has_actual and __trace_support['judgeEqual'](__actual, __expected))",
      ].join("\n"),
      { globals },
    );
    const parse = (pythonExpression) => JSON.parse(pyodide.runPython(
      `json.dumps(_jsonable(${pythonExpression}), ensure_ascii=False, allow_nan=True)`,
      { globals },
    ));
    const events = parse("__trace_support['state']['events']");
    const truncated = Boolean(pyodide.runPython("__trace_support['state']['truncated']", { globals }));
    const stopReason = parse("__trace_support['state']['stopReason']");
    const error = parse("__trace_error");
    const hasActual = Boolean(pyodide.runPython("__trace_has_actual", { globals }));
    const actual = hasActual ? parse("__trace_actual_snapshot") : null;
    const passed = Boolean(pyodide.runPython("__passed", { globals }));
    const stdout = String(pyodide.runPython("__stdout_buffer.getvalue()", { globals }));
    const result = {
      index: 0,
      name: "test",
      expression,
      expected,
      actual,
      hasActual,
      passed,
      error,
      duration: 1,
    };
    return {
      actual,
      actualComplete: Boolean(pyodide.runPython("__trace_actual_complete", { globals })),
      events,
      error,
      hasActual,
      limited: Boolean(pyodide.runPython("__trace_limited", { globals })),
      message: { trace: events, truncated, stopReason, result, stdout, duration: 1 },
      passed,
      stdout,
      stopReason,
      truncated,
    };
  } finally {
    globals.destroy();
  }
}

test("the real trace support handles success, caught errors, failures, limits, and hostile display methods", { timeout: 30_000 }, async () => {
  const pyodide = await pyodidePromise;
  const correct = await traceCode(
    pyodide,
    "class Solution:\n    def solve(self, nums):\n        total = 0\n        for number in nums:\n            total += number\n        return total",
    "solve([1,2,3])",
    6,
  );
  assert.equal(correct.passed, true);
  assert.ok(correct.events.some((event) => event.kind === "line" && event.line === 5));

  const caught = await traceCode(
    pyodide,
    "class Solution:\n    def solve(self):\n        try:\n            1 / 0\n        except ZeroDivisionError:\n            answer = 7\n        return answer",
    "solve()",
    7,
  );
  assert.equal(caught.passed, true);
  assert.ok(caught.events.some((event) => event.kind === "exception"));
  assert.ok(caught.events.some((event) => event.kind === "line" && event.line === 7));

  const failed = await traceCode(
    pyodide,
    "class Solution:\n    def solve(self):\n        values = []\n        return values[0]",
    "solve()",
    null,
  );
  assert.equal(failed.error.name, "IndexError");
  assert.equal(failed.hasActual, false);
  assert.equal(failed.truncated, false);

  const limited = await traceCode(
    pyodide,
    "class Solution:\n    def solve(self):\n        count = 0\n        while True:\n            count += 1",
    "solve()",
    null,
  );
  assert.equal(limited.truncated, true);
  assert.equal(limited.stopReason, "event-limit");
  assert.equal(limited.events.length, 240);
  assert.equal(limited.error, null);
  assert.equal(limited.hasActual, false);
  assert.equal(limited.limited, true);

  const hostile = await traceCode(
    pyodide,
    "class Evil:\n    def __repr__(self):\n        raise RuntimeError('repr must not run')\n    def __str__(self):\n        raise RuntimeError('str must not run')\nclass Solution:\n    def solve(self):\n        evil = Evil()\n        huge_range = range(10 ** 12)\n        huge_int = 1 << 200000\n        return 1",
    "solve()",
    1,
  );
  assert.equal(hostile.passed, true);
  assert.ok(hostile.events.some((event) => event.locals.evil === "<Evil>"));
  assert.ok(hostile.events.some((event) => event.locals.huge_int === "<very large int>"));

  const hostileReturn = await traceCode(
    pyodide,
    "class Evil:\n    def __repr__(self):\n        raise RuntimeError('repr must not run')\n    def __str__(self):\n        raise RuntimeError('str must not run')\nclass Solution:\n    def solve(self):\n        return Evil()",
    "solve()",
    null,
  );
  assert.equal(hostileReturn.error, null);
  assert.equal(hostileReturn.hasActual, true);
  assert.equal(hostileReturn.actual, "<Evil>");
  assert.equal(hostileReturn.actualComplete, false);
  assert.equal(hostileReturn.passed, false);
});

test("trace results stay truthful when display snapshots are large or have typed dictionary keys", { timeout: 30_000 }, async () => {
  const pyodide = await pyodidePromise;
  const sixtyFive = Array.from({ length: 65 }, (_, index) => index);
  const medium = await traceCode(
    pyodide,
    "class Solution:\n    def solve(self):\n        return list(range(65))",
    "solve()",
    sixtyFive,
  );
  assert.equal(medium.passed, true);
  assert.equal(medium.actual.length, 65);
  assert.ok(normalizeExecutionTraceResult(medium.message, {
    source: "mine",
    code: "class Solution:\n    def solve(self):\n        return list(range(65))",
    testIndex: 0,
  }));

  const twoHundredFifty = Array.from({ length: 250 }, (_, index) => index);
  const large = await traceCode(
    pyodide,
    "class Solution:\n    def solve(self):\n        return list(range(250))",
    "solve()",
    twoHundredFifty,
  );
  assert.equal(large.passed, true);
  assert.equal(large.actualComplete, false);
  assert.equal(large.actual.length, 201);
  assert.ok(normalizeExecutionTraceResult(large.message, {
    source: "mine",
    code: "class Solution:\n    def solve(self):\n        return list(range(250))",
    testIndex: 0,
  }));

  const typedKeys = await traceCode(
    pyodide,
    "class Solution:\n    def solve(self):\n        return {1: 'number', '1': 'string'}",
    "solve()",
    { 1: "string" },
  );
  assert.equal(typedKeys.passed, false);
  assert.equal(typedKeys.actual.__executionTraceType, "dict");
  assert.deepEqual(typedKeys.actual.entries.map((entry) => entry[0]), [1, "1"]);
});

test("trace output, finally unwinds, and generator pauses are represented safely", { timeout: 30_000 }, async () => {
  const pyodide = await pyodidePromise;
  const noisy = await traceCode(
    pyodide,
    "class Solution:\n    def solve(self):\n        print('x' * 150000)\n        return 1",
    "solve()",
    1,
  );
  assert.ok(noisy.stdout.length <= 100000);
  assert.match(noisy.stdout, /stdout was shortened/);

  const unwind = await traceCode(
    pyodide,
    "class Solution:\n    def solve(self):\n        try:\n            1 / 0\n        finally:\n            marker = 'cleanup'",
    "solve()",
    null,
  );
  assert.equal(unwind.error.name, "ZeroDivisionError");
  assert.ok(unwind.events.some((event) => event.kind === "return" && event.unwind === true));

  const caughtNone = await traceCode(
    pyodide,
    "class Solution:\n    def solve(self):\n        try:\n            1 / 0\n        except ZeroDivisionError:\n            return None",
    "solve()",
    null,
  );
  assert.equal(caughtNone.passed, true);
  assert.ok(caughtNone.events.some((event) => event.kind === "return" && event.unwind !== true && event.returnValue === null));

  const generator = await traceCode(
    pyodide,
    "class Solution:\n    def values(self):\n        yield 1\n        yield 2\n        return 3\n    def solve(self):\n        return list(self.values())",
    "solve()",
    [1, 2],
  );
  assert.equal(generator.passed, true);
  const pauses = generator.events.filter((event) => event.kind === "yield");
  assert.equal(pauses.length, 2);
  assert.equal(new Set(pauses.map((event) => event.frameId)).size, 1);
  assert.ok(generator.events.some((event) => event.kind === "resume"));
  assert.equal(
    generator.events.filter((event) => event.kind === "return" && event.functionName === "values").length,
    1,
  );
});
