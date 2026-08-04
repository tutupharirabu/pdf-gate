/**
 * @module ocr/rasterizer
 * @description Converts PDF pages into PNG images for OCR processing.
 *
 *              Renders each page via pdfjs-dist onto an `@napi-rs/canvas`
 *              canvas (lazy-loaded — only imported when OCR actually runs),
 *              producing PNG buffers that tesseract.js can recognize.
 *
 *              Rasterization is what enables OCR on scanned documents:
 *              tesseract.js only accepts images, never PDFs.
 */

import { fileURLToPath } from 'node:url';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// ── Constants ──────────────────────────────────────────────────────────────────

/** @const {number} Render scale factor (2x = higher OCR accuracy). */
const RENDER_SCALE = 2;

/** @const {number} Per-page render timeout (ms). */
const PAGE_TIMEOUT_MS = 20_000;

/**
 * Bundled pdfjs standard fonts (Helvetica/Times/Courier/Symbol + Liberation
 * sans replacements, Apache-2.0/SIL OFL — see LICENSE files in the folder).
 * Served via file:// with a patched fetch so pdfjs can load font data fully
 * locally — zero network, zero-trust preserved.
 * @type {string}
 */
const STANDARD_FONTS_URL = fileURLToPath(new URL('./standard_fonts/', import.meta.url));

/**
 * Temporarily patch global fetch so pdfjs can load bundled standard fonts
 * from file:// URLs (Node's built-in fetch does not support file://). The
 * original fetch is restored by the returned function.
 * @returns {() => void} Restore function.
 */
function patchFileFetch() {
  const originalFetch = globalThis.fetch;
  if (typeof originalFetch !== 'function') return () => {};

  let restored = false;
  /** @type {(input: string | URL | Request, init?: RequestInit) => Promise<Response>} */
  const patchedFetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    if (typeof url === 'string' && url.startsWith('file://')) {
      const { readFile } = await import('node:fs/promises');
      const data = await readFile(fileURLToPath(url));
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': 'application/octet-stream' },
      });
    }
    return originalFetch(input, init);
  };

  globalThis.fetch = patchedFetch;
  return () => {
    if (!restored) {
      globalThis.fetch = originalFetch;
      restored = true;
    }
  };
}

/**
 * Configure pdfjs to run in-thread in Node.js (same approach as
 * src/utils/pdf-parser.js).
 */
try {
  pdfjs.GlobalWorkerOptions.workerSrc = './pdf.worker.mjs';
  pdfjs.GlobalWorkerOptions.workerPort = null;
} catch (_) { /* ignore */ }

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Race a promise against a timeout.
 * @param {Promise<*>} promise
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<*>}
 */
function withTimeout(promise, ms, message) {
  /** @type {ReturnType<typeof setTimeout> | undefined} */
  let timer;
  const timeoutPromise = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([
    promise.then(
      (result) => {
        clearTimeout(timer);
        return result;
      },
      (err) => {
        clearTimeout(timer);
        throw err;
      },
    ),
    timeoutPromise,
  ]);
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Render PDF pages into PNG buffers.
 *
 * @param {Buffer|Uint8Array} pdfBuffer - Raw PDF bytes.
 * @param {{ pageLimit?: number }} [options] - Maximum pages to render
 *   (<= 0 means "all pages").
 * @returns {Promise<Buffer[]>} One PNG buffer per rendered page.
 * @throws {Error} When the document cannot be parsed or a page render times out.
 */
export async function rasterizePdf(pdfBuffer, options = {}) {
  const data = Buffer.isBuffer(pdfBuffer)
    ? new Uint8Array(pdfBuffer.buffer, pdfBuffer.byteOffset, pdfBuffer.byteLength)
    : pdfBuffer;

  // Lazy-load the native canvas backend — only paid for when OCR is used.
  const { createCanvas, Path2D: NapiPath2D } = await import('@napi-rs/canvas');

  // pdfjs-dist renders text via `new Path2D(...)` — but pdfjs ALSO installs its
  // own Path2D polyfill onto globalThis at import time. A foreign Path2D
  // instance is rejected by @napi-rs/canvas ctx.fill(), so unconditionally
  // override the global with the canvas-native constructor (idempotent).
  if (globalThis.Path2D !== NapiPath2D) {
    /** @type {any} */ (globalThis).Path2D = NapiPath2D;
  }

  let loadingTask;
  const restoreFetch = patchFileFetch();
  try {
    loadingTask = pdfjs.getDocument({
      data,
      // Render text as vector paths instead of loading FontFace (no FontFace
      // API in Node). Font data must still be present for glyph outlines,
      // so standard fonts are bundled and served via the patched file:// fetch.
      disableFontFace: true,
      standardFontDataUrl: STANDARD_FONTS_URL,
    });

    const doc = await withTimeout(
      loadingTask.promise,
      30_000,
      'Gagal memuat dokumen PDF untuk OCR (timeout).',
    );

    const pageLimit = options.pageLimit ?? 0;
    const pageCount =
      pageLimit > 0 ? Math.min(doc.numPages, pageLimit) : doc.numPages;

    /** @type {Buffer[]} */
    const pages = [];

    for (let pageNum = 1; pageNum <= pageCount; pageNum++) {
      const page = await withTimeout(
        doc.getPage(pageNum),
        PAGE_TIMEOUT_MS,
        `Timeout saat mengambil halaman ${pageNum} untuk OCR.`,
      );

      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = createCanvas(viewport.width, viewport.height);
      const ctx = canvas.getContext('2d');

      await withTimeout(
        page.render({ canvasContext: ctx, viewport }).promise,
        PAGE_TIMEOUT_MS,
        `Timeout saat merender halaman ${pageNum} untuk OCR.`,
      );

      pages.push(canvas.toBuffer('image/png'));
    }

    return pages;
  } catch (err) {
    if (loadingTask) {
      try {
        await loadingTask.destroy();
      } catch {
        // Best-effort cleanup.
      }
    }
    throw err instanceof Error
      ? err
      : new Error('Gagal merasterisasi PDF: ' + String(err));
  } finally {
    restoreFetch();
  }
}
