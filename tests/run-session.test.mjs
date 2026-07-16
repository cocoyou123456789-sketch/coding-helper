import assert from "node:assert/strict";
import test from "node:test";

import { problemDetailsA } from "../app/problem-details-a.ts";
import { problemDetailsC } from "../app/problem-details-c.ts";
import { problemEnglishA } from "../app/problem-i18n-a.ts";
import { problemEnglishC } from "../app/problem-i18n-c.ts";
import { problems } from "../app/problems.ts";
import {
  beginnerPythonErrorHint,
  describeFirstMismatch,
  messageBelongsToRun,
  normalizeSignatureIssue,
  pythonErrorSummary,
  pythonSourceIsEmpty,
  solutionErrorLine,
  starterPlaceholderLine,
  starterRecoveryNeedsConfirmation,
} from "../app/run-session.ts";

test("every practice problem carries the exact LeetCode entry contract", () => {
  assert.equal(problems.length, 105);
  const solutionProblems = problems.filter((problem) => problem.signature.kind === "solution");
  const designProblems = problems.filter((problem) => problem.signature.kind === "design");
  assert.equal(solutionProblems.length, 101);
  assert.deepEqual(designProblems.map((problem) => problem.id), [146, 208, 155, 295]);

  for (const problem of solutionProblems) {
    assert.equal(problem.signature.className, "Solution", problem.title);
    assert.deepEqual(problem.signature.constructorParams, [], problem.title);
    assert.equal(problem.signature.methods.length, 1, problem.title);
    assert.match(problem.starterCode, /^class Solution:/, problem.title);
    const method = problem.signature.methods[0];
    assert.match(
      problem.starterCode,
      new RegExp(`^ {4}def ${method.name}\\(self, ${method.params.join(", ")}\\):`, "m"),
      problem.title,
    );
  }

  for (const problem of designProblems) {
    assert.match(problem.starterCode, new RegExp(`^class ${problem.signature.className}:`), problem.title);
    const constructorParams = ["self", ...problem.signature.constructorParams].join(", ");
    assert.match(problem.starterCode, new RegExp(`^ {4}def __init__\\(${constructorParams}\\):`, "m"), problem.title);
    for (const method of problem.signature.methods) {
      const params = ["self", ...method.params].join(", ");
      assert.match(problem.starterCode, new RegExp(`^ {4}def ${method.name}\\(${params}\\):`, "m"), problem.title);
    }
  }
});

test("the imported two-pointer lesson is unique, localized, and runnable", () => {
  const problemDetails = { ...problemDetailsA, ...problemDetailsC };
  const problemEnglish = { ...problemEnglishA, ...problemEnglishC };
  assert.equal(new Set(problems.map((problem) => problem.id)).size, problems.length);
  assert.equal(new Set(problems.map((problem) => problem.slug)).size, problems.length);

  const expected = new Map([
    [15, ["3sum", "threeSum", ["nums"]]],
    [167, ["two-sum-ii-input-array-is-sorted", "twoSum", ["numbers", "target"]]],
    [2824, ["count-pairs-whose-sum-is-less-than-target", "countPairs", ["nums", "target"]]],
    [16, ["3sum-closest", "threeSumClosest", ["nums", "target"]]],
    [18, ["4sum", "fourSum", ["nums", "target"]]],
    [611, ["valid-triangle-number", "triangleNumber", ["nums"]]],
  ]);

  for (const [id, [slug, methodName, params]] of expected) {
    const matches = problems.filter((problem) => problem.id === id);
    assert.equal(matches.length, 1, `problem ${id}`);
    assert.equal(matches[0].slug, slug, `problem ${id}`);
    assert.deepEqual(matches[0].signature.methods, [{ name: methodName, params }], `problem ${id}`);
    assert.ok(problemDetails[id], `Chinese detail ${id}`);
    assert.ok(problemEnglish[id], `English copy ${id}`);
  }
});

