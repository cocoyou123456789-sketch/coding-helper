import assert from "node:assert/strict";
import test from "node:test";

import {
  addNoteImage,
  emptyNoteImageStore,
  MAX_NOTE_IMAGE_BINARY_BYTES,
  MAX_NOTE_IMAGE_CAPTION_LENGTH,
  MAX_NOTE_IMAGE_DATA_URL_LENGTH,
  MAX_NOTE_IMAGE_DIMENSION,
  MAX_NOTE_IMAGES,
  MAX_NOTE_IMAGES_PER_PROBLEM,
  NOTE_IMAGE_STORE_VERSION,
  NoteImageStoreValidationError,
  normalizeNoteImageStore,
  noteImageCount,
  noteImageStoredCharacters,
  noteImageStoreIssue,
  noteImagesForProblem,
  parseNoteImageStore,
  removeNoteImage,
  updateNoteImageCaption,
} from "../app/note-images.ts";
import {
  MAX_NOTE_IMAGE_INPUT_BYTES,
  MAX_NOTE_IMAGE_SOURCE_PIXELS,
  NoteImageProcessingError,
  fitNoteImageDimensions,
  noteImageDimensionsTooLarge,
  noteImageFileIssue,
  prepareNoteImage,
  sniffNoteImageFile,
  sniffNoteImageHeader,
  stripGeneratedJpegMetadata,
} from "../app/note-image-processing.ts";

function jpegDataUrl(width = 320, height = 180) {
  const bytes = [
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10,
    0x4a, 0x46, 0x49, 0x46, 0x00,
    0x01, 0x01, 0x00,
    0x00, 0x01, 0x00, 0x01,
    0x00, 0x00,
    0xff, 0xc0, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03,
    0x01, 0x11, 0x00,
    0x02, 0x11, 0x01,
    0x03, 0x11, 0x01,
    0xff, 0xda, 0x00, 0x0c, 0x03,
    0x01, 0x00, 0x02, 0x11, 0x03, 0x11,
    0x00, 0x3f, 0x00,
    0x00,
    0xff, 0xd9,
  ];
  return `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}`;
}

function attachment(id, width = 320, height = 180) {
  return {
    id,
    dataUrl: jpegDataUrl(width, height),
    width,
    height,
    caption: "指针移动示意图",
    createdAt: 1_752_480_000_000,
  };
}

