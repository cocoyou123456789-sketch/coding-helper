import { SpeechRecognition as NativeSpeechRecognition } from "@capgo/capacitor-speech-recognition";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";

const IS_NATIVE_BUILD = process.env.NEXT_PUBLIC_NATIVE_APP === "true";

export type SpeechRecognitionMode = "native" | "web" | "unsupported";

export type SpeechCaptureCallbacks = {
  onInterim: (text: string) => void;
  onFinal: (text: string) => void;
  onListening: (listening: boolean) => void;
  onError: (code: string) => void;
};

export type SpeechCaptureController = {
  mode: Exclude<SpeechRecognitionMode, "unsupported">;
  stop: () => Promise<void>;
};

interface BrowserSpeechAlternative {
  transcript: string;
}

interface BrowserSpeechResult {
  readonly isFinal: boolean;
  readonly length: number;
  [index: number]: BrowserSpeechAlternative;
}

interface BrowserSpeechResultList {
  readonly length: number;
  [index: number]: BrowserSpeechResult;
}

interface BrowserSpeechResultEvent extends Event {
  readonly resultIndex: number;
  readonly results: BrowserSpeechResultList;
}

interface BrowserSpeechErrorEvent extends Event {
  readonly error: string;
}

interface BrowserSpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onresult: ((event: BrowserSpeechResultEvent) => void) | null;
  onerror: ((event: BrowserSpeechErrorEvent) => void) | null;
}

type BrowserSpeechConstructor = new () => BrowserSpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: BrowserSpeechConstructor;
    webkitSpeechRecognition?: BrowserSpeechConstructor;
  }
}

function isNativePlatform(): boolean {
  return IS_NATIVE_BUILD && Capacitor.isNativePlatform();
}

function browserSpeechConstructor(): BrowserSpeechConstructor | undefined {
  if (typeof window === "undefined") return undefined;
  return window.SpeechRecognition ?? window.webkitSpeechRecognition;
}

export function getSpeechRecognitionMode(): SpeechRecognitionMode {
  if (isNativePlatform()) return "native";
  return browserSpeechConstructor() ? "web" : "unsupported";
}

async function startNativeCapture(
  language: string,
  callbacks: SpeechCaptureCallbacks,
): Promise<SpeechCaptureController> {
  const { available } = await NativeSpeechRecognition.available();
  if (!available) throw new Error("speech-unavailable");

  let permission = await NativeSpeechRecognition.checkPermissions();
  if (permission.speechRecognition === "prompt" || permission.speechRecognition === "prompt-with-rationale") {
    permission = await NativeSpeechRecognition.requestPermissions();
  }
  if (permission.speechRecognition !== "granted") throw new Error("not-allowed");

  const onDevice = await NativeSpeechRecognition
    .isOnDeviceRecognitionAvailable({ language })
    .catch(() => ({ available: false }));
  const listeners: PluginListenerHandle[] = [];
  let latestText = "";
  let committed = false;
  let stopped = false;
  let listenersRemoved = false;

  const commitLatest = () => {
    const text = latestText.trim();
    if (!text || committed) return;
    committed = true;
    callbacks.onInterim("");
    callbacks.onFinal(text);
  };
  const removeListeners = async () => {
    if (listenersRemoved) return;
    listenersRemoved = true;
    await Promise.all(listeners.map((listener) => listener.remove().catch(() => undefined)));
  };

  try {
    listeners.push(await NativeSpeechRecognition.addListener("partialResults", (event) => {
      latestText = (event.accumulatedText ?? event.accumulated ?? event.matches?.[0] ?? "").trim();
      if (latestText) callbacks.onInterim(latestText);
      if (event.forced) commitLatest();
    }));
    listeners.push(await NativeSpeechRecognition.addListener("listeningState", (event) => {
      const state = event.state ?? event.status;
      if ((state === "started" || state === "startingListening") && !stopped) callbacks.onListening(true);
      if (state === "stopped" && !stopped) {
        stopped = true;
        callbacks.onListening(false);
        void NativeSpeechRecognition.getLastPartialResult()
          .then((cached) => {
            if (cached.available && cached.text.trim()) latestText = cached.text.trim();
          })
          .catch(() => undefined)
          .finally(() => {
            commitLatest();
            void removeListeners();
          });
      }
    }));
    listeners.push(await NativeSpeechRecognition.addListener("error", (event) => {
      if (stopped) return;
      stopped = true;
      callbacks.onListening(false);
      callbacks.onError(event.code || "recognition-error");
      void removeListeners();
    }));

    const result = await NativeSpeechRecognition.start({
      language,
      maxResults: 1,
      partialResults: true,
      addPunctuation: true,
      useOnDeviceRecognition: onDevice.available,
      contextualStrings: [
        "Python", "LeetCode", "哈希表", "双指针", "链表", "二叉树",
        "动态规划", "时间复杂度", "空间复杂度", "function", "array", "dictionary",
      ],
    });
    latestText = result.matches?.[0]?.trim() || latestText;
    if (!stopped) callbacks.onListening(true);
  } catch (error) {
    await removeListeners();
    throw error;
  }

  return {
    mode: "native",
    stop: async () => {
      if (stopped) return;
      stopped = true;
      try {
        const cached = await NativeSpeechRecognition.getLastPartialResult();
        if (cached.available && cached.text.trim()) latestText = cached.text.trim();
      } catch {
        // The listener's latest text is still available when the cache API is unsupported.
      }
      try {
        await NativeSpeechRecognition.forceStop();
      } catch {
        await NativeSpeechRecognition.stop().catch(() => undefined);
      }
      commitLatest();
      callbacks.onListening(false);
      await removeListeners();
    },
  };
}

