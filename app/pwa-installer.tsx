"use client";

import { useEffect, useState } from "react";
import type { Language } from "./problem-i18n";
import { useDialogFocus } from "./use-dialog-focus";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
};

const installCopy = {
  zh: {
    install: "安装 App",
    installLabel: "把题解簿安装到手机",
    offline: "离线模式",
    title: "安装到手机主屏幕",
    intro: "安装后会像普通 App 一样全屏打开，学习进度和笔记仍保存在这台设备上。",
    networkNote: "首次运行 Python 测试需要联网下载运行环境。",
    iosSteps: [
      "请使用 Safari 打开这个页面。",
      "点浏览器底部的“分享”按钮。",
      "选择“添加到主屏幕”，再点“添加”。",
    ],
    otherSteps: [
      "打开浏览器菜单。",
      "选择“安装应用”或“添加到主屏幕”。",
      "确认安装后，从手机桌面打开题解簿。",
    ],
    close: "知道了",
  },
  en: {
    install: "Install App",
    installLabel: "Install AlgoQuest on this device",
    offline: "Offline",
    title: "Add AlgoQuest to your home screen",
    intro: "It opens full-screen like an app. Your progress and notes remain saved on this device.",
    networkNote: "The first Python test needs a connection to download the runtime.",
    iosSteps: [
      "Open this page in Safari.",
      "Tap the Share button at the bottom of Safari.",
      "Choose Add to Home Screen, then tap Add.",
    ],
    otherSteps: [
      "Open your browser menu.",
      "Choose Install app or Add to Home Screen.",
      "Confirm, then open AlgoQuest from your home screen.",
    ],
    close: "Got it",
  },
} as const;

function isStandaloneMode() {
  const navigatorWithStandalone = navigator as Navigator & { standalone?: boolean };
  return window.matchMedia("(display-mode: standalone)").matches || navigatorWithStandalone.standalone === true;
}

export default function PwaInstaller({ language }: { language: Language }) {
  const nativeBuild = process.env.NEXT_PUBLIC_NATIVE_APP === "true";
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [showButton, setShowButton] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [isIos, setIsIos] = useState(false);
  const [isOffline, setIsOffline] = useState(false);
  const copy = installCopy[language];
  const installDialogRef = useDialogFocus<HTMLElement>(showHelp, () => setShowHelp(false));

  useEffect(() => {
    if (nativeBuild) return;

    const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
    const userAgent = window.navigator.userAgent;
    const iosDevice = /iPad|iPhone|iPod/.test(userAgent)
      || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const mobileDevice = /Android|iPad|iPhone|iPod|Mobile/i.test(userAgent) || navigator.maxTouchPoints > 1;
    const standalone = isStandaloneMode();

    const initialStateTimer = window.setTimeout(() => {
      setIsIos(iosDevice);
      setShowButton(!standalone && mobileDevice);
      setIsOffline(!navigator.onLine);
    }, 0);

    const handleInstallPrompt = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setShowButton(!isStandaloneMode());
    };
    const handleInstalled = () => {
      setInstallPrompt(null);
      setShowButton(false);
      setShowHelp(false);
    };
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("beforeinstallprompt", handleInstallPrompt);
    window.addEventListener("appinstalled", handleInstalled);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    let cancelled = false;
    const registerWorker = () => {
      if (cancelled || !("serviceWorker" in navigator)) return;
      navigator.serviceWorker.register(`${basePath}/sw.js`, {
        scope: `${basePath || ""}/`,
        updateViaCache: "none",
      }).catch(() => {
        // Installation is optional; the learning workspace should still open if registration fails.
      });
    };

    if (document.readyState === "complete") {
      window.setTimeout(registerWorker, 0);
    } else {
      window.addEventListener("load", registerWorker, { once: true });
    }

    return () => {
      cancelled = true;
      window.clearTimeout(initialStateTimer);
      window.removeEventListener("beforeinstallprompt", handleInstallPrompt);
      window.removeEventListener("appinstalled", handleInstalled);
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      window.removeEventListener("load", registerWorker);
    };
  }, [nativeBuild]);

  async function installApp() {
    if (!installPrompt) {
      setShowHelp(true);
      return;
    }

    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setShowButton(false);
  }

  if (nativeBuild) return null;

  return (
    <>
      {isOffline && <span className="pwa-offline-badge"><i />{copy.offline}</span>}
      {showButton && (
        <button className="button pwa-install-trigger" type="button" onClick={installApp} aria-label={copy.installLabel}>
          <span aria-hidden="true">⇩</span>{copy.install}
        </button>
      )}
      {showHelp && (
        <div className="install-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setShowHelp(false); }}>
          <section ref={installDialogRef} tabIndex={-1} className="install-dialog" role="dialog" aria-modal="true" aria-labelledby="install-title">
            <div className="install-icon" aria-hidden="true">{"{ }"}</div>
            <h2 id="install-title">{copy.title}</h2>
            <p>{copy.intro}</p>
            <ol>
              {(isIos ? copy.iosSteps : copy.otherSteps).map((step, index) => (
                <li key={step}><b>{index + 1}</b><span>{step}</span></li>
              ))}
            </ol>
            <small className="install-network-note">{copy.networkNote}</small>
            <button className="learn-primary" type="button" onClick={() => setShowHelp(false)}>{copy.close}</button>
          </section>
        </div>
      )}
    </>
  );
}
