/**
 * @module test/ocr-failure.test
 * @description OCR failure-containment tests — validatePDF() must survive a
 *              broken OCR engine: the failure is recorded in layer1.ocr.error
 *              and validation continues with the ORIGINAL extracted text
 *              (which fails Layer 1 Gate 1 with the standard "tidak memiliki
 *              teks" message). No real OCR runs here — the engine is mocked.
 *
 *              The engine module is mocked with `jest.unstable_mockModule`
 *              (the canonical ESM mocking API under
 *              `--experimental-vm-modules`). It is registered BEFORE
 *              src/index.js is dynamically imported below, so validatePDF()
 *              resolves the mock for its transitive import of
 *              src/ocr/index.js as well (mocks apply via the ESM graph
 *              walker — see jest-runtime's module registry).
 */

// In ESM test files the `jest` object is not injected into module scope —
// it must be imported explicitly from @jest/globals to use jest.fn() and
// jest.unstable_mockModule() at module top level.
import { jest } from '@jest/globals';

// Must run before the dynamic import of src/index.js below.
// Implementation form (not mockRejectedValue) so @types/jest infers the
// mock's signature cleanly under checkJs strict.
/** @type {jest.Mock<(...args: any[]) => Promise<never>>} */
const mockRunOcr = jest.fn((_buffer, _options) => Promise.reject(new Error('engine broken')));
jest.unstable_mockModule('../src/ocr/index.js', () => ({
  runOcr: mockRunOcr,
}));

// Dynamic import (not a static one): the mock above must be registered
// BEFORE src/index.js is evaluated, otherwise its transitive import of
// src/ocr/index.js would load the real module. A variable specifier keeps
// this out of static module resolution (checkJs: the import target is
// resolved at runtime).
const INDEX_MODULE_SPECIFIER = '../src/index.js';
const { validatePDF } = await import(INDEX_MODULE_SPECIFIER);

/**
 * Build a minimal valid 1-page PDF with NO text content (blank content
 * stream) — the input that must auto-trigger OCR in validatePDF().
 * @returns {Buffer} The PDF bytes.
 */
function makeEmptyPdf() {
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
  addObject('<< /Length 0 >>\nstream\n\nendstream');

  const xrefOffset = Buffer.byteLength(pdf, 'latin1');
  pdf += 'xref\n0 6\n0000000000 65535 f \n';
  for (const off of offsets) {
    pdf += `${String(off).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'latin1');
}

// =============================================================================
// validatePDF — OCR engine failure containment
// =============================================================================
describe('validatePDF — OCR engine failure containment', () => {
  test('a rejecting runOcr is contained: error recorded, original text used, status FAILED', async () => {
    const result = await validatePDF(makeEmptyPdf(), {
      schema: 'sertifikat',
      skipLayer2: true,
    });

    expect(result.pageCount).toBe(1);

    // OCR was attempted (auto-trigger: empty text, 1 page <= limit).
    expect(mockRunOcr).toHaveBeenCalledTimes(1);
    const ocrArg = mockRunOcr.mock.calls[0]?.[0];
    expect(Buffer.isBuffer(ocrArg) || ocrArg instanceof Uint8Array).toBe(true);

    // The engine failure is recorded — validation must NOT throw.
    if (!result.layer1.ocr) {
      throw new Error('expected layer1.ocr to be set (OCR was attempted)');
    }
    expect(result.layer1.ocr.used).toBe(true);
    expect(result.layer1.ocr.error).toContain('engine broken');
    expect(result.layer1.ocr.engine).toBeNull();
    expect(result.layer1.ocr.confidence).toBeNull();

    // Validation continued with the ORIGINAL (empty) text -> Gate 1 failure
    // with the standard message, exactly as if OCR had never existed.
    expect(result.layer1.passed).toBe(false);
    expect(result.layer1.failReason).toContain('tidak memiliki teks');
    expect(result.status).toBe('FAILED');
  });
});
