import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";

const workerSource = await readFile(new URL("../public/sw.js", import.meta.url), "utf8");
const origin = "https://example.test";
const scope = `${origin}/coding-helper/`;

function workerContext(fetchImplementation = async () => new Response("", { status: 404 })) {
  const context = {
    URL,
    Response,
    caches: {},
    fetch: fetchImplementation,
    self: {
      addEventListener() {},
      location: { origin },
      registration: { scope },
    },
  };
  vm.runInNewContext(workerSource, context);
  return context;
}

test("deferred asset paths resolve inside the GitHub Pages scope", () => {
  const context = workerContext();
  const dependencies = [...context.appAssetDependencies(
    '["assets/editor-123.js","assets/course-456.css","https://outside.test/file.js"]',
    `${scope}assets/page-1.js`,
  )];

  assert.deepEqual(dependencies, [
    `${scope}assets/editor-123.js`,
    `${scope}assets/course-456.css`,
  ]);
});

test("install caching follows nested deferred JavaScript and CSS", async () => {
  const sources = new Map([
    [`${scope}assets/page-1.js`, '["assets/editor-123.js","assets/course-456.css"]'],
    [`${scope}assets/editor-123.js`, 'import("./python-language-789.js")'],
    [`${scope}assets/course-456.css`, ".course{}"],
    [`${scope}assets/python-language-789.js`, "export const ready = true"],
  ]);
  const context = workerContext(async (url) => sources.has(String(url))
    ? new Response(sources.get(String(url)), { status: 200 })
    : new Response("missing", { status: 404 }));
  const cached = [];

  await context.cacheAppAssetGraph({
    async put(request) {
      cached.push(String(request));
    },
  }, [`${scope}assets/page-1.js`]);

  assert.deepEqual(cached.sort(), [...sources.keys()].sort());
});
