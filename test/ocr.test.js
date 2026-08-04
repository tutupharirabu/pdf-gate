/**
 * @module test/ocr.test
 * @description OCR feature tests for pdf-gate:
 *              - `runOcr()` smoke tests on a synthetic (canvas-rendered) PNG
 *                with sertifikat-style text — no real documents involved.
 *              - `validatePDF()` OCR integration contract: auto-trigger on
 *                text-less PDFs, no-trigger on text PDFs, force mode, and
 *                option sanitization.
 *
 *              The OCR engine module (src/ocr/) is loaded lazily via a
 *              dynamic import so the integration tests can run independently
 *              of the (parallel) engine implementation. Until src/ocr/index.js
 *              exists, the smoke tests fail loudly with ERR_MODULE_NOT_FOUND —
 *              they are never silently skipped.
 */

import { validatePDF } from '../src/index.js';
import { createCanvas } from '@napi-rs/canvas';

// =============================================================================
// Fixture helpers
// =============================================================================

/**
 * Build a minimal single-page PDF whose content stream is `contentStream`.
 * All objects, xref table and trailer offsets are computed programmatically
 * so the output parses cleanly with pdfjs-dist.
 *
 * Objects: 1 Catalog, 2 Pages, 3 Page (612x792, /F1 Helvetica), 4 Font,
 * 5 Contents stream.
 *
 * @param {string} contentStream - ASCII content-stream operators.
 * @returns {Buffer} The PDF bytes.
 */
function makeMinimalPdf(contentStream) {
  let pdf = '%PDF-1.4\n';
  /** @type {number[]} */
  const offsets = [];

  /**
   * @param {string} body - PDF object body text.
   */
  const addObject = (body) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'));
    pdf += `${offsets.length} 0 obj\n${body}\nendobj\n`;
  };

  addObject('<< /Type /Catalog /Pages 2 0 R >>');
  addObject('<< /Type /Pages /Kids [3 0 R] /Count 1 >>');
  addObject(
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] ' +
      '/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
  );
  addObject('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');

  const streamBytes = Buffer.from(contentStream, 'latin1');
  addObject(`<< /Length ${streamBytes.length} >>\nstream\n${contentStream}\nendstream`);

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

/**
 * Build a minimal valid 1-page PDF with NO text content (blank content
 * stream) — the input that must auto-trigger OCR in validatePDF().
 * @returns {Buffer} The PDF bytes.
 */
function makeEmptyPdf() {
  return makeMinimalPdf('');
}

/**
 * Build a minimal 1-page PDF whose page shows `text` via a `Tj` operator
 * (standard Helvetica). pdfjs-dist extracts this text, so validatePDF()
 * must NOT auto-trigger OCR on it.
 * @param {string} text - ASCII text to embed (parens/backslashes are escaped).
 * @returns {Buffer} The PDF bytes.
 */
function makeTextPdf(text) {
  const escaped = text
    .replace(/\\/g, '\\\\')
    .replace(/\(/g, '\\(')
    .replace(/\)/g, '\\)');
  return makeMinimalPdf(`BT /F1 12 Tf 72 712 Td (${escaped}) Tj ET`);
}

/**
 * Sertifikat-style text with enough words to satisfy the built-in
 * `sertifikat` schema heuristics (>= 20 words) if it were extracted.
 * @type {string}
 */
const SERTIFIKAT_TEXT =
  'SERTIFIKAT Diberikan kepada Nama Ahmad Fauzi Rahman ' +
  'Telah mengikuti pelatihan Full Stack Web Development ' +
  'Diselenggarakan oleh Lembaga Training Indonesia ' +
  'Tanggal 10 Januari 2024 ' +
  'Dinyatakan kompeten dalam bidang Web Development Direktur TTD';

/**
 * Render a synthetic "sertifikat" document as a PNG buffer: large, clear
 * black-on-white text that tesseract.js reads reliably, generated at
 * runtime — never a real (PII-bearing) document.
 * @returns {Buffer} PNG bytes.
 */
function renderSertifikatPng() {
  const width = 1400;
  const height = 900;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#000000';
  ctx.font = '48px sans-serif';

  const lines = [
    'SERTIFIKAT',
    'Diberikan kepada',
    'Nama : Ahmad Fauzi Rahman',
    'Telah mengikuti pelatihan Full Stack Web Development',
    'Diselenggarakan oleh Lembaga Training Indonesia',
    'Tanggal : 10 Januari 2024',
    'Dinyatakan kompeten dalam bidang Web Development',
  ];

  let y = 100;
  for (const line of lines) {
    ctx.fillText(line, 60, y);
    y += 100;
  }

  return canvas.toBuffer('image/png');
}

// =============================================================================
// OCR engine loader (lazy)
// =============================================================================

/**
 * Result shape of a successful `runOcr()` call (src/ocr/index.js contract).
 * @typedef {object} OcrRunResult
 * @property {string}   text       - Extracted OCR text.
 * @property {number}   pages      - Number of pages processed.
 * @property {number}   confidence - Average OCR confidence (0-1).
 * @property {number}   durationMs - Wall-clock OCR processing time in ms.
 * @property {string}   engine     - Engine identifier (e.g. "tesseract.js@7.x").
 * @property {string[]} languages  - Language codes used (e.g. ["ind","eng"]).
 */

/**
 * Module specifier for the OCR engine. Kept in a variable so the dynamic
 * import below stays out of static module resolution: TypeScript/checkJs
 * must not flag the not-yet-existing module, and the integration tests in
 * this file must still load while src/ocr/ is being implemented in parallel.
 * @type {string}
 */
const OCR_MODULE_SPECIFIER = '../src/ocr/index.js';

