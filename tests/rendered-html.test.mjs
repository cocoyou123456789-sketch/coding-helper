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
  assert.match(html, /今天写一页/);
  assert.match(html, /第一次使用？照着 4 步走/);
  assert.match(html, /闯关小课/);
  assert.match(html, /极速抢答/);
  assert.match(html, /算法闪卡/);
  assert.match(html, /直接练完整题/);
  assert.match(html, /完整题目练习/);
  assert.match(html, /按难度学习/);
  assert.match(html, /Language \/ 语言/);
  assert.match(html, /调整字体大小/);
  assert.match(html, /type="range"/);
  assert.match(html, /113%/);
  assert.match(html, /manifest\.webmanifest/);
  assert.match(html, /apple-mobile-web-app-capable/);
  assert.match(html, /viewport-fit=cover/);
  assert.match(html, /theme-color/);
  assert.doesNotMatch(html, /_vinext_fonts/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/i);
});

test("ships 100 problems, the Python runner, and Pages workflow", async () => {
  const [problemSource, pageSource, pwaSource, detailA, detailB, detailC, englishA, englishB, englishC, workerSource, serviceWorkerSource, manifestSource, workflowSource] = await Promise.all([
    readFile(new URL("../app/problems.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/pwa-installer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-details-a.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-details-b.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-details-c.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-i18n-a.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-i18n-b.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-i18n-c.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/python-worker.js", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);

  assert.equal((problemSource.match(/\bq\(\{ id:/g) ?? []).length, 100);
  assert.equal(([detailA, detailB, detailC].join("\n").match(/^  \d+: \{/gm) ?? []).length, 100);
  assert.equal(([englishA, englishB, englishC].join("\n").match(/^  \d+: \{/gm) ?? []).length, 100);
  assert.match(englishA, /title: "Two Sum"/);
  assert.match(problemSource, /id: 32, title: "最长有效括号"/);
  assert.match(pageSource, /运行测试/);
  assert.match(pageSource, /逐行解释/);
  assert.match(pageSource, /在力扣查看官方原题/);
  assert.match(pageSource, /完整题目练习工作台/);
  assert.match(pageSource, /原题 \+ 代码/);
  assert.match(pageSource, /mobile-notes-context/);
  assert.match(pageSource, /app-mode-nav/);
  assert.match(pageSource, /测试通过，下一步：写复盘/);
  assert.match(pageSource, /mobile-workspace-tabs/);
  assert.match(pageSource, /wrap="off"/);
  assert.match(pwaSource, /serviceWorker\.register/);
  assert.match(pwaSource, /安装 App/);
  assert.match(workerSource, /Pyodide/);
  assert.match(workerSource, /build_list = make_list/);
  assert.match(serviceWorkerSource, /self\.registration\.scope/);
  assert.equal(manifest.start_url, "./?source=pwa");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.background_color, "#fff7f9");
  assert.equal(manifest.theme_color, "#b94368");
  assert.equal(manifest.icons.length, 3);
  assert.match(serviceWorkerSource, /2026-07-12-pink/);
  assert.match(workflowSource, /actions\/deploy-pages@v4/);
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../public/favicon.png", import.meta.url));
  await access(new URL("../public/icons/apple-touch-icon.png", import.meta.url));
  await access(new URL("../public/icons/icon-192.png", import.meta.url));
  await access(new URL("../public/icons/icon-512.png", import.meta.url));
  await access(new URL("../public/icons/icon-maskable-512.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});
