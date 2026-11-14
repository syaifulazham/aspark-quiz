/**
 * Client-side document extraction for AI question generation.
 *
 * Everything is parsed in the browser so the original file never has to pass
 * through a serverless function (Vercel caps request bodies at ~4.5 MB).
 * Each document becomes a list of "units" (a PDF page, or a whole DOCX/text
 * file). A unit carries its text plus the images the model may look at and
 * that a question picture can later be snapshotted from.
 */

export interface DocImage {
  /** Unique within one extraction session; the model refers to images by it. */
  id: number;
  label: string;
  /** Full-quality source used for cropping snapshots. */
  blob: Blob;
  url: string;
  width: number;
  height: number;
  /**
   * Downscaled JPEG (base64, no data: prefix) sent to the model. It is padded
   * with white to a square so the model's box coordinates use one scale on
   * both axes; `modelSpan` is the fraction of that square the image occupies.
   */
  modelData: string;
  modelSpan: { x: number; y: number };
  /** True for a whole page (PDF page, uploaded scan) rather than a single picture. */
  isPage: boolean;
}

export interface DocUnit {
  label: string;
  /** 1-based page number for PDFs; undefined otherwise. */
  page?: number;
  text: string;
  images: DocImage[];
  /** Questions found starting in this unit; undefined until counted. */
  questionCount?: number;
}

export interface ExtractedDocument {
  name: string;
  kind: "pdf" | "docx" | "image" | "text";
  units: DocUnit[];
  /** Human-readable notes, e.g. truncation. */
  notes: string[];
}

/** Normalised crop rectangle, all values 0..1 relative to the image. */
export interface CropBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export const ACCEPTED_DOCUMENT_TYPES =
  ".pdf,.docx,.txt,.md,.markdown,.csv,.json,.html,.htm,.rtf,.png,.jpg,.jpeg,.webp";

const MAX_PDF_PAGES = 60;
const MAX_DOCX_IMAGES = 10;
const MAX_TEXT_CHARS = 150_000;
const CROP_SOURCE_WIDTH = 1500;
const MODEL_IMAGE_MAX = 1000;

let nextImageId = 1;

function extensionOf(name: string) {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number) {
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Could not encode image"))),
      type,
      quality
    )
  );
}

/** Downscale onto a white square JPEG the model can read (bare base64). */
function toModelImage(source: CanvasImageSource, width: number, height: number) {
  const longSide = Math.max(width, height);
  const scale = Math.min(1, MODEL_IMAGE_MAX / longSide);
  const side = Math.max(1, Math.round(longSide * scale));
  const canvas = document.createElement("canvas");
  canvas.width = side;
  canvas.height = side;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, side, side);
  ctx.drawImage(source, 0, 0, width * scale, height * scale);
  return {
    modelData: canvas.toDataURL("image/jpeg", 0.6).split(",")[1] ?? "",
    modelSpan: { x: width / longSide, y: height / longSide },
  };
}

/** Convert a box the model gave (relative to the padded square) to the image. */
export function modelBoxToImage(image: DocImage, box: CropBox): CropBox {
  // Small margin so strokes and labels on the edge are not clipped.
  const m = 0.012;
  const x = Math.min(1, Math.max(0, box.x / image.modelSpan.x - m));
  const y = Math.min(1, Math.max(0, box.y / image.modelSpan.y - m));
  const w = Math.min(1 - x, box.w / image.modelSpan.x + 2 * m);
  const h = Math.min(1 - y, box.h / image.modelSpan.y + 2 * m);
  // A box that fell entirely in the padding is meaningless: use the whole image.
  return w > 0.04 && h > 0.04 ? { x, y, w, h } : { x: 0, y: 0, w: 1, h: 1 };
}

async function imageFromBlob(blob: Blob, label: string, isPage: boolean): Promise<DocImage> {
  const bitmap = await createImageBitmap(blob);
  try {
    return {
      id: nextImageId++,
      label,
      blob,
      url: URL.createObjectURL(blob),
      width: bitmap.width,
      height: bitmap.height,
      ...toModelImage(bitmap, bitmap.width, bitmap.height),
      isPage,
    };
  } finally {
    bitmap.close();
  }
}

