// @ts-expect-error Node's strip-types test runner needs the explicit source extension.
import { MAX_NOTE_IMAGE_BINARY_BYTES, MAX_NOTE_IMAGE_DATA_URL_LENGTH, MAX_NOTE_IMAGE_DIMENSION, NOTE_IMAGE_STORE_VERSION, noteImageStoreIssue, type NoteImageAttachment } from "./note-images.ts";

export const MAX_NOTE_IMAGE_INPUT_BYTES = 15 * 1024 * 1024;
// Browser image decoders allocate an uncompressed pixel surface before the
// note is resized. Keep that temporary surface bounded even for compressed
// phone photos (roughly 96 MiB at four bytes per pixel).
export const MAX_NOTE_IMAGE_SOURCE_PIXELS = 24_000_000;
export const MAX_NOTE_IMAGE_HEADER_BYTES = 1024 * 1024;

export type NoteImageFileFormat = "jpeg" | "png" | "webp" | "heif";

export type NoteImageHeader = {
  format: NoteImageFileFormat;
  width: number | null;
  height: number | null;
};

export type NoteImageProcessingErrorCode = "unsupported" | "too-large" | "decode" | "compress";

export class NoteImageProcessingError extends Error {
  readonly code: NoteImageProcessingErrorCode;

  constructor(code: NoteImageProcessingErrorCode, message: string) {
    super(message);
    this.name = "NoteImageProcessingError";
    this.code = code;
  }
}

export function fitNoteImageDimensions(
  width: number,
  height: number,
  maximum = MAX_NOTE_IMAGE_DIMENSION,
): { width: number; height: number } {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0 || maximum <= 0) {
    return { width: 0, height: 0 };
  }
  const scale = Math.min(1, maximum / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export function noteImageFileIssue(file: Pick<File, "name" | "size" | "type">): NoteImageProcessingErrorCode | null {
  const lowerName = file.name.toLowerCase();
  const lowerType = file.type.trim().toLowerCase();
  if (lowerType === "image/svg+xml"
    || lowerType === "application/pdf"
    || lowerName.endsWith(".svg")
    || lowerName.endsWith(".pdf")) {
    return "unsupported";
  }
  if (file.size <= 0 || file.size > MAX_NOTE_IMAGE_INPUT_BYTES) return "too-large";
  return null;
}

function asciiEquals(bytes: Uint8Array, offset: number, expected: string): boolean {
  if (offset < 0 || offset + expected.length > bytes.length) return false;
  for (let index = 0; index < expected.length; index += 1) {
    if (bytes[offset + index] !== expected.charCodeAt(index)) return false;
  }
  return true;
}

function asciiValue(bytes: Uint8Array, offset: number, length: number): string {
  if (offset < 0 || offset + length > bytes.length) return "";
  let result = "";
  for (let index = 0; index < length; index += 1) result += String.fromCharCode(bytes[offset + index]);
  return result;
}

function uint16BigEndian(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 2 > bytes.length) return null;
  return bytes[offset] * 0x100 + bytes[offset + 1];
}

function uint24LittleEndian(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 3 > bytes.length) return null;
  return bytes[offset] + bytes[offset + 1] * 0x100 + bytes[offset + 2] * 0x10000;
}

function uint32BigEndian(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  return bytes[offset] * 0x1000000
    + bytes[offset + 1] * 0x10000
    + bytes[offset + 2] * 0x100
    + bytes[offset + 3];
}

function uint32LittleEndian(bytes: Uint8Array, offset: number): number | null {
  if (offset < 0 || offset + 4 > bytes.length) return null;
  return bytes[offset]
    + bytes[offset + 1] * 0x100
    + bytes[offset + 2] * 0x10000
    + bytes[offset + 3] * 0x1000000;
}

/**
 * Canvas encoders may add fresh JFIF, ICC, Adobe, or comment segments even
 * after the source photo was rasterized. Remove every APP/COM segment from
 * the generated JPEG before storage so browser-specific color metadata never
 * makes a safe iPhone image fail the strict persisted-format validator.
 */
