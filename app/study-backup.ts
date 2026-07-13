// @ts-expect-error Node's strip-types test runner needs the explicit source extension.
import { MAX_COURSES, MAX_COURSE_TEXT_LENGTH, normalizeCourseStore, type CourseStore } from "./course-notes-model.ts";
// @ts-expect-error Node's strip-types test runner needs the explicit source extension.
import { normalizeLearningProfile, normalizeSavedStudy, type StudyRecord, type StudyRecords, STUDY_STORAGE_VERSION } from "./study-storage.ts";
import type { LearningProfile } from "./learning-hub";
import type { DailyReminder } from "./native-app";
import type { Problem } from "./problems";

export const STUDY_BACKUP_FORMAT = "tijiebu-backup";
export const STUDY_BACKUP_VERSION = 1;
// Twenty courses can legally contain 4,000,000 Chinese characters across
// transcripts and notes (roughly 12 MB as UTF-8). Keep enough headroom for
// problem work while still bounding the memory used to parse an import.
export const MAX_STUDY_BACKUP_BYTES = 24 * 1024 * 1024;

export const MAX_BACKUP_CODE_LENGTH = 100_000;
export const MAX_BACKUP_NOTE_LENGTH = 50_000;
export const MAX_BACKUP_LINE_NOTE_LENGTH = 4_000;
export const MAX_BACKUP_LINE_NOTES = 5_000;

const MIN_FONT_SIZE = 16;
const MAX_FONT_SIZE = 24;
const DEFAULT_FONT_SIZE = 18;
const DEFAULT_REMINDER_TIME = "20:00";
const MAX_BACKUP_COURSE_TITLE_LENGTH = 160;
const MAX_BACKUP_COURSE_URL_LENGTH = 2_048;
const MAX_BACKUP_COURSE_ID_LENGTH = 256;
const VALID_STATUSES = new Set(["todo", "learning", "solved", "review"]);

export type BackupLanguage = "zh" | "en";

export type BackupStudy = {
  version: typeof STUDY_STORAGE_VERSION;
  records: StudyRecords;
  selectedId?: number;
};

export type StudyBackupSource = {
  study: unknown;
  profile: unknown;
  font: unknown;
  language: unknown;
  reminder: unknown;
  course: unknown;
};

export type StudyBackup = {
  format: typeof STUDY_BACKUP_FORMAT;
  version: typeof STUDY_BACKUP_VERSION;
  exportedAt: string;
  study: BackupStudy;
  profile: LearningProfile;
  font: number;
  language: BackupLanguage;
  reminder: DailyReminder;
  course: CourseStore;
};

export type StudyBackupErrorCode =
  | "too-large"
  | "invalid-json"
  | "invalid-format"
  | "unsupported-version";

export class StudyBackupError extends Error {
  readonly code: StudyBackupErrorCode;

  constructor(code: StudyBackupErrorCode, message: string) {
    super(message);
    this.name = "StudyBackupError";
    this.code = code;
  }
}

export type StudySnapshotRestoreResult =
  | { restored: true; rolledBack: false }
  | { restored: false; rolledBack: boolean };

