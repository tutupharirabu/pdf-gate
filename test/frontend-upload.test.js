/**
 * @module test/frontend-upload.test
 * @description Simulates browser-based PDF upload via the File API and
 *              validates that validatePDF() returns frontend-friendly
 *              responses suitable for React/Vue/Svelte UI rendering.
 *
 *              Uses real PDF fixtures from the test/ directory.
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePDF } from '../src/index.js';

const __d = path.dirname(fileURLToPath(import.meta.url));

// ── Fixtures ──────────────────────────────────────────────────────────

const FIXTURES = {
  ijazah: path.join(__d, 'Ijazah.pdf'),
  sertifikat: path.join(__d, 'File Sertifikasi.pdf'),
  certificate: path.join(__d, 'Certificate_of_Completion - Softskills and Greenskills Training.pdf'),
};

// ── Helpers ───────────────────────────────────────────────────────────

/**
 * Simulate browser new File([buffer], name, { type }).
 * Returns an object that behaves like the Web File API.
 */
function makeFile(buffer, name, mimeType = 'application/pdf') {
  return {
    name,
    type: mimeType,
    size: buffer.length,
    lastModified: Date.now(),
    async arrayBuffer() {
      // Return a copy so the caller can't mutate our buffer
      return buffer.buffer.slice(
        buffer.byteOffset,
        buffer.byteOffset + buffer.byteLength,
      );
    },
    // Expose raw buffer for test assertions
    _buffer: buffer,
  };
}

/**
 * Format a ValidationResult into a frontend-friendly shape.
 * This mirrors what a React/Vue component would receive.
 */
function toUploadResult(result) {
  const statusIcon = {
    VERIFIED: '✓',
    PLAUSIBLE: '⚠',
    FAILED: '✗',
  };
  const statusColor = {
    VERIFIED: 'green',
    PLAUSIBLE: 'yellow',
    FAILED: 'red',
  };

  const message =
    result.status === 'VERIFIED'
      ? 'Dokumen valid — tanda tangan digital & konten terverifikasi.'
      : result.status === 'PLAUSIBLE'
        ? 'Dokumen tidak memiliki tanda tangan digital, namun konten sesuai skema.'
        : `Gagal validasi: ${result.failReason || 'alasan tidak diketahui'}`;

  return {
    fileName: result.fileName || 'unknown',
    status: result.status,
    icon: statusIcon[result.status] || '?',
    color: statusColor[result.status] || 'gray',
    message,
    details: {
      detectedType: result.layer1?.detectedType || null,
      pageCount: result.pageCount,
      durationMs: result.totalDurationMs,
      fieldResults: (result.layer1?.rules || []).map((r) => ({
        label: r.label,
        passed: r.passed,
      })),
      hasSignature: result.layer2?.hasSignature || false,
    },
  };
}

// ── Test: File → Buffer → validatePDF → UI result ────────────────────

