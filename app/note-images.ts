export const NOTE_IMAGES_STORAGE_KEY = "leetcode-problem-note-images-v1";
export const NOTE_IMAGE_CAPTION_DRAFTS_STORAGE_KEY = "tijiebu-note-image-caption-drafts-v1";
export const NOTE_IMAGE_STORE_VERSION = 1;
export const MAX_NOTE_IMAGES_PER_PROBLEM = 4;
export const MAX_NOTE_IMAGES = 20;
export const MAX_NOTE_IMAGE_CAPTION_LENGTH = 240;
export const MAX_NOTE_IMAGE_DATA_URL_LENGTH = 400_000;
export const MAX_NOTE_IMAGE_BINARY_BYTES = 290 * 1024;
export const MAX_NOTE_IMAGE_STORE_CHARACTERS = 8 * 1024 * 1024;
// The browser processor never emits a side longer than 1,600 px. Keep the
// persisted/imported format on that same ceiling so a crafted backup cannot
// smuggle a larger decoded surface behind falsified width/height metadata.
export const MAX_NOTE_IMAGE_DIMENSION = 1_600;
export const MAX_NOTE_IMAGE_PIXELS = MAX_NOTE_IMAGE_DIMENSION * MAX_NOTE_IMAGE_DIMENSION;

const JPEG_DATA_URL_PREFIX = "data:image/jpeg;base64,";
const SAFE_ID = /^[A-Za-z0-9_-]{1,80}$/;
const BASE64_PAYLOAD = /^[A-Za-z0-9+/]+={0,2}$/;
const JPEG_START_OF_FRAME_MARKERS = new Set([
  0xc0, 0xc1, 0xc2, 0xc3,
  0xc5, 0xc6, 0xc7,
  0xc9, 0xca, 0xcb,
  0xcd, 0xce, 0xcf,
]);

export type NoteImageAttachment = {
  id: string;
  dataUrl: string;
  width: number;
  height: number;
  caption: string;
  createdAt: number;
};

export type NoteImageStore = {
  version: typeof NOTE_IMAGE_STORE_VERSION;
  byProblem: Record<number, NoteImageAttachment[]>;
};

export type NoteImageStoreIssue = {
  code: "invalid" | "too-large";
  field: string;
};

export type AddNoteImageResult =
  | { ok: true; store: NoteImageStore }
  | { ok: false; reason: "invalid" | "duplicate" | "problem-limit" | "total-limit" | "storage-limit" };

function objectValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function safeInteger(value: unknown, minimum: number, maximum: number): value is number {
  return typeof value === "number"
    && Number.isSafeInteger(value)
    && value >= minimum
    && value <= maximum;
}

type DecodedJpegMetadata = {
  byteLength: number;
  width: number;
  height: number;
};

/**
 * Read the JPEG frame header without asking the browser to decode pixels.
 * Imported backups are untrusted, so the separately stored width/height may
 * never be used to hide an oversized JPEG from the safety limits below.
 */
