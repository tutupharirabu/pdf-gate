/**
 * @module ocr/engine
 * @description tesseract.js (WASM) engine wrapper for pdf-gate OCR.
 *
 *              The engine and its traineddata are lazy-loaded: `tesseract.js`
 *              is imported dynamically the first time OCR actually runs, so
 *              the core validation pipeline stays fast and lightweight.
 *
 *              Traineddata (ind + eng) is bundled inside this package under
 *              `./traineddata/` (Apache-2.0, from tesseract-ocr/tessdata_best)
 *              and resolved via the local filesystem — no network ever.
 */

import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

// ── Constants ──────────────────────────────────────────────────────────────────

/**
 * Absolute path to the bundled traineddata directory.
 * @type {string}
 */
const TRAINEDDATA_DIR = fileURLToPath(new URL('./traineddata/', import.meta.url));

/**
 * Resolve the tesseract WASM core from the installed package.
 *
 * We pin the plain SIMD build explicitly: auto-selection (via
 * wasm-feature-detect) picks the "relaxedsimd" build on some runtimes,
 * which fails to link ("missing function: DotProductSSE") — observed with
 * tesseract.js-core 7.x on Node.js. Pinning SIMD is deterministic and works
 * across tesseract.js 6.x/7.x.
 * @type {string}
 */
const CORE_PATH = (() => {
  try {
    const require = createRequire(import.meta.url);
    return require.resolve('tesseract.js-core/tesseract-core-simd.wasm.js');
  } catch {
    return 'tesseract.js-core/tesseract-core-simd.wasm.js';
  }
})();

/**
 * Engine identifier reported in results (e.g. "tesseract.js@7.0.0").
 * @type {string}
 */
export const ENGINE_ID = 'tesseract.js';

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Run tesseract.js OCR over a list of PNG images.
 *
 * @param {Buffer[]} pngs - PNG image buffers (one per page).
 * @param {{ languages?: string[], logger?: (m: unknown) => void }} [options]
 * @returns {Promise<{ text: string, confidence: number, languages: string[] }>}
 * @throws {Error} When the engine cannot be loaded or recognition fails.
 */
export async function recognizeImages(pngs, options = {}) {
  const languages = Array.isArray(options.languages) && options.languages.length > 0
    ? options.languages
    : ['ind', 'eng'];

  const Tesseract = await import('tesseract.js');

  /** @type {import('tesseract.js').Worker | undefined} */
  let worker;
  try {
    /** @type {Record<string, unknown>} */
    const workerOptions = {
      langPath: TRAINEDDATA_DIR,
      corePath: CORE_PATH,
      // Traineddata is bundled uncompressed (tessdata_best); tell the
      // engine not to look for `.gz` variants.
      gzip: false,
    };
    // Only attach the logger when provided — tesseract.js calls it
    // unconditionally when the key exists, so `undefined` breaks it.
    if (typeof options.logger === 'function') {
      workerOptions.logger = options.logger;
    }

    worker = await Tesseract.createWorker(languages, 1, workerOptions);
    if (!worker) {
      throw new Error('Worker tesseract.js gagal diinisialisasi.');
    }

    /** @type {string[]} */
    const texts = [];
    let confidenceSum = 0;

    for (const png of pngs) {
      const { data } = await worker.recognize(png);
      texts.push(data.text ?? '');
      confidenceSum += typeof data.confidence === 'number' ? data.confidence : 0;
    }

    const text = texts.join('\n');
    const confidence = pngs.length > 0 ? confidenceSum / pngs.length / 100 : 0;

    return { text, confidence, languages };
  } finally {
    if (worker) {
      try {
        await worker.terminate();
      } catch {
        // Best-effort cleanup — worker may already be gone.
      }
    }
  }
}