/**
 * Load the OCR engine module namespace. Fails loudly (ERR_MODULE_NOT_FOUND)
 * until src/ocr/index.js exists — no silent skips.
 * @returns {Promise<{ runOcr: (buffer: Buffer, options?: object) => Promise<OcrRunResult> }>}
 */
async function loadOcrModule() {
  return /** @type {any} */ (await import(OCR_MODULE_SPECIFIER));
}

// =============================================================================
// runOcr — synthetic PNG smoke tests (real OCR, ~2-5s each)
// NOTE: runOcr() accepts a PDF buffer; these smoke tests exercise the
// engine-level recognizeImages() API directly against synthetic PNGs.
describe('OCR engine — synthetic PNG smoke tests', () => {
  test('reads sertifikat-style text from a synthetic PNG with default languages', async () => {
    const { recognizeImages } = await import('../src/ocr/engine.js');
    const png = renderSertifikatPng();

    const result = await recognizeImages([png]);

    expect(result.text.trim().length).toBeGreaterThan(0);
    // ~0.5 is typical locally; 0.3 is the deterministic CI floor.
    expect(result.confidence).toBeGreaterThan(0.3);
    expect(result.languages).toEqual(['ind', 'eng']);
  }, 60_000);

  test('works with languages: ["ind"] (ind model handles latin text)', async () => {
    const { recognizeImages } = await import('../src/ocr/engine.js');
    const png = renderSertifikatPng();

    const result = await recognizeImages([png], { languages: ['ind'] });

    expect(result.text.trim().length).toBeGreaterThan(0);
    expect(result.languages).toEqual(['ind']);
    expect(result.confidence).toBeGreaterThan(0.3);
  }, 60_000);
});

// =============================================================================
// validatePDF — OCR integration contract
// =============================================================================
describe('validatePDF — OCR integration', () => {
  test('auto-triggers OCR on a text-less PDF and falls back to the original (empty) text', async () => {
    const result = await validatePDF(makeEmptyPdf(), { schema: 'sertifikat' });

    // Fixture sanity: the hand-written PDF must parse.
    expect(result.pageCount).toBe(1);

    // Auto-trigger condition: < 10 non-whitespace chars AND pageCount
    // (1) <= ocrPageLimit (default 10) -> OCR ran automatically.
    if (!result.layer1.ocr) {
      throw new Error('expected layer1.ocr to be set (auto-trigger on empty PDF)');
    }
    expect(result.layer1.ocr.used).toBe(true);
    expect(result.layer1.ocr.error).toBeNull();
    expect(result.layer1.ocr).toHaveProperty('engine', expect.stringContaining('tesseract'));
    expect(result.layer1.ocr).toHaveProperty('languages', expect.any(Array));
    expect(result.layer1.ocr).toHaveProperty('confidence');
    expect(result.layer1.ocr).toHaveProperty('durationMs', expect.any(Number));
    expect(result.layer1.ocr).toHaveProperty('pages', expect.any(Number));
    expect(result.layer1.ocr).toHaveProperty('charCount', expect.any(Number));

    // The blank page yields no OCR text, so Layer 1 still validates the
    // ORIGINAL (empty) text and fails at Gate 1 with the standard message.
    expect(result.layer1.passed).toBe(false);
    expect(result.layer1.failReason).toContain('tidak memiliki teks');
    expect(result.status).toBe('FAILED');
  }, 60_000);

  test('does NOT trigger OCR when the PDF has extractable text', async () => {
    const result = await validatePDF(makeTextPdf(SERTIFIKAT_TEXT), { schema: 'sertifikat' });

    expect(result.pageCount).toBe(1);

    // Prove the fixture really carries extractable text (auto-trigger
    // condition must be false because of the text, not because of the PDF).
    expect(result.layer1.heuristics.wordCount).toBeGreaterThan(0);

    // Text present -> OCR never ran.
    expect(result.layer1.ocr).toBeNull();
  });

  test('force mode (ocr: true) runs OCR regardless of the page limit', async () => {
    // Within the limit anyway — force must still run OCR.
    const withinLimit = await validatePDF(makeEmptyPdf(), {
      schema: 'sertifikat',
      ocr: true,
      ocrPageLimit: 1,
    });
    expect(withinLimit.layer1.ocr).toHaveProperty('used', true);

    // pageLimit 0 could never auto-trigger (1 page > 0) — force ignores it.
    const forcedBeyondLimit = await validatePDF(makeEmptyPdf(), {
      schema: 'sertifikat',
      ocr: true,
      ocrPageLimit: 0,
    });
    expect(forcedBeyondLimit.layer1.ocr).toHaveProperty('used', true);
  }, 60_000);

  test('ocrLanguages: [] does not crash — defaults are restored (or OCR fails cleanly)', async () => {
    const result = await validatePDF(makeEmptyPdf(), {
      schema: 'sertifikat',
      ocrLanguages: [],
      skipLayer2: true,
    });

    expect(result.pageCount).toBe(1);

    if (!result.layer1.ocr) {
      throw new Error('expected layer1.ocr to be set (auto-trigger on empty PDF)');
    }
    expect(result.layer1.ocr.used).toBe(true);

    if (result.layer1.ocr.languages.length === 0) {
      // Literal interpretation of []: the engine must have failed cleanly
      // and validation must still complete with the original text.
      expect(result.layer1.ocr.error).toBeTruthy();
      expect(result.layer1.passed).toBe(false);
      expect(result.layer1.failReason).toContain('tidak memiliki teks');
    } else {
      // Empty list fell back to the defaults.
      expect(result.layer1.ocr.languages).toEqual(['ind', 'eng']);
    }
  }, 60_000);
});