export async function restoreStudySnapshot<T>(
  next: T,
  previous: T,
  operations: {
    write(snapshot: T): Promise<void>;
    finalize(): Promise<void>;
  },
): Promise<StudySnapshotRestoreResult> {
  try {
    await operations.write(next);
    await operations.finalize();
    return { restored: true, rolledBack: false };
  } catch {
    try {
      await operations.write(previous);
      return { restored: false, rolledBack: true };
    } catch {
      return { restored: false, rolledBack: false };
    }
  }
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function invalidFormat(message: string): never {
  throw new StudyBackupError("invalid-format", message);
}

function tooLarge(message: string): never {
  throw new StudyBackupError("too-large", message);
}

function assertText(value: unknown, maximum: number, field: string): asserts value is string {
  if (typeof value !== "string") invalidFormat(`${field} must be text.`);
  if (value.length > maximum) tooLarge(`${field} is too long to back up safely.`);
}

function assertOptionalExportText(value: unknown, maximum: number, field: string): void {
  if (typeof value === "string" && value.length > maximum) {
    tooLarge(`${field} is too long to back up safely.`);
  }
}

function normalizeBackupRecord(record: StudyRecord): StudyRecord {
  return {
    code: record.code,
    lineNotes: [...record.lineNotes],
    thinking: record.thinking,
    mistakes: record.mistakes,
    review: record.review,
    status: record.status,
  };
}

function assertRecordSchema(value: unknown, field: string): asserts value is StudyRecord {
  const record = objectValue(value);
  if (!record
    || !hasOwn(record, "code")
    || !hasOwn(record, "lineNotes")
    || !hasOwn(record, "thinking")
    || !hasOwn(record, "mistakes")
    || !hasOwn(record, "review")
    || !hasOwn(record, "status")) {
    invalidFormat(`${field} is incomplete or malformed.`);
  }

  assertText(record.code, MAX_BACKUP_CODE_LENGTH, `${field}.code`);
  assertText(record.thinking, MAX_BACKUP_NOTE_LENGTH, `${field}.thinking`);
  assertText(record.mistakes, MAX_BACKUP_NOTE_LENGTH, `${field}.mistakes`);
  assertText(record.review, MAX_BACKUP_NOTE_LENGTH, `${field}.review`);
  if (!Array.isArray(record.lineNotes)) invalidFormat(`${field}.lineNotes must be a list.`);
  if (record.lineNotes.length > MAX_BACKUP_LINE_NOTES) {
    tooLarge(`${field}.lineNotes contains too many entries.`);
  }
  record.lineNotes.forEach((note, index) => {
    assertText(note, MAX_BACKUP_LINE_NOTE_LENGTH, `${field}.lineNotes[${index}]`);
  });
  if (typeof record.status !== "string" || !VALID_STATUSES.has(record.status)) {
    invalidFormat(`${field}.status is invalid.`);
  }
}

/**
 * Storage normalizers intentionally repair old malformed values. Before an
 * export, check every valid field that they could otherwise shorten so a
 * "full backup" either preserves that text byte-for-byte or fails clearly.
 */
function assertExportSourceFits(source: StudyBackupSource, problemList: Problem[]): void {
  const knownIds = new Set(problemList.map((problem) => problem.id));
  const study = objectValue(source.study);
  const records = objectValue(study?.records);
  if (records) {
    for (const [rawId, rawValue] of Object.entries(records)) {
      if (!knownIds.has(Number(rawId))) continue;
      const record = objectValue(rawValue);
      if (!record) continue;
      assertOptionalExportText(record.code, MAX_BACKUP_CODE_LENGTH, `study.records.${rawId}.code`);
      assertOptionalExportText(record.thinking, MAX_BACKUP_NOTE_LENGTH, `study.records.${rawId}.thinking`);
      assertOptionalExportText(record.mistakes, MAX_BACKUP_NOTE_LENGTH, `study.records.${rawId}.mistakes`);
      assertOptionalExportText(record.review, MAX_BACKUP_NOTE_LENGTH, `study.records.${rawId}.review`);
      if (Array.isArray(record.lineNotes)) {
        if (record.lineNotes.length > MAX_BACKUP_LINE_NOTES) {
          tooLarge(`study.records.${rawId}.lineNotes contains too many entries.`);
        }
        record.lineNotes.forEach((note, index) => {
          assertOptionalExportText(note, MAX_BACKUP_LINE_NOTE_LENGTH, `study.records.${rawId}.lineNotes[${index}]`);
        });
      }
    }
  }

  const course = objectValue(source.course);
  if (!Array.isArray(course?.courses)) return;
  if (course.courses.length > MAX_COURSES) {
    tooLarge("course.courses contains more saved courses than a backup can hold.");
  }
  course.courses.forEach((rawValue, index) => {
    const savedCourse = objectValue(rawValue);
    if (!savedCourse) return;
    assertOptionalExportText(savedCourse.id, MAX_BACKUP_COURSE_ID_LENGTH, `course.courses[${index}].id`);
    assertOptionalExportText(savedCourse.videoId, MAX_BACKUP_COURSE_ID_LENGTH, `course.courses[${index}].videoId`);
    assertOptionalExportText(savedCourse.sourceUrl, MAX_BACKUP_COURSE_URL_LENGTH, `course.courses[${index}].sourceUrl`);
    assertOptionalExportText(savedCourse.embedUrl, MAX_BACKUP_COURSE_URL_LENGTH, `course.courses[${index}].embedUrl`);
    assertOptionalExportText(savedCourse.title, MAX_BACKUP_COURSE_TITLE_LENGTH, `course.courses[${index}].title`);
    assertOptionalExportText(savedCourse.transcript, MAX_COURSE_TEXT_LENGTH, `course.courses[${index}].transcript`);
    assertOptionalExportText(savedCourse.notes, MAX_COURSE_TEXT_LENGTH, `course.courses[${index}].notes`);
  });
}

function normalizeBackupStudy(value: unknown, problemList: Problem[]): BackupStudy {
  const normalized = normalizeSavedStudy(value, problemList);
  const records: StudyRecords = {};
  for (const [rawId, record] of Object.entries(normalized.records)) {
    records[Number(rawId)] = normalizeBackupRecord(record);
  }

  return {
    version: STUDY_STORAGE_VERSION,
    records,
    ...(normalized.selectedId === undefined ? {} : { selectedId: normalized.selectedId }),
  };
}

function normalizeFontSize(value: unknown): number {
  const parsed = typeof value === "string" && value.trim() !== ""
    ? Number(value)
    : value;
  return typeof parsed === "number"
    && Number.isInteger(parsed)
    && parsed >= MIN_FONT_SIZE
    && parsed <= MAX_FONT_SIZE
    ? parsed
    : DEFAULT_FONT_SIZE;
}

function normalizeLanguage(value: unknown): BackupLanguage {
  return value === "en" ? "en" : "zh";
}

function normalizeReminder(value: unknown): DailyReminder {
  const reminder = objectValue(value);
  const time = typeof reminder?.time === "string"
    && /^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.time)
    ? reminder.time
    : DEFAULT_REMINDER_TIME;

  // Importing data must never schedule a notification without fresh user consent.
  return { enabled: false, time };
}

