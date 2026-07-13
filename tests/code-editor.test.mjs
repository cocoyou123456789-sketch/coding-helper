import assert from "node:assert/strict";
import test from "node:test";

import {
  editForBackspace,
  editForBracket,
  editForEnter,
  editForTab,
  syncLineNotes,
} from "../app/code-editor.ts";

test("Enter follows Python indentation and places the caret correctly", () => {
  const classLine = "class Solution:";
  const classEdit = editForEnter(classLine, classLine.length, classLine.length);
  assert.equal(classEdit.code, "class Solution:\n    ");
  assert.equal(classEdit.selectionStart, classEdit.code.length);
  assert.equal(classEdit.selectionEnd, classEdit.code.length);

  const methodLine = "class Solution:\n    def twoSum(self, nums, target):";
  const methodEdit = editForEnter(methodLine, methodLine.length, methodLine.length);
  assert.equal(methodEdit.code, `${methodLine}\n        `);

  const ordinaryLine = "        seen = {}";
  assert.equal(
    editForEnter(ordinaryLine, ordinaryLine.length, ordinaryLine.length).code,
    `${ordinaryLine}\n        `,
  );
});

test("Enter recognizes Python comments without treating string colons as blocks", () => {
  const blockWithComment = "if target:  # we found it";
  assert.equal(
    editForEnter(blockWithComment, blockWithComment.length, blockWithComment.length).code,
    `${blockWithComment}\n    `,
  );

  const stringLine = "message = 'value:'";
  assert.equal(
    editForEnter(stringLine, stringLine.length, stringLine.length).code,
    `${stringLine}\n`,
  );

  const selectedCode = "if ready: pass";
  const selectedEdit = editForEnter(selectedCode, "if ready:".length, selectedCode.length);
  assert.equal(selectedEdit.code, "if ready:\n    ");
  assert.equal(selectedEdit.selectionStart, selectedEdit.code.length);

  const tripleQuotedString = 'text = """value:';
  assert.equal(
    editForEnter(tripleQuotedString, tripleQuotedString.length, tripleQuotedString.length).code,
    `${tripleQuotedString}\n`,
  );

  const closedMultilineString = 'if ready: """doc\nmore"""';
  assert.equal(
    editForEnter(closedMultilineString, closedMultilineString.length, closedMultilineString.length).code,
    `${closedMultilineString}\n`,
  );
});

test("Enter expands an empty bracket pair onto aligned lines", () => {
  const code = "nums = []";
  const caret = code.indexOf("]");
  const edit = editForEnter(code, caret, caret);
  assert.equal(edit.code, "nums = [\n    \n]");
  assert.equal(edit.selectionStart, "nums = [\n    ".length);
  assert.equal(edit.selectionStart, edit.selectionEnd);
});

test("Tab uses four-column stops and preserves multiline selections", () => {
  const caretEdit = editForTab("  value", 2, 2);
  assert.equal(caretEdit.code, "    value");
  assert.deepEqual([caretEdit.selectionStart, caretEdit.selectionEnd], [4, 4]);

  const tabColumnEdit = editForTab("\tfoo", 1, 1);
  assert.equal(tabColumnEdit.code, "\t    foo");
  assert.deepEqual([tabColumnEdit.selectionStart, tabColumnEdit.selectionEnd], [5, 5]);

  const selectionEdit = editForTab("a\nb\nc", 0, 3);
  assert.equal(selectionEdit.code, "    a\n    b\nc");
  assert.deepEqual([selectionEdit.selectionStart, selectionEdit.selectionEnd], [4, 11]);

  const lineBoundaryEdit = editForTab("a\nb", 0, 2);
  assert.equal(lineBoundaryEdit.code, "    a\nb");
  assert.deepEqual([lineBoundaryEdit.selectionStart, lineBoundaryEdit.selectionEnd], [4, 6]);
});

test("Shift+Tab removes at most one indentation level per selected line", () => {
  const selectionEdit = editForTab("    a\n  b", 0, 9, true);
  assert.equal(selectionEdit.code, "a\nb");
  assert.deepEqual([selectionEdit.selectionStart, selectionEdit.selectionEnd], [0, 3]);

  const caretEdit = editForTab("        value", 8, 8, true);
  assert.equal(caretEdit.code, "    value");
  assert.deepEqual([caretEdit.selectionStart, caretEdit.selectionEnd], [4, 4]);

  const partialIndentSelection = editForTab("    a\n    b", 0, 8, true);
  assert.equal(partialIndentSelection.code, "a\nb");
  assert.deepEqual(
    [partialIndentSelection.selectionStart, partialIndentSelection.selectionEnd],
    [0, 2],
  );

  const mixedIndentEdit = editForTab("  \tvalue", 3, 3, true);
  assert.equal(mixedIndentEdit.code, "value");
  assert.deepEqual([mixedIndentEdit.selectionStart, mixedIndentEdit.selectionEnd], [0, 0]);
});

test("Backspace removes one indent stop or an empty bracket pair", () => {
  const indentEdit = editForBackspace("      value", 6, 6);
  assert.ok(indentEdit);
  assert.equal(indentEdit.code, "    value");
  assert.deepEqual([indentEdit.selectionStart, indentEdit.selectionEnd], [4, 4]);

  const pairEdit = editForBackspace("print()", 6, 6);
  assert.ok(pairEdit);
  assert.equal(pairEdit.code, "print");
  assert.deepEqual([pairEdit.selectionStart, pairEdit.selectionEnd], [5, 5]);
});

test("bracket keys pair, wrap selections, and step over existing closers", () => {
  const pairEdit = editForBracket("print", 5, 5, "(");
  assert.ok(pairEdit);
  assert.equal(pairEdit.code, "print()");
  assert.deepEqual([pairEdit.selectionStart, pairEdit.selectionEnd], [6, 6]);

  const closerEdit = editForBracket(pairEdit.code, 6, 6, ")");
  assert.ok(closerEdit);
  assert.equal(closerEdit.code, "print()");
  assert.deepEqual([closerEdit.selectionStart, closerEdit.selectionEnd], [7, 7]);

  const wrapEdit = editForBracket("value", 0, 5, "[");
  assert.ok(wrapEdit);
  assert.equal(wrapEdit.code, "[value]");
  assert.deepEqual([wrapEdit.selectionStart, wrapEdit.selectionEnd], [1, 6]);
});

test("line notes stay attached when code rows are inserted, removed, or edited", () => {
  assert.deepEqual(syncLineNotes("a\nb", "a\n\nb", ["A", "B"]), ["A", "", "B"]);
  assert.deepEqual(syncLineNotes("a\nb\nc", "a\nc", ["A", "B", "C"]), ["A", "C"]);
  assert.deepEqual(syncLineNotes("a\nb\nc", "a\nB\nc", ["A", "B note", "C"]), ["A", "B note", "C"]);
  assert.deepEqual(syncLineNotes("alpha", "al\npha", ["Alpha note"]), ["Alpha note", ""]);
  assert.deepEqual(syncLineNotes("a\nb", "    a\n    b", ["A", "B"]), ["A", "B"]);
  assert.deepEqual(
    syncLineNotes("a\nb\nc", "a\nx\nb\nC", ["A", "B", "C"]),
    ["A", "", "B", "C"],
  );
  assert.deepEqual(
    syncLineNotes("a\na", "a\na\na", ["first", "second"], {
      start: 0,
      end: 0,
      insertedText: "a\n",
    }),
    ["", "first", "second"],
  );
});
