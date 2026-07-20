import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  MAX_CODE_LAYER_CHARACTERS,
  MAX_CODE_LAYER_LINE_CHARACTERS,
  MAX_CODE_LAYER_LINES,
  analyzePythonCodeLayers,
} from "../app/code-layer-analysis.ts";
import {
  fillEmptyLayerNotes,
  invalidateChangedAutomaticLayerNotes,
  isAutomaticLayerNote,
  stripAutomaticLayerNotePrefix,
} from "../app/code-layer-notes.js";

test("maps a LeetCode solution from class to function, loop, condition, and return", () => {
  const code = [
    "class Solution:",
    "    def twoSum(self, nums, target):",
    "        seen = {}",
    "        for index, number in enumerate(nums):",
    "            need = target - number",
    "            if need in seen:",
    "                return [seen[need], index]",
    "            seen[number] = index",
  ].join("\n");

  const result = analyzePythonCodeLayers(code, "zh");
  assert.equal(result.maxDepth, 5);
  assert.equal(result.blockCount, 4);
  assert.equal(result.meaningfulLines, 8);
  assert.deepEqual(
    result.lines.map(({ lineNumber, depth, parentLine, kind }) => ({ lineNumber, depth, parentLine, kind })),
    [
      { lineNumber: 1, depth: 1, parentLine: null, kind: "class" },
      { lineNumber: 2, depth: 2, parentLine: 1, kind: "function" },
      { lineNumber: 3, depth: 3, parentLine: 2, kind: "assignment" },
      { lineNumber: 4, depth: 3, parentLine: 2, kind: "loop" },
      { lineNumber: 5, depth: 4, parentLine: 4, kind: "assignment" },
      { lineNumber: 6, depth: 4, parentLine: 4, kind: "condition" },
      { lineNumber: 7, depth: 5, parentLine: 6, kind: "return" },
      { lineNumber: 8, depth: 4, parentLine: 4, kind: "assignment" },
    ],
  );
  assert.deepEqual(result.lines[6].path, [
    "类 Solution",
    "函数 twoSum",
    "遍历 enumerate(nums)",
    "判断 need in seen",
  ]);
  assert.match(result.lines[4].explanation, /target - number/);
  assert.match(result.lines[7].explanation, /seen\[number\]/);
  assert.equal(isAutomaticLayerNote(result.lines[6].note), true);
});

test("keeps if, elif, and else as sibling layers with separate child bodies", () => {
  const code = [
    "def label(value):",
    "    if value > 0:",
    "        return 'positive'",
    "    elif value == 0:",
    "        return 'zero'",
    "    else:",
    "        return 'negative'",
  ].join("\n");
  const result = analyzePythonCodeLayers(code, "en");

  assert.deepEqual(result.lines.slice(1).map((line) => line.depth), [2, 3, 2, 3, 2, 3]);
  assert.deepEqual(result.lines.slice(1).map((line) => line.parentLine), [1, 2, 1, 4, 1, 6]);
  assert.match(result.lines[4].path.at(-1) ?? "", /Check value == 0/);
  assert.match(result.lines[6].path.at(-1) ?? "", /Fallback branch/);
});

test("uses the Python syntax tree so multiline headers and calls do not invent nested layers", () => {
  const code = [
    "def solve(",
    "    nums,",
    "    target,",
    "):",
    "    answer = helper(",
    "        nums,",
    "        target,",
    "    )",
    "    if (",
    "        answer == target",
    "    ):",
    "        return answer",
    "    return None",
  ].join("\n");
  const result = analyzePythonCodeLayers(code, "en");

  assert.deepEqual(result.lines.slice(0, 4).map((line) => line.depth), [1, 1, 1, 1]);
  assert.deepEqual(result.lines.slice(4, 11).map((line) => line.depth), [2, 2, 2, 2, 2, 2, 2]);
  assert.deepEqual(result.lines.slice(5, 8).map((line) => line.kind), ["continuation", "continuation", "continuation"]);
  assert.equal(result.lines[11].depth, 3);
  assert.equal(result.lines[11].parentLine, 9);
  assert.match(result.lines[8].explanation, /answer == target/);
  assert.match(result.lines[9].explanation, /one statement/);
});