export function stripGeneratedJpegMetadata(bytes: Uint8Array): Uint8Array | null {
  if (bytes.length < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let outputLength = 2;
  let offset = 2;

  while (offset < bytes.length - 1) {
    const markerOffset = offset;
    if (bytes[offset] !== 0xff) return null;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;
    const marker = bytes[offset];
    offset += 1;

    if (marker === 0xd9) {
      if (offset !== bytes.length) return null;
      const end = bytes.subarray(markerOffset, offset);
      parts.push(end);
      outputLength += end.length;
      break;
    }
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) return null;

    const segmentLength = uint16BigEndian(bytes, offset);
    if (segmentLength === null || segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    const segmentEnd = offset + segmentLength;
    if (marker === 0xda) {
      // Metadata emitted by conforming canvas serializers precedes the first
      // scan. Preserve entropy-coded bytes exactly; the strict store validator
      // still scans through EOI and rejects any crafted post-scan APP segment.
      const remainder = bytes.subarray(markerOffset);
      parts.push(remainder);
      outputLength += remainder.length;
      offset = bytes.length;
      break;
    }

    const isApplicationMetadata = marker >= 0xe0 && marker <= 0xef;
    const isComment = marker === 0xfe;
    if (!isApplicationMetadata && !isComment) {
      const segment = bytes.subarray(markerOffset, segmentEnd);
      parts.push(segment);
      outputLength += segment.length;
    }
    offset = segmentEnd;
  }

  if (offset !== bytes.length || parts.length < 2) return null;
  const output = new Uint8Array(outputLength);
  let outputOffset = 0;
  for (const part of parts) {
    output.set(part, outputOffset);
    outputOffset += part.length;
  }
  return output;
}

function jpegDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let offset = 2;
  while (offset < bytes.length) {
    while (offset < bytes.length && bytes[offset] !== 0xff) offset += 1;
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    if (offset >= bytes.length) return null;

    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) return null;
    if (marker === 0x00 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd8)) continue;

    const segmentLength = uint16BigEndian(bytes, offset);
    if (segmentLength === null || segmentLength < 2 || offset + segmentLength > bytes.length) return null;
    const isStartOfFrame = marker >= 0xc0
      && marker <= 0xcf
      && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isStartOfFrame && segmentLength >= 7) {
      const height = uint16BigEndian(bytes, offset + 3);
      const width = uint16BigEndian(bytes, offset + 5);
      if (width && height) return { width, height };
      return null;
    }
    offset += segmentLength;
  }
  return null;
}

function pngDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (!asciiEquals(bytes, 12, "IHDR") || uint32BigEndian(bytes, 8) !== 13) return null;
  const width = uint32BigEndian(bytes, 16);
  const height = uint32BigEndian(bytes, 20);
  return width && height ? { width, height } : null;
}

function webpDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  let chunkOffset = 12;
  while (chunkOffset + 8 <= bytes.length) {
    const chunkType = asciiValue(bytes, chunkOffset, 4);
    const chunkLength = uint32LittleEndian(bytes, chunkOffset + 4);
    const dataOffset = chunkOffset + 8;
    if (chunkLength === null || chunkLength < 0 || dataOffset + chunkLength > bytes.length) return null;

    if (chunkType === "VP8X" && chunkLength >= 10) {
      const widthMinusOne = uint24LittleEndian(bytes, dataOffset + 4);
      const heightMinusOne = uint24LittleEndian(bytes, dataOffset + 7);
      if (widthMinusOne !== null && heightMinusOne !== null) {
        return { width: widthMinusOne + 1, height: heightMinusOne + 1 };
      }
    }
    if (chunkType === "VP8L" && chunkLength >= 5 && bytes[dataOffset] === 0x2f) {
      const width = 1 + bytes[dataOffset + 1] + ((bytes[dataOffset + 2] & 0x3f) << 8);
      const height = 1
        + (bytes[dataOffset + 2] >> 6)
        + (bytes[dataOffset + 3] << 2)
        + ((bytes[dataOffset + 4] & 0x0f) << 10);
      return { width, height };
    }
    if (chunkType === "VP8 "
      && chunkLength >= 10
      && bytes[dataOffset + 3] === 0x9d
      && bytes[dataOffset + 4] === 0x01
      && bytes[dataOffset + 5] === 0x2a) {
      const rawWidth = bytes[dataOffset + 6] + bytes[dataOffset + 7] * 0x100;
      const rawHeight = bytes[dataOffset + 8] + bytes[dataOffset + 9] * 0x100;
      const width = rawWidth & 0x3fff;
      const height = rawHeight & 0x3fff;
      if (width && height) return { width, height };
      return null;
    }

    const paddedLength = chunkLength + (chunkLength % 2);
    if (dataOffset + paddedLength <= chunkOffset) return null;
    chunkOffset = dataOffset + paddedLength;
  }
  return null;
}

