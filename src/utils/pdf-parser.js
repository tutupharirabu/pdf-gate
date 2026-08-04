/**
 * @module utils/pdf-parser
 * @description pdfjs-dist@^4.x wrapper for extracting text content and
 *              per-item coordinates from a PDF file.
 *
 *              Returns `{ fullText, items, pageCount }` where `items`
 *              is an array of `{ str, x, y, page, width, height }`.
 *
 *              Handles corrupt and encrypted PDFs with clear, verbatim
 *              error messages sourced from the PRD §9 error catalogue.
 */

import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

// ---------------------------------------------------------------------------
// Worker configuration for Node.js
// ---------------------------------------------------------------------------

/**
 * In Node.js, pdfjs-dist v4 runs without a real worker: its static
 * initializer defaults `workerSrc` to `./pdf.worker.mjs` (relative to the
 * pdfjs module) and uses an in-thread "fake worker". We keep that default
 * explicitly (a non-empty string is required — an empty value makes the
 * fake-worker loader throw) and pin `workerPort` to null so no real worker
 * is ever spawned.
 */
try {
  pdfjs.GlobalWorkerOptions.workerSrc = './pdf.worker.mjs';
  pdfjs.GlobalWorkerOptions.workerPort = null;
} catch (_) { /* ignore */ }

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default timeout for loading a PDF document (30 s).
 * @type {number}
 */
const DEFAULT_LOAD_TIMEOUT_MS = 30_000;

/**
 * Timeout for extracting a single page's text content (15 s).
 * @type {number}
 */
const PAGE_TIMEOUT_MS = 15_000;

/**
 * Maximum number of pages to extract before aborting (security cap).
 * @type {number}
 */
const MAX_PAGES = 200;

/**
 * Maximum number of text items to collect before aborting (security cap).
 * @type {number}
 */
const MAX_ITEMS = 100_000;

// ---------------------------------------------------------------------------
// Error catalogue (verbatim from PRD §9)
// ---------------------------------------------------------------------------

const ERR_CORRUPT =
  'PDF parsing failed: The file appears to be corrupt or malformed. Verify that the file was not truncated during download or storage.';

const ERR_ENCRYPTED =
  'PDF parsing failed: The document is encrypted with a password. Password-protected PDFs cannot be validated. Please provide an unprotected copy.';

const ERR_LOAD_TIMEOUT =
  'PDF parsing failed: Document loading timed out. The file may be too large or the parser may be stuck.';

const ERR_PAGE_TIMEOUT =
  'Page extraction timed out. The file may be too large or the parser may be stuck.';

const ERR_TOO_MANY_PAGES =
  `Document exceeds the maximum allowed page count (${MAX_PAGES}). ` +
  'Reject for security — the document is too large.';

const ERR_TOO_MANY_ITEMS =
  `Document exceeds the maximum allowed text item count (${MAX_ITEMS}). ` +
  'Reject for security — the document is too large.';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Classify a pdfjs-dist loading error and return a clear user-facing message.
 * @param {unknown} err
 * @returns {string}
 */
