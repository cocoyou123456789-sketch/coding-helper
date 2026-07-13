import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const file = (path) => new URL(`../${path}`, import.meta.url);

test("full backup is available on web and iOS with verified storage and paused autosave", async () => {
  const [page, nativeStorage, courseNotes, courseStorage, studySession, backupStyles, privacy, support] = await Promise.all([
    readFile(file("app/page.tsx"), "utf8"),
    readFile(file("app/native-app.ts"), "utf8"),
    readFile(file("app/course-notes.tsx"), "utf8"),
    readFile(file("app/course-storage.ts"), "utf8"),
    readFile(file("app/study-data-session.ts"), "utf8"),
    readFile(file("app/backup-settings.module.css"), "utf8"),
    readFile(file("app/privacy/page.tsx"), "utf8"),
    readFile(file("app/support/page.tsx"), "utf8"),
  ]);

  assert.match(page, /\{showNativeSettings &&/);
  assert.doesNotMatch(page, /\{nativeApp && showNativeSettings &&/);
  assert.match(page, /accept="\.json,application\/json"/);
  assert.match(page, /restoreStudySnapshot/);
  assert.match(page, /dataOperationRef\.current = true/);
  assert.match(page, /await storageWritesRef\.current/);
  assert.match(page, /await drainCourseStoreWrites\(\)/);
  assert.match(page, /advanceStudyDataRevision\(\)/);
  assert.match(page, /hasOtherActiveStudyTab\(\)/);
  assert.match(page, /queuedStudyValueRef/);
  assert.match(page, /latestStudyValueRef/);
  assert.match(page, /useLayoutEffect\(\(\) => \{\s*latestStudyValueRef\.current = serializedStudyValue/s);
  assert.match(page, /stageNativeStoredValueForBackground\(STORAGE_KEY, serialized\)/);
  assert.equal((page.match(/persistLatestSerializedValue\(/g) ?? []).length, 1);
  assert.match(page, /window\.addEventListener\("pagehide", flushOnPageHide\)/);
  assert.match(page, /document\.addEventListener\("visibilitychange", flushWhenHidden\)/);
  assert.match(page, /queueStorageWrite\(storageWritesRef,[\s\S]*?setStoredValue\(STORAGE_KEY, value\)/);
  assert.match(page, /advanceStudyDataRevision\(\)/);
  assert.match(page, /withStudyDataWriteLock\(async \(\) => \{\s*advanceStudyDataRevision\(\);\s*await operation\(\)/s);
  assert.match(page, /setStorageLoadFailed\(true\)/);
  assert.match(page, /try \{\s*unregister = registerStudyDataTab\(\)/s);
  assert.match(page, /pauseMountedStudyData/);
  assert.match(page, /window\.location\.reload/);
  assert.match(page, /备份文件是可阅读的明文/);
  assert.match(page, /backupReviewHeadingRef/);
  assert.match(page, /restoreBackupButtonRef/);
  assert.match(page, /supportsSafeStudyDataWrites/);
  assert.match(page, /staleCapturePromiseRef/);
  assert.match(page, /withStudyDataRescueReadLock/);
  assert.match(page, /tijiebu-\$\{rescueMode \? "rescue" : "backup"\}/);
  assert.match(page, /hydrated && !studyEditingBlocked/);
  assert.doesNotMatch(page, /inert=\{!hydrated\}/);

  assert.match(nativeStorage, /writeStoredStudySnapshot/);
  assert.match(nativeStorage, /Stored value verification failed/);
  assert.match(nativeStorage, /Large value verification failed/);
  assert.match(nativeStorage, /Directory\.Cache/);
  assert.match(nativeStorage, /files: \[uri\]/);
  assert.match(nativeStorage, /remainingValues\.some/);
  assert.match(nativeStorage, /reminderCancelled = false/);

  assert.match(courseNotes, /STUDY_DATA_FLUSH_EVENT/);
  assert.match(courseNotes, /STUDY_DATA_RESUME_EVENT/);
  assert.match(courseNotes, /skipPersistenceRef\.current = true/);
  assert.match(courseNotes, /detail\?\.waitUntil\(queueCourseStoreFlush\(/);
  assert.match(courseNotes, /\(\) => stopActiveCapture\(true\)/);
  assert.match(courseStorage, /let courseStorageWrites: Promise<void>/);
  assert.match(courseStorage, /withStudyDataWriteLock\(async \(\) =>/);
  assert.match(courseStorage, /advanceStudyDataRevision\(\)/);
  assert.equal((courseStorage.match(/withStudyDataWriteLock\(async \(\) => \{\s*advanceStudyDataRevision\(\);\s*await setLargeStoredValue/g) ?? []).length, 2);
  assert.match(courseStorage, /persistedCourseStore/);
  assert.match(courseNotes, /setLoadFailed\(true\)/);
  assert.match(studySession, /STUDY_DATA_STALE_EVENT/);
  assert.match(studySession, /REVISION_KEY/);
  assert.match(studySession, /pendingProbes/);
  assert.match(studySession, /export function withStudyDataRescueReadLock/);
  assert.match(backupStyles, /:global\(\.button-quiet\)[^{]*\{[^}]*display: inline-flex/s);
  assert.match(backupStyles, /max-height: calc\(100vh/);
  assert.match(backupStyles, /max-height: calc\(100dvh/);
  assert.ok(backupStyles.indexOf("max-height: calc(100vh") < backupStyles.indexOf("max-height: calc(100dvh"));

  assert.match(privacy, /完整备份是可阅读的 JSON 明文文件/);
  assert.match(support, /设置 → 完整备份/);
});
