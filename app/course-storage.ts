import type { CourseStore } from "./course-notes-model";
import { COURSE_NOTES_STORAGE_KEY } from "./course-notes-model";
import { setLargeStoredValue } from "./native-app";
import { advanceStudyDataRevision, withStudyDataWriteLock } from "./study-data-session";

let courseStorageWrites: Promise<void> = Promise.resolve();
let persistedCourseStore: string | null = null;
let latestCourseStore: string | null = null;

function queueCourseStorageOperation(operation: () => Promise<void>): Promise<void> {
  const pending = courseStorageWrites
    .catch(() => undefined)
    .then(operation);
  courseStorageWrites = pending;
  return pending;
}

/**
 * Keep course writes in one module-level queue so a component unmount cannot
 * orphan an in-flight save that backup, restore, or deletion cannot observe.
 */
export function queueCourseStoreWrite(store: CourseStore): Promise<void> {
  const serialized = JSON.stringify(store);
  latestCourseStore = serialized;
  return queueCourseStorageOperation(async () => {
    if (serialized === persistedCourseStore) return;
    await withStudyDataWriteLock(async () => {
      advanceStudyDataRevision();
      await setLargeStoredValue(COURSE_NOTES_STORAGE_KEY, serialized);
      persistedCourseStore = serialized;
    });
  });
}

export function markCourseStoreLoaded(store: CourseStore): void {
  persistedCourseStore = JSON.stringify(store);
  latestCourseStore = persistedCourseStore;
}

export function latestCourseStoreSnapshot(): string | null {
  return latestCourseStore;
}

/**
 * Register the entire stop/finalize/write sequence before its first await.
 * This makes an unmount flush visible to restore/delete immediately.
 */
export function queueCourseStoreFlush(
  prepare: () => Promise<void>,
  currentStore: () => CourseStore,
): Promise<void> {
  return queueCourseStorageOperation(async () => {
    await prepare();
    const serialized = JSON.stringify(currentStore());
    latestCourseStore = serialized;
    if (serialized === persistedCourseStore) return;
    await withStudyDataWriteLock(async () => {
      advanceStudyDataRevision();
      await setLargeStoredValue(COURSE_NOTES_STORAGE_KEY, serialized);
      persistedCourseStore = serialized;
    });
  });
}

export async function drainCourseStoreWrites(): Promise<void> {
  await courseStorageWrites;
}
