/**
 * @module test/integration.test
 * @description Integration tests for validatePDF() — schema validation,
 *              input validation, error handling. Uses real Layer 1 logic.
 */

import { validatePDF, generateSchema, registerSchema } from '../src/index.js';

const IJAZAH_TEXT = `
KEMENTERIAN PENDIDIKAN
IJAZAH
No: 1234/UN/DIP/2024

Dinyatakan bahwa:
Nama : Ahmad Fauzi Rahman
NIM  : 20190001
Program Studi : Teknik Informatika
Telah menyelesaikan program sarjana dan dinyatakan lulus pada tanggal 15 Juli 2024
Gelar : Sarjana Komputer

Rektor Universitas Teknologi Indonesia
Dekan Fakultas Ilmu Komputer
`;

function makeBuffer(size = 10000) {
  return Buffer.alloc(size, 'x');
}

describe('validatePDF — Input Validation', () => {
  test('throws for non-Buffer input', async () => {
    await expect(validatePDF('bukan buffer', { schema: 'ijazah' }))
      .rejects.toThrow();
  });

  test('throws for empty Buffer', async () => {
    await expect(validatePDF(Buffer.alloc(0), { schema: 'ijazah' }))
      .rejects.toThrow();
  });

  test('throws for missing schema option', async () => {
    await expect(validatePDF(makeBuffer(), {}))
      .rejects.toThrow();
  });

  test('throws for null options', async () => {
    await expect(validatePDF(makeBuffer(), null))
      .rejects.toThrow();
  });
});

describe('validatePDF — Schema Resolution', () => {
  test('custom schema object passed directly is accepted', async () => {
    // This will try to parse the buffer as PDF which will fail,
    // but it should get past schema resolution
    await expect(
      validatePDF(makeBuffer(), {
        schema: {
          name: 'inline-custom', label: 'Inline',
          fingerprints: [/kementerian/i, /pendidikan/i],
          fingerprintMin: 1,
          heuristics: { minWords: 10, maxWords: 500 },
          rules: [{ id: 'nama', label: 'Nama', pattern: /nama\s*:\s*.+/i, required: true }],
        },
      })
    ).resolves.toHaveProperty('status');
  });

  test('resolves built-in schema by name', async () => {
    await expect(
      validatePDF(makeBuffer(), { schema: 'ijazah' })
    ).resolves.toHaveProperty('status');
  });

  test('unknown schema name throws', async () => {
    await expect(
      validatePDF(makeBuffer(), { schema: 'skema-tidak-ada' })
    ).rejects.toThrow();
  });
});


// =============================================================================
//  validatePDF — Real PDF Fixture Tests (regression)
// =============================================================================

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __d = path.dirname(fileURLToPath(import.meta.url));

const FIXTURES = {
  ijazah: path.join(__d, 'Ijazah.pdf'),
  sertifikat: path.join(__d, 'File Sertifikasi.pdf'),
  certificate: path.join(__d, 'Certificate_of_Completion - Softskills and Greenskills Training.pdf'),
};

const hasFixtures = existsSync(FIXTURES.ijazah) || existsSync(FIXTURES.sertifikat) || existsSync(FIXTURES.certificate);

describe('validatePDF — Real PDF Fixtures', () => {
  test('Ijazah.pdf parses and validates with schema ijazah', async () => {
    if (!existsSync(FIXTURES.ijazah)) return; // fixture not available — skip
    const buffer = readFileSync(FIXTURES.ijazah);
    const result = await validatePDF(buffer, {
      schema: 'ijazah',
      fileName: 'Ijazah.pdf',
      skipLayer2: true,
    });
    // Basic shape checks — parsing must succeed even if validation fails
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('schema', 'ijazah');
    expect(result).toHaveProperty('pageCount');
    expect(result.pageCount).toBeGreaterThan(0); // PDF must be parsed
    expect(result).toHaveProperty('layer1');
    expect(result).toHaveProperty('layer2');
    expect(typeof result.totalDurationMs).toBe('number');
  });

  test('File Sertifikasi.pdf parses and validates with schema sertifikat', async () => {
    if (!existsSync(FIXTURES.sertifikat)) return;
    const buffer = readFileSync(FIXTURES.sertifikat);
    const result = await validatePDF(buffer, {
      schema: 'sertifikat',
      fileName: 'File Sertifikasi.pdf',
      skipLayer2: true,
    });
    expect(result.pageCount).toBeGreaterThan(0);
    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('layer1');
  });

  test('Certificate of Completion parses without throwing', async () => {
    if (!existsSync(FIXTURES.certificate)) return;
    const buffer = readFileSync(FIXTURES.certificate);
    const result = await validatePDF(buffer, {
      schema: 'sertifikat',
      fileName: 'Certificate_of_Completion.pdf',
      skipLayer2: true,
    });
    expect(result.pageCount).toBeGreaterThan(0);
    expect(result).toHaveProperty('status');
  });
});

