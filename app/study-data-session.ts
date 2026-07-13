export const STUDY_DATA_STALE_EVENT = "tijiebu:study-data-stale";

const REVISION_KEY = "tijiebu-study-data-revision-v1";
const PROBE_KEY = "tijiebu-study-tab-probe-v1";
const RESPONSE_KEY = "tijiebu-study-tab-response-v1";
const CHANNEL_NAME = "tijiebu-study-tabs-v1";
const WRITE_LOCK_NAME = "tijiebu-study-data-write-v1";
const WRITE_LEASE_KEY = "tijiebu-study-data-write-lease-v1";
const WRITE_LEASE_MS = 15_000;
const IS_NATIVE_BUILD = process.env.NEXT_PUBLIC_NATIVE_APP === "true";

type StudyTabMessage = {
  type: "probe" | "present";
  sender: string;
  probeId: string;
};

const tabId = typeof crypto !== "undefined" && "randomUUID" in crypto
  ? crypto.randomUUID()
  : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

let sessionRevision: string | null = null;
let channel: BroadcastChannel | null = null;
let registrations = 0;
let localWriteTail: Promise<void> = Promise.resolve();
const pendingProbes = new Map<string, () => void>();

function isStudyTabMessage(value: unknown): value is StudyTabMessage {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StudyTabMessage>;
  return (candidate.type === "probe" || candidate.type === "present")
    && typeof candidate.sender === "string"
    && typeof candidate.probeId === "string";
}

function readRevision(): string {
  if (typeof window === "undefined") return "0";
  return window.localStorage.getItem(REVISION_KEY) ?? "0";
}

function ensureSessionRevision(): string {
  sessionRevision ??= readRevision();
  return sessionRevision;
}

function postMessage(message: StudyTabMessage): void {
  channel?.postMessage(message);
  try {
    window.localStorage.setItem(
      message.type === "probe" ? PROBE_KEY : RESPONSE_KEY,
      JSON.stringify({ ...message, sentAt: Date.now() }),
    );
  } catch {
    // BroadcastChannel remains the primary path when localStorage is unavailable.
  }
}

function receiveMessage(message: StudyTabMessage): void {
  if (message.sender === tabId) return;
  if (message.type === "probe") {
    postMessage({ type: "present", sender: tabId, probeId: message.probeId });
    return;
  }
  pendingProbes.get(message.probeId)?.();
}

function receiveStorageEvent(event: StorageEvent): void {
  if (event.key === REVISION_KEY && event.newValue !== ensureSessionRevision()) {
    window.dispatchEvent(new Event(STUDY_DATA_STALE_EVENT));
    return;
  }
  if ((event.key !== PROBE_KEY && event.key !== RESPONSE_KEY) || !event.newValue) return;
  try {
    const parsed = JSON.parse(event.newValue) as unknown;
    if (isStudyTabMessage(parsed)) receiveMessage(parsed);
  } catch {
    // Ignore unrelated or damaged coordination messages.
  }
}

function ensureCoordinator(): void {
  if (typeof window === "undefined" || registrations > 0) return;
  ensureSessionRevision();
  if (typeof BroadcastChannel !== "undefined") {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (isStudyTabMessage(event.data)) receiveMessage(event.data);
    });
  }
  window.addEventListener("storage", receiveStorageEvent);
}

/** Register this document as an active study tab and responder. */
export function registerStudyDataTab(): () => void {
  if (typeof window === "undefined") return () => undefined;
  ensureCoordinator();
  registrations += 1;
  return () => {
    registrations = Math.max(0, registrations - 1);
    if (registrations > 0) return;
    window.removeEventListener("storage", receiveStorageEvent);
    channel?.close();
    channel = null;
  };
}

/**
 * Detect another responsive tab before a whole-dataset operation. A revision
 * guard still prevents a suspended, stale tab from saving after it wakes.
 */
