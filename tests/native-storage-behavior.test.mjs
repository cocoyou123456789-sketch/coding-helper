import assert from "node:assert/strict";
import test from "node:test";

const DATABASE_NAME = "tijiebu-study-files-v1";
const OBJECT_STORE_NAME = "documents";
const JOURNAL_KEY = "tijiebu-storage-transaction-v1";
const JOURNAL_PAYLOAD_KEY = "__tijiebu-storage-transaction-payload-v1__";

class MemoryStorage {
  #values = new Map();

  get length() {
    return this.#values.size;
  }

  clear() {
    this.#values.clear();
  }

  getItem(key) {
    return this.#values.has(String(key)) ? this.#values.get(String(key)) : null;
  }

  key(index) {
    return [...this.#values.keys()][index] ?? null;
  }

  removeItem(key) {
    this.#values.delete(String(key));
  }

  setItem(key, value) {
    this.#values.set(String(key), String(value));
  }
}

class MemoryIndexedDB {
  #databases = new Map();
  #writeFailures = new Map();

  failNextPuts(key, count = 1) {
    this.#writeFailures.set(`put:${String(key)}`, count);
  }

  getValue(key) {
    return this.#databases
      .get(DATABASE_NAME)
      ?.stores.get(OBJECT_STORE_NAME)
      ?.get(String(key)) ?? null;
  }

  open(name, version) {
    const request = {
      error: null,
      result: null,
      onerror: null,
      onsuccess: null,
      onupgradeneeded: null,
    };

    queueMicrotask(() => {
      let record = this.#databases.get(name);
      const needsUpgrade = !record || (version ?? 1) > record.version;
      if (!record) {
        record = { version: version ?? 1, stores: new Map() };
        this.#databases.set(name, record);
      } else if (needsUpgrade) {
        record.version = version;
      }

      request.result = this.#databaseHandle(record);
      if (needsUpgrade) request.onupgradeneeded?.({ target: request });
      queueMicrotask(() => request.onsuccess?.({ target: request }));
    });

    return request;
  }

  #databaseHandle(record) {
    return {
      close() {},
      createObjectStore: (name) => {
        if (!record.stores.has(name)) record.stores.set(name, new Map());
        return {};
      },
      objectStoreNames: {
        contains: (name) => record.stores.has(name),
      },
      transaction: (name, mode) => this.#transaction(record, name, mode),
    };
  }

  #transaction(record, storeName, mode) {
    const transaction = {
      error: null,
      onabort: null,
      oncomplete: null,
      onerror: null,
      objectStore: (requestedStore) => {
        if (requestedStore !== storeName || !record.stores.has(requestedStore)) {
          throw new Error(`Unknown IndexedDB object store: ${requestedStore}`);
        }
        const store = record.stores.get(requestedStore);
        return {
          delete: (key) => this.#scheduleWrite(transaction, mode, "delete", store, key),
          get: (key) => {
            const request = { error: null, result: undefined, onerror: null, onsuccess: null };
            queueMicrotask(() => {
              request.result = store.get(String(key));
              request.onsuccess?.({ target: request });
            });
            return request;
          },
          put: (value, key) => this.#scheduleWrite(transaction, mode, "put", store, key, value),
        };
      },
    };
    return transaction;
  }

  #scheduleWrite(transaction, mode, operation, store, key, value) {
    if (mode !== "readwrite") throw new Error("IndexedDB write used a readonly transaction");
    const request = { error: null, result: key, onerror: null, onsuccess: null };
    queueMicrotask(() => {
      const failureKey = `${operation}:${String(key)}`;
      const remainingFailures = this.#writeFailures.get(failureKey) ?? 0;
      if (remainingFailures > 0) {
        if (remainingFailures === 1) this.#writeFailures.delete(failureKey);
        else this.#writeFailures.set(failureKey, remainingFailures - 1);
        const error = new Error(`Injected IndexedDB ${operation} failure for ${String(key)}`);
        request.error = error;
        transaction.error = error;
        request.onerror?.({ target: request });
        transaction.onerror?.({ target: transaction });
        return;
      }

      if (operation === "put") store.set(String(key), String(value));
      else store.delete(String(key));
      request.onsuccess?.({ target: request });
      transaction.oncomplete?.({ target: transaction });
    });
    return request;
  }
}

