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
import { emptyNoteImageStore, MAX_NOTE_IMAGE_DIMENSION } from "../app/note-images.ts";
import { emptyMistakeBookStore } from "../app/mistake-book.ts";

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

function jpegDataUrl(width = 320, height = 180) {
  const bytes = [
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01,
    0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x01,
    0x03, 0x11, 0x01,
    0xff, 0xda, 0x00, 0x0c, 0x03,
    0x01, 0x00, 0x02, 0x11, 0x03, 0x11,
    0x00, 0x3f, 0x00,
    0x00,
    0xff, 0xd9,
  ];
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

function safeNoteImages() {
  return {
    version: 1,
    byProblem: {
      1: [{
        id: "image-note-1",
        dataUrl: jpegDataUrl(),
        width: 320,
        height: 180,
        caption: "画出哈希表查找过程",
        createdAt: 1_752_480_000_000,
      }],
    },
  };
}

function safeMistakeBook() {
  return {
    version: 1,
    entries: [{
      id: "current-1",
      origin: "current",
      title: "1. 两数之和",
      sourceUrl: "https://leetcode.cn/problems/two-sum/description/",
      prompt: "返回两个下标。",
      language: "python",
      myAnswer: "return []",
      referenceAnswer: "return [0, 1]",
      rootCause: "没有保存下标。",
      takeaway: "配对查找先想哈希表。",
      status: "reviewing",
      createdAt: 1_752_480_000_000,
      updatedAt: 1_752_480_000_001,
    }],
  };
}

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
    noteImages: safeNoteImages(),
    mistakeBook: safeMistakeBook(),
  };
}

function assertBackupError(code) {
  return (error) => error instanceof StudyBackupError && error.code === code;
}

test("creates a JSON-safe normalized backup and round-trips it", () => {
  const backup = createStudyBackup(sampleSource(), problems, new Date("2026-07-14T08:00:00.000Z"));

  assert.equal(backup.format, "tijiebu-backup");
  assert.equal(backup.version, 3);
  assert.equal(backup.exportedAt, "2026-07-14T08:00:00.000Z");
  assert.deepEqual(Object.keys(backup.study.records), ["1"]);
  assert.equal(backup.study.selectedId, 2);
  assert.equal(backup.study.records[1].code, "answer = 1");
  assert.equal(backup.profile.xp, 20);
  assert.equal(backup.font, 20);
  assert.equal(backup.language, "en");
  assert.equal(backup.course.courses.length, 1);
  assert.equal(new URL(backup.course.courses[0].embedUrl).origin, "https://player.bilibili.com");
  assert.deepEqual(backup.noteImages, safeNoteImages());
  assert.deepEqual(backup.mistakeBook, safeMistakeBook());

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

test("refuses to create an incomplete backup when a local library is missing", () => {
  const missingNoteImages = sampleSource();
  delete missingNoteImages.noteImages;
  assert.throws(
    () => createStudyBackup(missingNoteImages, problems, 0),
    assertBackupError("invalid-format"),
  );

  const missingMistakeBook = sampleSource();
  delete missingMistakeBook.mistakeBook;
  assert.throws(
    () => createStudyBackup(missingMistakeBook, problems, 0),
    assertBackupError("invalid-format"),
  );
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
  future.version = 4;
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

test("imports version 1 and 2 backups without silently accepting newer fields", () => {
  const legacy = structuredClone(createStudyBackup(sampleSource(), problems, 0));
  legacy.version = 1;
  delete legacy.noteImages;
  delete legacy.mistakeBook;

  const restored = parseStudyBackup(JSON.stringify(legacy), problems);
  assert.equal(restored.version, 3);
  assert.deepEqual(restored.noteImages, emptyNoteImageStore());
  assert.deepEqual(restored.mistakeBook, emptyMistakeBookStore());

  legacy.noteImages = safeNoteImages();
  assert.throws(() => parseStudyBackup(JSON.stringify(legacy), problems), assertBackupError("invalid-format"));

  const versionTwo = structuredClone(createStudyBackup(sampleSource(), problems, 0));
  versionTwo.version = 2;
  delete versionTwo.mistakeBook;
  const restoredVersionTwo = parseStudyBackup(JSON.stringify(versionTwo), problems);
  assert.equal(restoredVersionTwo.version, 3);
  assert.deepEqual(restoredVersionTwo.noteImages, safeNoteImages());
  assert.deepEqual(restoredVersionTwo.mistakeBook, emptyMistakeBookStore());

  versionTwo.mistakeBook = safeMistakeBook();
  assert.throws(() => parseStudyBackup(JSON.stringify(versionTwo), problems), assertBackupError("invalid-format"));
});

test("requires current local libraries and validates JPEG frame dimensions", () => {
  const missing = createStudyBackup(sampleSource(), problems, 0);
  delete missing.noteImages;
  assert.throws(() => parseStudyBackup(JSON.stringify(missing), problems), assertBackupError("invalid-format"));

  const missingMistakeBook = createStudyBackup(sampleSource(), problems, 0);
  delete missingMistakeBook.mistakeBook;
  assert.throws(() => parseStudyBackup(JSON.stringify(missingMistakeBook), problems), assertBackupError("invalid-format"));

  const falsifiedDimensions = createStudyBackup(sampleSource(), problems, 0);
  falsifiedDimensions.noteImages.byProblem[1][0].width = 319;
  assert.throws(
    () => parseStudyBackup(JSON.stringify(falsifiedDimensions), problems),
    assertBackupError("invalid-format"),
  );

  const hiddenOversizedFrame = createStudyBackup(sampleSource(), problems, 0);
  hiddenOversizedFrame.noteImages.byProblem[1][0].dataUrl = jpegDataUrl(MAX_NOTE_IMAGE_DIMENSION + 1, 1);
  hiddenOversizedFrame.noteImages.byProblem[1][0].width = 1;
  hiddenOversizedFrame.noteImages.byProblem[1][0].height = 1;
  assert.throws(
    () => parseStudyBackup(JSON.stringify(hiddenOversizedFrame), problems),
    assertBackupError("invalid-format"),
  );

  const unknownProblem = createStudyBackup(sampleSource(), problems, 0);
  unknownProblem.noteImages.byProblem[999] = unknownProblem.noteImages.byProblem[1];
  delete unknownProblem.noteImages.byProblem[1];
  assert.throws(() => parseStudyBackup(JSON.stringify(unknownProblem), problems), assertBackupError("invalid-format"));
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