async function extractPdf(
  file: File,
  onProgress?: (message: string, fraction: number) => void
): Promise<ExtractedDocument> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();

  const loadingTask = pdfjs.getDocument({ data: await file.arrayBuffer() });
  const pdf = await loadingTask.promise;
  const notes: string[] = [];
  const pageCount = Math.min(pdf.numPages, MAX_PDF_PAGES);
  if (pdf.numPages > MAX_PDF_PAGES) {
    notes.push(`Only the first ${MAX_PDF_PAGES} of ${pdf.numPages} pages were read.`);
  }

  const units: DocUnit[] = [];
  try {
    for (let n = 1; n <= pageCount; n++) {
      onProgress?.(`${file.name}: reading page ${n} of ${pageCount}`, (n - 1) / pageCount);
      const page = await pdf.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({ scale: CROP_SOURCE_WIDTH / base.width });

      const canvas = document.createElement("canvas");
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvas, canvasContext: ctx, viewport }).promise;

      const blob = await canvasToBlob(canvas, "image/jpeg", 0.88);
      const content = await page.getTextContent();
      const text = content.items
        .map((item) =>
          "str" in item ? item.str + (item.hasEOL ? "\n" : " ") : ""
        )
        .join("")
        .replace(/[ \t]+\n/g, "\n")
        .trim();

      const label = `${file.name} — page ${n}`;
      units.push({
        label,
        page: n,
        text,
        images: [
          {
            id: nextImageId++,
            label,
            blob,
            url: URL.createObjectURL(blob),
            width: canvas.width,
            height: canvas.height,
            ...toModelImage(canvas, canvas.width, canvas.height),
            isPage: true,
          },
        ],
      });
      page.cleanup();
      canvas.width = canvas.height = 0;
    }
  } finally {
    await loadingTask.destroy();
  }

  return { name: file.name, kind: "pdf", units, notes };
}

async function extractDocx(file: File): Promise<ExtractedDocument> {
  const mammoth = (await import("mammoth")).default;
  const notes: string[] = [];
  const pending: Array<Promise<DocImage | null>> = [];
  let skipped = 0;

  const { value: html } = await mammoth.convertToHtml(
    { arrayBuffer: await file.arrayBuffer() },
    {
      convertImage: mammoth.images.imgElement(async (image) => {
        const supported = /^image\/(png|jpe?g|gif|webp|bmp)$/.test(image.contentType);
        if (!supported || pending.length >= MAX_DOCX_IMAGES) {
          skipped++;
          return { src: "", alt: "skipped" };
        }
        const index = pending.length;
        pending.push(
          image
            .read("base64")
            .then(async (b64) => {
              const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
              const blob = new Blob([bytes], { type: image.contentType });
              return imageFromBlob(blob, `${file.name} — picture ${index + 1}`, false);
            })
            .catch(() => null)
        );
        return { src: "", alt: `docimg-${index}` };
      }),
    }
  );

  const loaded = await Promise.all(pending);
  if (skipped > 0) {
    notes.push(
      `${skipped} embedded picture(s) were skipped (unsupported format or over the ${MAX_DOCX_IMAGES}-picture limit).`
    );
  }

  // Turn the HTML into plain text, leaving a marker where each picture sits so
  // the model knows which picture belongs to which passage.
  const root = new DOMParser().parseFromString(html, "text/html").body;
  root.querySelectorAll("img").forEach((img) => {
    const match = /^docimg-(\d+)$/.exec(img.getAttribute("alt") || "");
    const image = match ? loaded[Number(match[1])] : null;
    img.replaceWith(image ? ` [IMAGE ID ${image.id}] ` : "");
  });
  root.querySelectorAll("td,th").forEach((cell) => cell.append(" | "));
  root
    .querySelectorAll("p,h1,h2,h3,h4,h5,h6,li,tr,br")
    .forEach((block) => block.append("\n"));
  const text = (root.textContent || "").replace(/\n{3,}/g, "\n\n").trim();

  return {
    name: file.name,
    kind: "docx",
    units: [
      {
        label: file.name,
        text: truncate(text, notes),
        images: loaded.filter((i): i is DocImage => i !== null),
      },
    ],
    notes,
  };
}

function truncate(text: string, notes: string[]) {
  if (text.length <= MAX_TEXT_CHARS) return text;
  notes.push("The text was long, so only the first part was read.");
  return text.slice(0, MAX_TEXT_CHARS);
}

