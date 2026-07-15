"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { prepareNoteImage, NoteImageProcessingError } from "./note-image-processing";
import {
  MAX_NOTE_IMAGE_CAPTION_LENGTH,
  MAX_NOTE_IMAGES,
  MAX_NOTE_IMAGES_PER_PROBLEM,
  NOTE_IMAGE_CAPTION_DRAFTS_STORAGE_KEY,
  type NoteImageAttachment,
} from "./note-images";
import type { Language } from "./problem-i18n";
import { useDialogFocus } from "./use-dialog-focus";
import styles from "./note-image-panel.module.css";

export type NoteImageActionFailure =
  | "invalid"
  | "duplicate"
  | "problem-limit"
  | "total-limit"
  | "storage-limit"
  | "backup-limit"
  | "save-failed"
  | "blocked";

export type NoteImageActionResult =
  | { ok: true }
  | { ok: false; reason: NoteImageActionFailure };

type NoteImagePanelProps = {
  language: Language;
  problemTitle: string;
  images: NoteImageAttachment[];
  totalImages: number;
  disabled: boolean;
  unavailable: boolean;
  onAdd(image: NoteImageAttachment): Promise<NoteImageActionResult>;
  onCaption(imageId: string, caption: string): Promise<NoteImageActionResult>;
  onRemove(imageId: string): Promise<NoteImageActionResult>;
};

const panelCopy = {
  zh: {
    title: "图片笔记",
    help: "把手写推导、白板或报错截图放在这里。图片会自动压缩并去掉照片元数据，只保存在本机和完整备份中。",
    add: "添加图片",
    adding: "正在处理…",
    limit: `每题最多 ${MAX_NOTE_IMAGES_PER_PROBLEM} 张，单张原图不超过 15 MB。手机会打开拍照或相册选择。`,
    emptyTitle: "还没有图片笔记",
    emptyBody: "遇到画图、手算或报错时，拍下来比重新抄一遍更快。",
    caption: "图片说明（可选）",
    captionPlaceholder: "例如：双指针移动过程",
    captionHelp: "停止输入后自动保存",
    savingCaption: "正在保存说明…",
    draftConflict: "发现一份基于旧说明的未保存草稿。为避免覆盖较新的说明，请选择要保留哪一份。",
    restoreDraft: "使用未保存草稿",
    keepSaved: "保留已保存说明",
    view: (index: number) => `查看第 ${index} 张图片笔记`,
    alt: (index: number) => `第 ${index} 张笔记图片（未填写说明）`,
    remove: "删除",
    removeConfirm: "删除这张图片笔记吗？文字笔记不会受影响。",
    close: "关闭大图",
    previewTitle: "图片笔记大图",
    added: "图片已安全保存到本机。",
    captionSaved: "图片说明已保存。",
    removed: "图片已删除。",
    processingUnsupported: "只能添加 JPG、PNG、WebP 或可读取的 iPhone 照片。",
    processingTooLarge: "这张图片过大，请选择 15 MB 以内、像素较小的图片。",
    processingDecode: "这张图片无法读取，请换一张或先保存为 JPG。",
    processingCompress: "图片没有处理成功，请换一张较小的图片。",
    problemLimit: `本题已有 ${MAX_NOTE_IMAGES_PER_PROBLEM} 张，先删除一张再添加。`,
    totalLimit: `本机最多保存 ${MAX_NOTE_IMAGES} 张图片笔记，请先删除不需要的图片。`,
    storageLimit: "图片笔记已接近本机安全容量，请先删除不用的图片或导出备份。",
    backupLimit: "加入这张图后完整备份会超过 24 MB，请换一张更小的图或先清理旧笔记。",
    saveFailed: "本机空间不足或保存失败，图片没有加入笔记。请释放空间后重试。",
    blocked: "当前学习数据为只读状态，重新加载后再添加图片。",
    unavailable: "图片库暂时无法安全读取。为避免覆盖原图，本页不会保存新的图片；请先导出文字笔记并重新加载。",
  },
  en: {
    title: "Image notes",
    help: "Keep handwritten work, whiteboards, or error screenshots here. Images are compressed, stripped of photo metadata, and saved only on this device and in full backups.",
    add: "Add image",
    adding: "Processing…",
    limit: `Up to ${MAX_NOTE_IMAGES_PER_PROBLEM} per problem; original files must be 15 MB or smaller. On mobile, the system offers camera or photo choices.`,
    emptyTitle: "No image notes yet",
    emptyBody: "When a sketch, calculation, or error matters, capture it instead of copying it again.",
    caption: "Image description (optional)",
    captionPlaceholder: "For example: how the two pointers move",
    captionHelp: "Saves automatically after you stop typing",
    savingCaption: "Saving description…",
    draftConflict: "An unsaved draft was based on an older caption. Choose which version to keep so newer saved text is not overwritten.",
    restoreDraft: "Use unsaved draft",
    keepSaved: "Keep saved caption",
    view: (index: number) => `View image note ${index}`,
    alt: (index: number) => `Image note ${index} without a description`,
    remove: "Delete",
    removeConfirm: "Delete this image note? Text notes will not be changed.",
    close: "Close large image",
    previewTitle: "Large image note",
    added: "Image saved safely on this device.",
    captionSaved: "Image description saved.",
    removed: "Image deleted.",
    processingUnsupported: "Choose a JPG, PNG, WebP, or readable iPhone photo.",
    processingTooLarge: "This image is too large. Choose one under 15 MB with smaller dimensions.",
    processingDecode: "This image could not be read. Try another image or save it as JPG first.",
    processingCompress: "The image could not be prepared. Try a smaller image.",
    problemLimit: `This problem already has ${MAX_NOTE_IMAGES_PER_PROBLEM} images. Delete one before adding another.`,
    totalLimit: `This device can keep up to ${MAX_NOTE_IMAGES} image notes. Delete an old image first.`,
    storageLimit: "Image notes are near the safe on-device limit. Delete an old image or export a backup first.",
    backupLimit: "A full backup would exceed 24 MB after adding this image. Choose a smaller image or clean up old notes.",
    saveFailed: "The image was not added because on-device storage failed or is full. Free some space and try again.",
    blocked: "Study data is read-only right now. Reload before adding an image.",
    unavailable: "The image library could not be read safely. New images will not be saved so existing ones are not overwritten; export text notes and reload.",
  },
} as const;

