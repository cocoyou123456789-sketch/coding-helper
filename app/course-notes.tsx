"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  appendTranscript,
  buildBulletDraft,
  COURSE_NOTES_STORAGE_KEY,
  createCourseDocument,
  EMPTY_COURSE_STORE,
  MAX_COURSES,
  MAX_COURSE_TEXT_LENGTH,
  normalizeCourseStore,
  parseBilibiliCourseLink,
  type CourseDocument,
  type CourseRecognitionLanguage,
  type CourseStore,
} from "./course-notes-model";
import {
  getLargeStoredValue,
  openExternalPage,
  shareStudyNote,
  STUDY_DATA_CAPTURE_EVENT,
  STUDY_DATA_CLEAR_EVENT,
  STUDY_DATA_FLUSH_EVENT,
  STUDY_DATA_RESUME_EVENT,
} from "./native-app";
import { drainCourseStoreWrites, markCourseStoreLoaded, queueCourseStoreFlush, queueCourseStoreWrite } from "./course-storage";
import { withStudyDataReadLock } from "./study-data-session";
import {
  getSpeechRecognitionMode,
  startSpeechCapture,
  type SpeechCaptureController,
  type SpeechRecognitionMode,
} from "./speech-notes";
import styles from "./course-notes.module.css";

type Props = {
  language: "zh" | "en";
  nativeApp: boolean;
};

