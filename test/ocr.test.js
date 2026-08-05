/**
 * @module test/ocr.test
 * @description OCR feature tests for pdf-gate:
 *              - OCR engine smoke tests on a synthetic (canvas-rendered) PNG
 *                with sertifikat-style text — no real documents involved.
 *              - `validatePDF()` OCR integration contract: auto-trigger on
 *                text-less PDFs, no-trigger on text PDFs, force mode, and
 *                option sanitization.
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
// OCR engine — synthetic PNG smoke tests (real OCR, ~2-5s each)
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
});

/**
 * Build a minimal valid PDF with `pageCount` blank pages (no text content).
 * Used to test the automatic-OCR page-limit guard (default 10).
 * @param {number} pageCount - Number of blank pages (>= 1).
 * @returns {Buffer} The PDF bytes.
 */
function makeMultiPageEmptyPdf(pageCount) {
  const kids = [];
  const pages = [];
  for (let i = 0; i < pageCount; i++) {
    const objNum = 3 + i * 2; // page object
    kids.push(`${objNum} 0 R`);
    pages.push({ objNum, contentNum: objNum + 1 });
  }

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
  addObject(`<< /Type /Pages /Kids [${kids.join(' ')}] /Count ${pageCount} >>`);

  for (const { objNum, contentNum } of pages) {
    addObject(
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentNum} 0 R >>`,
    );
    addObject('<< /Length 0 >>\nstream\n\nendstream');
  }

  const total = offsets.length + 1;
  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += 'xref\n0 ' + total + '\n0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

// =============================================================================
// Page-limit guard + force mode + concurrency (review fixes)
// =============================================================================

describe('OCR page-limit guard & force mode', () => {
  test('auto-OCR does NOT run on an 11-page PDF (default limit 10) — layer1.ocr is null', async () => {
    const result = await validatePDF(makeMultiPageEmptyPdf(11), {
      schema: 'sertifikat',
      skipLayer2: true,
    });

    expect(result.pageCount).toBe(11);
    // Over the limit: OCR must not be attempted automatically.
    expect(result.layer1.ocr).toBeNull();
    // Original failure path preserved.
    expect(result.status).toBe('FAILED');
    expect(result.layer1.failReason).toContain('tidak memiliki teks');
  }, 30_000);

  test('force mode (ocr: true) IGNORES the page limit — runs on an 11-page PDF', async () => {
    const result = await validatePDF(makeMultiPageEmptyPdf(11), {
      schema: 'sertifikat',
      ocr: true,
      ocrPageLimit: 5,
      skipLayer2: true,
    });

    expect(result.pageCount).toBe(11);
    expect(result.layer1.ocr).not.toBeNull();
    expect(result.layer1.ocr?.used).toBe(true);
    // Force processes ALL pages (blank pages yield no text).
    expect(result.layer1.ocr?.pages).toBe(11);
  }, 90_000);
});

describe('OCR rasterizer — concurrent calls', () => {
  test('two concurrent rasterizePdf calls leave globalThis.fetch restored (no leak)', async () => {
    const originalFetch = globalThis.fetch;
    const { rasterizePdf } = await import('../src/ocr/rasterizer.js');

    const [a, b] = await Promise.all([
      rasterizePdf(makeEmptyPdf()),
      rasterizePdf(makeTextPdf('SERTIFIKAT')),
    ]);

    expect(a.length).toBe(1);
    expect(b.length).toBe(1);
    // Regression: the refcounted patch must fully restore the original fetch.
    expect(globalThis.fetch).toBe(originalFetch);
  }, 60_000);
});