function classifyError(err) {
  if (err instanceof Error) {
    const msg = err.message ?? '';
    const name = err.name ?? '';

    // pdfjs-dist v4 uses specific error names and messages for these cases.
    if (
      name === 'PasswordException' ||
      name === 'UnknownErrorException' ||
      /password/i.test(msg) ||
      /encrypted/i.test(msg) ||
      /incorrect password/i.test(msg)
    ) {
      return ERR_ENCRYPTED;
    }

    if (
      name === 'InvalidPDFException' ||
      /invalid pdf/i.test(msg) ||
      /corrupt/i.test(msg) ||
      /bad file descriptor/i.test(msg) ||
      /not a pdf/i.test(msg)
    ) {
      return ERR_CORRUPT;
    }

    // Generic fallback — still wraps in our standard phrasing.
    return `PDF parsing failed: ${msg}`;
  }

  return ERR_CORRUPT;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Parse a PDF file and extract text with positional metadata.
 *
 * @param {string|URL|ArrayBuffer|Uint8Array} src – File path, URL, or binary
 *   buffer containing PDF data. When a string is passed it is treated as a
 *   file-system path (Node.js) or URL.
 * @param {{
 *   timeout?: number,
 * }} [options]
 * @returns {Promise<{
 *   fullText: string,
 *   items: Array<{ str: string, x: number, y: number, page: number, width: number, height: number }>,
 *   pageCount: number,
 * }>}
 */
export async function parsePdf(src, options = {}) {
  const timeout = options.timeout ?? DEFAULT_LOAD_TIMEOUT_MS;
  const startTime = performance.now();

  // Convert Buffer to Uint8Array for pdfjs-dist compatibility on Node >=21.
  // pdfjs-dist v4+ expects Uint8Array, but Node's fs.readFileSync returns Buffer.
  const data = Buffer.isBuffer(src)
    ? new Uint8Array(src.buffer, src.byteOffset, src.byteLength)
    : src;

  // -----------------------------------------------------------------------
  // Load the document with a timeout guard
  // -----------------------------------------------------------------------

  let loadingTask;

  try {
    // Pass document params explicitly so we can pin `standardFontDataUrl` to an
    // empty string: pdfjs-dist treats the parameter as provided and never
    // attempts an outbound network fetch for standard font files (zero-trust:
    // no network during parsing). NOTE: pdfjs may still print a console warning
    // ("Ensure that the `standardFontDataUrl` API parameter is provided") for
    // documents that use standard fonts (Helvetica etc.). That is expected and
    // harmless — font data is only needed for RENDERING, never for text
    // extraction, so validation results are unaffected. Loading fonts from a
    // file:// URL is not possible in Node (fetch does not support file:).
    const docParams =
      data instanceof URL || typeof data === 'string'
        ? { url: data, standardFontDataUrl: '' }
        : { data, standardFontDataUrl: '' };

    loadingTask = pdfjs.getDocument(docParams);

    const doc = await withTimeout(
      loadingTask.promise,
      timeout,
      ERR_LOAD_TIMEOUT,
    );

    // ---------------------------------------------------------------------
    // Walk pages and collect text items
    // ---------------------------------------------------------------------

    // Security cap: refuse to walk documents with an excessive page count.
    if (doc.numPages > MAX_PAGES) {
      throw new Error(ERR_TOO_MANY_PAGES);
    }

    /** @type {Array<{ str: string, x: number, y: number, page: number, width: number, height: number }>} */
    const items = [];
    /** @type {string[]} */
    const textParts = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      // Each page extraction is individually time-guarded.
      const page = await withTimeout(doc.getPage(pageNum), PAGE_TIMEOUT_MS, ERR_PAGE_TIMEOUT);
      const textContent = await withTimeout(page.getTextContent(), PAGE_TIMEOUT_MS, ERR_PAGE_TIMEOUT);

      if (textParts.length > 0) {
        // Insert a newline separator between pages.
        textParts.push('\n');
      }

      for (const item of textContent.items) {
        // pdfjs-dist v4 items may carry `str`, `dir`, `width`, `height`,
        // and `transform` (an array from which we derive x, y).
        // TextMarkedContent entries carry no text — skip them.
        if (!('str' in item)) continue;
        const str = item.str ?? '';
        if (str.length === 0) continue;

        // Security cap: stop collecting once the item budget is exhausted.
        if (items.length >= MAX_ITEMS) {
          throw new Error(ERR_TOO_MANY_ITEMS);
        }

        let x = 0;
        let y = 0;

        if (Array.isArray(item.transform) && item.transform.length >= 6) {
          x = item.transform[4];
          y = item.transform[5];
        }

        const width = typeof item.width === 'number' ? item.width : 0;
        const height = typeof item.height === 'number' ? item.height : 0;

        items.push({ str, x, y, page: pageNum, width, height });
        textParts.push(str);
      }
    }

    const fullText = textParts.join(' ');
    const elapsed = performance.now() - startTime;

    // If a logging facility is available, emit a debug line — otherwise
    // this is purely informational and silently successful.
    if (typeof process !== 'undefined' && process.env.LOG_LEVEL === 'debug') {
      process.stderr.write(
        `[pdf-parser] Parsed ${doc.numPages} page(s), ${items.length} text items in ${elapsed.toFixed(1)} ms\n`,
      );
    }

    return { fullText, items, pageCount: doc.numPages };
  } catch (err) {
    // Clean up the loading task if it was started.
    if (loadingTask) {
      try {
        await loadingTask.destroy();
      } catch {
        // Best-effort cleanup.
      }
    }

    const message = classifyError(err);
    throw new Error(message);
  }
}

/**
 * Race a promise against a timeout.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} message
 * @returns {Promise<T>}
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
        if (timer !== undefined) clearTimeout(timer);
        return result;
      },
      (err) => {
        if (timer !== undefined) clearTimeout(timer);
        throw err;
      },
    ),
    timeoutPromise,
  ]);
}
