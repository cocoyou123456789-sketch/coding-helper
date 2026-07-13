import assert from "node:assert/strict";
import test from "node:test";

import {
  practiceCompletionProgress,
  practiceKeyLineIndexes,
} from "../app/practice-completion.ts";

test("completion notes count algorithm lines instead of starter scaffolding", () => {
  const code = [
    "class Solution:",
    "    def solve(self, nums):",
    "        # remember seen values",
    "        seen = {}",
    "        return len(nums)",
  ].join("\n");

  assert.deepEqual(practiceKeyLineIndexes(code), [3, 4]);

  assert.deepEqual(practiceCompletionProgress(code, [], ""), {
    explainedKeyLines: 0,
    requiredKeyLines: 2,
    hasRecognitionSignal: false,
    notesReady: false,
  });

  const notes = ["class", "function", "comment", "save values", "return length"];
  assert.deepEqual(practiceCompletionProgress(code, notes, "看到重复查找，想到哈希表"), {
    explainedKeyLines: 2,
    requiredKeyLines: 2,
    hasRecognitionSignal: true,
    notesReady: true,
  });
});

test("a one-line solution asks for only one explanation", () => {
  const progress = practiceCompletionProgress(
    "class Solution:\n    def solve(self):\n        return 1",
    ["", "", "return the answer"],
    "constant answer",
  );
  assert.equal(progress.requiredKeyLines, 1);
  assert.equal(progress.notesReady, true);
});

test("starter scaffolding and generated suggestions do not count as personal reflection", () => {
  const scaffoldOnly = practiceCompletionProgress(
    "class Solution:\n    def solve(self):\n        pass",
    ["class note", "function note", "pass note"],
    "I recognize it",
  );
  assert.equal(scaffoldOnly.requiredKeyLines, 0);
  assert.equal(scaffoldOnly.notesReady, false);

  const code = "class Solution:\n    def solve(self):\n        return 1";
  const suggestions = ["class", "function", ["返回常数。", "Return a constant."]];
  assert.deepEqual(practiceCompletionProgress(
    code,
    ["", "", "  Return a constant.  "],
    "   ",
    suggestions,
  ), {
    explainedKeyLines: 0,
    requiredKeyLines: 1,
    hasRecognitionSignal: false,
    notesReady: false,
  });
});