export async function extractDocument(
  file: File,
  onProgress?: (message: string, fraction: number) => void
): Promise<ExtractedDocument> {
  const ext = extensionOf(file.name);

  if (ext === "pdf" || file.type === "application/pdf") {
    return extractPdf(file, onProgress);
  }
  if (ext === "docx") {
    onProgress?.(`${file.name}: reading`, 0.3);
    return extractDocx(file);
  }
  if (ext === "doc") {
    throw new Error(
      "Old .doc files are not supported. Save the file as .docx or PDF and upload again."
    );
  }
  if (file.type.startsWith("image/")) {
    const image = await imageFromBlob(file, file.name, true);
    return {
      name: file.name,
      kind: "image",
      units: [{ label: file.name, text: "", images: [image] }],
      notes: [],
    };
  }

  // Anything else is treated as text; reject files that are clearly binary.
  let text = await file.text();
  if (/\u0000/.test(text.slice(0, 2000))) {
    throw new Error(
      `${file.name}: unsupported file type. Use PDF, DOCX, text or image files.`
    );
  }
  if (ext === "html" || ext === "htm") {
    text = new DOMParser().parseFromString(text, "text/html").body.textContent || "";
  }
  const notes: string[] = [];
  return {
    name: file.name,
    kind: "text",
    units: [{ label: file.name, text: truncate(text.trim(), notes), images: [] }],
    notes,
  };
}

export function releaseDocument(doc: ExtractedDocument) {
  for (const unit of doc.units) {
    for (const image of unit.images) URL.revokeObjectURL(image.url);
  }
}

/** Parse "1-5, 8" into a set of page numbers; null means "all pages". */
export function parsePageRange(input: string): Set<number> | null {
  const pages = new Set<number>();
  for (const part of input.split(",")) {
    const match = /^\s*(\d+)\s*(?:-\s*(\d+)\s*)?$/.exec(part);
    if (!match) continue;
    const from = Number(match[1]);
    const to = match[2] ? Number(match[2]) : from;
    for (let p = Math.min(from, to); p <= Math.max(from, to) && pages.size < 500; p++) {
      pages.add(p);
    }
  }
  return pages.size > 0 ? pages : null;
}

/**
 * Group units into request-sized batches so each call stays well under the
 * serverless body limit.
 */
export function batchUnits(units: DocUnit[], maxBytes = 2_600_000, maxImages = 10) {
  const batches: DocUnit[][] = [];
  let current: DocUnit[] = [];
  let bytes = 0;
  let images = 0;

  for (const unit of units) {
    // Keep only the pictures that fit one request (image-heavy DOCX files).
    let budget = maxBytes - unit.text.length;
    const fitting = unit.images
      .slice(0, maxImages)
      .filter((i) => (budget -= i.modelData.length) >= 0);
    const kept = fitting.length === unit.images.length ? unit : { ...unit, images: fitting };
    const size = Math.min(
      maxBytes,
      unit.text.length + fitting.reduce((n, i) => n + i.modelData.length, 0)
    );
    if (
      current.length > 0 &&
      (bytes + size > maxBytes || images + kept.images.length > maxImages)
    ) {
      batches.push(current);
      current = [];
      bytes = 0;
      images = 0;
    }
    current.push(kept);
    bytes += size;
    images += kept.images.length;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}

/** The page on its own (no padding) as a base64 JPEG, for locating one figure. */
export async function pageImageData(image: DocImage, maxSide = 1200): Promise<string> {
  const bitmap = await createImageBitmap(image.blob);
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.75).split(",")[1] ?? "";
  } finally {
    bitmap.close();
  }
}

/** Grow a box by a small margin so strokes and labels on its edge survive. */
export function padBox(box: CropBox, margin = 0.012): CropBox {
  const x = Math.max(0, box.x - margin);
  const y = Math.max(0, box.y - margin);
  return {
    x,
    y,
    w: Math.min(1 - x, box.w + box.x - x + margin),
    h: Math.min(1 - y, box.h + box.y - y + margin),
  };
}

/** Crop a region out of a source image and return it as a PNG. */
export async function cropImage(image: DocImage, box: CropBox): Promise<Blob> {
  const bitmap = await createImageBitmap(image.blob);
  try {
    const sx = Math.round(clamp01(box.x) * bitmap.width);
    const sy = Math.round(clamp01(box.y) * bitmap.height);
    const sw = Math.max(1, Math.min(bitmap.width - sx, Math.round(box.w * bitmap.width)));
    const sh = Math.max(1, Math.min(bitmap.height - sy, Math.round(box.h * bitmap.height)));
    const canvas = document.createElement("canvas");
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, sw, sh);
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
    return await canvasToBlob(canvas, "image/png");
  } finally {
    bitmap.close();
  }
}

function clamp01(n: number) {
  return Math.min(1, Math.max(0, n));
}