const copy = {
  zh: {
    kicker: "COURSE COMPANION",
    title: "边看课，边把讲解变成自己的笔记。",
    intro: "粘贴 Bilibili 免费课程的完整链接，用官方播放器学习；需要记录时再打开麦克风。听写文字和笔记只保存在这台设备。",
    badges: ["官方外链播放器", "不下载视频", "笔记保存在本机"],
    library: "我的课程",
    libraryEmpty: "还没有课程，先粘贴一个完整链接。",
    importTitle: "导入一节课程",
    linkLabel: "Bilibili 完整链接或 BV / av 号",
    linkPlaceholder: "https://www.bilibili.com/video/BV...",
    titleLabel: "课程名称（可选）",
    titlePlaceholder: "例如：Python 哈希表入门",
    importButton: "导入并开始记笔记",
    emptyLink: "请先粘贴课程链接。",
    shortLink: "b23.tv 短链接无法直接识别。请先在浏览器打开，再复制地址栏里的完整 bilibili.com 链接。",
    invalidLink: "没有识别到有效的 Bilibili BV / av 课程链接。",
    tooMany: `最多保存 ${MAX_COURSES} 节课程，请先删除一节旧课程。`,
    imported: "课程已导入，笔记会自动保存。",
    saved: "已自动保存在本机",
    saveFailed: "本机存储空间不足，刚才的更改可能没有保存。请先复制重要笔记并清理旧课程。",
    loading: "正在读取本机笔记…",
    loadFailed: "暂时无法安全读取课程笔记。为防止覆盖原内容，本页没有开始保存。",
    retryLoad: "重新加载后再试",
    openBilibili: "在 Bilibili 打开 ↗",
    deleteCourse: "删除课程",
    deleteConfirm: "确定删除这节课程及其听写和笔记吗？",
    playerTitle: "Bilibili 课程播放器",
    loadPlayer: "加载官方课程播放器",
    playerConsent: "点击后会连接 Bilibili 并加载第三方播放器；Bilibili 可能接收网络和设备信息。",
    playerFallback: "如果播放器无法加载，请点击“在 Bilibili 打开”。",
    voiceTitle: "分段语音听写",
    voiceIntro: "播放课程后点击开始，口述你想留下的要点；若课程从另一台设备外放，麦克风也可能收录。它不会直接提取播放器音频。",
    languageLabel: "识别语言",
    chinese: "中文普通话",
    english: "English",
    start: "开始听写",
    starting: "正在准备麦克风…",
    cancel: "取消听写",
    waitForStop: "上一次听写正在安全停止，请稍等一秒再开始。",
    stop: "停止并保存",
    listening: "正在听…",
    idle: "等待开始",
    elapsed: "本次听写",
    interim: "正在识别",
    noInterim: "说话后，临时识别文字会显示在这里。",
    webPrivacy: "网页语音识别由浏览器提供，部分浏览器可能把音频发送给其语音服务处理。题解簿不保存音频，只保存识别后的文字。",
    nativePrivacy: "iOS 会在你主动开始时请求麦克风和语音识别权限。支持时优先在设备上识别；旧版 iOS 更适合短段听写，停止后可继续下一段。题解簿不保存录音。",
    unsupported: "这个浏览器暂不支持语音识别。建议使用最新版 Chrome、Edge，或在 iOS App 中使用；你仍然可以手动记录笔记。",
    denied: "麦克风或语音识别权限没有开启。请在浏览器或 iPhone 设置中允许后再试。",
    speechError: "听写暂时中断，请检查网络或麦克风后重新开始。已经识别的文字不会丢失。",
    transcriptTitle: "课程听写原文",
    transcriptHelp: "时间是本次听写计时，不是视频进度。你可以直接修改识别错误。",
    transcriptPlaceholder: "点击“开始听写”，或把课程字幕粘贴到这里…",
    notesTitle: "我的课程笔记",
    notesHelp: "留下真正需要复习的概念、例子和问题。",
    notesPlaceholder: "例如：\n## 核心概念\n- 哈希表用空间换时间\n\n## 我的问题\n- 为什么查找是 O(1)？",
    makeDraft: "把听写转成要点草稿",
    noTranscript: "还没有听写内容，先开始听写或粘贴字幕。",
    draftAdded: "要点草稿已加入笔记，请再用自己的话修改。",
    share: "分享 / 复制笔记",
    shared: "笔记已打开分享菜单。",
    copied: "笔记已复制。",
    shareFailed: "当前设备无法分享，请手动复制文本。",
    clearTranscript: "清空听写",
    clearConfirm: "确定清空听写原文吗？你的课程笔记会保留。",
    courseTitle: "课程标题",
    noAffiliation: "题解簿使用 Bilibili 官方外链播放器，与 Bilibili 无隶属关系；课程版权归原发布者。请只导入你有权观看的公开课程。",
  },
  en: {
    kicker: "COURSE COMPANION",
    title: "Watch a lesson and turn the explanation into your own notes.",
    intro: "Paste a full public Bilibili course link, learn in the official player, and turn on the microphone only when you want dictation. Transcripts and notes stay on this device.",
    badges: ["Official embed", "No video downloads", "On-device note storage"],
    library: "My courses",
    libraryEmpty: "No courses yet. Paste a full course link to begin.",
    importTitle: "Import a course",
    linkLabel: "Full Bilibili link or BV / av ID",
    linkPlaceholder: "https://www.bilibili.com/video/BV...",
    titleLabel: "Course title (optional)",
    titlePlaceholder: "For example: Python hash maps",
    importButton: "Import and take notes",
    emptyLink: "Paste a course link first.",
    shortLink: "b23.tv short links cannot be identified directly. Open it first, then copy the full bilibili.com URL from the address bar.",
    invalidLink: "A valid Bilibili BV / av course link was not found.",
    tooMany: `You can save up to ${MAX_COURSES} courses. Delete an old course first.`,
    imported: "Course imported. Notes will save automatically.",
    saved: "Saved automatically on this device",
    saveFailed: "Local storage is full, so the latest change may not be saved. Copy important notes and remove an old course.",
    loading: "Loading notes from this device…",
    loadFailed: "Course notes could not be read safely, so saving did not start. Your existing notes have not been overwritten.",
    retryLoad: "Reload and try again",
    openBilibili: "Open on Bilibili ↗",
    deleteCourse: "Delete course",
    deleteConfirm: "Delete this course, its transcript, and notes?",
    playerTitle: "Bilibili course player",
    loadPlayer: "Load the official course player",
    playerConsent: "This connects to Bilibili and loads its third-party player. Bilibili may receive network and device information.",
    playerFallback: "If the player does not load, use “Open on Bilibili.”",
    voiceTitle: "Segmented voice dictation",
    voiceIntro: "Play the course, then dictate the takeaways you want to keep. A mic may also hear a lesson playing on another device; it does not extract player audio.",
    languageLabel: "Recognition language",
    chinese: "Mandarin Chinese",
    english: "English",
    start: "Start dictation",
    starting: "Preparing the microphone…",
    cancel: "Cancel dictation",
    waitForStop: "The previous session is stopping safely. Wait a moment and try again.",
    stop: "Stop and save",
    listening: "Listening…",
    idle: "Ready",
    elapsed: "This session",
    interim: "Recognizing",
    noInterim: "Interim words will appear here when you speak.",
    webPrivacy: "Browser speech recognition may send audio to the browser vendor's speech service. The notebook never stores audio; it saves only recognized text.",
    nativePrivacy: "iOS asks for microphone and speech-recognition permission only after you start. Recognition runs on device when supported; older iOS versions work best in short segments. The notebook never stores audio.",
    unsupported: "Speech recognition is not supported in this browser. Try current Chrome or Edge, or use the iOS app. Manual notes still work.",
    denied: "Microphone or speech-recognition permission is off. Allow it in browser or iPhone Settings and try again.",
    speechError: "Dictation stopped. Check the microphone or network and start again. Existing text is safe.",
    transcriptTitle: "Course transcript",
    transcriptHelp: "Timestamps measure this dictation session, not video playback. Correct recognition mistakes directly.",
    transcriptPlaceholder: "Start dictation, or paste course captions here…",
    notesTitle: "My course notes",
    notesHelp: "Keep the concepts, examples, and questions worth reviewing.",
    notesPlaceholder: "For example:\n## Core idea\n- A hash map trades space for time\n\n## Question\n- Why is lookup O(1)?",
    makeDraft: "Turn transcript into bullet draft",
    noTranscript: "There is no transcript yet. Start dictation or paste captions first.",
    draftAdded: "A bullet draft was added. Rewrite it in your own words.",
    share: "Share / copy notes",
    shared: "The share sheet is open.",
    copied: "Notes copied.",
    shareFailed: "Sharing is unavailable. Copy the text manually.",
    clearTranscript: "Clear transcript",
    clearConfirm: "Clear the transcript? Your course notes will remain.",
    courseTitle: "Course title",
    noAffiliation: "This notebook uses Bilibili's official external player and is not affiliated with Bilibili. Course rights remain with each publisher. Import only public courses you may watch.",
  },
} as const;