test("comparisons, hashes, and colons inside strings stay ordinary statements", () => {
  const code = [
    "def check(value):",
    "    text = '# not a comment: still text'",
    "    if value == text:",
    "        print('x:y # z')",
  ].join("\n");
  const result = analyzePythonCodeLayers(code, "en");

  assert.equal(result.lines[1].kind, "assignment");
  assert.equal(result.lines[2].kind, "condition");
  assert.equal(result.lines[3].kind, "call");
  assert.equal(result.lines[3].depth, 3);
});

test("keyword arguments inside calls are not mistaken for assignments", () => {
  const result = analyzePythonCodeLayers([
    "print(value, sep=':')",
    "numbers.sort(reverse=True)",
    "seen[number] = index",
  ].join("\n"), "en");

  assert.deepEqual(result.lines.map((line) => line.kind), ["call", "mutation", "assignment"]);
  assert.match(result.lines[0].explanation, /^Call /);
  assert.match(result.lines[1].explanation, /^Call /);
  assert.match(result.lines[2].explanation, /store it in/);
});

test("slice colons, loop else, try else, heap calls, and inline comments stay truthful", () => {
  const slices = analyzePythonCodeLayers([
    "if nums[left:right]:",
    "    return nums[left:right]  # selected slice",
    "for value in nums[left:right]:",
    "    pass",
  ].join("\n"), "en");
  assert.match(slices.lines[0].explanation, /nums\[left:right\]/);
  assert.match(slices.lines[1].explanation, /nums\[left:right\]/);
  assert.match(slices.lines[2].explanation, /nums\[left:right\]/);
  assert.doesNotMatch(slices.lines[1].explanation, /selected slice/);

  const branches = analyzePythonCodeLayers([
    "for value in values:",
    "    if value < 0:",
    "        break",
    "else:",
    "    finished = True",
    "try:",
    "    risky()",
    "except ValueError:",
    "    recover()",
    "else:",
    "    commit()",
  ].join("\n"), "en");
  assert.match(branches.lines[3].explanation, /without hitting break/);
  assert.match(branches.lines[9].explanation, /without raising an exception/);

  const heap = analyzePythonCodeLayers("heapq.heappush(heap, value)", "en").lines[0];
  assert.equal(heap.kind, "mutation");
  assert.match(heap.explanation, /heap stored in heap/);
  assert.doesNotMatch(heap.explanation, /stored in heapq/);
});

test("every physical line of a multiline docstring is described as text", () => {
  const result = analyzePythonCodeLayers([
    "def explain():",
    "    \"\"\"first line",
    "    second line: # still text",
    "    \"\"\"",
    "    return 1",
  ].join("\n"), "en");

  assert.deepEqual(result.lines.slice(1, 4).map((line) => line.kind), ["comment", "comment", "comment"]);
  assert.match(result.lines[2].explanation, /multiline string/);
});

test("augmented and chained assignments explain their real targets", () => {
  const result = analyzePythonCodeLayers([
    "count //= 2",
    "mask |= 1",
    "shift <<= 2",
    "a = b = 1",
  ].join("\n"), "en");

  assert.deepEqual(result.lines.map((line) => line.kind), [
    "assignment",
    "assignment",
    "assignment",
    "assignment",
  ]);
  assert.match(result.lines[0].label, /count$/);
  assert.match(result.lines[0].explanation, /apply \/\/=/);
  assert.match(result.lines[1].label, /mask$/);
  assert.match(result.lines[1].explanation, /apply \|=/);
  assert.match(result.lines[2].explanation, /apply <<=/);
  assert.match(result.lines[3].explanation, /Compute 1 once/);
  assert.match(result.lines[3].explanation, /a, b/);
  assert.doesNotMatch(result.lines[3].explanation, /Compute b = 1/);
});

