import assert from "node:assert/strict";
import test from "node:test";

import {
  createStudyBackup,
  MAX_BACKUP_CODE_LENGTH,
  MAX_BACKUP_LINE_NOTE_LENGTH,
  MAX_BACKUP_LINE_NOTES,
  MAX_BACKUP_NOTE_LENGTH,
  MAX_STUDY_BACKUP_BYTES,
  parseStudyBackup,
  restoreStudySnapshot,
  stringifyStudyBackup,
  StudyBackupError,
} from "../app/study-backup.ts";
import { MAX_COURSE_TEXT_LENGTH } from "../app/course-notes-model.ts";

const problems = [
  { id: 1, starterCode: "class Solution:\n    pass" },
  { id: 2, starterCode: "def answer():\n    pass" },
];

const safeCourse = {
  id: "ignored-by-normalizer",
  videoId: "ignored-by-normalizer",
  page: 9,
  sourceUrl: "https://www.bilibili.com/video/BV1B7411m7LV/?p=2",
  embedUrl: "https://evil.example/player",
  title: "Python 入门",
  transcript: "哈希表可以快速查找。",
  notes: "用空间换时间。",
  recognitionLanguage: "zh-CN",
  updatedAt: 123,
};

function sampleSource() {
  return {
    study: {
      selectedId: 2,
      records: {
        1: {
          code: "answer = 1",
          lineNotes: ["初始化答案"],
          thinking: "先观察输入",
          mistakes: "忘记边界",
          review: "明天再写",
          status: "learning",
        },
        999: { code: "unknown problem", status: "solved" },
      },
    },
    profile: {
      xp: 20.8,
      todayXp: 5,
      todayDate: "2026-07-14",
      streak: 2,
      lessons: 1,
      sprintBest: 3,
    },
    font: "20",
    language: "en",
    reminder: { enabled: true, time: "21:30" },
    course: {
      activeId: "BV1B7411m7LV:p2",
      courses: [
        { ...safeCourse },
        { ...safeCourse, sourceUrl: "https://evil.example/video/BV1B7411m7LV" },
      ],
    },
  };
}

function assertBackupError(code) {
  return (error) => error instanceof StudyBackupError && error.code === code;
}

test("creates a JSON-safe normalized backup and round-trips it", () => {
  const backup = createStudyBackup(sampleSource(), problems, new Date("2026-07-14T08:00:00.000Z"));

  assert.equal(backup.format, "tijiebu-backup");
  assert.equal(backup.version, 1);
  assert.equal(backup.exportedAt, "2026-07-14T08:00:00.000Z");
  assert.deepEqual(Object.keys(backup.study.records), ["1"]);
  assert.equal(backup.study.selectedId, 2);
  assert.equal(backup.study.records[1].code, "answer = 1");
  assert.equal(backup.profile.xp, 20);
  assert.equal(backup.font, 20);
  assert.equal(backup.language, "en");
  assert.equal(backup.course.courses.length, 1);
  assert.equal(new URL(backup.course.courses[0].embedUrl).origin, "https://player.bilibili.com");

  const serialized = stringifyStudyBackup(backup);
  assert.doesNotThrow(() => JSON.stringify(backup));
  assert.deepEqual(parseStudyBackup(serialized, problems), backup);
});

