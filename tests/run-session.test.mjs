import assert from "node:assert/strict";
import test from "node:test";

import { problems } from "../app/problems.ts";
import {
  beginnerPythonErrorHint,
  describeFirstMismatch,
  messageBelongsToRun,
  pythonSourceIsEmpty,
  solutionErrorLine,
  starterPlaceholderLine,
  starterRecoveryNeedsConfirmation,
} from "../app/run-session.ts";

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
  assert.equal(solutionErrorLine('File "<test-expression>", line 1'), null);
  assert.equal(solutionErrorLine("no line here"), null);
});

test("beginner hints translate common Python errors", () => {
  assert.match(beginnerPythonErrorHint("IndentationError: unexpected indent", "zh"), /缩进/);
  assert.match(beginnerPythonErrorHint("NameError: name nums is not defined", "en"), /Unknown name/);
  assert.match(beginnerPythonErrorHint("Something else", "zh"), /第一条错误/);
});
