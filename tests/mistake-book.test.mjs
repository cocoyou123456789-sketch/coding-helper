import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  compareMistakeAnswers,
  createCurrentProblemMistake,
  createExternalMistake,
  createMistakeEntryId,
  emptyMistakeBookStore,
  MAX_MISTAKE_ANSWER_LENGTH,
  MAX_MISTAKE_ANSWER_LINES,
  MAX_MISTAKE_ENTRIES,
  mergeMistakeEntryDraft,
  mistakeBookStoreIssue,
  mistakeEntryIssue,
  MistakeBookValidationError,
  normalizeAnswerLine,
  parseMistakeBookStore,
  removeMistakeEntry,
  serializeMistakeBookStore,
  upsertMistakeEntry,
} from "../app/mistake-book.ts";

function externalEntry(index = 1, overrides = {}) {
  return createExternalMistake({
    title: `Imported ${index}`,
    sourceUrl: `https://leetcode.com/problems/example-${index}/`,
    prompt: "Return the result.",
    language: "python",
    myAnswer: "return value",
    referenceAnswer: "return value",
    ...overrides,
  }, 1_000 + index, `import-test-${index}`);
}

test("creates stable current-problem entries and explicit external imports", () => {
  const current = createCurrentProblemMistake({
    problemId: 1,
    title: " 两数之和 ",
    sourceUrl: " https://leetcode.cn/problems/two-sum/ ",
    prompt: "返回两个下标",
    language: "python",
    myAnswer: "class Solution: pass",
  }, 123);
  assert.deepEqual(current, {
    id: "current-1",
    origin: "current",
    title: "两数之和",
    sourceUrl: "https://leetcode.cn/problems/two-sum/",
    prompt: "返回两个下标",
    language: "python",
    myAnswer: "class Solution: pass",
    referenceAnswer: "",
    rootCause: "",
    takeaway: "",
    status: "unreviewed",
    createdAt: 123,
    updatedAt: 123,
  });

  const imported = externalEntry(2, { language: "typescript" });
  assert.equal(imported.id, "import-test-2");
  assert.equal(imported.origin, "external");
  assert.equal(imported.language, "typescript");
  assert.equal(imported.referenceAnswer, "return value");
});