test("tokens inside strings, annotations, lambdas, and same-name methods stay conservative", () => {
  const result = analyzePythonCodeLayers([
    "message = 'show += here'",
    "print('items.append(value)')",
    "memo: dict[int, int] = {}",
    "f = lambda x=1: x + 1",
    "operator.add(a, b)",
    "items.append(value)",
    "x = 1; y = 2",
  ].join("\n"), "en");

  assert.equal(result.lines[0].kind, "assignment");
  assert.match(result.lines[0].explanation, /save the result as message/);
  assert.doesNotMatch(result.lines[0].explanation, /apply \+=/);
  assert.equal(result.lines[1].kind, "call");
  assert.doesNotMatch(result.lines[1].explanation, /changes that container/);
  assert.match(result.lines[2].explanation, /save the result as memo: dict/);
  assert.doesNotMatch(result.lines[2].explanation, /selected position or key/);
  assert.match(result.lines[3].explanation, /save the result as f/);
  assert.doesNotMatch(result.lines[3].explanation, /f, lambda x/);
  assert.equal(result.lines[4].kind, "call");
  assert.equal(result.lines[5].kind, "mutation");
  assert.match(result.lines[5].explanation, /custom object's type decides/);
  assert.match(result.lines[6].explanation, /multiple statements/);
});

test("incomplete and very large Python degrades safely without executing source", () => {
  const incomplete = "def solve(nums):\n    for number in nums:\n        if number >\n            return number";
  const incompleteResult = analyzePythonCodeLayers(incomplete, "zh");
  assert.ok(incompleteResult.lines.length > 0);
  assert.equal(incompleteResult.lines[2].incomplete, true);
  assert.match(incompleteResult.lines[2].explanation, /还没写完整/);
  assert.doesNotMatch(incompleteResult.lines[2].explanation, /只有结果为真/);

  const missingColon = analyzePythonCodeLayers("def solve(nums)\n    return 1", "en");
  assert.equal(missingColon.lines[0].incomplete, true);
  assert.match(missingColon.lines[0].explanation, /incomplete/);
  assert.doesNotMatch(missingColon.lines[0].explanation, /Define solve/);

  const tooManyLines = Array.from({ length: MAX_CODE_LAYER_LINES + 50 }, () => "value = 1").join("\n");
  const lineLimited = analyzePythonCodeLayers(tooManyLines, "en");
  assert.equal(lineLimited.lines.length, MAX_CODE_LAYER_LINES);
  assert.equal(lineLimited.truncated, true);

  const tooManyCharacters = `value = "${"x".repeat(MAX_CODE_LAYER_CHARACTERS)}"`;
  assert.equal(analyzePythonCodeLayers(tooManyCharacters, "en").truncated, true);

  const longLine = analyzePythonCodeLayers("x".repeat(MAX_CODE_LAYER_LINE_CHARACTERS + 500), "en");
  assert.equal(longLine.truncated, true);
  assert.equal(longLine.lines[0].text.length, MAX_CODE_LAYER_LINE_CHARACTERS);
});

test("the local explainer contains no code execution or network path", async () => {
  const source = await readFile(new URL("../app/code-layer-analysis.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /\beval\s*\(/);
  assert.doesNotMatch(source, /\bFunction\s*\(/);
  assert.doesNotMatch(source, /\bfetch\s*\(/);
});

test("automatic notes fill only real blank lines and never replace learner writing", () => {
  const merged = fillEmptyLayerNotes(
    "first = 1\n\nreturn first",
    ["my own explanation", "", ""],
    ["automatic first", "automatic blank", "automatic return"],
  );
  assert.deepEqual(merged, {
    filled: 1,
    lineNotes: ["my own explanation", "", "automatic return"],
  });
});

test("automatic notes refresh or clear after code changes while learner notes survive", () => {
  const refreshed = fillEmptyLayerNotes(
    "left = len(nums) - 1",
    ["【自动分层解释】旧说明：计算 0。"],
    ["【自动分层解释】新说明：计算 len(nums) - 1。"],
  );
  assert.equal(refreshed.filled, 1);
  assert.deepEqual(refreshed.lineNotes, ["【自动分层解释】新说明：计算 len(nums) - 1。"]);

  assert.deepEqual(
    invalidateChangedAutomaticLayerNotes(
      "left = 0\nright = 1",
      "left = len(nums) - 1\nright = 1",
      ["【自动分层解释】旧说明", "我自己的解释"],
    ),
    ["", "我自己的解释"],
  );
});

test("editing an automatic note removes its provenance prefix so reflection can count", () => {
  const automatic = "【自动分层解释】第 3 层：先计算右边。";
  assert.equal(isAutomaticLayerNote(automatic), true);
  const edited = stripAutomaticLayerNotePrefix(`${automatic} 我理解成先算再存。`);
  assert.equal(edited, "第 3 层：先计算右边。 我理解成先算再存。");
  assert.equal(isAutomaticLayerNote(edited), false);
});