let importSequence = 0;

async function createHarness() {
  const localStorage = new MemoryStorage();
  const indexedDB = new MemoryIndexedDB();
  const events = new EventTarget();
  globalThis.window = Object.assign(events, {
    indexedDB,
    localStorage,
    setTimeout: globalThis.setTimeout.bind(globalThis),
  });
  delete process.env.NEXT_PUBLIC_NATIVE_APP;

  const moduleUrl = new URL("../app/native-app.ts", import.meta.url);
  moduleUrl.searchParams.set("behavior-test", String(importSequence++));
  const storage = await import(moduleUrl.href);
  return { indexedDB, localStorage, storage };
}

async function importFreshStorageModule() {
  const moduleUrl = new URL("../app/native-app.ts", import.meta.url);
  moduleUrl.searchParams.set("behavior-test", String(importSequence++));
  return import(moduleUrl.href);
}

test("writeStoredStudySnapshot round-trips small and IndexedDB-backed large values", async () => {
  const { storage } = await createHarness();

  await storage.writeStoredStudySnapshot({
    values: { "study-small": "new small value", language: "en" },
    largeValues: { "study-large": "new large value" },
    reminder: { enabled: false, time: "08:45" },
  });

  assert.equal(await storage.getStoredValue("study-small"), "new small value");
  assert.equal(await storage.getLargeStoredValue("study-large"), "new large value");
  assert.deepEqual(await storage.loadDailyReminder(), { enabled: false, time: "08:45" });
});

test("a failed target write automatically restores the previous small and large values", async () => {
  const { indexedDB, storage } = await createHarness();
  await storage.setStoredValue("study-small", "old small value");
  await storage.setLargeStoredValue("study-large", "old large value");
  indexedDB.failNextPuts("study-large");

  await assert.rejects(
    storage.writeStoredStudySnapshot({
      values: { "study-small": "new small value" },
      largeValues: { "study-large": "new large value" },
      reminder: { enabled: false, time: "20:00" },
    }),
    /Injected IndexedDB put failure/,
  );

  assert.equal(await storage.getStoredValue("study-small"), "old small value");
  assert.equal(await storage.getLargeStoredValue("study-large"), "old large value");
  assert.equal(window.localStorage.getItem(JOURNAL_KEY), null);
  assert.equal(indexedDB.getValue(JOURNAL_PAYLOAD_KEY), null);
});

test("deleting a large value also removes a stale small fallback so it cannot reappear", async () => {
  const { indexedDB, localStorage, storage } = await createHarness();
  await storage.setLargeStoredValue("study-document", "current large value");
  localStorage.setItem("study-document", "stale legacy fallback");

  const result = await storage.clearStoredStudyData(["study-document"]);

  assert.deepEqual(result, { reminderCancelled: true });
  assert.equal(indexedDB.getValue("study-document"), null);
  assert.equal(localStorage.getItem("study-document"), null);
  assert.equal(await storage.getLargeStoredValue("study-document"), null);
  assert.equal(await storage.getStoredValue("study-document"), null);
});

test("a fresh module recovers a prepared journal when both the target write and rollback were interrupted", async () => {
  const { indexedDB, localStorage, storage } = await createHarness();
  await storage.setStoredValue("study-small", "old small value");
  await storage.setLargeStoredValue("study-large", "old large value");
  indexedDB.failNextPuts("study-large", 2);

  await assert.rejects(
    storage.writeStoredStudySnapshot({
      values: { "study-small": "new small value" },
      largeValues: { "study-large": "new large value" },
      reminder: { enabled: false, time: "20:00" },
    }),
    /Injected IndexedDB put failure/,
  );
  assert.match(localStorage.getItem(JOURNAL_KEY) ?? "", /"phase":"prepared"/);
  assert.notEqual(indexedDB.getValue(JOURNAL_PAYLOAD_KEY), null);

  const restartedStorage = await importFreshStorageModule();
  await restartedStorage.recoverInterruptedStudyDataWrite();

  assert.equal(await restartedStorage.getStoredValue("study-small"), "old small value");
  assert.equal(await restartedStorage.getLargeStoredValue("study-large"), "old large value");
  assert.equal(localStorage.getItem(JOURNAL_KEY), null);
  assert.equal(indexedDB.getValue(JOURNAL_PAYLOAD_KEY), null);
});
