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
