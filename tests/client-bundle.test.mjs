import assert from "node:assert/strict";
import { readFile, stat } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("heavy practice and course features stay out of the study-home bundle", async () => {
  const manifest = JSON.parse(await readFile(new URL("dist/client/.vite/manifest.json", root), "utf8"));
  const page = manifest["app/page.tsx"];
  const editor = manifest["app/leetcode-code-editor.tsx"];
  const course = manifest["app/course-notes.tsx"];
  const visualizer = manifest["app/execution-visualizer.tsx"];

  assert.ok(page?.dynamicImports?.includes("app/leetcode-code-editor.tsx"));
  assert.ok(page?.dynamicImports?.includes("app/course-notes.tsx"));
  assert.ok(page?.dynamicImports?.includes("app/execution-visualizer.tsx"));
  assert.equal(editor?.isDynamicEntry, true);
  assert.equal(course?.isDynamicEntry, true);
  assert.equal(visualizer?.isDynamicEntry, true);

  const pageFile = new URL(`dist/client/${page.file}`, root);
  const pageSize = (await stat(pageFile)).size;
  const compressedSize = gzipSync(await readFile(pageFile)).byteLength;
  assert.ok(pageSize < 350_000, `study-home route bundle is ${pageSize} bytes`);
  assert.ok(compressedSize < 120_000, `study-home route gzip is ${compressedSize} bytes`);
});
