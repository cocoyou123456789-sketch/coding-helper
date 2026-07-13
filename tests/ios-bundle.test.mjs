import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { test } from "node:test";

const root = new URL("../", import.meta.url);
const file = (path) => new URL(path, root);

test("the iOS bundle is local, branded independently, and App Store ready", async () => {
  const [html, nativeHtml, configSource, nativeConfig, worker, privacyManifest, packageSwift, infoPlist, manifestSource, nativeStorageSource, courseModelSource, editorSource] = await Promise.all([
    readFile(file("dist/client/index.html"), "utf8"),
    readFile(file("ios/App/App/public/index.html"), "utf8"),
    readFile(file("capacitor.config.ts"), "utf8"),
    readFile(file("ios/App/App/capacitor.config.json"), "utf8"),
    readFile(file("ios/App/App/public/python-worker.js"), "utf8"),
    readFile(file("ios/App/App/PrivacyInfo.xcprivacy"), "utf8"),
    readFile(file("ios/App/CapApp-SPM/Package.swift"), "utf8"),
    readFile(file("ios/App/App/Info.plist"), "utf8"),
    readFile(file("dist/client/.vite/manifest.json"), "utf8"),
    readFile(file("app/native-app.ts"), "utf8"),
    readFile(file("app/course-notes-model.ts"), "utf8"),
    readFile(file("app/code-editor.ts"), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);

  assert.match(html, /class="app-shell is-native-app"/);
  assert.match(html, /href="\/assets\//);
  assert.doesNotMatch(html, /\/coding-helper\//);
  assert.doesNotMatch(html, /LeetCode|力扣|HOT 100|Hot 100/);
  assert.equal(nativeHtml, html);
  assert.doesNotMatch(nativeHtml, /leetcode-code-editor-[^"']+\.js/);
  assert.doesNotMatch(nativeHtml, /course-notes-[^"']+\.js/);

  for (const moduleId of ["app/leetcode-code-editor.tsx", "app/course-notes.tsx"]) {
    const entry = manifest[moduleId];
    assert.equal(entry?.isDynamicEntry, true);
    await stat(file(`ios/App/App/public/${entry.file}`));
    for (const stylesheet of entry.css ?? []) {
      await stat(file(`ios/App/App/public/${stylesheet}`));
    }
  }

  assert.match(configSource, /webDir: "dist\/client"/);
  assert.match(configSource, /appId: "com\.coocylh\.tijiebu"/);
  assert.doesNotMatch(configSource, /server\s*:\s*\{[^}]*url\s*:/s);
  assert.equal(JSON.parse(nativeConfig).appId, "com.coocylh.tijiebu");

  assert.match(worker, /const IS_NATIVE_APP = true/);
  assert.doesNotMatch(worker, /cdn\.jsdelivr\.net/);
  assert.match(worker, /Network access is disabled inside the offline Python runner/);
  assert.doesNotMatch(worker, /micropip/);

  assert.match(privacyManifest, /NSPrivacyAccessedAPICategoryUserDefaults/);
  assert.match(privacyManifest, /CA92\.1/);
  assert.match(privacyManifest, /NSPrivacyAccessedAPICategoryFileTimestamp/);
  assert.match(privacyManifest, /C617\.1/);
  assert.match(packageSwift, /CapacitorLocalNotifications/);
  assert.match(packageSwift, /CapacitorPreferences/);
  assert.match(packageSwift, /CapacitorShare/);
  assert.match(packageSwift, /CapacitorFilesystem/);
  assert.match(packageSwift, /CapgoCapacitorSpeechRecognition/);
  assert.match(infoPlist, /NSMicrophoneUsageDescription/);
  assert.match(infoPlist, /NSSpeechRecognitionUsageDescription/);
  assert.match(infoPlist, /不会保存录音/);
  assert.doesNotMatch(`${nativeStorageSource}\n${courseModelSource}\n${editorSource}`, /Object\.hasOwn\(|\.at\(/);

  await assert.rejects(stat(file("ios/App/App/public/sw.js")), { code: "ENOENT" });
  await assert.rejects(stat(file("ios/App/App/public/manifest.webmanifest")), { code: "ENOENT" });
});

test("the pinned Python runtime is included in the app bundle", async () => {
  const requiredFiles = [
    ["pyodide.js", 10_000],
    ["pyodide.asm.js", 500_000],
    ["pyodide.asm.wasm", 5_000_000],
    ["python_stdlib.zip", 2_000_000],
    ["pyodide-lock.json", 50_000],
  ];

  for (const [name, minimumSize] of requiredFiles) {
    const details = await stat(file(`ios/App/App/public/pyodide/${name}`));
    assert.ok(details.size >= minimumSize, `${name} should be bundled, not a placeholder`);
  }

  const pyodideLoader = await readFile(file("ios/App/App/public/pyodide/pyodide.js"), "utf8");
  assert.doesNotMatch(pyodideLoader, /cdn\.jsdelivr\.net/);
});
