import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const nativeStorage = await readFile(
  new URL("../app/native-app.ts", import.meta.url),
  "utf8",
);

test("backup restore uses a two-phase journal with its payload in dedicated storage", () => {
  assert.match(nativeStorage, /phase: "prepared"/);
  assert.match(nativeStorage, /phase: "committed"/);
  assert.match(nativeStorage, /STORAGE_TRANSACTION_PAYLOAD_KEY/);
  assert.match(nativeStorage, /writeLargePrimaryValueDirect\(STORAGE_TRANSACTION_PAYLOAD_KEY, payload\)/);
  assert.match(nativeStorage, /recoverInterruptedStorageTransactionDirect/);
  assert.match(nativeStorage, /transaction\.phase === "committed" \? transaction\.after : transaction\.before/);
  assert.doesNotMatch(nativeStorage, /writeStorageOverride\("large"/);
  assert.doesNotMatch(nativeStorage, /Object\.hasOwn\(/);
});

test("large local libraries use the same verified crash-safe transaction", () => {
  assert.match(nativeStorage, /export async function writeLargeStoredValuesAtomically/);
  assert.match(nativeStorage, /runStorageTransactionDirect\(\{ values: \{\}, largeValues: \{ \.\.\.values \} \}\)/);
  assert.match(nativeStorage, /keys\.includes\(STORAGE_TRANSACTION_PAYLOAD_KEY\)/);
});

test("primary failures cannot be hidden by a stale large-value fallback", () => {
  assert.match(nativeStorage, /Only a confirmed "missing" primary may consult the legacy fallback/);
  assert.match(nativeStorage, /Large value write could not be verified/);
  assert.match(nativeStorage, /Large value deletion could not be verified/);
  assert.match(nativeStorage, /Preferences deletion could not be verified/);
  assert.doesNotMatch(nativeStorage, /deleteLargeWebValue\(key\)\.catch/);
  assert.doesNotMatch(nativeStorage, /Preferences\.remove\(\{ key \}\)\.catch/);
  assert.match(nativeStorage, /const largeKeySet = new Set\(largeKeys\)/);
  assert.match(nativeStorage, /keys\.filter\(\(key\) => !largeKeySet\.has\(key\)\)/);
});

test("reminder side effects have a persisted startup reconciliation path", () => {
  assert.match(nativeStorage, /REMINDER_RECONCILIATION_KEY/);
  assert.match(nativeStorage, /setReminderReconciliationMarker\(language\)/);
  assert.match(nativeStorage, /reconcilePendingReminderDirect/);
  assert.match(nativeStorage, /await recoverInterruptedStudyDataWrite\(\)\.catch/);
  assert.match(nativeStorage, /scheduleDailyReminderNotification\(reminder, language\)/);
});

test("native background saves synchronously stage the latest small value", () => {
  assert.match(nativeStorage, /export function stageNativeStoredValueForBackground/);
  assert.match(nativeStorage, /writeBackgroundStage\(key, value\)/);
  assert.match(nativeStorage, /if \(!hasNativeBridge\(\)\) return false/);
  assert.match(nativeStorage, /if \(stagedValue !== value\)/);
  assert.match(nativeStorage, /readBackgroundStage\(key\)/);
});
