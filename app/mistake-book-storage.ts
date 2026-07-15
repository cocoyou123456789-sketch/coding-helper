import {
  MISTAKE_BOOK_STORAGE_KEY,
  mistakeBookStoreIssue,
  parseMistakeBookStore,
  serializeMistakeBookStore,
  type MistakeBookStore,
} from "./mistake-book";
import { writeLargeStoredValuesAtomically } from "./native-app";
import { advanceStudyDataRevision, withStudyDataWriteLock } from "./study-data-session";

let writes: Promise<void> = Promise.resolve();
let latestStore: MistakeBookStore | null = null;
let persistedStore = "";

function queueOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = writes.catch(() => undefined).then(operation);
  writes = result.then(() => undefined, () => undefined);
  return result;
}

export function markMistakeBookStoreLoaded(store: MistakeBookStore): void {
  const parsed = parseMistakeBookStore(store);
  latestStore = parsed;
  persistedStore = serializeMistakeBookStore(parsed);
}

export function latestMistakeBookStoreSnapshot(): MistakeBookStore | null {
  return latestStore;
}

/**
 * Keep each edit based on the last verified value. UI state advances only after
 * the complete store has been journaled, written, and read back successfully.
 */
export function queueMistakeBookStoreMutation(
  mutate: (current: MistakeBookStore) => MistakeBookStore | Promise<MistakeBookStore>,
): Promise<MistakeBookStore> {
  return queueOperation(async () => {
    if (!latestStore) throw new Error("The mistake book is not ready.");
    const next = await mutate(latestStore);
    const issue = mistakeBookStoreIssue(next);
    if (issue) throw new Error(`The mistake book is invalid at ${issue.field}.`);
    const serialized = serializeMistakeBookStore(next);
    if (serialized === persistedStore) return latestStore;
    await withStudyDataWriteLock(async () => {
      advanceStudyDataRevision();
      await writeLargeStoredValuesAtomically({ [MISTAKE_BOOK_STORAGE_KEY]: serialized });
    });
    latestStore = parseMistakeBookStore(next);
    persistedStore = serialized;
    return latestStore;
  });
}

export async function drainMistakeBookStoreWrites(): Promise<void> {
  await writes;
}