test("creates secure import ids on every supported runtime", () => {
  assert.match(createMistakeEntryId(), /^import-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("strict validation rejects unsafe URLs, unknown fields, bad timestamps, and oversized answers", () => {
  const valid = externalEntry();
  assert.equal(mistakeEntryIssue(valid), null);

  assert.deepEqual(
    mistakeEntryIssue({ ...valid, sourceUrl: "javascript:alert(1)" }),
    { code: "invalid", field: "sourceUrl" },
  );
  assert.deepEqual(
    mistakeEntryIssue({ ...valid, sourceUrl: "https://user:secret@example.com/problem" }),
    { code: "invalid", field: "sourceUrl" },
  );
  assert.deepEqual(
    mistakeEntryIssue({ ...valid, unexpected: true }),
    { code: "invalid", field: "entry" },
  );
  assert.deepEqual(
    mistakeEntryIssue({ ...valid, updatedAt: valid.createdAt - 1 }),
    { code: "invalid", field: "updatedAt" },
  );
  assert.deepEqual(
    mistakeEntryIssue({ ...valid, myAnswer: "x".repeat(MAX_MISTAKE_ANSWER_LENGTH + 1) }),
    { code: "too-large", field: "myAnswer" },
  );
  assert.deepEqual(
    mistakeEntryIssue({ ...valid, myAnswer: Array(MAX_MISTAKE_ANSWER_LINES + 1).fill("x").join("\n") }),
    { code: "too-large", field: "myAnswer" },
  );
  assert.deepEqual(
    mistakeEntryIssue({ ...valid, myAnswer: Array(MAX_MISTAKE_ANSWER_LINES + 1).fill("x").join("\r") }),
    { code: "too-large", field: "myAnswer" },
  );
});

test("store parsing is strict, bounded, duplicate-safe, and returns a defensive clone", () => {
  const first = externalEntry(1);
  const original = { version: 1, entries: [first] };
  const parsed = parseMistakeBookStore(original);
  assert.deepEqual(parsed, original);
  assert.notEqual(parsed, original);
  assert.notEqual(parsed.entries, original.entries);
  assert.notEqual(parsed.entries[0], original.entries[0]);

  parsed.entries[0].title = "Changed clone";
  assert.equal(original.entries[0].title, "Imported 1");
  assert.deepEqual(JSON.parse(serializeMistakeBookStore(original)), original);

  assert.throws(
    () => parseMistakeBookStore({ version: 1, entries: [first, first] }),
    (error) => error instanceof MistakeBookValidationError && error.issue.code === "duplicate",
  );
  assert.throws(
    () => parseMistakeBookStore({ version: 2, entries: [] }),
    MistakeBookValidationError,
  );
  assert.throws(
    () => parseMistakeBookStore({ version: 1, entries: [], extra: true }),
    MistakeBookValidationError,
  );

  const tooMany = Array.from({ length: MAX_MISTAKE_ENTRIES + 1 }, (_, index) => externalEntry(index + 1));
  assert.deepEqual(
    mistakeBookStoreIssue({ version: 1, entries: tooMany }),
    { code: "too-large", field: "entries" },
  );
});

test("whole-store character limits prevent a valid-looking import from exhausting local storage", () => {
  const largeAnswer = "x".repeat(MAX_MISTAKE_ANSWER_LENGTH);
  const entries = Array.from({ length: 21 }, (_, index) => externalEntry(index + 1, {
    myAnswer: largeAnswer,
    referenceAnswer: "",
  }));
  assert.deepEqual(
    mistakeBookStoreIssue({ version: 1, entries }),
    { code: "too-large", field: "mistakeBook" },
  );
});

test("upsert and remove keep immutable, newest-first stores", () => {
  const empty = emptyMistakeBookStore();
  const first = externalEntry(1);
  const second = externalEntry(2);
  const firstResult = upsertMistakeEntry(empty, first);
  assert.equal(firstResult.ok, true);
  if (!firstResult.ok) return;
  assert.deepEqual(empty.entries, []);

  const secondResult = upsertMistakeEntry(firstResult.store, second);
  assert.equal(secondResult.ok, true);
  if (!secondResult.ok) return;
  assert.deepEqual(secondResult.store.entries.map((entry) => entry.id), [second.id, first.id]);

  const revised = { ...first, title: "Revised", updatedAt: 9_000 };
  const revisedResult = upsertMistakeEntry(secondResult.store, revised);
  assert.equal(revisedResult.ok, true);
  if (!revisedResult.ok) return;
  assert.equal(revisedResult.store.entries[0].title, "Revised");
  assert.equal(secondResult.store.entries[1].title, "Imported 1");

  const removed = removeMistakeEntry(revisedResult.store, first.id);
  assert.deepEqual(removed.entries.map((entry) => entry.id), [second.id]);
});

test("three-way draft merging preserves edits and reports only unresolved conflicts", () => {
  const base = externalEntry(8);

  const incomingOnly = { ...base, takeaway: "remote signal", updatedAt: base.updatedAt + 1 };
  const clean = mergeMistakeEntryDraft(base, base, incomingOnly);
  assert.equal(clean.entry.takeaway, "remote signal");
  assert.deepEqual(clean.conflictFields, []);

  const localOnly = { ...base, rootCause: "local cause" };
  const local = mergeMistakeEntryDraft(base, localOnly, incomingOnly);
  assert.equal(local.entry.rootCause, "local cause");
  assert.equal(local.entry.takeaway, "remote signal");
  assert.deepEqual(local.conflictFields, []);

  const divergent = mergeMistakeEntryDraft(
    base,
    { ...base, rootCause: "local cause" },
    { ...base, rootCause: "remote cause", updatedAt: base.updatedAt + 2 },
  );
  assert.equal(divergent.entry.rootCause, "local cause");
  assert.deepEqual(divergent.conflictFields, ["rootCause"]);

  const sameChange = mergeMistakeEntryDraft(
    base,
    { ...base, rootCause: "same cause" },
    { ...base, rootCause: "same cause", updatedAt: base.updatedAt + 3 },
  );
  assert.deepEqual(sameChange.conflictFields, []);

  const stillConflicted = mergeMistakeEntryDraft(
    { ...base, rootCause: "remote cause", updatedAt: base.updatedAt + 2 },
    divergent.entry,
    { ...base, rootCause: "remote cause", takeaway: "new remote signal", updatedAt: base.updatedAt + 4 },
    divergent.conflictFields,
  );
  assert.deepEqual(stillConflicted.conflictFields, ["rootCause"]);
  assert.equal(stillConflicted.entry.takeaway, "new remote signal");

  const resolved = mergeMistakeEntryDraft(
    { ...base, rootCause: "remote cause", updatedAt: base.updatedAt + 2 },
    { ...divergent.entry, rootCause: "remote cause" },
    { ...base, rootCause: "remote cause", updatedAt: base.updatedAt + 5 },
    divergent.conflictFields,
  );
  assert.deepEqual(resolved.conflictFields, []);

  assert.throws(() => mergeMistakeEntryDraft(base, { ...base, id: "other" }, incomingOnly));
});

test("line LCS preserves meaningful whitespace and ignores only trailing spaces", () => {
  const mine = [
    "def solve(nums):",
    "    total = sum(nums)",
    "",
    "    return total",
  ].join("\n");
  const reference = [
    "def solve(nums):",
    "\ttotal=sum(nums)",
    "    return total",
    "# checked",
  ].join("\n");
  const comparison = compareMistakeAnswers(mine, reference);

  assert.deepEqual(comparison.summary, {
    common: 2,
    onlyMine: 1,
    onlyReference: 2,
    similarity: 4 / 7,
  });
  assert.ok(comparison.lines.some((line) => line.kind === "mine" && line.mineText === "    total = sum(nums)"));
  assert.ok(comparison.lines.some((line) => line.kind === "reference" && line.referenceText === "\ttotal=sum(nums)"));
  assert.ok(comparison.lines.some((line) => line.kind === "mine" && line.mineText === ""));
  assert.ok(comparison.lines.some((line) => line.kind === "reference" && line.referenceText === "# checked"));
  assert.equal(normalizeAnswerLine("  return  x + 1 \t"), "  return  x + 1");
  assert.equal(compareMistakeAnswers('print("a b")', 'print("ab")').summary.common, 0);
});

test("line comparison is deterministic for additions, removals, and empty answers", () => {
  const comparison = compareMistakeAnswers("a\nb\nc", "a\nx\nc");
  assert.deepEqual(comparison.lines.map((line) => line.kind), ["same", "mine", "reference", "same"]);
  assert.deepEqual(comparison.summary, {
    common: 2,
    onlyMine: 1,
    onlyReference: 1,
    similarity: 2 / 3,
  });

  assert.deepEqual(compareMistakeAnswers("  \n", "\t\n").summary, {
    common: 0,
    onlyMine: 0,
    onlyReference: 0,
    similarity: null,
  });
  assert.deepEqual(compareMistakeAnswers("answer", "").summary, {
    common: 0,
    onlyMine: 1,
    onlyReference: 0,
    similarity: 0,
  });

  const bounded = compareMistakeAnswers(
    Array.from({ length: MAX_MISTAKE_ANSWER_LINES + 50 }, (_, index) => `mine ${index}`).join("\n"),
    "reference",
  );
  assert.deepEqual(bounded.truncated, { mine: true, reference: false });
  assert.equal(bounded.summary.onlyMine, MAX_MISTAKE_ANSWER_LINES);
});

test("panel stays persistence-agnostic, bilingual, accessible, and mobile-friendly", async () => {
  const panelSource = await readFile(new URL("../app/mistake-book-panel.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/mistake-book-panel.module.css", import.meta.url), "utf8");
  const noteImageStyles = await readFile(new URL("../app/note-image-panel.module.css", import.meta.url), "utf8");

  assert.match(panelSource, /onSave\(entry: MistakeEntry\): Promise<void>/);
  assert.match(panelSource, /onDelete\(entryId: string\): Promise<void>/);
  assert.doesNotMatch(panelSource, /localStorage|indexedDB|getLargeStoredValue|setStoredValue/);
  assert.match(panelSource, /它不是 AI/);
  assert.match(panelSource, /It is not AI/);
  assert.match(panelSource, /Only trailing whitespace is ignored/);
  assert.match(panelSource, /beforeunload/);
  assert.match(panelSource, /function canLeaveReview/);
  assert.match(panelSource, /window\.confirm\(text\.discardConfirm\)/);
  assert.match(panelSource, /sourceSignature: editableEntrySignature\(entry\)/);
  assert.match(panelSource, /mergeMistakeEntryDraft\(/);
  assert.match(panelSource, /draftState\.conflictFields\.filter\(\(field\) => field !== resolvedField\)/);
  assert.match(
    panelSource,
    /if \(!requestedEntry\) return;[\s\S]*?requestAnimationFrame\(\(\) => \{\s*handledSelectionSequenceRef\.current = selectionRequest\.sequence/,
  );
  assert.match(panelSource, /draftState\.sourceUpdatedAt === selectedEntry\.updatedAt \|\| storedDraftDirty/);
  assert.match(panelSource, /requestAnimationFrame\(\(\) => detailHeadingRef\.current\?\.focus\(\)\)/);
  assert.match(panelSource, /ref=\{detailHeadingRef\} tabIndex=\{-1\}/);
  assert.match(panelSource, /role="table"/);
  assert.match(panelSource, /role="columnheader"/);
  assert.match(panelSource, /role="rowgroup"/);
  assert.match(panelSource, /role="cell"/);
  assert.doesNotMatch(panelSource, /<main\b/);
  assert.match(panelSource, /aria-current/);
  assert.match(panelSource, /role=\{messageIsError \? "alert" : "status"\}/);
  assert.match(styles, /min-height: 44px/);
  assert.match(styles, /\.detailHeader h3:focus-visible/);
  assert.match(styles, /\.visuallyHidden/);
  assert.match(styles, /@media \(max-width: 760px\)/);
  assert.match(styles, /grid-template-columns: repeat\(2, minmax\(300px, 1fr\)\)/);
  assert.match(styles, /\.diffHeader \{\s*display: none;/);
  assert.match(styles, /\.diffLines li \{\s*grid-template-columns: 1fr;\s*min-width: 0;/);
  assert.match(styles, /\.diffLines \.visuallyHidden \{[\s\S]*?position: static;/);
  assert.match(noteImageStyles, /\.captionField input \{[\s\S]*?min-height: 44px/);
  assert.match(noteImageStyles, /\.deleteButton \{[\s\S]*?min-height: 44px/);
});
