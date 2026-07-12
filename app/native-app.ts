import { Browser } from "@capacitor/browser";
import { Capacitor } from "@capacitor/core";
import { Haptics, ImpactStyle, NotificationType } from "@capacitor/haptics";
import { LocalNotifications } from "@capacitor/local-notifications";
import { Preferences } from "@capacitor/preferences";
import { Share } from "@capacitor/share";
import { StatusBar, Style } from "@capacitor/status-bar";

const IS_NATIVE_BUILD = process.env.NEXT_PUBLIC_NATIVE_APP === "true";
const REMINDER_KEY = "tijiebu-daily-reminder-v1";
const DAILY_REMINDER_ID = 771201;

export type DailyReminder = {
  enabled: boolean;
  time: string;
};

export type ReminderSaveResult = "scheduled" | "disabled" | "denied" | "unsupported" | "error";

export function isNativeAppBuild(): boolean {
  return IS_NATIVE_BUILD;
}

function hasNativeBridge(): boolean {
  return IS_NATIVE_BUILD && Capacitor.isNativePlatform();
}

export async function configureNativeAppearance(): Promise<void> {
  if (!hasNativeBridge()) return;
  try {
    await StatusBar.setOverlaysWebView({ overlay: false });
    await StatusBar.setStyle({ style: Style.Dark });
  } catch {
    // The learning workspace should remain usable if a native appearance API is unavailable.
  }
}

export async function getStoredValue(key: string): Promise<string | null> {
  if (!hasNativeBridge()) return window.localStorage.getItem(key);

  try {
    const { value } = await Preferences.get({ key });
    if (value !== null) return value;

    const legacyValue = window.localStorage.getItem(key);
    if (legacyValue !== null) await Preferences.set({ key, value: legacyValue });
    return legacyValue;
  } catch {
    return window.localStorage.getItem(key);
  }
}

export async function setStoredValue(key: string, value: string): Promise<void> {
  if (!hasNativeBridge()) {
    window.localStorage.setItem(key, value);
    return;
  }

  try {
    await Preferences.set({ key, value });
  } catch {
    window.localStorage.setItem(key, value);
  }
}

export async function playSelectionHaptic(): Promise<void> {
  if (!hasNativeBridge()) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Haptics are an enhancement and should never interrupt navigation.
  }
}

export async function playTestHaptic(passed: boolean): Promise<void> {
  if (!hasNativeBridge()) return;
  try {
    await Haptics.notification({
      type: passed ? NotificationType.Success : NotificationType.Warning,
    });
  } catch {
    // Devices without a Taptic Engine safely continue without feedback.
  }
}

export async function loadDailyReminder(): Promise<DailyReminder> {
  const fallback = { enabled: false, time: "20:00" } satisfies DailyReminder;
  const stored = await getStoredValue(REMINDER_KEY);
  if (!stored) return fallback;

  try {
    const parsed = JSON.parse(stored) as Partial<DailyReminder>;
    const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(parsed.time ?? "") ? parsed.time! : fallback.time;
    return { enabled: parsed.enabled === true, time };
  } catch {
    return fallback;
  }
}

export async function saveDailyReminder(
  reminder: DailyReminder,
  language: "zh" | "en",
): Promise<ReminderSaveResult> {
  if (!hasNativeBridge()) return "unsupported";

  try {
    await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });

    if (!reminder.enabled) {
      await setStoredValue(REMINDER_KEY, JSON.stringify(reminder));
      return "disabled";
    }

    let permission = await LocalNotifications.checkPermissions();
    if (permission.display === "prompt" || permission.display === "prompt-with-rationale") {
      permission = await LocalNotifications.requestPermissions();
    }
    if (permission.display !== "granted") {
      await setStoredValue(REMINDER_KEY, JSON.stringify({ ...reminder, enabled: false }));
      return "denied";
    }

    const [hour, minute] = reminder.time.split(":").map(Number);
    await LocalNotifications.schedule({
      notifications: [
        {
          id: DAILY_REMINDER_ID,
          title: language === "zh" ? "今天写一页题解簿" : "Write one page in your algo notebook",
          body: language === "zh" ? "用 10 分钟复习一道题，不用死磕。" : "Review one problem for 10 minutes — no grinding required.",
          schedule: { on: { hour, minute } },
          extra: { destination: "study-home" },
        },
      ],
    });
    await setStoredValue(REMINDER_KEY, JSON.stringify(reminder));
    return "scheduled";
  } catch {
    return "error";
  }
}

export async function shareStudyNote(title: string, text: string): Promise<"shared" | "copied" | "unavailable"> {
  try {
    const { value: canShare } = await Share.canShare();
    if (canShare) {
      await Share.share({ title, text });
      return "shared";
    }
  } catch {
    // Fall through to a clipboard copy when the share sheet is unavailable.
  }

  if (typeof navigator !== "undefined" && navigator.clipboard) {
    await navigator.clipboard.writeText(text);
    return "copied";
  }
  return "unavailable";
}

export async function openExternalPage(url: string): Promise<void> {
  if (hasNativeBridge()) {
    await Browser.open({ url, presentationStyle: "popover" });
    return;
  }
  window.open(url, "_blank", "noopener,noreferrer");
}

export async function clearStoredStudyData(keys: string[]): Promise<void> {
  try {
    await LocalNotifications.cancel({ notifications: [{ id: DAILY_REMINDER_ID }] });
  } catch {
    // Clearing local study data should still work if no reminder was scheduled.
  }

  if (hasNativeBridge()) {
    await Promise.all([...keys, REMINDER_KEY].map((key) => Preferences.remove({ key }).catch(() => undefined)));
  }
  [...keys, REMINDER_KEY].forEach((key) => window.localStorage.removeItem(key));
}