const HEIF_BRANDS = new Set(["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1"]);
const MAX_BMFF_BOXES = 4_096;

type BmffBox = {
  type: string;
  payloadStart: number;
  end: number;
};

function uint64BigEndianSafe(bytes: Uint8Array, offset: number): number | null {
  const high = uint32BigEndian(bytes, offset);
  const low = uint32BigEndian(bytes, offset + 4);
  if (high === null || low === null || high > Math.floor((Number.MAX_SAFE_INTEGER - low) / 0x100000000)) {
    return null;
  }
  return high * 0x100000000 + low;
}

function bmffBoxAt(bytes: Uint8Array, offset: number, parentEnd: number): BmffBox | null {
  if (offset < 0 || parentEnd > bytes.length || offset + 8 > parentEnd) return null;
  const size32 = uint32BigEndian(bytes, offset);
  if (size32 === null) return null;

  let headerLength = 8;
  let size = size32;
  if (size32 === 1) {
    headerLength = 16;
    if (offset + headerLength > parentEnd) return null;
    const largeSize = uint64BigEndianSafe(bytes, offset + 8);
    if (largeSize === null) return null;
    size = largeSize;
  } else if (size32 === 0) {
    size = parentEnd - offset;
  }

  if (!Number.isSafeInteger(size)
    || size < headerLength
    || size > parentEnd - offset) {
    return null;
  }
  return {
    type: asciiValue(bytes, offset + 4, 4),
    payloadStart: offset + headerLength,
    end: offset + size,
  };
}

function isHeif(bytes: Uint8Array): boolean {
  if (bytes.length < 12 || !asciiEquals(bytes, 4, "ftyp")) return false;
  const boxLength = uint32BigEndian(bytes, 0);
  const end = boxLength !== null && boxLength >= 16
    ? Math.min(boxLength, bytes.length)
    : bytes.length;
  if (HEIF_BRANDS.has(asciiValue(bytes, 8, 4))) return true;
  for (let offset = 16; offset + 4 <= end; offset += 4) {
    if (HEIF_BRANDS.has(asciiValue(bytes, offset, 4))) return true;
  }
  return false;
}

/**
 * Read HEIF's ImageSpatialExtentsProperty (`ispe`) without asking the browser
 * to allocate a decoded pixel surface. Only boxes reached through the
 * standard meta > iprp > ipco hierarchy are considered; byte patterns inside
 * media payloads are deliberately ignored. When a file contains thumbnail
 * and full-size properties, the largest surface is used for the preflight.
 */