test("structured signature failures point beginners to the required declaration", () => {
  const twoSum = problems.find((problem) => problem.id === 1);
  const lru = problems.find((problem) => problem.id === 146);
  assert.ok(twoSum);
  assert.ok(lru);

  assert.deepEqual(
    normalizeSignatureIssue(
      { code: "missing_class", symbol: "Solution" },
      twoSum.signature,
      "class Answer:\n    def twoSum(self, nums, target):\n        return []",
    ),
    {
      code: "missing_class",
      kind: "class",
      symbol: "Solution",
      declaration: "class Solution:",
    },
  );

  const renamedMethod = normalizeSignatureIssue(
    { code: "missing_method", symbol: "twoSum" },
    twoSum.signature,
    "class Solution:\n    def two_sum(self, nums, target):\n        return []",
  );
  assert.equal(renamedMethod?.declaration, "class Solution:\n    def twoSum(self, nums, target):");
  assert.equal(renamedMethod?.focusLine, 1);
  assert.equal(renamedMethod?.focusKind, "class");

  const wrongArity = normalizeSignatureIssue(
    { code: "incompatible_parameters", symbol: "twoSum" },
    twoSum.signature,
    "class Helper:\n    def twoSum(self, nums, target):\n        return []\nclass Solution:\n    def twoSum(self, nums):\n        return []",
  );
  assert.equal(wrongArity?.kind, "method");
  assert.equal(wrongArity?.focusLine, 5);
  assert.equal(wrongArity?.focusKind, "declaration");

  const wrongConstructor = normalizeSignatureIssue(
    { code: "incompatible_parameters", symbol: "__init__" },
    lru.signature,
    "class LRUCache:\n    def __init__(self):\n        pass",
  );
  assert.equal(wrongConstructor?.declaration, "class LRUCache:\n    def __init__(self, capacity):");
  assert.equal(wrongConstructor?.focusLine, 2);

  const missingDesignMethod = normalizeSignatureIssue(
    { code: "missing_method", symbol: "get" },
    lru.signature,
    "# plan\n# keep\nclass LRUCache:\n    def fetch(self, key):\n        return -1",
  );
  assert.equal(missingDesignMethod?.declaration, "class LRUCache:\n    def get(self, key):");
  assert.equal(missingDesignMethod?.focusLine, 3);
  assert.equal(missingDesignMethod?.focusKind, "class");

  const noReliableClassCandidate = normalizeSignatureIssue(
    { code: "missing_class", symbol: "Solution" },
    twoSum.signature,
    "class Helper:\n    pass\nclass Soluton:\n    pass",
  );
  assert.equal(noReliableClassCandidate?.focusLine, undefined);
  assert.equal(noReliableClassCandidate?.focusKind, undefined);
});

test("malformed signature failures never become trusted repair advice", () => {
  const twoSum = problems.find((problem) => problem.id === 1);
  assert.ok(twoSum);
  const normalize = (value) => normalizeSignatureIssue(value, twoSum.signature, twoSum.starterCode);
  assert.equal(normalize(null), null);
  assert.equal(normalize({ code: "unknown", symbol: "Solution" }), null);
  assert.equal(normalize({ code: "missing_class", symbol: "twoSum" }), null);
  assert.equal(normalize({ code: "missing_method", symbol: "Solution" }), null);
  assert.equal(normalize({ code: "missing_method", symbol: "__init__" }), null);
  assert.equal(normalize({ code: "incompatible_parameters", symbol: "Solution" }), null);
  assert.equal(normalize({ code: "missing_method", symbol: "notRequired" }), null);
});

test("blank or comment-only Python is stopped before the worker runs", () => {
  assert.equal(pythonSourceIsEmpty(""), true);
  assert.equal(pythonSourceIsEmpty("  \n\t\n# still planning\n    # another note"), true);
  assert.equal(pythonSourceIsEmpty("class Solution:\n    pass"), false);
  assert.equal(pythonSourceIsEmpty("# plan\nanswer = 1"), false);
});

test("restoring comment plans or line notes always asks before replacing them", () => {
  assert.equal(starterRecoveryNeedsConfirmation("", []), false);
  assert.equal(starterRecoveryNeedsConfirmation("  \n", ["", "  "]), false);
  assert.equal(starterRecoveryNeedsConfirmation("# my approach", []), true);
  assert.equal(starterRecoveryNeedsConfirmation("", ["keep this explanation"]), true);
});

test("starter placeholder remains visible after harmless edits", () => {
  const starter = "class Solution:\n    def solve(self):\n        # write here\n        pass";
  assert.equal(starterPlaceholderLine(starter, starter), 4);
  assert.equal(starterPlaceholderLine(`\n${starter}\n`, starter), 5);
  assert.equal(starterPlaceholderLine(starter.replace("write here", "my plan"), starter), 4);
  assert.equal(starterPlaceholderLine(starter.replace("        pass", "\n        pass"), starter), 5);
  assert.equal(starterPlaceholderLine(starter.replace("        pass", "        seen = {}\n        pass"), starter), 5);
  assert.equal(starterPlaceholderLine(starter.replace("pass", "return 1"), starter), null);
  assert.equal(starterPlaceholderLine(starter.replace("        pass", "        if False:\n            pass\n        return 1"), starter), null);
});