function decodedJpegMetadata(value: unknown): DecodedJpegMetadata | null {
  if (typeof value !== "string"
    || value.length > MAX_NOTE_IMAGE_DATA_URL_LENGTH
    || !value.startsWith(JPEG_DATA_URL_PREFIX)) {
    return null;
  }
  const payload = value.slice(JPEG_DATA_URL_PREFIX.length);
  if (!payload.length || payload.length % 4 !== 0 || !BASE64_PAYLOAD.test(payload)) return null;
  try {
    const decoded = atob(payload);
    if (decoded.length < 10
      || decoded.length > MAX_NOTE_IMAGE_BINARY_BYTES
      || decoded.charCodeAt(0) !== 0xff
      || decoded.charCodeAt(1) !== 0xd8
      || decoded.charCodeAt(2) !== 0xff
      || decoded.charCodeAt(decoded.length - 2) !== 0xff
      || decoded.charCodeAt(decoded.length - 1) !== 0xd9) {
      return null;
    }

    let offset = 2;
    let frame: (DecodedJpegMetadata & { componentCount: number }) | null = null;
    let sawScan = false;
    let sawJfif = false;
    let sawAdobe = false;
    while (offset < decoded.length - 1) {
      if (decoded.charCodeAt(offset) !== 0xff) return null;
      while (offset < decoded.length && decoded.charCodeAt(offset) === 0xff) offset += 1;
      if (offset >= decoded.length) return null;
      const marker = decoded.charCodeAt(offset);
      offset += 1;

      if (marker === 0xd9) {
        return frame && sawScan && offset === decoded.length ? frame : null;
      }
      if (marker === 0x00) return null;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) return null;
      // Normal uploads are rasterized before storage, so a persisted JPEG
      // should not contain application metadata or free-form comments. Keep
      // APP0 (JFIF) and APP14 (Adobe color transform), which encoders may need,
      // but reject APP1–APP13, APP15 and COM so crafted backups cannot restore
      // EXIF/GPS, XMP, ICC copyright, JUMBF/C2PA, Ducky or IPTC metadata.
      if ((marker >= 0xe1 && marker <= 0xed) || marker === 0xef || marker === 0xfe) return null;
      if (offset + 1 >= decoded.length) return null;

      const segmentLength = (decoded.charCodeAt(offset) << 8) | decoded.charCodeAt(offset + 1);
      if (segmentLength < 2 || offset + segmentLength > decoded.length) return null;
      if (marker === 0xe0) {
        // Canvas encoders may emit one fixed-size JFIF header. Reject generic
        // APP0 payloads and embedded thumbnails so the allow-list cannot be
        // repurposed as a metadata container.
        if (sawJfif
          || segmentLength !== 16
          || decoded.slice(offset + 2, offset + 7) !== "JFIF\0"
          || decoded.charCodeAt(offset + 14) !== 0
          || decoded.charCodeAt(offset + 15) !== 0) return null;
        sawJfif = true;
      }
      if (marker === 0xee) {
        // Adobe's color-transform header is also fixed-size. Its bounded
        // fields are needed by some encoders but cannot carry free-form data.
        if (sawAdobe
          || segmentLength !== 14
          || decoded.slice(offset + 2, offset + 7) !== "Adobe") return null;
        sawAdobe = true;
      }
      if (marker === 0xda) {
        if (!frame || segmentLength < 6) return null;
        const scanComponentCount = decoded.charCodeAt(offset + 2);
        if (scanComponentCount < 1
          || scanComponentCount > frame.componentCount
          || segmentLength !== 6 + scanComponentCount * 2) {
          return null;
        }
        sawScan = true;
        offset += segmentLength;
        // Walk entropy-coded bytes until the next real marker. FF00 is a
        // stuffed data byte and restart markers remain inside the scan; any
        // APP/COM marker between scans is returned to the outer validator.
        let foundMarker = false;
        while (offset < decoded.length - 1) {
          if (decoded.charCodeAt(offset) !== 0xff) {
            offset += 1;
            continue;
          }
          const markerOffset = offset;
          while (offset < decoded.length && decoded.charCodeAt(offset) === 0xff) offset += 1;
          if (offset >= decoded.length) return null;
          const scanMarker = decoded.charCodeAt(offset);
          offset += 1;
          if (scanMarker === 0x00 || (scanMarker >= 0xd0 && scanMarker <= 0xd7)) continue;
          offset = markerOffset;
          foundMarker = true;
          break;
        }
        if (!foundMarker) return null;
        continue;
      }
      if (JPEG_START_OF_FRAME_MARKERS.has(marker)) {
        if (frame || segmentLength < 8) return null;
        const precision = decoded.charCodeAt(offset + 2);
        const height = (decoded.charCodeAt(offset + 3) << 8) | decoded.charCodeAt(offset + 4);
        const width = (decoded.charCodeAt(offset + 5) << 8) | decoded.charCodeAt(offset + 6);
        const componentCount = decoded.charCodeAt(offset + 7);
        if (precision !== 8
          || componentCount < 1
          || componentCount > 4
          || segmentLength !== 8 + componentCount * 3
          || width < 1
          || height < 1
          || width > MAX_NOTE_IMAGE_DIMENSION
          || height > MAX_NOTE_IMAGE_DIMENSION
          || width * height > MAX_NOTE_IMAGE_PIXELS) {
          return null;
        }
        frame = { byteLength: decoded.length, width, height, componentCount };
      }
      offset += segmentLength;
    }
    return null;
  } catch {
    return null;
  }
}

