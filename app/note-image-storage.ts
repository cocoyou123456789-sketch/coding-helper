import {
  NOTE_IMAGES_STORAGE_KEY,
  noteImageStoreIssue,
  type NoteImageStore,
} from "./note-images";
import { writeLargeStoredValuesAtomically } from "./native-app";
import { advanceStudyDataRevision, withStudyDataWriteLock } from "./study-data-session";

let noteImageWrites: Promise<void> = Promise.resolve();
let latestStore: NoteImageStore | null = null;
let persistedStore = "";

function queueOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = noteImageWrites.catch(() => undefined).then(operation);
  noteImageWrites = result.then(() => undefined, () => undefined);
  return result;
}

export function markNoteImageStoreLoaded(store: NoteImageStore): void {
  const issue = noteImageStoreIssue(store);
  if (issue) throw new Error(`The note image library is invalid at ${issue.field}.`);
  latestStore = store;
  persistedStore = JSON.stringify(store);
}

export function latestNoteImageStoreSnapshot(): NoteImageStore | null {
  return latestStore;
}

/** Serialize mutations so rapid add/caption/delete actions always build on the last verified store. */
export function queueNoteImageStoreMutation(
  mutate: (current: NoteImageStore) => NoteImageStore | Promise<NoteImageStore>,
): Promise<NoteImageStore> {
  return queueOperation(async () => {
    if (!latestStore) throw new Error("The note image library is not ready.");
    const next = await mutate(latestStore);
    const issue = noteImageStoreIssue(next);
    if (issue) throw new Error(`The note image library is invalid at ${issue.field}.`);
    const serialized = JSON.stringify(next);
    if (serialized === persistedStore) return latestStore;
    await withStudyDataWriteLock(async () => {
      advanceStudyDataRevision();
      await writeLargeStoredValuesAtomically({ [NOTE_IMAGES_STORAGE_KEY]: serialized });
    });
    latestStore = next;
    persistedStore = serialized;
    return next;
  });
}

export async function drainNoteImageStoreWrites(): Promise<void> {
  await noteImageWrites;
}
