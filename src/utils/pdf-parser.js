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
 * In Node.js we disable the worker by setting workerSrc to a null-ish value.
 * pdfjs-dist v4 will fall back to a synchronous, fake worker when no src is
 * configured. This avoids the need to manage a separate worker binary while
 * keeping the API fully functional in a single-threaded Node process.
 */
pdfjs.GlobalWorkerOptions.workerSrc = /** @type {any} */ (null);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/**
 * Default timeout for loading a PDF document (30 s).
 * @type {number}
 */
const DEFAULT_LOAD_TIMEOUT_MS = 30_000;

// ---------------------------------------------------------------------------
// Error catalogue (verbatim from PRD §9)
// ---------------------------------------------------------------------------

const ERR_CORRUPT =
  'PDF parsing failed: The file appears to be corrupt or malformed. Verify that the file was not truncated during download or storage.';

const ERR_ENCRYPTED =
  'PDF parsing failed: The document is encrypted with a password. Password-protected PDFs cannot be validated. Please provide an unprotected copy.';

const ERR_LOAD_TIMEOUT =
  'PDF parsing failed: Document loading timed out. The file may be too large or the parser may be stuck.';

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

  // -----------------------------------------------------------------------
  // Load the document with a timeout guard
  // -----------------------------------------------------------------------

  let loadingTask;

  try {
    loadingTask = pdfjs.getDocument(src);

    const doc = await withTimeout(
      loadingTask.promise,
      timeout,
      ERR_LOAD_TIMEOUT,
    );

    // ---------------------------------------------------------------------
    // Walk pages and collect text items
    // ---------------------------------------------------------------------

    /** @type {Array<{ str: string, x: number, y: number, page: number, width: number, height: number }>} */
    const items = [];
    /** @type {string[]} */
    const textParts = [];

    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const textContent = await page.getTextContent();

      if (textParts.length > 0) {
        // Insert a newline separator between pages.
        textParts.push('\n');
      }

      for (const item of textContent.items) {
        // pdfjs-dist v4 items may carry `str`, `dir`, `width`, `height`,
        // and `transform` (an array from which we derive x, y).
        const str = item.str ?? '';
        if (str.length === 0) continue;

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

    const fullText = textParts.join('');
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
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(message)), ms),
    ),
  ]);
}
