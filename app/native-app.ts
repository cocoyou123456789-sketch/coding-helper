import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Directory, Encoding, Filesystem } from "@capacitor/filesystem";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Preferences } from "@capacitor/preferences";
import { Share } from "@capacitor/share";
import { StatusBar, Style } from "@capacitor/status-bar";

const IS_NATIVE_BUILD = process.env.NEXT_PUBLIC_NATIVE_APP === "true";
const REMINDER_KEY = "tijiebu-daily-reminder-v1";
const DAILY_REMINDER_ID = 771201;
const LARGE_STORAGE_DATABASE = "tijiebu-study-files-v1";
const LARGE_STORAGE_OBJECT_STORE = "documents";
const LARGE_STORAGE_DIRECTORY = "study-notes";
const STORAGE_TRANSACTION_KEY = "tijiebu-storage-transaction-v1";
const STORAGE_TRANSACTION_PAYLOAD_KEY = "__tijiebu-storage-transaction-payload-v1__";
const STORAGE_OVERRIDE_PREFIX = "tijiebu-storage-override-v1";
const LARGE_MIGRATION_PREFIX = "tijiebu-large-migration-v1";
const REMINDER_RECONCILIATION_KEY = "tijiebu-reminder-reconciliation-v1";
export const STUDY_DATA_CLEAR_EVENT = "tijiebu:clear-study-data";
export const STUDY_DATA_CAPTURE_EVENT = "tijiebu:capture-study-data";
export const STUDY_DATA_FLUSH_EVENT = "tijiebu:flush-study-data";
export const STUDY_DATA_RESUME_EVENT = "tijiebu:resume-study-data";

export type DailyReminder = {
  enabled: boolean;
  time: string;
};

export type ReminderSaveResult = "scheduled" | "disabled" | "denied" | "unsupported" | "error";
export type ClearStoredStudyDataResult = { reminderCancelled: boolean };

export type StoredStudySnapshot = {
  values: Record<string, string>;
  largeValues: Record<string, string>;
  reminder: DailyReminder;
};

type NullableStoredValues = Record<string, string | null>;

type StorageTransactionSnapshot = {
  values: NullableStoredValues;
  largeValues: NullableStoredValues;
};

type StorageTransaction = {
  version: 1;
  phase: "prepared" | "committed";
  before: StorageTransactionSnapshot;
  after: StorageTransactionSnapshot;
};

type StorageTransactionJournal = {
  version: 1;
  phase: "prepared" | "committed";
  payloadKey: typeof STORAGE_TRANSACTION_PAYLOAD_KEY;
};

type StorageOverride =
  | { operation: "set"; value: string }
  | { operation: "remove" };

let storageOperationTail: Promise<void> = Promise.resolve();

export function isNativeAppBuild(): boolean {
  return IS_NATIVE_BUILD;
}

function hasNativeBridge(): boolean {
  return IS_NATIVE_BUILD && Capacitor.isNativePlatform();
}

function withStorageOperation<T>(operation: () => Promise<T>): Promise<T> {
  const result = storageOperationTail.then(operation, operation);
  storageOperationTail = result.then(() => undefined, () => undefined);
  return result;
}

function storageOverrideKey(key: string): string {
  return `${STORAGE_OVERRIDE_PREFIX}:small:${encodeURIComponent(key)}`;
}

function readStorageOverride(key: string): StorageOverride | null {
  const raw = window.localStorage.getItem(storageOverrideKey(key));
  if (raw === null) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<StorageOverride>;
    if (parsed.operation === "remove") return { operation: "remove" };
    if (parsed.operation === "set" && typeof parsed.value === "string") {
      return { operation: "set", value: parsed.value };
    }
  } catch {
    // A corrupt override must not reveal an older primary value.
  }
  throw new Error(`Stored value override is corrupt for ${key}`);
}

function writeStorageOverride(key: string, override: StorageOverride): void {
  window.localStorage.setItem(storageOverrideKey(key), JSON.stringify(override));
}

function clearStorageOverride(key: string): void {
  window.localStorage.removeItem(storageOverrideKey(key));
}

async function readPreferenceValueDirect(key: string): Promise<string | null> {
  const { value } = await Preferences.get({ key });
  return value;
}

async function syncSmallOverrideDirect(key: string, override: StorageOverride): Promise<boolean> {
  try {
    if (override.operation === "set") {
      await Preferences.set({ key, value: override.value });
      if (await readPreferenceValueDirect(key) !== override.value) return false;
    } else {
      await Preferences.remove({ key });
      if (await readPreferenceValueDirect(key) !== null) return false;
    }
    window.localStorage.removeItem(key);
    clearStorageOverride(key);
    return true;
  } catch {
    return false;
  }
}