function heifDimensions(bytes: Uint8Array): { width: number; height: number } | null {
  if (!isHeif(bytes)) return null;

  let boxesRead = 0;
  let largest: { width: number; height: number } | null = null;
  let oversized: { width: number; height: number } | null = null;

  const inspectBoxes = (
    start: number,
    end: number,
    context: "root" | "meta" | "iprp" | "ipco",
  ): boolean => {
    let offset = start;
    while (offset < end) {
      boxesRead += 1;
      if (boxesRead > MAX_BMFF_BOXES) return false;
      const box = bmffBoxAt(bytes, offset, end);
      if (!box) return false;

      if (context === "root" && box.type === "meta") {
        // `meta` is a FullBox, so its child boxes begin after version/flags.
        if (box.payloadStart + 4 > box.end
          || !inspectBoxes(box.payloadStart + 4, box.end, "meta")) return false;
      } else if (context === "meta" && box.type === "iprp") {
        if (!inspectBoxes(box.payloadStart, box.end, "iprp")) return false;
      } else if (context === "iprp" && box.type === "ipco") {
        if (!inspectBoxes(box.payloadStart, box.end, "ipco")) return false;
      } else if (context === "ipco" && box.type === "ispe") {
        // `ispe` is a version-0 FullBox followed by uint32 width and height.
        if (box.end - box.payloadStart < 12
          || bytes[box.payloadStart] !== 0
          || bytes[box.payloadStart + 1] !== 0
          || bytes[box.payloadStart + 2] !== 0
          || bytes[box.payloadStart + 3] !== 0) return false;
        const width = uint32BigEndian(bytes, box.payloadStart + 4);
        const height = uint32BigEndian(bytes, box.payloadStart + 8);
        if (width === null || height === null || width < 1 || height < 1) return false;

        if (noteImageDimensionsTooLarge(width, height)) {
          oversized ??= { width, height };
        } else if (!largest || width * height > largest.width * largest.height) {
          // Products are safe here because both candidates are <= the 24 MP cap.
          largest = { width, height };
        }
      }

      if (box.end <= offset) return false;
      offset = box.end;
    }
    return offset === end;
  };

  if (!inspectBoxes(0, bytes.length, "root")) return null;
  return oversized ?? largest;
}

/** Inspect file bytes rather than trusting a caller-controlled name or MIME type. */
export function sniffNoteImageHeader(bytes: Uint8Array): NoteImageHeader | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    const dimensions = jpegDimensions(bytes);
    return { format: "jpeg", width: dimensions?.width ?? null, height: dimensions?.height ?? null };
  }
  const pngSignature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (bytes.length >= pngSignature.length
    && pngSignature.every((value, index) => bytes[index] === value)) {
    const dimensions = pngDimensions(bytes);
    return { format: "png", width: dimensions?.width ?? null, height: dimensions?.height ?? null };
  }
  if (bytes.length >= 12 && asciiEquals(bytes, 0, "RIFF") && asciiEquals(bytes, 8, "WEBP")) {
    const dimensions = webpDimensions(bytes);
    return { format: "webp", width: dimensions?.width ?? null, height: dimensions?.height ?? null };
  }
  if (isHeif(bytes)) {
    const dimensions = heifDimensions(bytes);
    return { format: "heif", width: dimensions?.width ?? null, height: dimensions?.height ?? null };
  }
  return null;
}

export async function sniffNoteImageFile(file: Pick<Blob, "size" | "slice">): Promise<NoteImageHeader | null> {
  const byteCount = Math.min(file.size, MAX_NOTE_IMAGE_HEADER_BYTES);
  if (byteCount <= 0) return null;
  const bytes = new Uint8Array(await file.slice(0, byteCount).arrayBuffer());
  const header = sniffNoteImageHeader(bytes);

  // JPEG/WebP metadata may legally precede the frame header. If the bounded
  // first read found a supported magic number but not its dimensions, inspect
  // the rest of an already size-limited upload before allowing a pixel decode.
  // PNG always carries its dimensions in the fixed IHDR location. HEIF's
  // metadata may appear after a large top-level box, so it also receives this
  // bounded full-file pass before any pixel decoder is invoked.
  if (header
    && header.format !== "png"
    && (header.width === null || header.height === null)
    && file.size > byteCount
    && file.size <= MAX_NOTE_IMAGE_INPUT_BYTES) {
    const completeBytes = new Uint8Array(await file.slice(0, file.size).arrayBuffer());
    return sniffNoteImageHeader(completeBytes);
  }
  return header;
}

export function noteImageDimensionsTooLarge(
  width: number,
  height: number,
  maximumPixels = MAX_NOTE_IMAGE_SOURCE_PIXELS,
): boolean {
  if (!Number.isSafeInteger(width)
    || !Number.isSafeInteger(height)
    || width <= 0
    || height <= 0
    || !Number.isSafeInteger(maximumPixels)
    || maximumPixels <= 0) {
    return true;
  }
  return width > Math.floor(maximumPixels / height);
}

function createImageId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

