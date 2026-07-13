export const COURSE_NOTES_STORAGE_KEY = "tijiebu-course-voice-notes-v1";
export const MAX_COURSES = 20;
export const MAX_COURSE_TEXT_LENGTH = 100_000;

export type CourseRecognitionLanguage = "zh-CN" | "en-US";

export type BilibiliCourseSource = {
  id: string;
  videoId: string;
  page: number;
  sourceUrl: string;
  embedUrl: string;
};

export type CourseLinkResult =
  | { ok: true; source: BilibiliCourseSource }
  | { ok: false; reason: "empty" | "short-link" | "unsupported" };

export type CourseDocument = BilibiliCourseSource & {
  title: string;
  transcript: string;
  notes: string;
  recognitionLanguage: CourseRecognitionLanguage;
  updatedAt: number;
};

export type CourseStore = {
  activeId: string | null;
  courses: CourseDocument[];
};

export const EMPTY_COURSE_STORE: CourseStore = { activeId: null, courses: [] };

function parseVideoToken(value: string | null): { key: "bvid" | "aid"; value: string } | null {
  if (!value) return null;
  const bvid = value.match(/^BV[0-9A-Za-z]{10}$/i)?.[0];
  if (bvid) return { key: "bvid", value: `BV${bvid.slice(2)}` };
  const aid = value.match(/^(?:av)?(\d+)$/i)?.[1];
  return aid ? { key: "aid", value: aid } : null;
}

function createSource(token: { key: "bvid" | "aid"; value: string }, page: number): BilibiliCourseSource {
  const videoId = token.key === "bvid" ? token.value : `av${token.value}`;
  const sourceUrl = new URL(`https://www.bilibili.com/video/${videoId}/`);
  sourceUrl.searchParams.set("p", String(page));
  const embedUrl = new URL("https://player.bilibili.com/player.html");
  embedUrl.searchParams.set("isOutside", "true");
  embedUrl.searchParams.set(token.key, token.value);
  embedUrl.searchParams.set("p", String(page));
  embedUrl.searchParams.set("page", String(page));
  embedUrl.searchParams.set("autoplay", "0");
  embedUrl.searchParams.set("danmaku", "0");

  return {
    id: `${videoId}:p${page}`,
    videoId,
    page,
    sourceUrl: sourceUrl.toString(),
    embedUrl: embedUrl.toString(),
  };
}

export function parseBilibiliCourseLink(input: string): CourseLinkResult {
  const value = input.trim();
  if (!value) return { ok: false, reason: "empty" };

  const bareToken = parseVideoToken(value);
  if (bareToken) return { ok: true, source: createSource(bareToken, 1) };

  let url: URL;
  try {
    const withProtocol = /^https?:\/\//i.test(value) ? value : `https://${value}`;
    url = new URL(withProtocol);
  } catch {
    return { ok: false, reason: "unsupported" };
  }

  const hostname = url.hostname.toLowerCase();
  if (hostname === "b23.tv" || hostname.endsWith(".b23.tv")) {
    return { ok: false, reason: "short-link" };
  }
  if (hostname !== "bilibili.com" && !hostname.endsWith(".bilibili.com")) {
    return { ok: false, reason: "unsupported" };
  }

  const pathToken = url.pathname.match(/\/video\/(BV[0-9A-Za-z]{10}|av\d+)(?:\/|$)/i)?.[1] ?? null;
  const queryToken = url.searchParams.get("bvid") ?? url.searchParams.get("aid");
  const token = parseVideoToken(pathToken) ?? parseVideoToken(queryToken);
  if (!token) return { ok: false, reason: "unsupported" };

  const requestedPage = Number(url.searchParams.get("p") ?? url.searchParams.get("page") ?? "1");
  const page = Number.isInteger(requestedPage) && requestedPage >= 1 && requestedPage <= 9999
    ? requestedPage
    : 1;
  return { ok: true, source: createSource(token, page) };
}

export function createCourseDocument(
  source: BilibiliCourseSource,
  title: string,
  recognitionLanguage: CourseRecognitionLanguage,
  now = Date.now(),
): CourseDocument {
  return {
    ...source,
    title: title.trim() || `Bilibili 课程 · ${source.videoId}`,
    transcript: "",
    notes: "",
    recognitionLanguage,
    updatedAt: now,
  };
}

export function normalizeCourseStore(value: unknown): CourseStore {
  if (!value || typeof value !== "object") return EMPTY_COURSE_STORE;
  const candidate = value as Partial<CourseStore>;
  if (!Array.isArray(candidate.courses)) return EMPTY_COURSE_STORE;

  const courses: CourseDocument[] = [];
  const seenIds = new Set<string>();
  for (const storedCourse of candidate.courses) {
    if (!storedCourse || typeof storedCourse !== "object") continue;
    const course = storedCourse as Partial<CourseDocument>;
    if (typeof course.sourceUrl !== "string"
      || typeof course.title !== "string"
      || typeof course.transcript !== "string"
      || typeof course.notes !== "string"
      || (course.recognitionLanguage !== "zh-CN" && course.recognitionLanguage !== "en-US")
      || typeof course.updatedAt !== "number"
      || !Number.isFinite(course.updatedAt)) continue;

    const parsed = parseBilibiliCourseLink(course.sourceUrl);
    if (!parsed.ok || seenIds.has(parsed.source.id)) continue;
    seenIds.add(parsed.source.id);
    courses.push({
      ...parsed.source,
      title: course.title.slice(0, 160),
      transcript: course.transcript.slice(0, MAX_COURSE_TEXT_LENGTH),
      notes: course.notes.slice(0, MAX_COURSE_TEXT_LENGTH),
      recognitionLanguage: course.recognitionLanguage,
      updatedAt: course.updatedAt,
    });
    if (courses.length >= MAX_COURSES) break;
  }
  const activeId = courses.some((course) => course.id === candidate.activeId)
    ? candidate.activeId!
    : courses[0]?.id ?? null;
  return { activeId, courses };
}

export function formatElapsed(seconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
}

export function appendTranscript(existing: string, text: string, elapsedSeconds: number): string {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return existing;
  const existingLines = existing.trimEnd().split("\n");
  const previousLine = existingLines[existingLines.length - 1]?.replace(/^\[\d+:\d{2}\]\s*/, "") ?? "";
  if (previousLine === normalized) return existing;
  const line = `[${formatElapsed(elapsedSeconds)}] ${normalized}`;
  return `${existing.trimEnd()}${existing.trim() ? "\n" : ""}${line}`.slice(0, MAX_COURSE_TEXT_LENGTH);
}

export function buildBulletDraft(transcript: string, language: "zh" | "en"): string {
  const sentences = transcript
    .replace(/([。！？.!?])\s*/g, "$1\n")
    .split(/\n+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 2)
    .slice(0, 100);
  if (!sentences.length) return "";

  if (language === "zh") {
    return [
      "## 课程要点（听写草稿）",
      "",
      ...sentences.map((sentence) => `- ${sentence}`),
      "",
      "## 我还没弄懂的地方",
      "",
      "- ",
    ].join("\n");
  }
  return [
    "## Course takeaways (transcript draft)",
    "",
    ...sentences.map((sentence) => `- ${sentence}`),
    "",
    "## Questions to revisit",
    "",
    "- ",
  ].join("\n");
}
