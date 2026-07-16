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

test("renders a non-editable hydration shell before local study data is restored", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);

  const html = await response.text();
  assert.match(html, /<html lang="zh-CN">/i);
  assert.match(html, /题解簿/);
  assert.match(html, /LeetCode Hot 100/);
  assert.match(html, /正在恢复这台设备上的学习记录/);
  assert.doesNotMatch(html, /两数之和/);
  assert.doesNotMatch(html, /<textarea\b/i);
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

test("ships Hot 100 plus five extra problems, course dictation, the Python runner, and Pages workflow", async () => {
  const [problemSource, pageSource, courseSource, speechSource, pwaSource, detailA, detailB, detailC, englishA, englishB, englishC, workerSource, serviceWorkerSource, manifestSource, workflowSource] = await Promise.all([
    readFile(new URL("../app/problems.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/course-notes.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/speech-notes.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/pwa-installer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-details-a.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-details-b.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-details-c.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-i18n-a.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-i18n-b.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/problem-i18n-c.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/python-worker-trace-v2.js", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../.github/workflows/pages.yml", import.meta.url), "utf8"),
  ]);
  const manifest = JSON.parse(manifestSource);

  assert.equal((problemSource.match(/\bq\(\{ id:/g) ?? []).length, 105);
  assert.equal(([detailA, detailB, detailC].join("\n").match(/^  \d+: \{/gm) ?? []).length, 105);
  assert.equal(([englishA, englishB, englishC].join("\n").match(/^  \d+: \{/gm) ?? []).length, 105);
  assert.match(englishA, /title: "Two Sum"/);
  assert.match(problemSource, /id: 32, title: "最长有效括号"/);
  assert.match(problemSource, /id: 167, title: "两数之和 II - 输入有序数组"/);
  assert.match(problemSource, /id: 2824, title: "统计和小于目标的下标对数目"/);
  assert.match(problemSource, /id: 16, title: "最接近的三数之和"/);
  assert.match(problemSource, /id: 18, title: "四数之和"/);
  assert.match(problemSource, /id: 611, title: "有效三角形的个数"/);
  assert.match(problemSource, /export interface ProblemSignature/);
  assert.match(problemSource, /kind: "solution" \| "design"/);
  assert.match(detailC, /^  167: \{/m);
  assert.match(englishC, /^  167: \{/m);
  for (const id of [2824, 16, 18, 611]) {
    assert.match(detailC, new RegExp(`^  ${id}: \\{`, "m"));
    assert.match(englishC, new RegExp(`^  ${id}: \\{`, "m"));
  }
  assert.match(pageSource, /运行测试/);
  assert.match(pageSource, /逐行解释|每一行代码是什么意思/);
  assert.match(pageSource, /来源：LeetCode/);
  assert.match(pageSource, /currentDetail\.examples/);
  assert.match(pageSource, /完整题目练习工作台/);
  assert.match(pageSource, /原题 \+ 代码/);
  assert.match(pageSource, /mobile-notes-context/);
  assert.match(pageSource, /app-mode-nav/);
  assert.match(pageSource, /本机测试通过，完成 3 步巩固/);
  assert.match(pageSource, /我已在力扣 Accepted，标记掌握/);
  assert.match(pageSource, /推荐下一题/);
  assert.match(pageSource, /在当前难度和题型中：先续学，再复习，最后开新题/);
  assert.match(pageSource, /按学习状态筛选题目/);
  assert.match(pageSource, /先把代码外壳找回来/);
  assert.match(pageSource, /恢复初始代码后，从 pass 那一行开始写/);
  assert.match(pageSource, /当前代码（包括注释）和逐行解释会被替换/);
  assert.match(pageSource, /你的代码还没有执行，也没有丢失/);
  assert.match(pageSource, /代码运行太久，先检查循环/);
  assert.match(pageSource, /先恢复原题要求的代码入口/);
  assert.match(pageSource, /python-worker-trace-v2\.js/);
  assert.match(pageSource, /workerFailed: "Python 环境暂时无法启动，请重新运行。"/);
  assert.match(pageSource, /保存失败，请先复制重要笔记/);
  assert.match(pageSource, /saveErrorBanner/);
  assert.match(pageSource, /mobile-workspace-tabs/);
  assert.match(pageSource, /LeetCodeCodeEditor/);
  assert.match(pageSource, /ExecutionVisualizer/);
  assert.match(pageSource, /lazy\(loadExecutionVisualizer\)/);
  assert.match(pageSource, /去 LeetCode 提交/);
  assert.match(pageSource, /practice-ide\.module\.css/);
  assert.match(pageSource, /课程笔记/);
  assert.match(pageSource, /CourseNotes/);
  assert.match(courseSource, /加载官方课程播放器/);
  assert.match(courseSource, /开始听写/);
  assert.match(courseSource, /不下载视频/);
  assert.match(courseSource, /loading="lazy"/);
  assert.match(courseSource, /aria-labelledby="course-transcript-heading"/);
  assert.match(courseSource, /aria-labelledby="course-personal-notes-heading"/);
  assert.match(speechSource, /webkitSpeechRecognition/);
  assert.match(speechSource, /NativeSpeechRecognition/);
  assert.match(pwaSource, /serviceWorker\.register/);
  assert.match(pwaSource, /安装 App/);
  assert.match(workerSource, /Pyodide/);
  assert.match(workerSource, /build_list = make_list/);
  assert.match(workerSource, /__signature_contract/);
  assert.match(workerSource, /inspect\.signature/);
  assert.match(workerSource, /missing_class/);
  assert.match(workerSource, /missing_method/);
  assert.match(workerSource, /incompatible_parameters/);
  assert.match(workerSource, /globals\(\)\[__method_name\] = getattr/);
  assert.match(workerSource, /PYTHON_TRACE_SUPPORT/);
  assert.match(workerSource, /co_filename != "<solution>"/);
  assert.match(workerSource, /"event-limit"/);
  assert.match(serviceWorkerSource, /self\.registration\.scope/);
  assert.match(serviceWorkerSource, /cacheAppAssetGraph/);
  assert.match(serviceWorkerSource, /appAssetDependencies/);
  assert.equal(manifest.start_url, "./?source=pwa");
  assert.equal(manifest.scope, "./");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.background_color, "#fff7f9");
  assert.equal(manifest.theme_color, "#b94368");
  assert.equal(manifest.icons.length, 3);
  assert.match(serviceWorkerSource, /2026-07-16-execution-trace-v2/);
  assert.match(workflowSource, /actions\/deploy-pages@v4/);
  assert.match(workflowSource, /dist\/client\/python-worker-trace-v2\.js/);
  assert.doesNotMatch(workflowSource, /python-worker-signature-v1\.js/);
  await access(new URL("../public/og.png", import.meta.url));
  await access(new URL("../public/favicon.png", import.meta.url));
  await access(new URL("../public/icons/apple-touch-icon.png", import.meta.url));
  await access(new URL("../public/icons/icon-192.png", import.meta.url));
  await access(new URL("../public/icons/icon-512.png", import.meta.url));
  await access(new URL("../public/icons/icon-maskable-512.png", import.meta.url));
  await assert.rejects(access(new URL("../app/_sites-preview", import.meta.url)));
});

test("course note inputs stay named, tappable, and above the iOS zoom threshold", async () => {
  const [source, styles] = await Promise.all([
    readFile(new URL("../app/course-notes.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/course-notes.module.css", import.meta.url), "utf8"),
  ]);
  const baseStyles = styles.split("@media")[0];

  assert.match(source, /aria-labelledby="course-transcript-heading"/);
  assert.match(source, /aria-labelledby="course-personal-notes-heading"/);
  assert.match(baseStyles, /\.notebookCard textarea[\s\S]*font-size: max\(16px, 0\.86rem\)/);
  assert.match(baseStyles, /\.notebookHead button[\s\S]*min-height: 44px/);
});

test("privacy and support explain local image notes, mistake reviews, backups, and deletion", async () => {
  const [privacy, support, infoPlist] = await Promise.all([
    readFile(new URL("../app/privacy/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/support/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../ios/App/App/Info.plist", import.meta.url), "utf8"),
  ]);

  assert.match(privacy, /相册、相机和图片笔记/);
  assert.match(privacy, /图片会作为该题的学习笔记保存在当前设备/);
  assert.match(privacy, /完整备份[^。]*会包含[^。]*图片笔记/);
  assert.match(privacy, /删除本机学习数据[^。]*图片笔记/);
  assert.match(privacy, /错题本和来源链接/);
  assert.match(privacy, /不会把代码发送给 AI 服务/);
  assert.match(privacy, /完整备份[^。]*错题本/);
  assert.match(support, /完整备份会包含[^。]*图片笔记/);
  assert.match(support, /设置 → 删除本机学习数据[^。]*全部图片笔记/);
  assert.match(support, /如何导入错题并对比答案/);
  assert.match(support, /它不是 AI/);
  assert.match(infoPlist, /NSPhotoLibraryUsageDescription/);
  assert.match(infoPlist, /NSCameraUsageDescription/);
});
