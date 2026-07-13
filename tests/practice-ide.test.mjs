import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const file = (path) => new URL(`../${path}`, import.meta.url);

test("the practice workspace uses a real Python editor and familiar IDE controls", async () => {
  const [page, editor, styles] = await Promise.all([
    readFile(file("app/page.tsx"), "utf8"),
    readFile(file("app/leetcode-code-editor.tsx"), "utf8"),
    readFile(file("app/practice-ide.module.css"), "utf8"),
  ]);

  assert.match(page, /LeetCodeCodeEditor/);
  assert.match(page, /去 LeetCode 提交/);
  assert.match(page, /setShowProblemList/);
  assert.match(page, /setShowNotesDrawer/);
  assert.match(page, /messageBelongsToRun/);
  assert.match(page, /activeRunRef/);
  assert.match(page, /cancelActiveRun/);
  assert.match(page, /noteLineMode/);
  assert.match(page, /noteLineIndexes/);
  assert.match(page, /onCursorLineChange/);
  assert.doesNotMatch(page, /if \(allPassed\) updateRecord\(\{ status: "solved" \}\)/);
  assert.doesNotMatch(page, /className="code-field"/);

  assert.match(editor, /EditorView/);
  assert.match(editor, /python\(\)/);
  assert.match(editor, /pythonLanguage\.data\.of/);
  assert.match(editor, /snippetCompletion/);
  assert.match(editor, /Mod-Enter/);
  assert.match(editor, /indentWithTab/);
  assert.match(editor, /onCursorLineChangeRef/);
  assert.match(editor, /update\.selectionSet/);

  assert.match(styles, /grid-template-columns: minmax\(330px, 42%\)/);
  assert.match(styles, /\.notesDrawer/);
  assert.match(styles, /--ide-caption: max\(12px/);
  assert.match(styles, /\.errorCoach/);
  assert.match(styles, /\.lineNoteNavigator/);
  assert.match(styles, /\.navigatorActive/);
  assert.match(styles, /@media \(max-width: 760px\)/);
});