function loadBrowserImage(file: File): Promise<{ image: HTMLImageElement; release(): void }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    let image: HTMLImageElement;
    try {
      image = new Image();
    } catch {
      URL.revokeObjectURL(objectUrl);
      reject(new NoteImageProcessingError("decode", "The selected image could not be decoded."));
      return;
    }
    let released = false;
    const release = () => {
      if (released) return;
      released = true;
      image.onload = null;
      image.onerror = null;
      image.removeAttribute("src");
      URL.revokeObjectURL(objectUrl);
    };
    image.decoding = "async";
    image.onload = () => resolve({ image, release });
    image.onerror = () => {
      release();
      reject(new NoteImageProcessingError("decode", "The selected image could not be decoded."));
    };
    image.src = objectUrl;
  });
}

function canvasBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new NoteImageProcessingError("compress", "The image could not be compressed."));
    }, "image/jpeg", quality);
  });
}

function blobDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => typeof reader.result === "string"
      ? resolve(reader.result)
      : reject(new NoteImageProcessingError("compress", "The compressed image could not be read."));
    reader.onerror = () => reject(new NoteImageProcessingError("compress", "The compressed image could not be read."));
    reader.readAsDataURL(blob);
  });
}

/** Rasterize and bound an imported image so EXIF/location metadata and oversized originals are not stored. */
export async function prepareNoteImage(file: File): Promise<NoteImageAttachment> {
  const fileIssue = noteImageFileIssue(file);
  if (fileIssue) {
    throw new NoteImageProcessingError(
      fileIssue,
      fileIssue === "too-large" ? "The selected image is too large." : "The selected file is not a supported image.",
    );
  }

  let header: NoteImageHeader | null;
  try {
    header = await sniffNoteImageFile(file);
  } catch {
    throw new NoteImageProcessingError("decode", "The selected image could not be read.");
  }
  if (!header) {
    throw new NoteImageProcessingError("unsupported", "The selected file is not a supported image.");
  }
  if (header.width === null || header.height === null) {
    throw new NoteImageProcessingError("decode", "The selected image header is incomplete or invalid.");
  }
  if (noteImageDimensionsTooLarge(header.width, header.height)) {
    throw new NoteImageProcessingError("too-large", "The selected image dimensions are too large.");
  }

  const loaded = await loadBrowserImage(file);
  try {
    const sourceWidth = loaded.image.naturalWidth;
    const sourceHeight = loaded.image.naturalHeight;
    if (noteImageDimensionsTooLarge(sourceWidth, sourceHeight)) {
      throw new NoteImageProcessingError("too-large", "The selected image dimensions are too large.");
    }

    const base = fitNoteImageDimensions(sourceWidth, sourceHeight);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new NoteImageProcessingError("compress", "Image compression is unavailable.");

    const sizeFactors = [1, 0.84, 0.7, 0.58];
    const qualities = [0.84, 0.72, 0.6, 0.48];
    for (const factor of sizeFactors) {
      const width = Math.max(1, Math.round(base.width * factor));
      const height = Math.max(1, Math.round(base.height * factor));
      canvas.width = width;
      canvas.height = height;
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(loaded.image, 0, 0, width, height);

      for (const quality of qualities) {
        const blob = await canvasBlob(canvas, quality);
        if (blob.size > MAX_NOTE_IMAGE_BINARY_BYTES) continue;
        const strippedBytes = stripGeneratedJpegMetadata(new Uint8Array(await blob.arrayBuffer()));
        if (!strippedBytes || strippedBytes.byteLength > MAX_NOTE_IMAGE_BINARY_BYTES) continue;
        const strippedBlob = new Blob([strippedBytes.slice().buffer], { type: "image/jpeg" });
        const dataUrl = await blobDataUrl(strippedBlob);
        if (dataUrl.length > MAX_NOTE_IMAGE_DATA_URL_LENGTH) continue;
        const attachment: NoteImageAttachment = {
          id: createImageId(),
          dataUrl,
          width,
          height,
          caption: "",
          createdAt: Date.now(),
        };
        if (noteImageStoreIssue({
          version: NOTE_IMAGE_STORE_VERSION,
          byProblem: { 1: [attachment] },
        }, [1])) continue;
        return attachment;
      }
    }
  } finally {
    loaded.release();
  }

  throw new NoteImageProcessingError("compress", "The selected image could not be reduced to a safe note size.");
}