function pngHeader(width, height) {
  const bytes = new Uint8Array(24);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  bytes.set([0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function webpVp8xHeader(width, height) {
  const bytes = new Uint8Array(30);
  bytes.set(Buffer.from("RIFF"), 0);
  new DataView(bytes.buffer).setUint32(4, bytes.length - 8, true);
  bytes.set(Buffer.from("WEBPVP8X"), 8);
  new DataView(bytes.buffer).setUint32(16, 10, true);
  const widthMinusOne = width - 1;
  const heightMinusOne = height - 1;
  bytes.set([
    widthMinusOne & 0xff,
    (widthMinusOne >> 8) & 0xff,
    (widthMinusOne >> 16) & 0xff,
  ], 24);
  bytes.set([
    heightMinusOne & 0xff,
    (heightMinusOne >> 8) & 0xff,
    (heightMinusOne >> 16) & 0xff,
  ], 27);
  return bytes;
}

function bmffBox(type, payload) {
  const bytes = Buffer.alloc(8 + payload.length);
  bytes.writeUInt32BE(bytes.length, 0);
  bytes.write(type, 4, 4, "ascii");
  Buffer.from(payload).copy(bytes, 8);
  return bytes;
}

function heifFtyp(majorBrand = "heic") {
  return bmffBox("ftyp", Buffer.concat([
    Buffer.from(majorBrand, "ascii"),
    Buffer.alloc(4),
    Buffer.from("mif1", "ascii"),
  ]));
}

function heifIspe(width, height) {
  const payload = Buffer.alloc(12);
  payload.writeUInt32BE(width, 4);
  payload.writeUInt32BE(height, 8);
  return bmffBox("ispe", payload);
}

function heifFile(width, height, { majorBrand = "heic", prefixBoxes = [] } = {}) {
  const ipco = bmffBox("ipco", heifIspe(width, height));
  const iprp = bmffBox("iprp", ipco);
  const meta = bmffBox("meta", Buffer.concat([Buffer.alloc(4), iprp]));
  return Buffer.concat([heifFtyp(majorBrand), ...prefixBoxes, meta]);
}

function jpegDataUrlWithAppMarker(marker) {
  const original = Buffer.from(jpegDataUrl().split(",")[1], "base64");
  const appSegment = Buffer.from([0xff, marker, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  const bytes = Buffer.concat([original.subarray(0, 2), appSegment, original.subarray(2)]);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

function jpegDataUrlWithPostScanMarker(marker) {
  const original = Buffer.from(jpegDataUrl().split(",")[1], "base64");
  const segment = Buffer.from([0xff, marker, 0x00, 0x08, 0x45, 0x78, 0x69, 0x66, 0x00, 0x00]);
  const bytes = Buffer.concat([original.subarray(0, -2), segment, original.subarray(-2)]);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

function jpegDataUrlWithAdobeHeader() {
  const original = Buffer.from(jpegDataUrl().split(",")[1], "base64");
  const segment = Buffer.from([
    0xff, 0xee, 0x00, 0x0e,
    0x41, 0x64, 0x6f, 0x62, 0x65,
    0x00, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00,
  ]);
  const bytes = Buffer.concat([original.subarray(0, 2), segment, original.subarray(2)]);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

function jpegDataUrlWithStuffedAndRestartBytes() {
  const original = Buffer.from(jpegDataUrl().split(",")[1], "base64");
  const entropy = Buffer.from([0xff, 0x00, 0x12, 0xff, 0xd0, 0x34]);
  const bytes = Buffer.concat([original.subarray(0, -2), entropy, original.subarray(-2)]);
  return `data:image/jpeg;base64,${bytes.toString("base64")}`;
}

function jpegWithLateFrame(width, height) {
  const frame = Buffer.from(jpegDataUrl(width, height).split(",")[1], "base64").subarray(2);
  const segmentCount = 17;
  const segmentLength = 65_535;
  const bytes = new Uint8Array(2 + segmentCount * (segmentLength + 2) + frame.length);
  bytes.set([0xff, 0xd8]);
  let offset = 2;
  for (let index = 0; index < segmentCount; index += 1) {
    bytes.set([0xff, 0xe1, 0xff, 0xff], offset);
    offset += segmentLength + 2;
  }
  bytes.set(frame, offset);
  return bytes;
}

function namedBlob(bytes, name, type) {
  const blob = new Blob([bytes], { type });
  Object.defineProperty(blob, "name", { configurable: true, value: name });
  return blob;
}

function isProcessingError(code) {
  return (error) => error instanceof NoteImageProcessingError && error.code === code;
}

test("strict image-store parsing verifies JPEG frame dimensions", () => {
  const valid = {
    version: 1,
    byProblem: { 1: [attachment("safe-image")] },
  };
  assert.equal(noteImageStoreIssue(valid, [1]), null);
  const parsed = parseNoteImageStore(valid, [1]);
  assert.deepEqual(parsed, valid);
  assert.notStrictEqual(parsed, valid);

  const falseWidth = structuredClone(valid);
  falseWidth.byProblem[1][0].width = 319;
  assert.deepEqual(noteImageStoreIssue(falseWidth, [1]), {
    code: "invalid",
    field: "noteImages.byProblem.1[0]",
  });

  const hiddenLargeFrame = structuredClone(valid);
  hiddenLargeFrame.byProblem[1][0] = {
    ...hiddenLargeFrame.byProblem[1][0],
    dataUrl: jpegDataUrl(MAX_NOTE_IMAGE_DIMENSION + 1, 1),
    width: 1,
    height: 1,
  };
  assert.notEqual(noteImageStoreIssue(hiddenLargeFrame, [1]), null);

  const noFrame = structuredClone(valid);
  noFrame.byProblem[1][0].dataUrl = `data:image/jpeg;base64,${Buffer.from([
    0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xd9,
  ]).toString("base64")}`;
  assert.notEqual(noteImageStoreIssue(noFrame, [1]), null);
});

test("strict image-store parsing rejects JPEG application metadata and comments", () => {
  for (const marker of [0xe1, 0xe2, 0xeb, 0xec, 0xed, 0xef, 0xfe]) {
    const withMetadata = {
      version: NOTE_IMAGE_STORE_VERSION,
      byProblem: {
        1: [{ ...attachment(`metadata-${marker}`), dataUrl: jpegDataUrlWithAppMarker(marker) }],
      },
    };
    assert.deepEqual(noteImageStoreIssue(withMetadata, [1]), {
      code: "invalid",
      field: "noteImages.byProblem.1[0]",
    });
    assert.throws(() => parseNoteImageStore(withMetadata, [1]), NoteImageStoreValidationError);
  }

  for (const marker of [0xe1, 0xfe]) {
    const afterScan = {
      version: NOTE_IMAGE_STORE_VERSION,
      byProblem: {
        1: [{ ...attachment(`post-scan-${marker}`), dataUrl: jpegDataUrlWithPostScanMarker(marker) }],
      },
    };
    assert.notEqual(noteImageStoreIssue(afterScan, [1]), null);
  }

  for (const marker of [0xe0, 0xee]) {
    const forgedAllowedMarker = {
      version: NOTE_IMAGE_STORE_VERSION,
      byProblem: {
        1: [{ ...attachment(`forged-${marker}`), dataUrl: jpegDataUrlWithAppMarker(marker) }],
      },
    };
    assert.notEqual(noteImageStoreIssue(forgedAllowedMarker, [1]), null);
  }

  const adobe = {
    version: NOTE_IMAGE_STORE_VERSION,
    byProblem: { 1: [{ ...attachment("adobe"), dataUrl: jpegDataUrlWithAdobeHeader() }] },
  };
  assert.equal(noteImageStoreIssue(adobe, [1]), null);

  const legalEntropyMarkers = {
    version: NOTE_IMAGE_STORE_VERSION,
    byProblem: {
      1: [{ ...attachment("entropy-markers"), dataUrl: jpegDataUrlWithStuffedAndRestartBytes() }],
    },
  };
  assert.equal(noteImageStoreIssue(legalEntropyMarkers, [1]), null);
});

test("generated JPEG sanitization removes browser ICC and comment segments before strict storage", () => {
  const original = Buffer.from(jpegDataUrl().split(",")[1], "base64");
  const icc = Buffer.from([0xff, 0xe2, 0x00, 0x08, 0x49, 0x43, 0x43, 0x5f, 0x00, 0x01]);
  const comment = Buffer.from([0xff, 0xfe, 0x00, 0x06, 0x6e, 0x6f, 0x74, 0x65]);
  const generated = Buffer.concat([
    original.subarray(0, 2),
    icc,
    comment,
    original.subarray(2),
  ]);
  const stripped = stripGeneratedJpegMetadata(generated);
  assert.ok(stripped);
  assert.ok(stripped.byteLength < generated.byteLength);
  const dataUrl = `data:image/jpeg;base64,${Buffer.from(stripped).toString("base64")}`;
  assert.equal(noteImageStoreIssue({
    version: NOTE_IMAGE_STORE_VERSION,
    byProblem: { 1: [{ ...attachment("sanitized"), dataUrl }] },
  }, [1]), null);
  assert.equal(stripGeneratedJpegMetadata(Uint8Array.of(0xff, 0xd8, 0x00, 0x00)), null);
});

test("strict parsing rejects unknown problems, duplicate ids, and oversized captions", () => {
  const unknown = { version: 1, byProblem: { 99: [attachment("unknown")] } };
  assert.notEqual(noteImageStoreIssue(unknown, [1, 2]), null);

  const duplicate = {
    version: 1,
    byProblem: {
      1: [attachment("same-id")],
      2: [attachment("same-id")],
    },
  };
  assert.deepEqual(noteImageStoreIssue(duplicate, [1, 2]), {
    code: "invalid",
    field: "noteImages.byProblem.2[0].id",
  });

  const longCaption = { version: 1, byProblem: { 1: [attachment("caption")] } };
  longCaption.byProblem[1][0].caption = "字".repeat(241);
  assert.deepEqual(noteImageStoreIssue(longCaption, [1]), {
    code: "too-large",
    field: "noteImages.byProblem.1[0].caption",
  });
});

test("image mutations are immutable and enforce per-problem and total limits", () => {
  let store = emptyNoteImageStore();
  for (let index = 0; index < MAX_NOTE_IMAGES_PER_PROBLEM; index += 1) {
    const result = addNoteImage(store, 1, attachment(`problem-1-${index}`));
    assert.equal(result.ok, true);
    store = result.store;
  }
  assert.deepEqual(addNoteImage(store, 1, attachment("problem-1-extra")), {
    ok: false,
    reason: "problem-limit",
  });

  for (let index = MAX_NOTE_IMAGES_PER_PROBLEM; index < MAX_NOTE_IMAGES; index += 1) {
    const problemId = 2 + Math.floor((index - MAX_NOTE_IMAGES_PER_PROBLEM) / MAX_NOTE_IMAGES_PER_PROBLEM);
    const result = addNoteImage(store, problemId, attachment(`image-${index}`));
    assert.equal(result.ok, true);
    store = result.store;
  }
  assert.equal(noteImageCount(store), MAX_NOTE_IMAGES);
  assert.deepEqual(addNoteImage(store, 99, attachment("total-extra")), {
    ok: false,
    reason: "total-limit",
  });

  const beforeCaption = store;
  const captioned = updateNoteImageCaption(store, 1, "problem-1-0", "新的说明");
  assert.notEqual(captioned, beforeCaption);
  assert.equal(beforeCaption.byProblem[1][0].caption, "指针移动示意图");
  assert.equal(captioned.byProblem[1][0].caption, "新的说明");

  const removed = removeNoteImage(captioned, 1, "problem-1-0");
  assert.equal(noteImageCount(removed), MAX_NOTE_IMAGES - 1);
  assert.equal(noteImageCount(captioned), MAX_NOTE_IMAGES);
});

test("repair normalization never preserves malformed or unknown attachments", () => {
  const normalized = normalizeNoteImageStore({
    version: 999,
    byProblem: {
      1: [attachment("keep"), { ...attachment("bad-size"), width: 1 }],
      999: [attachment("unknown")],
    },
  }, [1]);
  assert.deepEqual(normalized, {
    version: 1,
    byProblem: { 1: [attachment("keep")] },
  });
});

test("file preflight detects real image headers instead of trusting extensions", () => {
  const jpegBytes = Buffer.from(jpegDataUrl().split(",")[1], "base64");
  assert.deepEqual(sniffNoteImageHeader(jpegBytes), { format: "jpeg", width: 320, height: 180 });
  assert.equal(sniffNoteImageHeader(Uint8Array.from([0x3c, 0x73, 0x76, 0x67, 0x3e])), null);
  assert.equal(noteImageFileIssue({ name: "photo.jpg", size: 100, type: "image/jpeg" }), null);
  assert.equal(noteImageFileIssue({ name: "danger.svg", size: 100, type: "image/jpeg" }), "unsupported");
  assert.equal(noteImageFileIssue({ name: "empty.png", size: 0, type: "image/png" }), "too-large");
});

test("dimension helpers cap output and reject multiplication-overflow tricks", () => {
  assert.deepEqual(fitNoteImageDimensions(4_000, 2_000), { width: 1_600, height: 800 });
  assert.deepEqual(fitNoteImageDimensions(0, 10), { width: 0, height: 0 });
  assert.equal(noteImageDimensionsTooLarge(6_000, 4_000), false);
  assert.equal(noteImageDimensionsTooLarge(6_001, 4_000), true);
  assert.equal(noteImageDimensionsTooLarge(Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER), true);
});

test("sniffs PNG, WebP and HEIF headers while rejecting SVG, PDF and arbitrary bytes", () => {
  assert.deepEqual(sniffNoteImageHeader(pngHeader(640, 480)), {
    format: "png", width: 640, height: 480,
  });
  assert.deepEqual(sniffNoteImageHeader(webpVp8xHeader(1_024, 768)), {
    format: "webp", width: 1_024, height: 768,
  });
  assert.deepEqual(sniffNoteImageHeader(heifFile(4_032, 3_024)), {
    format: "heif", width: 4_032, height: 3_024,
  });
  assert.equal(sniffNoteImageHeader(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>")), null);
  assert.equal(sniffNoteImageHeader(Buffer.from("%PDF-1.7\n% renamed as a photo")), null);
  assert.equal(sniffNoteImageHeader(Buffer.from("not an image")), null);
});

test("reads a supported late JPEG frame header before any browser pixel decode", async () => {
  const bytes = jpegWithLateFrame(1_200, 800);
  assert.ok(bytes.byteLength > 1024 * 1024);
  assert.ok(bytes.byteLength < MAX_NOTE_IMAGE_INPUT_BYTES);
  assert.deepEqual(await sniffNoteImageFile(new Blob([bytes])), {
    format: "jpeg", width: 1_200, height: 800,
  });
});

test("reads a late HEIF ispe box before any browser pixel decode", async () => {
  const free = bmffBox("free", Buffer.alloc(1024 * 1024));
  const bytes = heifFile(4_000, 3_000, { prefixBoxes: [free] });
  assert.ok(bytes.byteLength > 1024 * 1024);
  assert.ok(bytes.byteLength < MAX_NOTE_IMAGE_INPUT_BYTES);
  assert.deepEqual(await sniffNoteImageFile(new Blob([bytes])), {
    format: "heif", width: 4_000, height: 3_000,
  });
});

test("prepare rejects MIME-spoofed SVG, PDF and text before browser decode", async () => {
  const inputs = [
    namedBlob(Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'></svg>"), "renamed.png", "image/png"),
    namedBlob(Buffer.from("%PDF-1.7\n"), "renamed.jpg", "image/jpeg"),
    namedBlob(Buffer.from("plain text"), "renamed.webp", "image/webp"),
  ];

  for (const input of inputs) {
    await assert.rejects(prepareNoteImage(input), isProcessingError("unsupported"));
  }
});

test("prepare rejects oversized or malformed dimensions from headers before decode", async () => {
  const hugePng = namedBlob(pngHeader(6_001, 4_000), "huge.png", "image/png");
  await assert.rejects(prepareNoteImage(hugePng), isProcessingError("too-large"));

  const hugeHeif = namedBlob(heifFile(6_001, 4_000), "huge.heic", "image/heic");
  await assert.rejects(prepareNoteImage(hugeHeif), isProcessingError("too-large"));

  const dimensionlessHeif = namedBlob(heifFtyp(), "missing-ispe.heic", "image/heic");
  await assert.rejects(prepareNoteImage(dimensionlessHeif), isProcessingError("decode"));

  const incompleteJpeg = namedBlob(Uint8Array.of(0xff, 0xd8, 0xff, 0xd9), "bad.jpg", "image/jpeg");
  await assert.rejects(prepareNoteImage(incompleteJpeg), isProcessingError("decode"));
  assert.equal(MAX_NOTE_IMAGE_SOURCE_PIXELS, 24_000_000);
});

test("prepare revokes and detaches the object URL when browser decoding fails", async () => {
  const createDescriptor = Object.getOwnPropertyDescriptor(URL, "createObjectURL");
  const revokeDescriptor = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
  const imageDescriptor = Object.getOwnPropertyDescriptor(globalThis, "Image");
  const revoked = [];
  let removedSource = 0;

  class FailingImage {
    decoding = "auto";
    onload = null;
    onerror = null;

    set src(_value) {
      queueMicrotask(() => this.onerror?.());
    }

    removeAttribute(name) {
      if (name === "src") removedSource += 1;
    }
  }

  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: () => "blob:note-image" });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: (value) => revoked.push(value) });
  Object.defineProperty(globalThis, "Image", { configurable: true, value: FailingImage });

  try {
    const file = namedBlob(
      Buffer.from(jpegDataUrl().split(",")[1], "base64"),
      "photo.jpg",
      "text/plain",
    );
    await assert.rejects(prepareNoteImage(file), isProcessingError("decode"));
    assert.deepEqual(revoked, ["blob:note-image"]);
    assert.equal(removedSource, 1);
  } finally {
    if (createDescriptor) Object.defineProperty(URL, "createObjectURL", createDescriptor);
    else delete URL.createObjectURL;
    if (revokeDescriptor) Object.defineProperty(URL, "revokeObjectURL", revokeDescriptor);
    else delete URL.revokeObjectURL;
    if (imageDescriptor) Object.defineProperty(globalThis, "Image", imageDescriptor);
    else delete globalThis.Image;
  }
});

test("strict store parser rejects wrong versions and malformed image payloads", () => {
  const valid = { version: NOTE_IMAGE_STORE_VERSION, byProblem: { 1: [attachment("valid")] } };
  assert.deepEqual(parseNoteImageStore(valid, [1]), valid);

  const wrongVersion = structuredClone(valid);
  wrongVersion.version = 999;
  assert.throws(() => parseNoteImageStore(wrongVersion, [1]), NoteImageStoreValidationError);

  const nonJpeg = structuredClone(valid);
  nonJpeg.byProblem[1][0].dataUrl = `data:image/png;base64,${Buffer.from("PNG").toString("base64")}`;
  assert.throws(() => parseNoteImageStore(nonJpeg, [1]), NoteImageStoreValidationError);

  const corruptBase64 = structuredClone(valid);
  corruptBase64.byProblem[1][0].dataUrl = "data:image/jpeg;base64,%%%=";
  assert.throws(() => parseNoteImageStore(corruptBase64, [1]), NoteImageStoreValidationError);

  const missingCaption = structuredClone(valid);
  delete missingCaption.byProblem[1][0].caption;
  assert.throws(() => parseNoteImageStore(missingCaption, [1]), NoteImageStoreValidationError);
});

test("strict store parser applies encoded, binary and collection limits", () => {
  const oversizedCaption = {
    version: NOTE_IMAGE_STORE_VERSION,
    byProblem: { 1: [{ ...attachment("caption"), caption: "字".repeat(MAX_NOTE_IMAGE_CAPTION_LENGTH + 1) }] },
  };
  assert.equal(noteImageStoreIssue(oversizedCaption, [1]).code, "too-large");

  const oversizedUrl = {
    version: NOTE_IMAGE_STORE_VERSION,
    byProblem: {
      1: [{
        ...attachment("url"),
        dataUrl: `data:image/jpeg;base64,${"A".repeat(MAX_NOTE_IMAGE_DATA_URL_LENGTH)}`,
      }],
    },
  };
  assert.equal(noteImageStoreIssue(oversizedUrl, [1]).code, "too-large");

  const bytes = new Uint8Array(MAX_NOTE_IMAGE_BINARY_BYTES + 1);
  const frame = Buffer.from(jpegDataUrl().split(",")[1], "base64");
  bytes.set(frame.subarray(0, frame.length - 2));
  bytes.set([0xff, 0xd9], bytes.length - 2);
  const oversizedBinary = {
    version: NOTE_IMAGE_STORE_VERSION,
    byProblem: {
      1: [{ ...attachment("binary"), dataUrl: `data:image/jpeg;base64,${Buffer.from(bytes).toString("base64")}` }],
    },
  };
  assert.notEqual(noteImageStoreIssue(oversizedBinary, [1]), null);
});

test("store helpers expose stable empty values and immutable caption/removal behavior", () => {
  const empty = emptyNoteImageStore();
  assert.deepEqual(noteImagesForProblem(empty, 1), []);
  assert.equal(noteImageStoredCharacters(empty), 0);

  const added = addNoteImage(empty, 1, attachment("first"));
  assert.equal(added.ok, true);
  assert.equal(noteImageCount(empty), 0);
  assert.equal(noteImageStoredCharacters(added.store), attachment("first").dataUrl.length);

  const unchanged = updateNoteImageCaption(added.store, 1, "missing", "ignored");
  assert.strictEqual(unchanged, added.store);
  const clamped = updateNoteImageCaption(
    added.store,
    1,
    "first",
    "笔".repeat(MAX_NOTE_IMAGE_CAPTION_LENGTH + 10),
  );
  assert.equal(clamped.byProblem[1][0].caption.length, MAX_NOTE_IMAGE_CAPTION_LENGTH);
  assert.equal(added.store.byProblem[1][0].caption, "指针移动示意图");

  const removed = removeNoteImage(clamped, 1, "first");
  assert.equal(Object.hasOwn(removed.byProblem, 1), false);
  assert.strictEqual(removeNoteImage(removed, 1, "missing"), removed);
});