async function getStoredValueDirect(key: string): Promise<string | null> {
  if (!hasNativeBridge()) return window.localStorage.getItem(key);

  const override = readStorageOverride(key);
  if (override) {
    await syncSmallOverrideDirect(key, override);
    return override.operation === "set" ? override.value : null;
  }

  // Older builds used the unqualified localStorage key as their fallback. It
  // must win over a stale Preferences value until it has been copied back.
  const legacyFallback = window.localStorage.getItem(key);
  if (legacyFallback !== null) {
    try {
      await Preferences.set({ key, value: legacyFallback });
      if (await readPreferenceValueDirect(key) === legacyFallback) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // The legacy key itself remains the authoritative fallback.
    }
    return legacyFallback;
  }

  return readPreferenceValueDirect(key);
}

async function setStoredValueDirect(key: string, value: string, requirePrimary = false): Promise<boolean> {
  if (!hasNativeBridge()) {
    window.localStorage.setItem(key, value);
    return true;
  }

  if (!requirePrimary) {
    const existingOverride = readStorageOverride(key);
    if (existingOverride !== null) {
      const nextOverride = { operation: "set", value } satisfies StorageOverride;
      writeStorageOverride(key, nextOverride);
      return syncSmallOverrideDirect(key, nextOverride);
    }
    if (window.localStorage.getItem(key) !== null) {
      window.localStorage.setItem(key, value);
      try {
        await Preferences.set({ key, value });
        if (await readPreferenceValueDirect(key) !== value) return false;
        window.localStorage.removeItem(key);
        return true;
      } catch {
        return false;
      }
    }
  }

  // Clear an older fallback before attempting the new primary write. A crash
  // before Preferences changes leaves the old primary state; a crash after it
  // leaves the new state, so no large payload needs to be duplicated locally.
  window.localStorage.removeItem(key);
  clearStorageOverride(key);
  try {
    await Preferences.set({ key, value });
    if (await readPreferenceValueDirect(key) !== value) {
      throw new Error(`Preferences write could not be verified for ${key}`);
    }
    return true;
  } catch (error) {
    if (requirePrimary) throw error;
    writeStorageOverride(key, { operation: "set", value });
    return false;
  }
}

async function removeStoredValueDirect(key: string, requirePrimary = false): Promise<boolean> {
  if (!hasNativeBridge()) {
    window.localStorage.removeItem(key);
    return true;
  }

  if (!requirePrimary && (readStorageOverride(key) !== null || window.localStorage.getItem(key) !== null)) {
    const tombstone = { operation: "remove" } satisfies StorageOverride;
    writeStorageOverride(key, tombstone);
    window.localStorage.removeItem(key);
    return syncSmallOverrideDirect(key, tombstone);
  }

  window.localStorage.removeItem(key);
  clearStorageOverride(key);
  try {
    await Preferences.remove({ key });
    if (await readPreferenceValueDirect(key) !== null) {
      throw new Error(`Preferences deletion could not be verified for ${key}`);
    }
    return true;
  } catch (error) {
    if (requirePrimary) throw error;
    writeStorageOverride(key, { operation: "remove" });
    return false;
  }
}

export async function configureNativeAppearance(): Promise<void> {
  // This is called during app startup. Storage APIs repeat the same recovery
  // gate, so a transient startup failure can never expose a partial restore.
  await recoverInterruptedStudyDataWrite().catch(() => undefined);
  if (!hasNativeBridge()) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // The learning workspace should remain usable if a native appearance API is unavailable.
  }
}

export async function getStoredValue(key: string): Promise<string | null> {
  return withStorageOperation(async () => {
    await recoverInterruptedStorageTransactionDirect();
    return getStoredValueDirect(key);
  });
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  await withStorageOperation(async () => {
    await recoverInterruptedStorageTransactionDirect();
    await setStoredValueDirect(key, value);
  });
}

function openLargeStorageDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(LARGE_STORAGE_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(LARGE_STORAGE_OBJECT_STORE)) {
        request.result.createObjectStore(LARGE_STORAGE_OBJECT_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readLargeWebValue(key: string): Promise<string | null> {
  const database = await openLargeStorageDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database
        .transaction(LARGE_STORAGE_OBJECT_STORE, "readonly")
        .objectStore(LARGE_STORAGE_OBJECT_STORE)
        .get(key);
      request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function writeLargeWebValue(key: string, value: string): Promise<void> {
  const database = await openLargeStorageDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(LARGE_STORAGE_OBJECT_STORE, "readwrite");
      transaction.objectStore(LARGE_STORAGE_OBJECT_STORE).put(value, key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

async function deleteLargeWebValue(key: string): Promise<void> {
  const database = await openLargeStorageDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction(LARGE_STORAGE_OBJECT_STORE, "readwrite");
      transaction.objectStore(LARGE_STORAGE_OBJECT_STORE).delete(key);
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
      transaction.onabort = () => reject(transaction.error);
    });
  } finally {
    database.close();
  }
}

function largeStoragePath(key: string): string {
  return `${LARGE_STORAGE_DIRECTORY}/${encodeURIComponent(key)}.json`;
}

function hasDedicatedLargeStorage(): boolean {
  return hasNativeBridge() || typeof window.indexedDB !== "undefined";
}

function isMissingFileError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === "OS-PLUG-FILE-0008") return true;
  return typeof candidate.message === "string"
    && /does not exist|not found|no such file/i.test(candidate.message);
}

