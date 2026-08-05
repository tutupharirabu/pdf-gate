/**
 * @module ocr
 * @description OCR orchestrator for scanned PDF documents.
 *
 *              Pipeline: PDF buffer → rasterize pages to PNG (pdfjs-dist +
 *              @napi-rs/canvas) → recognize text (tesseract.js WASM with
 *              bundled ind+eng traineddata) → merged text + metadata.
 *
 *              Everything is lazy-loaded: no OCR dependency is imported
 *              until `runOcr()` is actually called, keeping the core
 *              validation pipeline fast and the zero-trust no-network
 *              guarantee intact (traineddata is bundled, never fetched).
 */

import { rasterizePdf } from './rasterizer.js';
import { recognizeImages, ENGINE_ID } from './engine.js';

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Resolve the installed tesseract.js version for the engine identifier.
 * @returns {Promise<string>}
 */
async function getTesseractVersion() {
  try {
    const { createRequire } = await import('node:module');
    const require = createRequire(import.meta.url);
    const pkg = require('tesseract.js/package.json');
    return typeof pkg.version === 'string' ? pkg.version : 'unknown';
  } catch {
    return 'unknown';
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run OCR over a PDF document.
 *
 * @param {Buffer|Uint8Array} pdfBuffer - Raw PDF bytes.
 * @param {{ languages?: string[], pageLimit?: number }} [options] -
 *   `languages`: tesseract language codes (default ['ind','eng']).
 *   `pageLimit`: max pages to process (default: all pages).
 * @returns {Promise<{
 *   text: string,
 *   pages: number,
 *   confidence: number,
 *   durationMs: number,
 *   engine: string,
 *   languages: string[],
 * }>}
 * @throws {Error} When rasterization or recognition fails.
 */
export async function runOcr(pdfBuffer, options = {}) {
  const t0 = performance.now();

  const pngs = await rasterizePdf(pdfBuffer, {
    pageLimit: options.pageLimit,
  });

  const { text, confidence, languages } = await recognizeImages(pngs, {
    languages: options.languages,
  });

  const version = await getTesseractVersion();

  return {
    text,
    pages: pngs.length,
    confidence: Math.round(confidence * 10000) / 10000,
    durationMs: Math.round(performance.now() - t0),
    engine: `${ENGINE_ID}@${version}`,
    languages,
  };
}