function normalizeAttachment(value: unknown): NoteImageAttachment | null {
  const attachment = objectValue(value);
  if (!attachment
    || typeof attachment.id !== "string"
    || !SAFE_ID.test(attachment.id)
    || typeof attachment.dataUrl !== "string"
    || !safeInteger(attachment.width, 1, MAX_NOTE_IMAGE_DIMENSION)
    || !safeInteger(attachment.height, 1, MAX_NOTE_IMAGE_DIMENSION)
    || !safeInteger(attachment.createdAt, 0, Number.MAX_SAFE_INTEGER)) {
    return null;
  }
  const jpeg = decodedJpegMetadata(attachment.dataUrl);
  if (!jpeg
    || jpeg.width !== attachment.width
    || jpeg.height !== attachment.height
    || jpeg.width * jpeg.height > MAX_NOTE_IMAGE_PIXELS) {
    return null;
  }
  return {
    id: attachment.id,
    dataUrl: attachment.dataUrl,
    width: attachment.width,
    height: attachment.height,
    caption: typeof attachment.caption === "string"
      ? attachment.caption.slice(0, MAX_NOTE_IMAGE_CAPTION_LENGTH)
      : "",
    createdAt: attachment.createdAt,
  };
}

export function emptyNoteImageStore(): NoteImageStore {
  return { version: NOTE_IMAGE_STORE_VERSION, byProblem: {} };
}

export function normalizeNoteImageStore(
  value: unknown,
  knownProblemIds?: Iterable<number>,
): NoteImageStore {
  const store = objectValue(value);
  const rawByProblem = objectValue(store?.byProblem);
  if (!rawByProblem) return emptyNoteImageStore();

  const known = knownProblemIds ? new Set(knownProblemIds) : null;
  const byProblem: Record<number, NoteImageAttachment[]> = {};
  const seenIds = new Set<string>();
  let imageCount = 0;
  let storedCharacters = 0;

  for (const [rawProblemId, rawImages] of Object.entries(rawByProblem)) {
    if (!/^\d+$/.test(rawProblemId) || !Array.isArray(rawImages)) continue;
    const problemId = Number(rawProblemId);
    if (!Number.isSafeInteger(problemId)
      || problemId < 1
      || String(problemId) !== rawProblemId
      || (known && !known.has(problemId))) continue;

    const images: NoteImageAttachment[] = [];
    for (const rawImage of rawImages) {
      if (images.length >= MAX_NOTE_IMAGES_PER_PROBLEM || imageCount >= MAX_NOTE_IMAGES) break;
      const image = normalizeAttachment(rawImage);
      if (!image || seenIds.has(image.id)) continue;
      if (storedCharacters + image.dataUrl.length > MAX_NOTE_IMAGE_STORE_CHARACTERS) break;
      seenIds.add(image.id);
      images.push(image);
      imageCount += 1;
      storedCharacters += image.dataUrl.length;
    }
    if (images.length) byProblem[problemId] = images;
  }

  return { version: NOTE_IMAGE_STORE_VERSION, byProblem };
}

export function noteImageStoreIssue(
  value: unknown,
  knownProblemIds?: Iterable<number>,
): NoteImageStoreIssue | null {
  const store = objectValue(value);
  const rawByProblem = objectValue(store?.byProblem);
  if (!store || store.version !== NOTE_IMAGE_STORE_VERSION || !rawByProblem) {
    return { code: "invalid", field: "noteImages" };
  }

  const seenIds = new Set<string>();
  const known = knownProblemIds ? new Set(knownProblemIds) : null;
  let imageCount = 0;
  let storedCharacters = 0;
  for (const [rawProblemId, rawImages] of Object.entries(rawByProblem)) {
    const field = `noteImages.byProblem.${rawProblemId}`;
    if (!/^\d+$/.test(rawProblemId)
      || !Number.isSafeInteger(Number(rawProblemId))
      || Number(rawProblemId) < 1
      || String(Number(rawProblemId)) !== rawProblemId
      || (known && !known.has(Number(rawProblemId)))
      || !Array.isArray(rawImages)) {
      return { code: "invalid", field };
    }
    if (rawImages.length > MAX_NOTE_IMAGES_PER_PROBLEM) return { code: "too-large", field };

    for (let index = 0; index < rawImages.length; index += 1) {
      const imageField = `${field}[${index}]`;
      const rawImage = objectValue(rawImages[index]);
      if (!rawImage) return { code: "invalid", field: imageField };
      if (typeof rawImage.dataUrl === "string" && rawImage.dataUrl.length > MAX_NOTE_IMAGE_DATA_URL_LENGTH) {
        return { code: "too-large", field: `${imageField}.dataUrl` };
      }
      if (typeof rawImage.caption === "string" && rawImage.caption.length > MAX_NOTE_IMAGE_CAPTION_LENGTH) {
        return { code: "too-large", field: `${imageField}.caption` };
      }
      const normalized = normalizeAttachment(rawImage);
      if (!normalized
        || typeof rawImage.caption !== "string"
        || normalized.caption !== rawImage.caption
        || !Object.prototype.hasOwnProperty.call(rawImage, "createdAt")) {
        return { code: "invalid", field: imageField };
      }
      if (seenIds.has(normalized.id)) return { code: "invalid", field: `${imageField}.id` };
      seenIds.add(normalized.id);
      imageCount += 1;
      storedCharacters += normalized.dataUrl.length;
      if (imageCount > MAX_NOTE_IMAGES) return { code: "too-large", field: "noteImages" };
      if (storedCharacters > MAX_NOTE_IMAGE_STORE_CHARACTERS) return { code: "too-large", field: "noteImages" };
    }
  }
  return null;
}

