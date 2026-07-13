import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeLearningProfile,
  normalizeSavedStudy,
  normalizeStudyRecord,
  parseStoredJson,
} from "../app/study-storage.ts";

const problems = [
  { id: 1, starterCode: "class Solution:\n    pass" },
  { id: 2, starterCode: "def answer():\n    pass" },
];

test("a damaged record falls back to safe starter values", () => {
  const record = normalizeStudyRecord(problems[0], {
    code: null,
    lineNotes: ["first", 42, null],
    thinking: { invalid: true },
    mistakes: "off by one",
    status: "not-a-status",
  });

  assert.equal(record.code, problems[0].starterCode);
  assert.deepEqual(record.lineNotes, ["first", "", ""]);
  assert.equal(record.thinking, "");
  assert.equal(record.mistakes, "off by one");
  assert.equal(record.status, "todo");
});

test("saved study keeps only known problems and a valid selection", () => {
  const normalized = normalizeSavedStudy({
    version: 1,
    selectedId: 2,
    records: {
      1: { code: "answer = 1", status: "learning" },
      999: { code: "unknown" },
    },
  }, problems);

  assert.deepEqual(Object.keys(normalized.records), ["1"]);
  assert.equal(normalized.records[1].code, "answer = 1");
  assert.equal(normalized.records[1].status, "learning");
  assert.equal(normalized.selectedId, 2);
  assert.deepEqual(normalizeSavedStudy({ records: null, selectedId: 999 }, problems), { records: {}, selectedId: undefined });
});

test("profile counters cannot become invalid numbers", () => {
  assert.deepEqual(normalizeLearningProfile({
    xp: -5,
    todayXp: Number.NaN,
    todayDate: "tomorrow",
    streak: 2.9,
    lessons: "4",
    sprintBest: 7,
  }), {
    xp: 0,
    todayXp: 0,
    todayDate: "",
    streak: 2,
    lessons: 0,
    sprintBest: 7,
  });
});

test("invalid saved JSON can be discarded without blocking startup", () => {
  assert.equal(parseStoredJson("{unfinished"), undefined);
  assert.deepEqual(parseStoredJson('{"records":{}}'), { records: {} });
  assert.deepEqual(normalizeSavedStudy(parseStoredJson("not-json"), problems), { records: {} });
});
