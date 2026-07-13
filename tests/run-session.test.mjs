import assert from "node:assert/strict";
import test from "node:test";

import {
  beginnerPythonErrorHint,
  messageBelongsToRun,
  solutionErrorLine,
} from "../app/run-session.ts";

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
