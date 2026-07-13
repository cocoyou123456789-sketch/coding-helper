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

test("offline navigation with deep-link query uses the cached app shell", async () => {
  const cacheMatches = [];
  const context = workerContext(async () => {
    throw new Error("offline");
  });
  context.caches.open = async () => ({
    async match(request, options) {
      cacheMatches.push({ request: String(request.url ?? request), ignoreSearch: options?.ignoreSearch === true });
      return options?.ignoreSearch ? new Response("cached app shell", { status: 200 }) : undefined;
    },
  });

  const response = await context.networkFirst(new Request(`${scope}?mode=workspace&problem=283`));

  assert.equal(await response.text(), "cached app shell");
  assert.deepEqual(cacheMatches, [{
    request: `${scope}?mode=workspace&problem=283`,
    ignoreSearch: true,
  }]);
});

test("the signature worker path cannot match an older stable worker cache entry", async () => {
  const fetched = [];
  const context = workerContext(async (request) => {
    fetched.push(String(request.url ?? request));
    return new Response("new signature worker", { status: 200 });
  });
  context.caches.open = async () => ({
    async match(request) {
      const pathname = new URL(String(request.url ?? request)).pathname;
      return pathname.endsWith("/python-worker.js")
        ? new Response("old stable worker", { status: 200 })
        : undefined;
    },
    async put() {},
  });

  const response = await context.cacheFirst(new Request(`${scope}python-worker-signature-v1.js`));

  assert.equal(await response.text(), "new signature worker");
  assert.deepEqual(fetched, [`${scope}python-worker-signature-v1.js`]);
  assert.match(workerSource, /appUrl\("python-worker-signature-v1\.js"\)/);
});