function isoDate(value: Date | number): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) {
    throw new StudyBackupError("invalid-format", "The backup export time is invalid.");
  }
  return date.toISOString();
}

function isCanonicalIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || value.length > 64) return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function assertNonNegativeInteger(value: unknown, field: string): void {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    invalidFormat(`${field} must be a non-negative integer.`);
  }
}

function assertProfileSchema(value: unknown): void {
  const profile = objectValue(value);
  const numericFields = ["xp", "todayXp", "streak", "lessons", "sprintBest"] as const;
  if (!profile || !hasOwn(profile, "todayDate") || numericFields.some((field) => !hasOwn(profile, field))) {
    invalidFormat("profile is incomplete or malformed.");
  }
  numericFields.forEach((field) => assertNonNegativeInteger(profile[field], `profile.${field}`));
  if (typeof profile.todayDate !== "string"
    || (profile.todayDate !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(profile.todayDate))) {
    invalidFormat("profile.todayDate is invalid.");
  }
}

function assertCourseSchema(value: unknown): void {
  const store = objectValue(value);
  if (!store || !hasOwn(store, "activeId") || !Array.isArray(store.courses)) {
    invalidFormat("course is incomplete or malformed.");
  }
  if (store.activeId !== null) {
    assertText(store.activeId, MAX_BACKUP_COURSE_ID_LENGTH, "course.activeId");
  }
  if (store.courses.length > MAX_COURSES) {
    tooLarge("course.courses contains too many entries.");
  }

  store.courses.forEach((rawCourse, index) => {
    const field = `course.courses[${index}]`;
    const course = objectValue(rawCourse);
    const requiredFields = [
      "id",
      "videoId",
      "page",
      "sourceUrl",
      "embedUrl",
      "title",
      "transcript",
      "notes",
      "recognitionLanguage",
      "updatedAt",
    ];
    if (!course || requiredFields.some((required) => !hasOwn(course, required))) {
      invalidFormat(`${field} is incomplete or malformed.`);
    }
    assertText(course.id, MAX_BACKUP_COURSE_ID_LENGTH, `${field}.id`);
    assertText(course.videoId, MAX_BACKUP_COURSE_ID_LENGTH, `${field}.videoId`);
    assertText(course.sourceUrl, MAX_BACKUP_COURSE_URL_LENGTH, `${field}.sourceUrl`);
    assertText(course.embedUrl, MAX_BACKUP_COURSE_URL_LENGTH, `${field}.embedUrl`);
    assertText(course.title, MAX_BACKUP_COURSE_TITLE_LENGTH, `${field}.title`);
    assertText(course.transcript, MAX_COURSE_TEXT_LENGTH, `${field}.transcript`);
    assertText(course.notes, MAX_COURSE_TEXT_LENGTH, `${field}.notes`);
    if (typeof course.page !== "number"
      || !Number.isInteger(course.page)
      || course.page < 1
      || course.page > 9_999) {
      invalidFormat(`${field}.page is invalid.`);
    }
    if (course.recognitionLanguage !== "zh-CN" && course.recognitionLanguage !== "en-US") {
      invalidFormat(`${field}.recognitionLanguage is invalid.`);
    }
    if (typeof course.updatedAt !== "number" || !Number.isFinite(course.updatedAt)) {
      invalidFormat(`${field}.updatedAt is invalid.`);
    }
  });
}