test("preserves every saved text field exactly instead of truncating it", () => {
  const source = sampleSource();
  source.study.records[1].code = "代".repeat(MAX_BACKUP_CODE_LENGTH);
  source.study.records[1].lineNotes = ["行".repeat(MAX_BACKUP_LINE_NOTE_LENGTH)];
  source.study.records[1].thinking = "想".repeat(MAX_BACKUP_NOTE_LENGTH);
  source.study.records[1].mistakes = "错".repeat(MAX_BACKUP_NOTE_LENGTH);
  source.study.records[1].review = "习".repeat(MAX_BACKUP_NOTE_LENGTH);
  source.course.courses = [{
    ...safeCourse,
    transcript: "听".repeat(MAX_COURSE_TEXT_LENGTH),
    notes: "记".repeat(MAX_COURSE_TEXT_LENGTH),
  }];

  const backup = createStudyBackup(source, problems, 0);
  assert.equal(backup.study.records[1].code, source.study.records[1].code);
  assert.deepEqual(backup.study.records[1].lineNotes, source.study.records[1].lineNotes);
  assert.equal(backup.study.records[1].thinking, source.study.records[1].thinking);
  assert.equal(backup.study.records[1].mistakes, source.study.records[1].mistakes);
  assert.equal(backup.study.records[1].review, source.study.records[1].review);
  assert.equal(backup.course.courses[0].transcript, source.course.courses[0].transcript);
  assert.equal(backup.course.courses[0].notes, source.course.courses[0].notes);
});

test("fails explicitly instead of shortening saved study or course text", () => {
  const oversizedCode = sampleSource();
  oversizedCode.study.records[1].code = "x".repeat(MAX_BACKUP_CODE_LENGTH + 1);
  assert.throws(() => createStudyBackup(oversizedCode, problems, 0), assertBackupError("too-large"));

  const oversizedLineNote = sampleSource();
  oversizedLineNote.study.records[1].lineNotes = ["n".repeat(MAX_BACKUP_LINE_NOTE_LENGTH + 1)];
  assert.throws(() => createStudyBackup(oversizedLineNote, problems, 0), assertBackupError("too-large"));

  const tooManyLineNotes = sampleSource();
  tooManyLineNotes.study.records[1].lineNotes = Array(MAX_BACKUP_LINE_NOTES + 1).fill("");
  assert.throws(() => createStudyBackup(tooManyLineNotes, problems, 0), assertBackupError("too-large"));

  const oversizedCourse = sampleSource();
  oversizedCourse.course.courses[0].transcript = "课".repeat(MAX_COURSE_TEXT_LENGTH + 1);
  assert.throws(() => createStudyBackup(oversizedCourse, problems, 0), assertBackupError("too-large"));
});

test("accepts the maximum legal Chinese course text above the old 6 MB ceiling", () => {
  const source = sampleSource();
  source.course = {
    activeId: "av1:p1",
    courses: Array.from({ length: 20 }, (_, index) => ({
      ...safeCourse,
      sourceUrl: `https://www.bilibili.com/video/av${index + 1}/?p=1`,
      transcript: "课".repeat(MAX_COURSE_TEXT_LENGTH),
      notes: "记".repeat(MAX_COURSE_TEXT_LENGTH),
    })),
  };

  const backup = createStudyBackup(source, problems, 0);
  const serialized = stringifyStudyBackup(backup);
  const byteLength = new TextEncoder().encode(serialized).byteLength;
  assert.ok(byteLength > 6 * 1024 * 1024);
  assert.ok(byteLength <= MAX_STUDY_BACKUP_BYTES);
  assert.deepEqual(parseStudyBackup(serialized, problems), backup);
});