function recognitionErrorMessage(error: unknown, language: "zh" | "en"): string {
  const message = error instanceof Error ? error.message : String(error);
  if (message.includes("not-allowed") || message.includes("permission")) return copy[language].denied;
  if (message.includes("unavailable") || message.includes("not supported")) return copy[language].unsupported;
  return copy[language].speechError;
}

export default function CourseNotes({ language, nativeApp }: Props) {
  const text = copy[language];
  const [store, setStore] = useState<CourseStore>(EMPTY_COURSE_STORE);
  const [hydrated, setHydrated] = useState(false);
  const [loadFailed, setLoadFailed] = useState(false);
  const [sourceInput, setSourceInput] = useState("");
  const [titleInput, setTitleInput] = useState("");
  const [linkMessage, setLinkMessage] = useState("");
  const [actionMessage, setActionMessage] = useState("");
  const [interimText, setInterimText] = useState("");
  const [listening, setListening] = useState(false);
  const [starting, setStarting] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [speechMode] = useState<SpeechRecognitionMode>(() => getSpeechRecognitionMode());
  const [loadedPlayerId, setLoadedPlayerId] = useState<string | null>(null);
  const speechControllerRef = useRef<SpeechCaptureController | null>(null);
  const pendingSpeechStartRef = useRef<Promise<SpeechCaptureController> | null>(null);
  const captureCourseIdRef = useRef<string | null>(null);
  const interimTextRef = useRef("");
  const finalCommitSequenceRef = useRef(0);
  const stopCaptureRef = useRef<Promise<void> | null>(null);
  const captureGenerationRef = useRef(0);
  const sessionStartedAtRef = useRef(0);
  const sessionHasStartedRef = useRef(false);
  const latestStoreRef = useRef(store);
  const hydratedRef = useRef(hydrated);
  const skipPersistenceRef = useRef(false);

  const activeCourse = useMemo(
    () => store.courses.find((course) => course.id === store.activeId) ?? null,
    [store],
  );
  const orderedCourses = useMemo(
    () => [...store.courses].sort((first, second) => second.updatedAt - first.updatedAt),
    [store.courses],
  );
  const captureActive = listening || starting;

  const commitStore = useCallback((update: (current: CourseStore) => CourseStore) => {
    const next = update(latestStoreRef.current);
    latestStoreRef.current = next;
    setStore(next);
  }, []);

  const appendCapturedTranscript = useCallback((courseId: string, result: string, seconds: number) => {
    commitStore((current) => ({
      ...current,
      courses: current.courses.map((course) => course.id === courseId
        ? { ...course, transcript: appendTranscript(course.transcript, result, seconds), updatedAt: Date.now() }
        : course),
    }));
  }, [commitStore]);

  const stopActiveCapture = useCallback(async (saveInterim: boolean) => {
    if (stopCaptureRef.current) return stopCaptureRef.current;
    const operation = (async () => {
      const generation = captureGenerationRef.current;
      const pendingInterim = interimTextRef.current.trim();
      const courseId = captureCourseIdRef.current;
      const finalSequenceBeforeStop = finalCommitSequenceRef.current;
      let controller = speechControllerRef.current;
      if (!controller && pendingSpeechStartRef.current) {
        controller = await pendingSpeechStartRef.current.catch(() => null);
      }
      await controller?.stop();
      // Native stop commits its cached final result synchronously. Browser
      // stop may not, so preserve the last interim only when no final arrived.
      if (saveInterim
        && finalCommitSequenceRef.current === finalSequenceBeforeStop
        && pendingInterim
        && courseId) {
        const seconds = sessionStartedAtRef.current
          ? Math.max(0, Math.floor((performance.now() - sessionStartedAtRef.current) / 1000))
          : 0;
        appendCapturedTranscript(courseId, pendingInterim, seconds);
      }
      if (captureGenerationRef.current === generation) captureGenerationRef.current += 1;
      if (speechControllerRef.current === controller) speechControllerRef.current = null;
      captureCourseIdRef.current = null;
      interimTextRef.current = "";
      setStarting(false);
      setListening(false);
      setInterimText("");
    })();
    stopCaptureRef.current = operation;
    try {
      await operation;
    } finally {
      if (stopCaptureRef.current === operation) stopCaptureRef.current = null;
    }
  }, [appendCapturedTranscript]);

  useEffect(() => {
    latestStoreRef.current = store;
  }, [store]);

  useEffect(() => {
    hydratedRef.current = hydrated;
  }, [hydrated]);

  useEffect(() => {
    let cancelled = false;
    void drainCourseStoreWrites()
      .then(() => withStudyDataReadLock(() => getLargeStoredValue(COURSE_NOTES_STORAGE_KEY)))
      .then((saved) => {
        if (cancelled) return;
        if (saved) {
          const normalized = normalizeCourseStore(JSON.parse(saved));
          latestStoreRef.current = normalized;
          setStore(normalized);
          markCourseStoreLoaded(normalized);
        } else {
          markCourseStoreLoaded(EMPTY_COURSE_STORE);
        }
        setHydrated(true);
      })
      .catch(() => {
        if (cancelled) return;
        skipPersistenceRef.current = true;
        setLoadFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    const timer = window.setTimeout(() => {
      if (skipPersistenceRef.current) return;
      void queueCourseStoreWrite(store)
        .catch(() => setActionMessage(text.saveFailed));
    }, 600);
    return () => window.clearTimeout(timer);
  }, [hydrated, store, text.saveFailed]);

  useEffect(() => {
    const flushLatestStore = () => {
      if (!hydratedRef.current || skipPersistenceRef.current) return;
      return queueCourseStoreFlush(
        () => stopActiveCapture(true),
        () => latestStoreRef.current,
      );
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushLatestStore();
    };
    window.addEventListener("pagehide", flushLatestStore);
    document.addEventListener("visibilitychange", flushWhenHidden);
    return () => {
      window.removeEventListener("pagehide", flushLatestStore);
      document.removeEventListener("visibilitychange", flushWhenHidden);
      void flushLatestStore()?.catch(() => undefined);
    };
  }, [stopActiveCapture]);

  useEffect(() => {
    const prepareForClear = () => {
      skipPersistenceRef.current = true;
      void stopActiveCapture(false);
    };
    const resumePersistence = () => {
      skipPersistenceRef.current = false;
    };
    const flushForBackup = (event: Event) => {
      if (!hydratedRef.current || skipPersistenceRef.current) return;
      const detail = (event as CustomEvent<{ waitUntil(promise: Promise<void>): void }>).detail;
      detail?.waitUntil(queueCourseStoreFlush(
        () => stopActiveCapture(true),
        () => latestStoreRef.current,
      ));
    };
    const captureForBackup = (event: Event) => {
      if (!hydratedRef.current || skipPersistenceRef.current) return;
      const detail = (event as CustomEvent<{ provide(key: string, value: Promise<string>): void }>).detail;
      detail?.provide(COURSE_NOTES_STORAGE_KEY, (async () => {
        await stopActiveCapture(true);
        return JSON.stringify(latestStoreRef.current);
      })());
    };
    window.addEventListener(STUDY_DATA_CLEAR_EVENT, prepareForClear);
    window.addEventListener(STUDY_DATA_CAPTURE_EVENT, captureForBackup);
    window.addEventListener(STUDY_DATA_FLUSH_EVENT, flushForBackup);
    window.addEventListener(STUDY_DATA_RESUME_EVENT, resumePersistence);
    return () => {
      window.removeEventListener(STUDY_DATA_CLEAR_EVENT, prepareForClear);
      window.removeEventListener(STUDY_DATA_CAPTURE_EVENT, captureForBackup);
      window.removeEventListener(STUDY_DATA_FLUSH_EVENT, flushForBackup);
      window.removeEventListener(STUDY_DATA_RESUME_EVENT, resumePersistence);
    };
  }, [stopActiveCapture]);

  useEffect(() => {
    if (!listening) return;
    const timer = window.setInterval(() => {
      setElapsed(Math.max(0, Math.floor((performance.now() - sessionStartedAtRef.current) / 1000)));
    }, 500);
    return () => window.clearInterval(timer);
  }, [listening]);

  function updateCourse(courseId: string, patch: Partial<CourseDocument>) {
    commitStore((current) => ({
      ...current,
      courses: current.courses.map((course) => course.id === courseId
        ? { ...course, ...patch, updatedAt: Date.now() }
        : course),
    }));
  }

  async function stopListening() {
    await stopActiveCapture(true);
  }

  function selectCourse(courseId: string) {
    void stopListening();
    setLoadedPlayerId(null);
    commitStore((current) => ({ ...current, activeId: courseId }));
    setActionMessage("");
  }

  function importCourse(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLinkMessage("");
    setActionMessage("");
    const result = parseBilibiliCourseLink(sourceInput);
    if (!result.ok) {
      setLinkMessage(result.reason === "empty" ? text.emptyLink : result.reason === "short-link" ? text.shortLink : text.invalidLink);
      return;
    }

    const existing = store.courses.find((course) => course.id === result.source.id);
    if (!existing && store.courses.length >= MAX_COURSES) {
      setLinkMessage(text.tooMany);
      return;
    }
    const recognitionLanguage: CourseRecognitionLanguage = language === "zh" ? "zh-CN" : "en-US";
    const course = existing ?? createCourseDocument(result.source, titleInput, recognitionLanguage);
    commitStore((current) => ({
      activeId: course.id,
      courses: existing
        ? current.courses.map((item) => item.id === existing.id
          ? {
            ...item,
            sourceUrl: result.source.sourceUrl,
            embedUrl: result.source.embedUrl,
            title: titleInput.trim() || item.title,
            updatedAt: Date.now(),
          }
          : item)
        : [course, ...current.courses],
    }));
    setSourceInput("");
    setTitleInput("");
    setLoadedPlayerId(null);
    setActionMessage(text.imported);
  }

  async function startListening() {
    if (!activeCourse || speechMode === "unsupported") {
      setActionMessage(text.unsupported);
      return;
    }
    if (pendingSpeechStartRef.current) {
      setActionMessage(text.waitForStop);
      return;
    }
    if (speechControllerRef.current) await stopListening();
    const generation = captureGenerationRef.current + 1;
    captureGenerationRef.current = generation;
    sessionHasStartedRef.current = false;
    sessionStartedAtRef.current = 0;
    setStarting(true);
    setActionMessage("");
    setElapsed(0);
    const courseId = activeCourse.id;
    captureCourseIdRef.current = courseId;
    const startPromise = startSpeechCapture(activeCourse.recognitionLanguage, {
      onInterim: (value) => {
        if (captureGenerationRef.current === generation) {
          interimTextRef.current = value;
          setInterimText(value);
        }
      },
      onListening: (nextListening) => {
        if (captureGenerationRef.current !== generation) return;
        if (nextListening && !sessionHasStartedRef.current) {
          sessionHasStartedRef.current = true;
          sessionStartedAtRef.current = performance.now();
          setElapsed(0);
        }
        setStarting(false);
        setListening(nextListening);
      },
      onError: (code) => {
        if (captureGenerationRef.current !== generation) return;
        setStarting(false);
        setListening(false);
        setActionMessage(recognitionErrorMessage(new Error(code), language));
      },
      onFinal: (result) => {
        if (captureGenerationRef.current !== generation) return;
        finalCommitSequenceRef.current += 1;
        interimTextRef.current = "";
        setInterimText("");
        const seconds = sessionStartedAtRef.current
          ? Math.max(0, Math.floor((performance.now() - sessionStartedAtRef.current) / 1000))
          : 0;
        appendCapturedTranscript(courseId, result, seconds);
      },
    });
    pendingSpeechStartRef.current = startPromise;
    try {
      const controller = await startPromise;
      if (captureGenerationRef.current !== generation) {
        await controller.stop();
        return;
      }
      speechControllerRef.current = controller;
    } catch (error) {
      if (captureGenerationRef.current === generation) {
        setStarting(false);
        setListening(false);
        setActionMessage(recognitionErrorMessage(error, language));
      }
    } finally {
      if (pendingSpeechStartRef.current === startPromise) pendingSpeechStartRef.current = null;
    }
  }

  function changeRecognitionLanguage(nextLanguage: CourseRecognitionLanguage) {
    if (!activeCourse) return;
    void stopListening();
    setLoadedPlayerId(null);
    updateCourse(activeCourse.id, { recognitionLanguage: nextLanguage });
  }

  function deleteActiveCourse() {
    if (!activeCourse || !window.confirm(text.deleteConfirm)) return;
    void stopListening();
    setLoadedPlayerId(null);
    commitStore((current) => {
      const courses = current.courses.filter((course) => course.id !== activeCourse.id);
      return { activeId: courses[0]?.id ?? null, courses };
    });
    setActionMessage("");
  }

  function createDraft() {
    if (!activeCourse) return;
    const draft = buildBulletDraft(activeCourse.transcript, language);
    if (!draft) {
      setActionMessage(text.noTranscript);
      return;
    }
    updateCourse(activeCourse.id, {
      notes: `${activeCourse.notes.trimEnd()}${activeCourse.notes.trim() ? "\n\n---\n\n" : ""}${draft}`.slice(0, MAX_COURSE_TEXT_LENGTH),
    });
    setActionMessage(text.draftAdded);
  }

  async function shareCourseNotes() {
    if (!activeCourse) return;
    const exportText = [
      activeCourse.title,
      activeCourse.sourceUrl,
      activeCourse.notes.trim() ? `\n${activeCourse.notes.trim()}` : "",
      activeCourse.transcript.trim() ? `\n---\n${text.transcriptTitle}\n${activeCourse.transcript.trim()}` : "",
    ].filter(Boolean).join("\n");
    try {
      const result = await shareStudyNote(activeCourse.title, exportText);
      setActionMessage(result === "shared" ? text.shared : result === "copied" ? text.copied : text.shareFailed);
    } catch {
      setActionMessage(text.shareFailed);
    }
  }

  async function clearTranscript() {
    if (!activeCourse || !window.confirm(text.clearConfirm)) return;
    const courseId = activeCourse.id;
    await stopListening();
    updateCourse(courseId, { transcript: "" });
  }

  if (!hydrated) {
    return (
      <section className={styles.shell} aria-busy={!loadFailed}>
        <div className={styles.hero} role={loadFailed ? "alert" : "status"}>
          <div>
            <span className={styles.kicker}>{text.kicker}</span>
            <h1>{loadFailed ? text.loadFailed : text.loading}</h1>
            {loadFailed && <button type="button" onClick={() => window.location.reload()}>{text.retryLoad}</button>}
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.shell} aria-labelledby="course-notes-title">
      <header className={styles.hero}>
        <div>
          <span className={styles.kicker}>{text.kicker}</span>
          <h1 id="course-notes-title">{text.title}</h1>
          <p>{text.intro}</p>
        </div>
        <ul>{text.badges.map((badge) => <li key={badge}>{badge}</li>)}</ul>
      </header>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <form className={styles.importCard} onSubmit={importCourse}>
            <span className={styles.step}>01</span>
            <h2>{text.importTitle}</h2>
            <label>
              <span>{text.linkLabel}</span>
              <input value={sourceInput} onChange={(event) => setSourceInput(event.target.value)} placeholder={text.linkPlaceholder} inputMode="url" autoCapitalize="off" autoCorrect="off" />
            </label>
            <label>
              <span>{text.titleLabel}</span>
              <input value={titleInput} onChange={(event) => setTitleInput(event.target.value.slice(0, 160))} placeholder={text.titlePlaceholder} />
            </label>
            {linkMessage && <p className={styles.error} role="alert">{linkMessage}</p>}
            <button type="submit">{text.importButton}</button>
          </form>

          <section className={styles.courseLibrary} aria-labelledby="course-library-title">
            <div className={styles.sectionHead}>
              <h2 id="course-library-title">{text.library}</h2>
              <span>{store.courses.length} / {MAX_COURSES}</span>
            </div>
            {orderedCourses.length ? (
              <div className={styles.courseList}>
                {orderedCourses.map((course) => (
                  <button key={course.id} type="button" aria-current={course.id === activeCourse?.id ? "true" : undefined} className={course.id === activeCourse?.id ? styles.activeCourse : ""} onClick={() => selectCourse(course.id)}>
                    <span>{course.videoId}{course.page > 1 ? ` · P${course.page}` : ""}</span>
                    <strong>{course.title}</strong>
                    <small>{new Date(course.updatedAt).toLocaleDateString(language === "zh" ? "zh-CN" : "en-US")}</small>
                  </button>
                ))}
              </div>
            ) : <p className={styles.emptyLibrary}>{text.libraryEmpty}</p>}
          </section>
        </aside>

        <main className={styles.mainPanel}>
          {activeCourse ? (
            <>
              <div className={styles.courseHeader}>
                <label>
                  <span>{text.courseTitle}</span>
                  <input value={activeCourse.title} maxLength={160} onChange={(event) => updateCourse(activeCourse.id, { title: event.target.value })} />
                </label>
                <div>
                  <button type="button" onClick={() => void openExternalPage(activeCourse.sourceUrl)}>{text.openBilibili}</button>
                  <button type="button" className={styles.deleteButton} onClick={deleteActiveCourse}>{text.deleteCourse}</button>
                </div>
              </div>

              {loadedPlayerId === activeCourse.id ? (
                <div className={styles.playerFrame}>
                  <iframe
                    src={activeCourse.embedUrl}
                    title={`${text.playerTitle}: ${activeCourse.title}`}
                    allow="autoplay; fullscreen; picture-in-picture"
                    allowFullScreen
                    loading="lazy"
                    referrerPolicy="strict-origin-when-cross-origin"
                  />
                </div>
              ) : (
                <div className={styles.playerGate}>
                  <div>
                    <strong>{activeCourse.title}</strong>
                    <p>{text.playerConsent}</p>
                    <button type="button" onClick={() => setLoadedPlayerId(activeCourse.id)}>{text.loadPlayer}</button>
                  </div>
                </div>
              )}
              <p className={styles.playerFallback}>{text.playerFallback}</p>

              <section className={`${styles.voiceCard} ${captureActive ? styles.isListening : ""}`}>
                <div className={styles.voiceIntro}>
                  <span className={styles.step}>02</span>
                  <div><h2>{text.voiceTitle}</h2><p>{text.voiceIntro}</p></div>
                </div>
                <div className={styles.voiceControls}>
                  <label>
                    <span>{text.languageLabel}</span>
                    <select value={activeCourse.recognitionLanguage} onChange={(event) => changeRecognitionLanguage(event.target.value as CourseRecognitionLanguage)} disabled={captureActive}>
                      <option value="zh-CN">{text.chinese}</option>
                      <option value="en-US">{text.english}</option>
                    </select>
                  </label>
                  <div className={styles.voiceStatus} aria-live="polite">
                    <i />
                    <span>{starting ? text.starting : listening ? text.listening : text.idle}</span>
                    <b>{text.elapsed} {String(Math.floor(elapsed / 60)).padStart(2, "0")}:{String(elapsed % 60).padStart(2, "0")}</b>
                  </div>
                  <button type="button" className={captureActive ? styles.stopButton : styles.startButton} onClick={() => captureActive ? void stopListening() : void startListening()} disabled={speechMode === "unsupported"}>
                    <span aria-hidden="true">{captureActive ? "■" : "●"}</span>{starting ? text.cancel : listening ? text.stop : text.start}
                  </button>
                </div>
                <div className={styles.interimBox}>
                  <span>{text.interim}</span>
                  <p>{interimText || text.noInterim}</p>
                </div>
                <p className={styles.privacyNote}>{speechMode === "native" || nativeApp ? text.nativePrivacy : speechMode === "web" ? text.webPrivacy : text.unsupported}</p>
              </section>

              {actionMessage && <p className={styles.actionMessage} role="status">{actionMessage}</p>}

              <div className={styles.notebooks}>
                <section className={styles.notebookCard}>
                  <div className={styles.notebookHead}>
                    <div><span className={styles.step}>03</span><h2>{text.transcriptTitle}</h2></div>
                    <button type="button" onClick={clearTranscript}>{text.clearTranscript}</button>
                  </div>
                  <p>{text.transcriptHelp}</p>
                  <textarea
                    value={activeCourse.transcript}
                    maxLength={MAX_COURSE_TEXT_LENGTH}
                    onChange={(event) => updateCourse(activeCourse.id, { transcript: event.target.value })}
                    placeholder={text.transcriptPlaceholder}
                    spellCheck
                  />
                  <small>{activeCourse.transcript.length.toLocaleString()} / {MAX_COURSE_TEXT_LENGTH.toLocaleString()}</small>
                </section>

                <section className={`${styles.notebookCard} ${styles.personalNotes}`}>
                  <div className={styles.notebookHead}>
                    <div><span className={styles.step}>04</span><h2>{text.notesTitle}</h2></div>
                  </div>
                  <p>{text.notesHelp}</p>
                  <textarea
                    value={activeCourse.notes}
                    maxLength={MAX_COURSE_TEXT_LENGTH}
                    onChange={(event) => updateCourse(activeCourse.id, { notes: event.target.value })}
                    placeholder={text.notesPlaceholder}
                    spellCheck
                  />
                  <small>{activeCourse.notes.length.toLocaleString()} / {MAX_COURSE_TEXT_LENGTH.toLocaleString()}</small>
                  <div className={styles.noteActions}>
                    <button type="button" onClick={createDraft}>{text.makeDraft}</button>
                    <button type="button" className={styles.primaryAction} onClick={() => void shareCourseNotes()}>{text.share}</button>
                  </div>
                </section>
              </div>
            </>
          ) : (
            <div className={styles.emptyState}>
              <span>01</span>
              <h2>{text.importTitle}</h2>
              <p>{text.libraryEmpty}</p>
            </div>
          )}
        </main>
      </div>

      <footer className={styles.disclaimer}>
        <span>{hydrated ? text.saved : text.loading}</span>
        <p>{text.noAffiliation}</p>
      </footer>
    </section>
  );
}