export class NoteImageStoreValidationError extends Error {
  readonly issue: NoteImageStoreIssue;

  constructor(issue: NoteImageStoreIssue) {
    super(`Invalid note image store at ${issue.field}`);
    this.name = "NoteImageStoreValidationError";
    this.issue = issue;
  }
}

export function parseNoteImageStore(value: unknown, knownProblemIds?: Iterable<number>): NoteImageStore {
  const issue = noteImageStoreIssue(value, knownProblemIds);
  if (issue) throw new NoteImageStoreValidationError(issue);
  // Return a fresh canonical shape so untrusted imports cannot retain unknown
  // metadata even when every required field is valid.
  return normalizeNoteImageStore(value, knownProblemIds);
}

export function noteImagesForProblem(store: NoteImageStore, problemId: number): NoteImageAttachment[] {
  return store.byProblem[problemId] ?? [];
}

export function noteImageCount(store: NoteImageStore): number {
  return Object.values(store.byProblem).reduce((total, images) => total + images.length, 0);
}

export function noteImageStoredCharacters(store: NoteImageStore): number {
  return Object.values(store.byProblem).reduce(
    (total, images) => total + images.reduce((problemTotal, image) => problemTotal + image.dataUrl.length, 0),
    0,
  );
}

export function addNoteImage(
  store: NoteImageStore,
  problemId: number,
  value: NoteImageAttachment,
): AddNoteImageResult {
  const image = normalizeAttachment(value);
  if (!image || !Number.isSafeInteger(problemId) || problemId < 1) return { ok: false, reason: "invalid" };
  const currentImages = noteImagesForProblem(store, problemId);
  if (currentImages.length >= MAX_NOTE_IMAGES_PER_PROBLEM) return { ok: false, reason: "problem-limit" };
  if (noteImageCount(store) >= MAX_NOTE_IMAGES) return { ok: false, reason: "total-limit" };
  if (Object.values(store.byProblem).some((images) => images.some((item) => item.id === image.id))) {
    return { ok: false, reason: "duplicate" };
  }
  if (noteImageStoredCharacters(store) + image.dataUrl.length > MAX_NOTE_IMAGE_STORE_CHARACTERS) {
    return { ok: false, reason: "storage-limit" };
  }
  return {
    ok: true,
    store: {
      ...store,
      byProblem: {
        ...store.byProblem,
        [problemId]: [...currentImages, image],
      },
    },
  };
}

export function updateNoteImageCaption(
  store: NoteImageStore,
  problemId: number,
  imageId: string,
  caption: string,
): NoteImageStore {
  const currentImages = noteImagesForProblem(store, problemId);
  const nextCaption = caption.slice(0, MAX_NOTE_IMAGE_CAPTION_LENGTH);
  if (!currentImages.some((image) => image.id === imageId && image.caption !== nextCaption)) return store;
  return {
    ...store,
    byProblem: {
      ...store.byProblem,
      [problemId]: currentImages.map((image) => image.id === imageId ? { ...image, caption: nextCaption } : image),
    },
  };
}

export function removeNoteImage(store: NoteImageStore, problemId: number, imageId: string): NoteImageStore {
  const currentImages = noteImagesForProblem(store, problemId);
  const nextImages = currentImages.filter((image) => image.id !== imageId);
  if (nextImages.length === currentImages.length) return store;
  const byProblem = { ...store.byProblem };
  if (nextImages.length) byProblem[problemId] = nextImages;
  else delete byProblem[problemId];
  return { ...store, byProblem };
}
