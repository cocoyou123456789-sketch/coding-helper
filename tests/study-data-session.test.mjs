import assert from "node:assert/strict";
import test from "node:test";

class MemoryStorage {
  #values = new Map();

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

test("study tabs detect peers and stale revisions cannot write", async () => {
  const previousWindow = globalThis.window;
  const previousNavigator = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const testWindow = new EventTarget();
  testWindow.localStorage = new MemoryStorage();
  testWindow.setTimeout = setTimeout;
  globalThis.window = testWindow;
  Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true });

  const source = new URL("../app/study-data-session.ts", import.meta.url);
  const first = await import(`${source.href}?tab=first`);
  const second = await import(`${source.href}?tab=second`);
  const unregisterFirst = first.registerStudyDataTab();
  const unregisterSecond = second.registerStudyDataTab();

  try {
    assert.equal(await first.hasOtherActiveStudyTab(100), true);
    first.assertStudyDataSessionCurrent();

    const order = [];
    let releaseFirst;
    const firstFinished = first.withStudyDataReadLock(async () => {
      order.push("first-start");
      await new Promise((resolve) => { releaseFirst = resolve; });
      order.push("first-end");
    });
    while (!order.includes("first-start")) await new Promise((resolve) => setTimeout(resolve, 5));
    const secondFinished = second.withStudyDataReadLock(async () => {
      order.push("second");
    });
    await new Promise((resolve) => setTimeout(resolve, 80));
    assert.deepEqual(order, ["first-start"]);
    releaseFirst();
    await Promise.all([firstFinished, secondFinished]);
    assert.deepEqual(order, ["first-start", "first-end", "second"]);

    await assert.rejects(
      () => first.withExclusiveStudyDataOperation(async () => undefined),
      first.StudyDataLockUnavailableError,
    );
    await assert.rejects(
      () => first.withStudyDataWriteLock(async () => undefined),
      first.StudyDataLockUnavailableError,
    );

    second.advanceStudyDataRevision();
    assert.throws(
      () => first.assertStudyDataSessionCurrent(),
      /changed in another tab/i,
    );

    unregisterSecond();
    assert.equal(await first.hasOtherActiveStudyTab(30), false);
  } finally {
    unregisterFirst();
    unregisterSecond();
    globalThis.window = previousWindow;
    if (previousNavigator) Object.defineProperty(globalThis, "navigator", previousNavigator);
    else delete globalThis.navigator;
  }
});