function isExistingDirectoryError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; message?: unknown };
  if (candidate.code === "OS-PLUG-FILE-0010") return true;
  return typeof candidate.message === "string" && /already exists/i.test(candidate.message);
}

async function readLargePrimaryValueDirect(key: string): Promise<string | null> {
  if (hasNativeBridge()) {
    try {
      const result = await Filesystem.readFile({
        path: largeStoragePath(key),
        directory: Directory.LibraryNoCloud,
        encoding: Encoding.UTF8,
      });
      if (typeof result.data !== "string") throw new Error(`Large value is unreadable for ${key}`);
      return result.data;
    } catch (error) {
      if (isMissingFileError(error)) return null;
      throw error;
    }
  }
  if (typeof window.indexedDB !== "undefined") return readLargeWebValue(key);
  return getStoredValueDirect(key);
}

async function writeLargePrimaryValueDirect(key: string, value: string): Promise<void> {
  if (hasNativeBridge()) {
    try {
      await Filesystem.mkdir({
        path: LARGE_STORAGE_DIRECTORY,
        directory: Directory.LibraryNoCloud,
        recursive: true,
      });
    } catch (error) {
      if (!isExistingDirectoryError(error)) throw error;
    }
    await Filesystem.writeFile({
      path: largeStoragePath(key),
      data: value,
      directory: Directory.LibraryNoCloud,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    return;
  }
  if (typeof window.indexedDB !== "undefined") {
    await writeLargeWebValue(key, value);
    return;
  }
  await setStoredValueDirect(key, value, true);
}

async function deleteLargePrimaryValueDirect(key: string): Promise<void> {
  if (hasNativeBridge()) {
    try {
      await Filesystem.deleteFile({
        path: largeStoragePath(key),
        directory: Directory.LibraryNoCloud,
      });
    } catch (error) {
      if (!isMissingFileError(error)) throw error;
    }
  } else if (typeof window.indexedDB !== "undefined") {
    await deleteLargeWebValue(key);
  } else {
    await removeStoredValueDirect(key, true);
    return;
  }

  if (await readLargePrimaryValueDirect(key) !== null) {
    throw new Error(`Large value deletion could not be verified for ${key}`);
  }
}

function largeMigrationKey(key: string): string {
  return `${LARGE_MIGRATION_PREFIX}:${encodeURIComponent(key)}`;
}

async function finishLargeMigrationDirect(key: string, fallbackValue: string): Promise<boolean> {
  try {
    await writeLargePrimaryValueDirect(key, fallbackValue);
    if (await readLargePrimaryValueDirect(key) !== fallbackValue) return false;
    await removeStoredValueDirect(key, true);
    await removeStoredValueDirect(largeMigrationKey(key), true);
    return true;
  } catch {
    // The small migration marker remains authoritative. It contains no large
    // payload; the existing legacy value is preserved until migration retries.
    return false;
  }
}

async function getLargeStoredValueDirect(key: string): Promise<string | null> {
  if (!hasDedicatedLargeStorage()) return getStoredValueDirect(key);

  const migrationMarker = await getStoredValueDirect(largeMigrationKey(key));
  if (migrationMarker !== null) {
    if (migrationMarker === "primary") {
      const primaryValue = await readLargePrimaryValueDirect(key);
      if (primaryValue === null) {
        throw new Error(`Authoritative large value is missing for ${key}`);
      }
      await removeStoredValueDirect(key, true);
      await removeStoredValueDirect(largeMigrationKey(key), true);
      return primaryValue;
    }
    if (migrationMarker !== "legacy") {
      throw new Error(`Large value migration marker is corrupt for ${key}`);
    }
    const fallbackValue = await getStoredValueDirect(key);
    if (fallbackValue !== null) {
      await finishLargeMigrationDirect(key, fallbackValue);
      return fallbackValue;
    }

    const migratedValue = await readLargePrimaryValueDirect(key);
    if (migratedValue === null) {
      throw new Error(`Large value migration state is incomplete for ${key}`);
    }
    await removeStoredValueDirect(largeMigrationKey(key), true);
    return migratedValue;
  }

  // Only a confirmed "missing" primary may consult the legacy fallback. An
  // I/O failure is surfaced so a stale fallback can never masquerade as a
  // successfully verified primary value.
  const primaryValue = await readLargePrimaryValueDirect(key);
  if (primaryValue !== null) return primaryValue;

  const fallbackValue = await getStoredValueDirect(key);
  if (fallbackValue !== null) {
    await setStoredValueDirect(largeMigrationKey(key), "legacy", true);
    await finishLargeMigrationDirect(key, fallbackValue);
    return fallbackValue;
  }
  return null;
}

async function getLargeStoredValueWithoutMigrationDirect(key: string): Promise<string | null> {
  if (!hasDedicatedLargeStorage()) return getStoredValueDirect(key);

  const migrationMarker = await getStoredValueDirect(largeMigrationKey(key));
  if (migrationMarker === "legacy") return getStoredValueDirect(key);
  if (migrationMarker !== null && migrationMarker !== "primary") {
    throw new Error(`Large value migration marker is corrupt for ${key}`);
  }

  const primaryValue = await readLargePrimaryValueDirect(key);
  if (migrationMarker === "primary" && primaryValue === null) {
    throw new Error(`Authoritative large value is missing for ${key}`);
  }
  if (primaryValue !== null) return primaryValue;
  return getStoredValueDirect(key);
}

async function setLargeStoredValueDirect(key: string, value: string, requirePrimary = false): Promise<void> {
  if (!hasDedicatedLargeStorage()) {
    await setStoredValueDirect(key, value, requirePrimary);
    return;
  }

  await writeLargePrimaryValueDirect(key, value);
  if (await readLargePrimaryValueDirect(key) !== value) {
    throw new Error(`Large value write could not be verified for ${key}`);
  }
  // Mark the primary authoritative before deleting any legacy fallback. The
  // marker is small and prevents fallback resurrection if cleanup is retried.
  await setStoredValueDirect(largeMigrationKey(key), "primary", true);
  await removeStoredValueDirect(key, true);
  await removeStoredValueDirect(largeMigrationKey(key), true);
}

async function removeLargeStoredValueDirect(key: string, requirePrimary = false): Promise<void> {
  if (!hasDedicatedLargeStorage()) {
    await removeStoredValueDirect(key, requirePrimary);
    return;
  }

  await deleteLargePrimaryValueDirect(key);
  await removeStoredValueDirect(key, true);
  await removeStoredValueDirect(largeMigrationKey(key), true);
}

export async function getLargeStoredValue(key: string): Promise<string | null> {
  return withStorageOperation(async () => {
    await recoverInterruptedStorageTransactionDirect();
    return getLargeStoredValueDirect(key);
  });
}

export async function setLargeStoredValue(key: string, value: string): Promise<void> {
  await withStorageOperation(async () => {
    await recoverInterruptedStorageTransactionDirect();
    await setLargeStoredValueDirect(key, value);
  });
}

export async function flushMountedStudyData(): Promise<void> {
  const pending: Promise<void>[] = [];
  window.dispatchEvent(new CustomEvent(STUDY_DATA_FLUSH_EVENT, {
    detail: {
      waitUntil(promise: Promise<void>) {
        pending.push(promise);
      },
    },
  }));
  await Promise.all(pending);
}

export async function captureMountedStudyData(): Promise<Record<string, string>> {
  const pending: Promise<{ key: string; value: string }>[] = [];
  window.dispatchEvent(new CustomEvent(STUDY_DATA_CAPTURE_EVENT, {
    detail: {
      provide(key: string, value: Promise<string>) {
        pending.push(value.then((resolved) => ({ key, value: resolved })));
      },
    },
  }));
  return Object.fromEntries((await Promise.all(pending)).map(({ key, value }) => [key, value]));
}

export function pauseMountedStudyData(): void {
  window.dispatchEvent(new Event(STUDY_DATA_CLEAR_EVENT));
}

export function resumeMountedStudyData(): void {
  window.dispatchEvent(new Event(STUDY_DATA_RESUME_EVENT));
}

function isNullableStoredValues(value: unknown): value is NullableStoredValues {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Object.values(value).every((item) => item === null || typeof item === "string");
}

function isStorageTransactionSnapshot(value: unknown): value is StorageTransactionSnapshot {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<StorageTransactionSnapshot>;
  return isNullableStoredValues(candidate.values) && isNullableStoredValues(candidate.largeValues);
}

function parseStorageTransactionPayload(raw: string): Pick<StorageTransaction, "before" | "after"> {
  try {
    const parsed = JSON.parse(raw) as { before?: unknown; after?: unknown };
    if (isStorageTransactionSnapshot(parsed.before) && isStorageTransactionSnapshot(parsed.after)) {
      return { before: parsed.before, after: parsed.after };
    }
  } catch {
    // Fall through to a fail-closed error below.
  }
  throw new Error("The interrupted storage transaction payload is corrupt.");
}

function parseStorageTransactionJournal(raw: string): StorageTransactionJournal {
  try {
    const parsed = JSON.parse(raw) as Partial<StorageTransactionJournal>;
    if (
      parsed.version === 1
      && (parsed.phase === "prepared" || parsed.phase === "committed")
      && parsed.payloadKey === STORAGE_TRANSACTION_PAYLOAD_KEY
    ) {
      return parsed as StorageTransactionJournal;
    }
  } catch {
    // Fall through to a fail-closed error below.
  }
  throw new Error("The interrupted storage transaction journal is corrupt.");
}

async function readStorageTransactionDirect(): Promise<StorageTransaction | null> {
  const localJournal = window.localStorage.getItem(STORAGE_TRANSACTION_KEY);
  let journal: StorageTransactionJournal | null = null;
  if (localJournal !== null) {
    journal = parseStorageTransactionJournal(localJournal);
  } else if (hasNativeBridge()) {
    const preferenceJournal = await readPreferenceValueDirect(STORAGE_TRANSACTION_KEY);
    if (preferenceJournal !== null) {
      window.localStorage.setItem(STORAGE_TRANSACTION_KEY, preferenceJournal);
      journal = parseStorageTransactionJournal(preferenceJournal);
    }
  }
  if (!journal) return null;
  if (!hasDedicatedLargeStorage()) {
    throw new Error("Dedicated storage is unavailable for transaction recovery.");
  }

  const payload = await readLargePrimaryValueDirect(journal.payloadKey);
  if (payload === null) throw new Error("The interrupted storage transaction payload is missing.");
  return { ...journal, ...parseStorageTransactionPayload(payload) };
}

async function writePreparedStorageTransactionDirect(transaction: StorageTransaction): Promise<void> {
  if (!hasDedicatedLargeStorage()) {
    throw new Error("Dedicated storage is required for atomic study-data updates.");
  }

  const payload = JSON.stringify({ before: transaction.before, after: transaction.after });
  await writeLargePrimaryValueDirect(STORAGE_TRANSACTION_PAYLOAD_KEY, payload);
  if (await readLargePrimaryValueDirect(STORAGE_TRANSACTION_PAYLOAD_KEY) !== payload) {
    throw new Error("Storage transaction payload preparation could not be verified.");
  }

  const journal = {
    version: 1,
    phase: "prepared",
    payloadKey: STORAGE_TRANSACTION_PAYLOAD_KEY,
  } satisfies StorageTransactionJournal;
  const serialized = JSON.stringify(journal);
  window.localStorage.setItem(STORAGE_TRANSACTION_KEY, serialized);
  if (!hasNativeBridge()) return;

  await Preferences.set({ key: STORAGE_TRANSACTION_KEY, value: serialized });
  if (await readPreferenceValueDirect(STORAGE_TRANSACTION_KEY) !== serialized) {
    throw new Error("Storage transaction journal preparation could not be verified.");
  }
}

async function markStorageTransactionCommittedDirect(transaction: StorageTransaction): Promise<StorageTransaction> {
  const committed = { ...transaction, phase: "committed" } satisfies StorageTransaction;
  const journal = {
    version: 1,
    phase: "committed",
    payloadKey: STORAGE_TRANSACTION_PAYLOAD_KEY,
  } satisfies StorageTransactionJournal;
  const serialized = JSON.stringify(journal);
  if (hasNativeBridge()) {
    // Keep the local journal in "prepared" until Preferences confirms the
    // commit. A crash anywhere before that point therefore rolls back.
    await Preferences.set({ key: STORAGE_TRANSACTION_KEY, value: serialized });
    if (await readPreferenceValueDirect(STORAGE_TRANSACTION_KEY) !== serialized) {
      throw new Error("Storage transaction commit could not be verified.");
    }
  }
  window.localStorage.setItem(STORAGE_TRANSACTION_KEY, serialized);
  return committed;
}

async function clearStorageTransactionDirect(): Promise<void> {
  if (hasNativeBridge()) {
    await Preferences.remove({ key: STORAGE_TRANSACTION_KEY });
    if (await readPreferenceValueDirect(STORAGE_TRANSACTION_KEY) !== null) {
      throw new Error("Storage transaction journal deletion could not be verified.");
    }
  }
  window.localStorage.removeItem(STORAGE_TRANSACTION_KEY);
  await deleteLargePrimaryValueDirect(STORAGE_TRANSACTION_PAYLOAD_KEY);
}

async function captureStorageTransactionSnapshotDirect(
  template: StorageTransactionSnapshot,
): Promise<StorageTransactionSnapshot> {
  const values: NullableStoredValues = {};
  const largeValues: NullableStoredValues = {};
  for (const key of Object.keys(template.values)) {
    values[key] = await getStoredValueDirect(key);
  }
  for (const key of Object.keys(template.largeValues)) {
    largeValues[key] = await getLargeStoredValueWithoutMigrationDirect(key);
  }
  return { values, largeValues };
}

async function applyStorageTransactionSnapshotDirect(snapshot: StorageTransactionSnapshot): Promise<void> {
  for (const [key, value] of Object.entries(snapshot.values)) {
    if (value === null) await removeStoredValueDirect(key, true);
    else await setStoredValueDirect(key, value, true);
  }
  for (const [key, value] of Object.entries(snapshot.largeValues)) {
    if (value === null) await removeLargeStoredValueDirect(key, true);
    else await setLargeStoredValueDirect(key, value, true);
  }
}

async function verifyStorageTransactionSnapshotDirect(snapshot: StorageTransactionSnapshot): Promise<void> {
  for (const [key, expected] of Object.entries(snapshot.values)) {
    const stored = hasNativeBridge()
      ? await readPreferenceValueDirect(key)
      : window.localStorage.getItem(key);
    if (stored !== expected || readStorageOverride(key) !== null) {
      throw new Error(`Stored value verification failed for ${key}`);
    }
  }
  for (const [key, expected] of Object.entries(snapshot.largeValues)) {
    const stored = await readLargePrimaryValueDirect(key);
    if (stored !== expected) {
      throw new Error(`Large value verification failed for ${key}`);
    }
    if (hasDedicatedLargeStorage()) {
      const fallback = hasNativeBridge()
        ? await readPreferenceValueDirect(key)
        : window.localStorage.getItem(key);
      if (fallback !== null || readStorageOverride(key) !== null) {
        throw new Error(`Large value fallback cleanup failed for ${key}`);
      }
    }
  }
}

async function rollbackPreparedStorageTransactionDirect(transaction: StorageTransaction): Promise<void> {
  await applyStorageTransactionSnapshotDirect(transaction.before);
  await verifyStorageTransactionSnapshotDirect(transaction.before);
  await clearStorageTransactionDirect();
}

async function runStorageTransactionDirect(after: StorageTransactionSnapshot): Promise<void> {
  const transaction = {
    version: 1,
    phase: "prepared",
    before: await captureStorageTransactionSnapshotDirect(after),
    after,
  } satisfies StorageTransaction;

  await writePreparedStorageTransactionDirect(transaction);
  try {
    await applyStorageTransactionSnapshotDirect(after);
    await verifyStorageTransactionSnapshotDirect(after);
    await markStorageTransactionCommittedDirect(transaction);
  } catch (error) {
    try {
      await rollbackPreparedStorageTransactionDirect(transaction);
    } catch {
      // Keep the prepared journal. The next startup/read/write must finish
      // this rollback before exposing any value.
    }
    throw error;
  }

  // The values are already committed. If cleanup is interrupted, the
  // committed journal remains and recovery idempotently rolls them forward.
  await clearStorageTransactionDirect().catch(() => undefined);
}

async function recoverInterruptedStorageTransactionDirect(): Promise<void> {
  const transaction = await readStorageTransactionDirect();
  if (!transaction) return;

  const recoveryTarget = transaction.phase === "committed" ? transaction.after : transaction.before;
  await applyStorageTransactionSnapshotDirect(recoveryTarget);
  await verifyStorageTransactionSnapshotDirect(recoveryTarget);
  await clearStorageTransactionDirect();
}

async function reconcilePendingReminderDirect(): Promise<void> {
  const pending = await getStoredValueDirect(REMINDER_RECONCILIATION_KEY);
  if (pending === null) return;
  if (!hasNativeBridge()) {
    await removeStoredValueDirect(REMINDER_RECONCILIATION_KEY);
    return;
  }

  let language: "zh" | "en" = "zh";
  try {
    if ((JSON.parse(pending) as { language?: unknown }).language === "en") language = "en";
  } catch {
    // Older pending markers did not include a language.
  }
  const reminder = parseDailyReminderValue(await getStoredValueDirect(REMINDER_KEY));

  if (!reminder.enabled) {
    await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
  } else {
    const permission = await LocalNotifications.checkPermissions();
    if (permission.display === "granted") {
      await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
      await scheduleDailyReminderNotification(reminder, language);
    } else {
      await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
      await setStoredValueDirect(REMINDER_KEY, JSON.stringify({ ...reminder, enabled: false }), true);
    }
  }
  await removeStoredValueDirect(REMINDER_RECONCILIATION_KEY);
}

export async function recoverInterruptedStudyDataWrite(): Promise<void> {
  await withStorageOperation(async () => {
    await recoverInterruptedStorageTransactionDirect();
    await reconcilePendingReminderDirect();
  });
}

export async function writeStoredStudySnapshot(snapshot: StoredStudySnapshot): Promise<void> {
  await withStorageOperation(async () => {
    await recoverInterruptedStorageTransactionDirect();
    if (Object.keys(snapshot.largeValues).some((key) => Object.prototype.hasOwnProperty.call(snapshot.values, key))) {
      throw new Error("A study snapshot key cannot use both small and large storage.");
    }
    const reminderLanguage = Object.values(snapshot.values).includes("en") ? "en" : "zh";
    const after = {
      values: {
        ...snapshot.values,
        [REMINDER_KEY]: JSON.stringify(snapshot.reminder),
        [REMINDER_RECONCILIATION_KEY]: JSON.stringify({ version: 1, language: reminderLanguage }),
      },
      largeValues: { ...snapshot.largeValues },
    } satisfies StorageTransactionSnapshot;
    await runStorageTransactionDirect(after);
  });
}

export async function cancelReminderAfterRestore(): Promise<void> {
  if (!hasNativeBridge()) {
    await withStorageOperation(async () => {
      await recoverInterruptedStorageTransactionDirect();
      await removeStoredValueDirect(REMINDER_RECONCILIATION_KEY);
    });
    return;
  }
  await withStorageOperation(async () => {
    await recoverInterruptedStorageTransactionDirect();
    await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
    // Cancellation already succeeded. A failed marker cleanup is left as a
    // harmless tombstone/retry instead of turning a successful finalizer into
    // a rollback that could desynchronize an enabled reminder.
    await removeStoredValueDirect(REMINDER_RECONCILIATION_KEY);
  });
}

export async function exportStudyBackupFile(filename: string, data: string): Promise<"shared" | "downloaded"> {
  const safeFilename = filename.replace(/[\\/:*?"<>|]/g, "-");
  if (hasNativeBridge()) {
    const path = `exports/${safeFilename}`;
    await Filesystem.writeFile({
      path,
      data,
      directory: Directory.Cache,
      encoding: Encoding.UTF8,
      recursive: true,
    });
    try {
      const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache });
      await Share.share({ title: safeFilename, files: [uri] });
      return "shared";
    } finally {
      await Filesystem.deleteFile({ path, directory: Directory.Cache }).catch(() => undefined);
    }
  }

  const url = URL.createObjectURL(new Blob([data], { type: "application/json;charset=utf-8" }));
  try {
    const link = document.createElement("a");
    link.href = url;
    link.download = safeFilename;
    document.body.append(link);
    link.click();
    link.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
  return "downloaded";
}

export async function playSelectionHaptic(): Promise<void> {
  if (!hasNativeBridge()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Haptics are an enhancement and should never interrupt navigation.
  }
}

export async function playTestHaptic(passed: boolean): Promise<void> {
  if (!hasNativeBridge()) return;
  try {
    await Haptics.notification({
      type: passed ? NotificationType.Success : NotificationType.Warning,
    });
  } catch {
    // Devices without a Taptic Engine safely continue without feedback.
  }
}

function parseDailyReminderValue(stored: string | null): DailyReminder {
  const fallback = { enabled: false, time: "20:00" } satisfies DailyReminder;
  if (!stored) return fallback;

  try {
    const parsed = JSON.parse(stored) as Partial<DailyReminder>;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.time ?? "") ? parsed.time! : fallback.time;
    return { enabled: parsed.enabled === true, time };
  } catch {
    return fallback;
  }
}

async function scheduleDailyReminderNotification(
  reminder: DailyReminder,
  language: "zh" | "en",
): Promise<void> {
  const [hour, minute] = reminder.time.split(":").map(Number);
  await LocalNotifications.schedule({
    notifications: [
      {
        id: DAILY_REMINDER_ID,
        title: language === "zh" ? "今天写一页题解簿" : "Write one page in your algo notebook",
        body: language === "zh" ? "用 10 分钟复习一道题，不用死磕。" : "Review one problem for 10 minutes — no grinding required.",
        schedule: { on: { hour, minute } },
        extra: { destination: "study-home" },
      },
    ],
  });
}

async function setReminderReconciliationMarker(language: "zh" | "en"): Promise<void> {
  await setStoredValue(
    REMINDER_RECONCILIATION_KEY,
    JSON.stringify({ version: 1, language }),
  );
}

async function clearReminderReconciliationMarker(): Promise<void> {
  await withStorageOperation(async () => {
    await recoverInterruptedStorageTransactionDirect();
    await removeStoredValueDirect(REMINDER_RECONCILIATION_KEY);
  });
}

export async function loadDailyReminder(): Promise<DailyReminder> {
  return parseDailyReminderValue(await getStoredValue(REMINDER_KEY));
}

export async function saveDailyReminder(
  reminder: DailyReminder,
  language: "zh" | "en",
): Promise<ReminderSaveResult> {
  if (!hasNativeBridge()) return "unsupported";

  try {
    // Persist the recovery intent before mutating notification state. If the
    // app stops after cancel/schedule but before saving the preference, startup
    // re-applies whichever reminder is actually persisted.
    await setReminderReconciliationMarker(language);

    if (!reminder.enabled) {
      await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
      await setStoredValue(REMINDER_KEY, JSON.stringify(reminder));
      await clearReminderReconciliationMarker();
      return "disabled";
    }

    let permission = await LocalNotifications.checkPermissions();
    if (permission.display === "prompt" || permission.display === "prompt-with-rationale") {
      permission = await LocalNotifications.requestPermissions();
    }
    if (permission.display !== "granted") {
      await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
      await setStoredValue(REMINDER_KEY, JSON.stringify({ ...reminder, enabled: false }));
      await clearReminderReconciliationMarker();
      return "denied";
    }

    await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
    await scheduleDailyReminderNotification(reminder, language);
    await setStoredValue(REMINDER_KEY, JSON.stringify(reminder));
    await clearReminderReconciliationMarker();
    return "scheduled";
  } catch {
    return "error";
  }
}

export async function shareStudyNote(title: string, text: string): Promise<"shared" | "copied" | "unavailable"> {
  try {
    const { value: canShare } = await Share.canShare();
    if (canShare) {
      await Share.share({ title, text });
      return "shared";
    }
  } catch {
    // Fall through to a clipboard copy when the share sheet is unavailable.
  }

  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return "copied";
  }
  return "unavailable";
}

export async function openExternalPage(url: string): Promise<void> {
  if (hasNativeBridge()) {
    await Browser.open({ url, presentationStyle: "popover" });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function clearStoredStudyData(
  keys: string[],
  language: "zh" | "en" = "zh",
): Promise<ClearStoredStudyDataResult> {
  window.dispatchEvent(new Event(STUDY_DATA_CLEAR_EVENT));
  let reminderCancelled = true;
  if (hasNativeBridge()) {
    // Record reconciliation before touching the scheduled notification. If
    // storage deletion later rolls back, startup restores the still-persisted
    // reminder instead of leaving its notification silently cancelled.
    await setReminderReconciliationMarker(language);
    try {
      await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
    } catch {
      reminderCancelled = false;
    }
  }

  await withStorageOperation(async () => {
    await recoverInterruptedStorageTransactionDirect();
    const largeKeys: string[] = [];
    for (const key of keys) {
      const primaryValue = hasDedicatedLargeStorage()
        ? await readLargePrimaryValueDirect(key)
        : null;
      const migrationMarker = hasDedicatedLargeStorage()
        ? await getStoredValueDirect(largeMigrationKey(key))
        : null;
      if (primaryValue !== null || migrationMarker !== null) largeKeys.push(key);
    }
    const largeKeySet = new Set(largeKeys);
    const values = Object.fromEntries(
      [...keys.filter((key) => !largeKeySet.has(key)), REMINDER_KEY].map((key) => [key, null]),
    ) as NullableStoredValues;
    values[REMINDER_RECONCILIATION_KEY] = reminderCancelled
      ? null
      : JSON.stringify({ version: 1, language });
    const largeValues = Object.fromEntries(
      largeKeys.map((key) => [key, null]),
    ) as NullableStoredValues;
    await runStorageTransactionDirect({ values, largeValues });

    // The transaction already verified every primary deletion. These logical
    // reads additionally ensure no fallback can resurrect a removed value.
    const remainingValues = await Promise.all(keys.map((key) => getLargeStoredValueDirect(key)));
    const remainingSmallValues = await Promise.all(keys.map((key) => getStoredValueDirect(key)));
    if (
      remainingValues.some((value) => value !== null)
      || remainingSmallValues.some((value) => value !== null)
      || await getStoredValueDirect(REMINDER_KEY) !== null
    ) {
      throw new Error("Some on-device study data could not be deleted.");
    }
  });
  return { reminderCancelled };
}
