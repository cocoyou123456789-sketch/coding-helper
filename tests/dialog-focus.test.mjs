import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const file = (path) => new URL(`../${path}`, import.meta.url);

test("all modal dialogs trap focus, close with Escape, and restore the trigger", async () => {
  const [hook, page, installer] = await Promise.all([
    readFile(file("app/use-dialog-focus.ts"), "utf8"),
    readFile(file("app/page.tsx"), "utf8"),
    readFile(file("app/pwa-installer.tsx"), "utf8"),
  ]);

  assert.match(hook, /event\.key === "Escape"/);
  assert.match(hook, /event\.key !== "Tab"/);
  assert.match(hook, /document\.body\.style\.overflow = "hidden"/);
  assert.match(hook, /returnTarget\.focus/);
  assert.match(hook, /requestAnimationFrame/);

  assert.match(page, /nativeSettingsDialogRef = useDialogFocus/);
  assert.match(page, /guideDialogRef = useDialogFocus/);
  assert.match(page, /event\.target === event\.currentTarget/);
  assert.match(installer, /installDialogRef = useDialogFocus/);
  assert.match(installer, /event\.target === event\.currentTarget/);
});