const MAX_CAPTION_DRAFT_STORAGE_LENGTH = 16 * 1024;
type CaptionDraftRecord = { caption: string; baseCaption: string };
const captionDraftMemory = new Map<string, CaptionDraftRecord>();

function storedCaptionDrafts(): Record<string, CaptionDraftRecord> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(NOTE_IMAGE_CAPTION_DRAFTS_STORAGE_KEY);
    if (!raw || raw.length > MAX_CAPTION_DRAFT_STORAGE_LENGTH) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed)
      .filter(([id, draft]) => {
        if (!/^[A-Za-z0-9_-]{1,80}$/.test(id)
          || !draft
          || typeof draft !== "object"
          || Array.isArray(draft)) return false;
        const candidate = draft as Partial<CaptionDraftRecord>;
        return typeof candidate.caption === "string"
          && candidate.caption.length <= MAX_NOTE_IMAGE_CAPTION_LENGTH
          && typeof candidate.baseCaption === "string"
          && candidate.baseCaption.length <= MAX_NOTE_IMAGE_CAPTION_LENGTH;
      })
      .slice(0, MAX_NOTE_IMAGES)) as Record<string, CaptionDraftRecord>;
  } catch {
    return {};
  }
}

function captionDraft(imageId: string): CaptionDraftRecord | null {
  if (captionDraftMemory.has(imageId)) return captionDraftMemory.get(imageId) ?? null;
  const value = storedCaptionDrafts()[imageId];
  if (value) captionDraftMemory.set(imageId, value);
  return value ?? null;
}