test("rejects bad JSON, wrong envelopes, and future versions", () => {
  assert.throws(() => parseStudyBackup("{unfinished", problems), assertBackupError("invalid-json"));
  assert.throws(() => parseStudyBackup(JSON.stringify({ format: "some-other-app", version: 1 }), problems), assertBackupError("invalid-format"));

  const future = createStudyBackup(sampleSource(), problems, 0);
  future.version = 2;
  assert.throws(() => parseStudyBackup(JSON.stringify(future), problems), assertBackupError("unsupported-version"));

  const incomplete = createStudyBackup(sampleSource(), problems, 0);
  delete incomplete.course;
  assert.throws(() => parseStudyBackup(JSON.stringify(incomplete), problems), assertBackupError("invalid-format"));

  const nullPayload = createStudyBackup(sampleSource(), problems, 0);
  Object.assign(nullPayload, {
    study: null,
    profile: null,
    font: null,
    language: null,
    reminder: null,
    course: null,
  });
  assert.throws(() => parseStudyBackup(JSON.stringify(nullPayload), problems), assertBackupError("invalid-format"));

  const missingNestedRecords = createStudyBackup(sampleSource(), problems, 0);
  delete missingNestedRecords.study.records;
  assert.throws(() => parseStudyBackup(JSON.stringify(missingNestedRecords), problems), assertBackupError("invalid-format"));

  const missingRecordField = createStudyBackup(sampleSource(), problems, 0);
  delete missingRecordField.study.records[1].thinking;
  assert.throws(() => parseStudyBackup(JSON.stringify(missingRecordField), problems), assertBackupError("invalid-format"));

  const missingNestedCourses = createStudyBackup(sampleSource(), problems, 0);
  delete missingNestedCourses.course.courses;
  assert.throws(() => parseStudyBackup(JSON.stringify(missingNestedCourses), problems), assertBackupError("invalid-format"));
});

test("rejects backup text above the 24 MB limit before parsing", () => {
  const oversized = JSON.stringify({ padding: "x".repeat(MAX_STUDY_BACKUP_BYTES) });
  assert.throws(() => parseStudyBackup(oversized, problems), assertBackupError("too-large"));
});

test("rejects individually oversized imported fields instead of truncating them", () => {
  const oversizedCode = createStudyBackup(sampleSource(), problems, 0);
  oversizedCode.study.records[1].code = "x".repeat(MAX_BACKUP_CODE_LENGTH + 1);
  assert.throws(() => parseStudyBackup(JSON.stringify(oversizedCode), problems), assertBackupError("too-large"));

  const oversizedTranscript = createStudyBackup(sampleSource(), problems, 0);
  oversizedTranscript.course.courses[0].transcript = "课".repeat(MAX_COURSE_TEXT_LENGTH + 1);
  assert.throws(() => parseStudyBackup(JSON.stringify(oversizedTranscript), problems), assertBackupError("too-large"));
});

test("always disables imported reminders while retaining a valid time", () => {
  const unsafeImport = createStudyBackup(sampleSource(), problems, 0);
  unsafeImport.reminder = { enabled: true, time: "07:45" };

  const restored = parseStudyBackup(JSON.stringify(unsafeImport), problems);
  assert.deepEqual(restored.reminder, { enabled: false, time: "07:45" });
});

test("snapshot restoration verifies before finalizing and compensates on failure", async () => {
  const writes = [];
  const success = await restoreStudySnapshot("new", "old", {
    async write(value) { writes.push(value); },
    async finalize() { writes.push("finalized"); },
  });
  assert.deepEqual(success, { restored: true, rolledBack: false });
  assert.deepEqual(writes, ["new", "finalized"]);

  const rolledBackWrites = [];
  const rolledBack = await restoreStudySnapshot("new", "old", {
    async write(value) {
      rolledBackWrites.push(value);
      if (value === "new") throw new Error("storage full");
    },
    async finalize() {},
  });
  assert.deepEqual(rolledBack, { restored: false, rolledBack: true });
  assert.deepEqual(rolledBackWrites, ["new", "old"]);

  const finalizeWrites = [];
  const finalizeRolledBack = await restoreStudySnapshot("new", "old", {
    async write(value) { finalizeWrites.push(value); },
    async finalize() { throw new Error("notification cancellation failed"); },
  });
  assert.deepEqual(finalizeRolledBack, { restored: false, rolledBack: true });
  assert.deepEqual(finalizeWrites, ["new", "old"]);

  const rollbackFailed = await restoreStudySnapshot("new", "old", {
    async write() { throw new Error("storage unavailable"); },
    async finalize() {},
  });
  assert.deepEqual(rollbackFailed, { restored: false, rolledBack: false });
});