export async function hasOtherActiveStudyTab(timeoutMs = 350): Promise<boolean> {
  if (typeof window === "undefined") return false;
  ensureCoordinator();
  const probeId = `${tabId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return new Promise((resolve) => {
    let settled = false;
    const finish = (found: boolean) => {
      if (settled) return;
      settled = true;
      pendingProbes.delete(probeId);
      resolve(found);
    };
    pendingProbes.set(probeId, () => finish(true));
    postMessage({ type: "probe", sender: tabId, probeId });
    window.setTimeout(() => finish(false), timeoutMs);
  });
}

/** Prevent this tab from overwriting data replaced by another tab. */
export function assertStudyDataSessionCurrent(): void {
  if (typeof window === "undefined") return;
  if (readRevision() === ensureSessionRevision()) return;
  window.dispatchEvent(new Event(STUDY_DATA_STALE_EVENT));
  throw new Error("Study data changed in another tab. Reload before saving.");
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => globalThis.setTimeout(resolve, milliseconds));
}

async function withLocalStorageLease<T>(operation: () => Promise<T>): Promise<T> {
  const token = `${tabId}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const deadline = Date.now() + 20_000;

  while (Date.now() < deadline) {
    const now = Date.now();
    let available = false;
    try {
      const raw = window.localStorage.getItem(WRITE_LEASE_KEY);
      const lease = raw ? JSON.parse(raw) as { token?: unknown; expiresAt?: unknown } : null;
      available = !lease
        || typeof lease.expiresAt !== "number"
        || lease.expiresAt <= now;
    } catch {
      // If localStorage itself is unavailable, the in-document queue below is
      // still useful; native builds only have one WebView document.
      return operation();
    }

    if (available) {
      const candidate = JSON.stringify({ token, expiresAt: now + WRITE_LEASE_MS });
      window.localStorage.setItem(WRITE_LEASE_KEY, candidate);
      // Let simultaneous contenders settle, then only the final owner enters.
      await delay(30 + Math.floor(Math.random() * 25));
      const confirmed = window.localStorage.getItem(WRITE_LEASE_KEY);
      if (confirmed === candidate) {
        const renew = globalThis.setInterval(() => {
          try {
            const current = window.localStorage.getItem(WRITE_LEASE_KEY);
            if (!current || (JSON.parse(current) as { token?: unknown }).token !== token) return;
            window.localStorage.setItem(
              WRITE_LEASE_KEY,
              JSON.stringify({ token, expiresAt: Date.now() + WRITE_LEASE_MS }),
            );
          } catch {
            // The final ownership check below fails closed if the lease is lost.
          }
        }, WRITE_LEASE_MS / 3);
        try {
          const result = await operation();
          const current = window.localStorage.getItem(WRITE_LEASE_KEY);
          if (!current || (JSON.parse(current) as { token?: unknown }).token !== token) {
            throw new Error("The study-data write lock was lost.");
          }
          return result;
        } finally {
          globalThis.clearInterval(renew);
          try {
            const current = window.localStorage.getItem(WRITE_LEASE_KEY);
            if (current && (JSON.parse(current) as { token?: unknown }).token === token) {
              window.localStorage.removeItem(WRITE_LEASE_KEY);
            }
          } catch {
            // An expired lease is safe for a later operation to replace.
          }
        }
      }
    }
    await delay(45 + Math.floor(Math.random() * 55));
  }
  throw new Error("Another tab is still updating study data.");
}

/**
 * Serialize ordinary saves and whole-dataset operations across tabs. Web
 * Locks provide the strong path; a renewable localStorage lease covers older
 * Safari/WebViews, while a module queue prevents same-document races.
 */
export class StudyDataLockUnavailableError extends Error {
  constructor() {
    super("This browser cannot guarantee an exclusive cross-tab study-data operation.");
    this.name = "StudyDataLockUnavailableError";
  }
}

export function supportsSafeStudyDataWrites(): boolean {
  return IS_NATIVE_BUILD || (typeof navigator !== "undefined" && Boolean(navigator.locks));
}

function queueStudyDataLock<T>(
  lockedOperation: () => Promise<T>,
  requireStrongCrossTabLock = false,
): Promise<T> {
  const run = async () => {
    if (typeof navigator !== "undefined" && navigator.locks) {
      return navigator.locks.request(WRITE_LOCK_NAME, lockedOperation);
    }
    if (requireStrongCrossTabLock && !IS_NATIVE_BUILD) {
      throw new StudyDataLockUnavailableError();
    }
    return withLocalStorageLease(lockedOperation);
  };
  const result = localWriteTail.then(run, run);
  localWriteTail = result.then(() => undefined, () => undefined);
  return result;
}

export function withStudyDataWriteLock<T>(operation: () => Promise<T>): Promise<T> {
  return queueStudyDataLock(async () => {
    assertStudyDataSessionCurrent();
    return operation();
  }, true);
}

export function withStudyDataReadLock<T>(operation: () => Promise<T>): Promise<T> {
  return queueStudyDataLock(async () => {
    assertStudyDataSessionCurrent();
    return operation();
  });
}

/**
 * Let a stale tab take a read-only rescue snapshot after the current writer
 * finishes. This deliberately does not adopt the newer revision or authorize
 * any future save from the stale document.
 */
export function withStudyDataRescueReadLock<T>(operation: () => Promise<T>): Promise<T> {
  return queueStudyDataLock(operation, true);
}

/** A newly opened document may adopt the latest revision once it owns the lock. */
export function withInitialStudyDataReadLock<T>(operation: () => Promise<T>): Promise<T> {
  return queueStudyDataLock(async () => {
    sessionRevision = readRevision();
    return operation();
  });
}

/** Destructive web operations require the browser's true cross-tab mutex. */
export function withExclusiveStudyDataOperation<T>(operation: () => Promise<T>): Promise<T> {
  return queueStudyDataLock(async () => {
    assertStudyDataSessionCurrent();
    return operation();
  }, true);
}

/**
 * Invalidate every older tab before restore/delete starts. This revision is
 * intentionally retained even if the operation rolls back.
 */
export function advanceStudyDataRevision(): void {
  if (typeof window === "undefined") return;
  const next = `${Date.now()}-${tabId}-${Math.random().toString(36).slice(2)}`;
  window.localStorage.setItem(REVISION_KEY, next);
  sessionRevision = next;
}