function stageCaptionDraft(imageId: string, caption: string, baseCaption: string): void {
  const draft = { caption, baseCaption };
  captionDraftMemory.set(imageId, draft);
  if (typeof window === "undefined") return;
  try {
    const drafts = storedCaptionDrafts();
    drafts[imageId] = draft;
    const entries = Object.entries(drafts).slice(-MAX_NOTE_IMAGES);
    window.localStorage.setItem(NOTE_IMAGE_CAPTION_DRAFTS_STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // The in-memory fallback still protects problem-to-problem navigation.
  }
}

function clearCaptionDraft(imageId: string, persistedCaption: string): void {
  if (captionDraft(imageId)?.caption !== persistedCaption) return;
  discardCaptionDraft(imageId);
}

function discardCaptionDraft(imageId: string): void {
  captionDraftMemory.delete(imageId);
  if (typeof window === "undefined") return;
  try {
    const drafts = storedCaptionDrafts();
    delete drafts[imageId];
    if (Object.keys(drafts).length) {
      window.localStorage.setItem(NOTE_IMAGE_CAPTION_DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    } else {
      window.localStorage.removeItem(NOTE_IMAGE_CAPTION_DRAFTS_STORAGE_KEY);
    }
  } catch {
      // A verified main-library save already succeeded, or the learner chose
      // the saved version. A stale fallback is conflict-checked on next load.
  }
}

function resultMessage(result: NoteImageActionResult, text: typeof panelCopy.zh | typeof panelCopy.en): string {
  if (result.ok) return "";
  switch (result.reason) {
    case "problem-limit": return text.problemLimit;
    case "total-limit": return text.totalLimit;
    case "storage-limit": return text.storageLimit;
    case "backup-limit": return text.backupLimit;
    case "blocked": return text.blocked;
    default: return text.saveFailed;
  }
}

function CaptionEditor({
  image,
  text,
  disabled,
  onSave,
  announce,
}: {
  image: NoteImageAttachment;
  text: typeof panelCopy.zh | typeof panelCopy.en;
  disabled: boolean;
  onSave(imageId: string, caption: string): Promise<NoteImageActionResult>;
  announce(message: string, error?: boolean): void;
}) {
  const [initialRecovery] = useState(() => {
    const pending = captionDraft(image.id);
    if (!pending || pending.caption === image.caption) {
      if (pending) discardCaptionDraft(image.id);
      return { draft: image.caption, conflict: null as string | null };
    }
    return pending.baseCaption === image.caption
      ? { draft: pending.caption, conflict: null as string | null }
      : { draft: image.caption, conflict: pending.caption };
  });
  const [draft, setDraft] = useState(initialRecovery.draft);
  const [conflictingDraft, setConflictingDraft] = useState<string | null>(initialRecovery.conflict);
  const [saving, setSaving] = useState(false);
  const draftRef = useRef(draft);
  const persistedCaptionRef = useRef(image.caption);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const saveCaptionRef = useRef<() => Promise<void>>(async () => undefined);

  useEffect(() => {
    const previousCaption = persistedCaptionRef.current;
    persistedCaptionRef.current = image.caption;
    clearCaptionDraft(image.id, image.caption);
    if (draftRef.current !== previousCaption) return;
    draftRef.current = image.caption;
    const frame = window.requestAnimationFrame(() => setDraft(image.caption));
    return () => window.cancelAnimationFrame(frame);
  }, [image.caption, image.id]);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const saveCaption = useCallback(async () => {
    if (disabled || savingRef.current || draftRef.current === persistedCaptionRef.current) return;
    savingRef.current = true;
    if (mountedRef.current) setSaving(true);
    let result: NoteImageActionResult = { ok: true };
    do {
      const value = draftRef.current;
      try {
        result = await onSave(image.id, value);
      } catch {
        result = { ok: false, reason: "save-failed" };
      }
      if (!result.ok) break;
      persistedCaptionRef.current = value;
      clearCaptionDraft(image.id, value);
      // A newer edit may have arrived while the storage write was pending.
      // Finish that latest edit before releasing the single-writer guard.
    } while (draftRef.current !== persistedCaptionRef.current);
    savingRef.current = false;
    if (mountedRef.current) {
      setSaving(false);
      if (result.ok) announce(text.captionSaved);
      else announce(resultMessage(result, text), true);
    }
  }, [announce, disabled, image.id, onSave, text]);

  useEffect(() => {
    saveCaptionRef.current = saveCaption;
  }, [saveCaption]);

  useEffect(() => {
    if (disabled || draft === persistedCaptionRef.current) return;
    const timeout = window.setTimeout(() => { void saveCaption(); }, 400);
    return () => window.clearTimeout(timeout);
  }, [disabled, draft, saveCaption]);

  useEffect(() => {
    const saveBeforeBackground = () => { void saveCaption(); };
    const saveWhenHidden = () => {
      if (document.visibilityState === "hidden") saveBeforeBackground();
    };
    window.addEventListener("pagehide", saveBeforeBackground);
    document.addEventListener("visibilitychange", saveWhenHidden);
    return () => {
      window.removeEventListener("pagehide", saveBeforeBackground);
      document.removeEventListener("visibilitychange", saveWhenHidden);
    };
  }, [saveCaption]);

  useEffect(() => () => {
    // Switching problems can unmount this editor before the debounce expires.
    // Flush the newest draft through the same single-writer path first.
    void saveCaptionRef.current();
  }, []);

  return (
    <>
      <label className={styles.captionField}>
        <span>{text.caption}</span>
        <input
          type="text"
          value={draft}
          maxLength={MAX_NOTE_IMAGE_CAPTION_LENGTH}
          placeholder={text.captionPlaceholder}
          disabled={disabled}
          onChange={(event) => {
            draftRef.current = event.target.value;
            setDraft(event.target.value);
            setConflictingDraft(null);
            if (event.target.value === persistedCaptionRef.current) {
              discardCaptionDraft(image.id);
            } else {
              stageCaptionDraft(image.id, event.target.value, persistedCaptionRef.current);
            }
          }}
          onBlur={() => void saveCaption()}
        />
        <small>{saving ? text.savingCaption : text.captionHelp}</small>
      </label>
      {conflictingDraft !== null && (
        <div className={styles.draftConflict} role="alert">
          <p>{text.draftConflict}</p>
          <div>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                draftRef.current = conflictingDraft;
                setDraft(conflictingDraft);
                stageCaptionDraft(image.id, conflictingDraft, persistedCaptionRef.current);
                setConflictingDraft(null);
              }}
            >
              {text.restoreDraft}
            </button>
            <button
              type="button"
              disabled={disabled}
              onClick={() => {
                discardCaptionDraft(image.id);
                setConflictingDraft(null);
              }}
            >
              {text.keepSaved}
            </button>
          </div>
        </div>
      )}
    </>
  );
}

