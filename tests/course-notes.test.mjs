import assert from "node:assert/strict";
import test from "node:test";

import {
  appendTranscript,
  buildBulletDraft,
  createCourseDocument,
  normalizeCourseStore,
  parseBilibiliCourseLink,
} from "../app/course-notes-model.ts";

test("parses safe Bilibili course links and official player parameters", () => {
  const result = parseBilibiliCourseLink("https://www.bilibili.com/video/BV1B7411m7LV/?p=2&share_source=copy_web");
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.source.videoId, "BV1B7411m7LV");
  assert.equal(result.source.page, 2);
  assert.equal(result.source.id, "BV1B7411m7LV:p2");
  const embed = new URL(result.source.embedUrl);
  assert.equal(embed.origin, "https://player.bilibili.com");
  assert.equal(embed.searchParams.get("bvid"), "BV1B7411m7LV");
  assert.equal(embed.searchParams.get("p"), "2");
  assert.equal(embed.searchParams.get("page"), "2");
  assert.equal(embed.searchParams.get("isOutside"), "true");
  assert.equal(embed.searchParams.get("autoplay"), "0");
  assert.equal(embed.searchParams.get("danmaku"), "0");

  const playerLink = parseBilibiliCourseLink("https://player.bilibili.com/player.html?aid=123456&page=4");
  assert.equal(playerLink.ok, true);
  if (playerLink.ok) assert.equal(playerLink.source.page, 4);
});

test("accepts av links and bare BV ids while rejecting unsafe or short links", () => {
  const av = parseBilibiliCourseLink("m.bilibili.com/video/av123456?p=3");
  assert.equal(av.ok, true);
  if (av.ok) {
    assert.equal(av.source.videoId, "av123456");
    assert.match(av.source.embedUrl, /aid=123456/);
  }

  const bare = parseBilibiliCourseLink("BV1B7411m7LV");
  assert.equal(bare.ok, true);
  assert.deepEqual(parseBilibiliCourseLink("https://evil.example/video/BV1B7411m7LV"), { ok: false, reason: "unsupported" });
  assert.deepEqual(parseBilibiliCourseLink("https://b23.tv/abc123"), { ok: false, reason: "short-link" });
  assert.deepEqual(parseBilibiliCourseLink(""), { ok: false, reason: "empty" });
});

test("creates, normalizes, and bounds locally stored course documents", () => {
  const parsed = parseBilibiliCourseLink("BV1B7411m7LV");
  assert.equal(parsed.ok, true);
  if (!parsed.ok) return;
  const course = createCourseDocument(parsed.source, " Python 入门 ", "zh-CN", 123);
  assert.equal(course.title, "Python 入门");
  assert.equal(course.updatedAt, 123);
  const normalized = normalizeCourseStore({ activeId: course.id, courses: [course, null, { id: "broken" }] });
  assert.equal(normalized.activeId, course.id);
  assert.deepEqual(normalized.courses, [course]);

  const tampered = normalizeCourseStore({
    activeId: course.id,
    courses: [{ ...course, embedUrl: "https://evil.example/player" }],
  });
  assert.equal(new URL(tampered.courses[0].embedUrl).origin, "https://player.bilibili.com");
});

test("timestamps final speech once and turns transcripts into an editable bullet draft", () => {
  const first = appendTranscript("", "  哈希表 可以快速查找。 ", 7);
  assert.equal(first, "[00:07] 哈希表 可以快速查找。");
  assert.equal(appendTranscript(first, "哈希表 可以快速查找。", 8), first);
  const transcript = appendTranscript(first, "我们用空间换时间！", 68);
  assert.match(transcript, /\[01:08\] 我们用空间换时间！/);
  const draft = buildBulletDraft(transcript, "zh");
  assert.match(draft, /课程要点/);
  assert.match(draft, /- \[00:07\] 哈希表 可以快速查找。/);
  assert.match(draft, /我还没弄懂的地方/);
});