test("multi-method design problems point to every remaining starter pass", () => {
  const expectedLines = new Map([
    [146, [7, 10]],
    [208, [7, 10, 13]],
    [155, [6, 9, 12, 15]],
    [295, [7, 10]],
  ]);
  const designProblems = problems.filter((problem) => expectedLines.has(problem.id));
  assert.equal(designProblems.length, expectedLines.size);

  for (const problem of designProblems) {
    const foundLines = [];
    let code = problem.starterCode;
    while (true) {
      const lineNumber = starterPlaceholderLine(code, problem.starterCode);
      if (lineNumber === null) break;
      foundLines.push(lineNumber);
      const lines = code.split("\n");
      lines[lineNumber - 1] = lines[lineNumber - 1].replace(/\bpass\b/, "return None");
      code = lines.join("\n");
    }
    assert.deepEqual(foundLines, expectedLines.get(problem.id), problem.title);
    assert.equal(starterPlaceholderLine(code, problem.starterCode), null);
  }
});

test("logical failures describe one concrete mismatch in either language", () => {
  assert.match(describeFirstMismatch([0, 2], [0, 3], "zh"), /结果\[1\].*预期 2.*实际 3/);
  assert.match(describeFirstMismatch({ rows: [[1], [2]] }, { rows: [[1], [9]] }, "en"), /result\.rows\[1\]\[0\].*expected 2.*got 9/);
  assert.match(describeFirstMismatch("cat", "car", "en"), /result\[2\].*"t".*"r"/);
  assert.match(describeFirstMismatch([1, 2, 3], [1, 2], "zh"), /长度不同.*预期 3.*实际 2/);
  assert.match(describeFirstMismatch({ answer: 1 }, {}, "zh"), /结果\.answer.*缺少/);
  assert.match(describeFirstMismatch([0, 1], null, "zh"), /Python 里的 None.*return/);
  assert.match(describeFirstMismatch(42, undefined, "en"), /Python None.*missing return/);
  assert.doesNotMatch(describeFirstMismatch(null, 1, "zh"), /漏写 return/);
});

test("run messages cannot leak into a newer problem request", () => {
  assert.equal(messageBelongsToRun({ type: "result", id: "1:4" }, "1:4"), true);
  assert.equal(messageBelongsToRun({ type: "result", id: "1:4" }, "2:5"), false);
  assert.equal(messageBelongsToRun({ type: "status", id: "1:4" }, "2:5"), false);
  assert.equal(messageBelongsToRun({ type: "status", phase: "runtime" }, "2:5"), true);
  assert.equal(messageBelongsToRun({ type: "error", phase: "loading" }, "2:5"), true);
  assert.equal(messageBelongsToRun({ type: "result" }, "2:5"), false);
});

test("source line extraction ignores the internal test expression", () => {
  assert.equal(solutionErrorLine('File "<solution>", line 7\nSyntaxError'), 7);
  assert.equal(solutionErrorLine("SyntaxError (<solution>, line 3)"), 3);
  assert.equal(solutionErrorLine('File "<solution>", line 6, in solve\nFile "<solution>", line 2, in helper\nNameError'), 2);
  assert.equal(solutionErrorLine('File "<test-expression>", line 1'), null);
  assert.equal(solutionErrorLine("no line here"), null);
});

test("learner-facing errors hide Pyodide traceback internals", () => {
  const traceback = `PythonError: Traceback (most recent call last):
  File "/lib/python3.13/site-packages/_pyodide/_base.py", line 1, in eval_code
  File "<solution>", line 4, in twoSum
NameError: name 'seen' is not defined`;
  const summary = pythonErrorSummary(traceback);
  assert.equal(summary, "NameError: name 'seen' is not defined");
  assert.doesNotMatch(summary, /_pyodide|Traceback|<solution>/);
  assert.equal(pythonErrorSummary("plain runner failure"), "plain runner failure");
});

test("beginner hints translate common Python errors", () => {
  assert.match(beginnerPythonErrorHint("IndentationError: unexpected indent", "zh"), /缩进/);
  assert.match(beginnerPythonErrorHint("NameError: name nums is not defined", "en"), /Unknown name/);
  assert.match(beginnerPythonErrorHint("TypeError: 'NoneType' object is not iterable", "zh"), /没有返回答案.*return/);
  assert.match(beginnerPythonErrorHint("TypeError: cannot unpack non-iterable NoneType object", "en"), /returned no answer.*return/);
  const nonePointerHint = beginnerPythonErrorHint("AttributeError: 'NoneType' object has no attribute 'next'", "zh");
  assert.match(nonePointerHint, /变量或指针.*None/);
  assert.doesNotMatch(nonePointerHint, /没有返回答案/);
  assert.match(beginnerPythonErrorHint("ValueError: invalid literal", "zh"), /转换或使用/);
  assert.match(beginnerPythonErrorHint("RecursionError: maximum recursion depth exceeded", "en"), /base case/);
  assert.match(beginnerPythonErrorHint("Something else", "zh"), /第一条错误/);
});