export default function NoteImagePanel({
  language,
  problemTitle,
  images,
  totalImages,
  disabled,
  unavailable,
  onAdd,
  onCaption,
  onRemove,
}: NoteImagePanelProps) {
  const text = panelCopy[language];
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [processing, setProcessing] = useState(false);
  const [message, setMessage] = useState("");
  const [messageIsError, setMessageIsError] = useState(false);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const previewImage = images.find((image) => image.id === previewId) ?? null;
  const previewDialogRef = useDialogFocus<HTMLElement>(Boolean(previewImage), () => setPreviewId(null));
  const limitReached = images.length >= MAX_NOTE_IMAGES_PER_PROBLEM || totalImages >= MAX_NOTE_IMAGES;
  const editingDisabled = disabled || unavailable || processing;

  function announce(nextMessage: string, error = false) {
    setMessage(nextMessage);
    setMessageIsError(error);
  }

  async function handleFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || editingDisabled) return;
    setProcessing(true);
    announce("");
    try {
      const image = await prepareNoteImage(file);
      const result = await onAdd(image);
      if (result.ok) announce(text.added);
      else announce(resultMessage(result, text), true);
    } catch (error) {
      if (error instanceof NoteImageProcessingError) {
        announce(
          error.code === "unsupported"
            ? text.processingUnsupported
            : error.code === "too-large"
              ? text.processingTooLarge
              : error.code === "decode"
                ? text.processingDecode
                : text.processingCompress,
          true,
        );
      } else {
        announce(text.processingCompress, true);
      }
    } finally {
      setProcessing(false);
    }
  }

  async function removeImage(imageId: string) {
    if (editingDisabled || !window.confirm(text.removeConfirm)) return;
    const result = await onRemove(imageId);
    if (result.ok) {
      if (previewId === imageId) setPreviewId(null);
      announce(text.removed);
    } else {
      announce(resultMessage(result, text), true);
    }
  }

  return (
    <div className={styles.panel}>
      <div className={styles.intro}>
        <div>
          <h3>{text.title}</h3>
          <strong className={styles.problemTitle}>{problemTitle}</strong>
          <p id="note-image-help">{text.help}</p>
          <small>{text.limit}</small>
        </div>
        <button
          type="button"
          className={styles.addButton}
          disabled={editingDisabled || limitReached}
          aria-describedby="note-image-help note-image-limit"
          onClick={() => inputRef.current?.click()}
        >
          <span aria-hidden="true">＋</span>{processing ? text.adding : text.add}
        </button>
        <input
          ref={inputRef}
          className={styles.fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
          aria-label={text.add}
          aria-describedby="note-image-help note-image-limit"
          disabled={editingDisabled || limitReached}
          onChange={(event) => void handleFile(event)}
        />
      </div>

      <p id="note-image-limit" className={styles.counter}>
        {language === "zh"
          ? `本题 ${images.length} / ${MAX_NOTE_IMAGES_PER_PROBLEM} 张 · 本机共 ${totalImages} / ${MAX_NOTE_IMAGES} 张`
          : `${images.length} / ${MAX_NOTE_IMAGES_PER_PROBLEM} for this problem · ${totalImages} / ${MAX_NOTE_IMAGES} on this device`}
      </p>

      {unavailable && <p className={styles.errorBox} role="alert">{text.unavailable}</p>}
      {message && (
        <p className={messageIsError ? styles.errorMessage : styles.statusMessage} role={messageIsError ? "alert" : "status"}>
          {message}
        </p>
      )}

      {!images.length ? (
        <div className={styles.emptyState}>
          <span aria-hidden="true">▧</span>
          <strong>{text.emptyTitle}</strong>
          <p>{text.emptyBody}</p>
        </div>
      ) : (
        <ul className={styles.grid}>
          {images.map((image, index) => {
            const alt = image.caption.trim() || text.alt(index + 1);
            return (
              <li className={styles.card} key={image.id}>
                <button type="button" className={styles.thumbnail} onClick={() => setPreviewId(image.id)} aria-label={text.view(index + 1)}>
                  {/* eslint-disable-next-line @next/next/no-img-element -- local data URLs have no image-loader endpoint. */}
                  <img src={image.dataUrl} alt={alt} width={image.width} height={image.height} loading="lazy" />
                </button>
                <CaptionEditor image={image} text={text} disabled={disabled || unavailable} onSave={onCaption} announce={announce} />
                <button type="button" className={styles.deleteButton} disabled={disabled || unavailable} onClick={() => void removeImage(image.id)}>
                  {text.remove}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {previewImage && (
        <div className={styles.previewBackdrop} role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPreviewId(null); }}>
          <section ref={previewDialogRef} className={styles.previewDialog} role="dialog" aria-modal="true" aria-labelledby="note-image-preview-title" tabIndex={-1}>
            <div className={styles.previewHeader}>
              <h3 id="note-image-preview-title">{text.previewTitle}</h3>
              <button type="button" aria-label={text.close} onClick={() => setPreviewId(null)}>×</button>
            </div>
            {/* eslint-disable-next-line @next/next/no-img-element -- local data URLs have no image-loader endpoint. */}
            <img src={previewImage.dataUrl} alt={previewImage.caption.trim() || text.alt(images.indexOf(previewImage) + 1)} />
            {previewImage.caption.trim() && <p>{previewImage.caption}</p>}
          </section>
        </div>
      )}
    </div>
  );
}