describe('Frontend Upload — PDF Validation Pipeline', () => {
  test('happy path: Ijazah.pdf via File API → validatePDF → UI result', async () => {
    if (!existsSync(FIXTURES.ijazah)) return;

    // 1. Simulate browser file input
    const rawBuffer = readFileSync(FIXTURES.ijazah);
    const file = makeFile(rawBuffer, 'Ijazah.pdf');

    // 2. Frontend reads file as ArrayBuffer
    const arrayBuffer = await file.arrayBuffer();

    // 3. Convert to Node Buffer for validatePDF
    const buffer = Buffer.from(arrayBuffer);

    // 4. Validate
    const result = await validatePDF(buffer, {
      schema: 'ijazah',
      fileName: file.name,
      skipLayer2: true,
    });

    // 5. Format for UI
    const ui = toUploadResult(result);

    // Assertions — shape
    expect(ui).toHaveProperty('fileName', 'Ijazah.pdf');
    expect(ui).toHaveProperty('icon');
    expect(ui).toHaveProperty('color');
    expect(ui).toHaveProperty('message');
    expect(ui).toHaveProperty('details');
    expect(ui.details).toHaveProperty('pageCount');
    expect(ui.details.pageCount).toBeGreaterThan(0);
    expect(typeof ui.details.durationMs).toBe('number');
  });

  test('happy path: File Sertifikasi.pdf → validatePDF → UI result', async () => {
    if (!existsSync(FIXTURES.sertifikat)) return;
    const rawBuffer = readFileSync(FIXTURES.sertifikat);
    const file = makeFile(rawBuffer, 'File Sertifikasi.pdf');
    const arrayBuffer = await file.arrayBuffer();
    const result = await validatePDF(Buffer.from(arrayBuffer), {
      schema: 'sertifikat',
      fileName: file.name,
      skipLayer2: true,
    });
    const ui = toUploadResult(result);

    expect(ui.fileName).toBe('File Sertifikasi.pdf');
    expect(['PLAUSIBLE', 'FAILED']).toContain(ui.status);
    expect(ui.details.pageCount).toBeGreaterThan(0);
  });

  test('happy path: Certificate of Completion → validatePDF → UI result', async () => {
    if (!existsSync(FIXTURES.certificate)) return;
    const rawBuffer = readFileSync(FIXTURES.certificate);
    const file = makeFile(rawBuffer, 'Certificate_of_Completion.pdf');
    const arrayBuffer = await file.arrayBuffer();
    const result = await validatePDF(Buffer.from(arrayBuffer), {
      schema: 'sertifikat',
      fileName: file.name,
      skipLayer2: true,
    });
    const ui = toUploadResult(result);

    expect(ui.fileName).toBe('Certificate_of_Completion.pdf');
    expect(ui.details.pageCount).toBeGreaterThan(0);
    expect(ui.icon).toBeTruthy();
    expect(ui.color).toBeTruthy();
    expect(ui.message.length).toBeGreaterThan(0);
  });

  test('invalid file type: .txt content still returns FAILED', async () => {
    const textContent = 'Ini adalah file teks biasa, bukan PDF.';
    const rawBuffer = Buffer.from(textContent, 'utf-8');
    const file = makeFile(rawBuffer, 'dokumen.txt', 'text/plain');

    // Frontend should detect wrong mime type BEFORE calling validatePDF
    expect(file.type).toBe('text/plain');
    expect(file.type).not.toBe('application/pdf');

    // Even if it slips through, validatePDF handles it gracefully — returns FAILED
    const arrayBuffer = await file.arrayBuffer();
    const result = await validatePDF(Buffer.from(arrayBuffer), { schema: 'ijazah', fileName: file.name });
    expect(result.status).toBe('FAILED');
    expect(result.failReason).toMatch(/corrupt|Gagal/i);
    const ui = toUploadResult(result);
    expect(ui.color).toBe('red');
  });

  test('empty file upload should throw — buffer invariant', async () => {
    const file = makeFile(Buffer.alloc(0), 'empty.pdf');
    const arrayBuffer = await file.arrayBuffer();
    // Zero-length buffers violate sanitizeBuffer invariant — must throw
    await expect(
      validatePDF(Buffer.from(arrayBuffer), { schema: 'ijazah', fileName: file.name }),
    ).rejects.toThrow();
  });

  test('corrupt buffer should not crash — graceful FAILED response', async () => {
    const corrupt = Buffer.alloc(500, 'x');
    const file = makeFile(corrupt, 'corrupt.pdf');
    const arrayBuffer = await file.arrayBuffer();
    // validatePDF gracefully returns FAILED for corrupt PDFs — never throws
    const result = await validatePDF(Buffer.from(arrayBuffer), { schema: 'ijazah', fileName: file.name });
    expect(result.status).toBe('FAILED');
    expect(result.failReason).toMatch(/corrupt|Gagal/i);
    const ui = toUploadResult(result);
    expect(ui.color).toBe('red');
    expect(ui.icon).toBe('✗');
  });

  test('UI result contains field-level details for progress UI', async () => {
    if (!existsSync(FIXTURES.ijazah)) return;
    const rawBuffer = readFileSync(FIXTURES.ijazah);
    const file = makeFile(rawBuffer, 'Ijazah.pdf');
    const arrayBuffer = await file.arrayBuffer();
    const result = await validatePDF(Buffer.from(arrayBuffer), {
      schema: 'ijazah',
      fileName: file.name,
      skipLayer2: true,
    });
    const ui = toUploadResult(result);

    // fieldResults should exist for progress/step UI
    expect(Array.isArray(ui.details.fieldResults)).toBe(true);
    expect(ui.details.fieldResults.length).toBeGreaterThan(0);

    // Each field result should have label + passed
    for (const fr of ui.details.fieldResults) {
      expect(fr).toHaveProperty('label');
      expect(typeof fr.label).toBe('string');
      expect(fr).toHaveProperty('passed');
      expect(typeof fr.passed).toBe('boolean');
    }
  });

  test('durationMs can be used for progress bar emulation', async () => {
    if (!existsSync(FIXTURES.ijazah)) return;
    const rawBuffer = readFileSync(FIXTURES.ijazah);
    const file = makeFile(rawBuffer, 'Ijazah.pdf');
    const arrayBuffer = await file.arrayBuffer();
    const result = await validatePDF(Buffer.from(arrayBuffer), {
      schema: 'ijazah',
      fileName: file.name,
      skipLayer2: true,
    });

    // durationMs exists and is a positive number
    expect(typeof result.totalDurationMs).toBe('number');
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);

    // Simulate progress stages
    const stages = [
      { name: 'Parsing PDF', done: true, ms: result.totalDurationMs * 0.3 },
      { name: 'Validasi Layer 1', done: true, ms: result.layer1?.durationMs || 0 },
      { name: 'Verifikasi Tanda Tangan', done: false, ms: 0 },
    ];
    const totalEstimate = stages.reduce((s, st) => s + st.ms, 0);
    expect(totalEstimate).toBeGreaterThan(0);
  });
});