function startBrowserCapture(
  language: string,
  callbacks: SpeechCaptureCallbacks,
): SpeechCaptureController {
  const Recognition = browserSpeechConstructor();
  if (!Recognition) throw new Error("speech-unavailable");

  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = language;
  recognition.maxAlternatives = 1;
  let shouldContinue = true;
  let stopped = false;
  let restartTimer: ReturnType<typeof setTimeout> | null = null;

  const restart = () => {
    if (!shouldContinue) return;
    restartTimer = setTimeout(() => {
      try {
        recognition.start();
      } catch {
        shouldContinue = false;
        callbacks.onListening(false);
        callbacks.onError("restart-failed");
      }
    }, 250);
  };

  recognition.onstart = () => callbacks.onListening(true);
  recognition.onresult = (event) => {
    const finalParts: string[] = [];
    const interimParts: string[] = [];
    for (let index = event.resultIndex; index < event.results.length; index += 1) {
      const transcript = event.results[index][0]?.transcript?.trim();
      if (!transcript) continue;
      if (event.results[index].isFinal) finalParts.push(transcript);
      else interimParts.push(transcript);
    }
    callbacks.onInterim(interimParts.join(" "));
    if (finalParts.length) callbacks.onFinal(finalParts.join(" "));
  };
  recognition.onerror = (event) => {
    if (event.error === "aborted" || event.error === "no-speech") return;
    shouldContinue = false;
    callbacks.onListening(false);
    callbacks.onError(event.error || "recognition-error");
  };
  recognition.onend = () => {
    if (shouldContinue) restart();
    else callbacks.onListening(false);
  };

  recognition.start();
  return {
    mode: "web",
    stop: async () => {
      if (stopped) return;
      stopped = true;
      shouldContinue = false;
      if (restartTimer) clearTimeout(restartTimer);
      try {
        recognition.stop();
      } catch {
        recognition.abort();
      }
      callbacks.onInterim("");
      callbacks.onListening(false);
    },
  };
}

export async function startSpeechCapture(
  language: string,
  callbacks: SpeechCaptureCallbacks,
): Promise<SpeechCaptureController> {
  const mode = getSpeechRecognitionMode();
  if (mode === "native") return startNativeCapture(language, callbacks);
  if (mode === "web") return startBrowserCapture(language, callbacks);
  throw new Error("speech-unavailable");
}
