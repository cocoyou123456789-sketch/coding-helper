import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);

  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("renders the Hot 100 learning workspace", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /题解簿/);
  assert.match(html, /LeetCode Hot 100/);
  assert.match(html, /两数之和/);
  assert.match(html, /今天学一点/);
  assert.match(html, /闯关小课/);
  assert.match(html, /极速抢答/);
  assert.match(html, /算法闪卡/);
  assert.match(html, /按难度学习/);
  assert.match(html, /Language \/ 语言/);
  assert.match(html, /调整字体大小/);
  assert.match(html, /type="range"/);
  assert.match(html, /113%/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("ships 100 problems, the Python runner, and Pages workflow", async () => {
  const [problemSource, pageSource, detailA, detailB, detailC, englishA, englishB, englishC, workerSource, workflowSource] = await Promise.all([
    readFile(new URL("../app/problems.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-details-a.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-details-b.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-details-c.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-i18n-a.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-i18n-b.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-i18n-c.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/python-worker.js", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
  ]);

  assert.equal((problemSource.match(/\bq\(\{ id:/g) ?? []).length, 100);
  assert.equal(([detailA, detailB, detailC].join("\n").match(/^  \d+: \{/gm) ?? []).length, 100);
  assert.equal(([englishA, englishB, englishC].join("\n").match(/^  \d+: \{/gm) ?? []).length, 100);
  assert.match(englishA, /title: "Two Sum"/);
  assert.match(problemSource, /id: 32, title: "最长有效括号"/);
  assert.match(pageSource, /运行测试/);
  assert.match(pageSource, /逐行解释/);
  assert.match(pageSource, /打开力扣官方原题/);
  assert.match(workerSource, /Pyodide/);
  assert.match(workerSource, /build_list = make_list/);
  assert.match(workflowSource, /actions\/deploy-pages@v4/);
  await access(new URL("../public/og.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