function assertBackupPayloadSchema(envelope: Record<string, unknown>): void {
  const study = objectValue(envelope.study);
  if (!study
    || study.version !== STUDY_STORAGE_VERSION
    || !hasOwn(study, "records")
    || !objectValue(study.records)) {
    invalidFormat("study is incomplete or malformed.");
  }
  const records = objectValue(study.records)!;
  for (const [rawId, record] of Object.entries(records)) {
    if (!/^\d+$/.test(rawId) || !Number.isSafeInteger(Number(rawId))) {
      invalidFormat(`study.records.${rawId} has an invalid problem id.`);
    }
    assertRecordSchema(record, `study.records.${rawId}`);
  }
  if (hasOwn(study, "selectedId")
    && (typeof study.selectedId !== "number" || !Number.isSafeInteger(study.selectedId))) {
    invalidFormat("study.selectedId is invalid.");
  }

  assertProfileSchema(envelope.profile);
  if (typeof envelope.font !== "number"
    || !Number.isInteger(envelope.font)
    || envelope.font < MIN_FONT_SIZE
    || envelope.font > MAX_FONT_SIZE) {
    invalidFormat("font is invalid.");
  }
  if (envelope.language !== "zh" && envelope.language !== "en") {
    invalidFormat("language is invalid.");
  }
  const reminder = objectValue(envelope.reminder);
  if (!reminder
    || typeof reminder.enabled !== "boolean"
    || typeof reminder.time !== "string"
    || !/^([01]\d|2[0-3]):[0-5]\d$/.test(reminder.time)) {
    invalidFormat("reminder is incomplete or malformed.");
  }
  assertCourseSchema(envelope.course);
}

function textByteLength(value: string): number {
  // Every UTF-16 code unit needs at least one UTF-8 byte, so avoid encoding
  // obviously oversized input before calculating its exact byte length.
  if (value.length > MAX_STUDY_BACKUP_BYTES) return value.length;
  return new TextEncoder().encode(value).byteLength;
}

function assertBackupSize(text: string): void {
  if (textByteLength(text) > MAX_STUDY_BACKUP_BYTES) {
    throw new StudyBackupError("too-large", "Backup files must be 24 MB or smaller.");
  }
}

function normalizeBackup(
  source: StudyBackupSource,
  problemList: Problem[],
  exportedAt: string,
): StudyBackup {
  return {
    format: STUDY_BACKUP_FORMAT,
    version: STUDY_BACKUP_VERSION,
    exportedAt,
    study: normalizeBackupStudy(source.study, problemList),
    profile: normalizeLearningProfile(source.profile),
    font: normalizeFontSize(source.font),
    language: normalizeLanguage(source.language),
    reminder: normalizeReminder(source.reminder),
    course: normalizeCourseStore(source.course),
  };
}

/**
 * Build a portable, JSON-safe snapshot from already decoded local values.
 * Unknown problems and unsafe course links are removed by the shared storage
 * normalizers before the snapshot is returned.
 */
export function createStudyBackup(
  source: StudyBackupSource,
  problemList: Problem[],
  now: Date | number = Date.now(),
): StudyBackup {
  assertExportSourceFits(source, problemList);
  const backup = normalizeBackup(source, problemList, isoDate(now));
  assertBackupPayloadSchema(backup as unknown as Record<string, unknown>);
  assertBackupSize(JSON.stringify(backup));
  return backup;
}

/** Serialize a backup using the same schema and size ceiling enforced during import. */
export function stringifyStudyBackup(backup: StudyBackup): string {
  assertBackupPayloadSchema(backup as unknown as Record<string, unknown>);
  const text = JSON.stringify(backup);
  assertBackupSize(text);
  return text;
}

/**
 * Parse and sanitize an imported backup. Header/schema failures are rejected;
 * supported payload values are normalized to current safe storage shapes.
 */
export function parseStudyBackup(text: string, problemList: Problem[]): StudyBackup {
  assertBackupSize(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text) as unknown;
  } catch {
    throw new StudyBackupError("invalid-json", "The selected file is not valid JSON.");
  }

  const envelope = objectValue(parsed);
  if (!envelope || envelope.format !== STUDY_BACKUP_FORMAT) {
    throw new StudyBackupError("invalid-format", "This is not a Tijiebu study backup.");
  }
  if (envelope.version !== STUDY_BACKUP_VERSION) {
    throw new StudyBackupError(
      "unsupported-version",
      typeof envelope.version === "number" && envelope.version > STUDY_BACKUP_VERSION
        ? "This backup was created by a newer app version."
        : "This backup version is not supported.",
    );
  }
  if (!isCanonicalIsoDate(envelope.exportedAt)
    || !hasOwn(envelope, "study")
    || !hasOwn(envelope, "profile")
    || !hasOwn(envelope, "font")
    || !hasOwn(envelope, "language")
    || !hasOwn(envelope, "reminder")
    || !hasOwn(envelope, "course")) {
    throw new StudyBackupError("invalid-format", "The backup is incomplete or malformed.");
  }
  assertBackupPayloadSchema(envelope);

  return normalizeBackup({
    study: envelope.study,
    profile: envelope.profile,
    font: envelope.font,
    language: envelope.language,
    reminder: envelope.reminder,
    course: envelope.course,
  }, problemList, envelope.exportedAt);
}
