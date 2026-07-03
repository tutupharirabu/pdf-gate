/**
 * @module test/integration.test
 * @description Integration tests for validatePDF() full flow.
 *              Mocks pdf-parser and verify-pdf to inject controlled data.
 */

import { jest } from '@jest/globals';

// ─── Mock pdf-parser BEFORE importing validatePDF ─────────────────────────────

const mockParsePdf = jest.fn();
const mockRunLayer2 = jest.fn();

jest.unstable_mockModule('../src/utils/pdf-parser.js', () => ({
  parsePdf: mockParsePdf,
}));

jest.unstable_mockModule('../src/layer2/index.js', () => ({
  runLayer2: mockRunLayer2,
}));

// Import after mocks are set up
const { validatePDF, generateSchema, registerSchema } = await import('../src/index.js');
const { runLayer1 } = await import('../src/layer1/index.js');
const { SCHEMAS } = await import('../src/schemas/index.js');

// ─── Helpers ───────────────────────────────────────────────────────────────────

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

function mockPdfResult(text = IJAZAH_TEXT, overrides = {}) {
  return {
    fullText: text,
    items: text.split(/\s+/).map((word, i) => ({
      str: word,
      x: 50 + (i % 5) * 100,
      y: 100 + Math.floor(i / 5) * 20,
      page: 1,
      width: word.length * 8,
      height: 12,
    })),
    pageCount: 1,
    ...overrides,
  };
}

function mockLayer2Passed() {
  return {
    passed: true,
    hasSignature: true,
    issuer: 'CN=BSrE Indonesia',
    issuedTo: 'CN=Universitas Teknologi',
    validFrom: '2023-01-01T00:00:00Z',
    validTo: '2028-01-01T00:00:00Z',
    certExpired: false,
    integrityOk: true,
    signedAt: '2024-06-15T00:00:00Z',
    failReason: null,
    durationMs: 50,
  };
}

function mockLayer2NoSignature() {
  return {
    passed: false,
    hasSignature: false,
    issuer: null,
    issuedTo: null,
    validFrom: null,
    validTo: null,
    certExpired: false,
    integrityOk: false,
    signedAt: null,
    failReason: null,
    durationMs: 5,
  };
}

function mockLayer2Failed() {
  return {
    passed: false,
    hasSignature: true,
    issuer: 'CN=BSrE',
    issuedTo: 'CN=UTI',
    validFrom: '2020-01-01T00:00:00Z',
    validTo: '2022-01-01T00:00:00Z',
    certExpired: true,
    integrityOk: false,
    signedAt: '2021-06-15T00:00:00Z',
    failReason: 'Integritas dokumen gagal — PDF kemungkinan dimodifikasi setelah ditandatangani.',
    durationMs: 50,
  };
}

function makeBuffer(size = 10000) {
  return Buffer.alloc(size, 'x');
}

// ─── Reset mocks before each test ─────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockParsePdf.mockResolvedValue(mockPdfResult());
  mockRunLayer2.mockResolvedValue(mockLayer2Passed());
});

// =============================================================================
//  validatePDF — Full Flows
// =============================================================================

describe('validatePDF — Full Flows', () => {
  test('VERIFIED flow: Layer1 pass + Layer2 pass', async () => {
    const result = await validatePDF(makeBuffer(), { schema: 'ijazah' });
    expect(result.status).toBe('VERIFIED');
    expect(result.layer1.passed).toBe(true);
    expect(result.layer2.passed).toBe(true);
  });

  test('PLAUSIBLE flow: Layer1 pass + no signature', async () => {
    mockRunLayer2.mockResolvedValue(mockLayer2NoSignature());
    const result = await validatePDF(makeBuffer(), { schema: 'ijazah' });
    expect(result.status).toBe('PLAUSIBLE');
    expect(result.layer1.passed).toBe(true);
    expect(result.layer2.hasSignature).toBe(false);
  });

  test('FAILED flow: Layer1 fail → status FAILED', async () => {
    mockParsePdf.mockResolvedValue(mockPdfResult('teks pendek'));
    const result = await validatePDF(makeBuffer(), { schema: 'ijazah' });
    expect(result.status).toBe('FAILED');
  });

  test('FAILED flow: Layer1 pass + Layer2 fail → status FAILED', async () => {
    mockRunLayer2.mockResolvedValue(mockLayer2Failed());
    const result = await validatePDF(makeBuffer(), { schema: 'ijazah' });
    expect(result.status).toBe('FAILED');
    expect(result.failReason).toBeTruthy();
  });

  test('skipLayer2: true → only runs Layer1', async () => {
    const result = await validatePDF(makeBuffer(), {
      schema: 'ijazah',
      skipLayer2: true,
    });
    expect(result.status === 'PLAUSIBLE' || result.status === 'VERIFIED').toBe(true);
    expect(result.layer2.passed).toBe(false);
    expect(result.layer2.durationMs).toBe(0);
  });

  test('wrong schema → FAILED with type mismatch', async () => {
    // Text has ijazah content but user selects ktp
    mockParsePdf.mockResolvedValue(mockPdfResult(IJAZAH_TEXT));
    const result = await validatePDF(makeBuffer(), { schema: 'ktp' });
    expect(result.status).toBe('FAILED');
  });

  test('empty text → FAILED with scan message', async () => {
    mockParsePdf.mockResolvedValue(mockPdfResult('pendek'));
    const result = await validatePDF(makeBuffer(), { schema: 'ijazah' });
    expect(result.status).toBe('FAILED');
    expect(result.failReason).toContain('tidak memiliki teks');
  });

  test('custom schema object passed directly → accepted', async () => {
    const result = await validatePDF(makeBuffer(), {
      schema: {
        name: 'inline-custom',
        label: 'Inline',
        fingerprints: [/kementerian/i, /pendidikan/i],
        fingerprintMin: 1,
        heuristics: { minWords: 10, maxWords: 500 },
        rules: [
          { id: 'nama', label: 'Nama', pattern: /nama\s*:\s*.+/i, required: true },
        ],
      },
    });
    expect(result.status === 'VERIFIED' || result.status === 'PLAUSIBLE').toBe(true);
    expect(result.schema).toBe('inline-custom');
  });
});

// =============================================================================
//  validatePDF — Input Validation
// =============================================================================

describe('validatePDF — Input Validation', () => {
  test('throws for non-Buffer input', async () => {
    await expect(validatePDF('bukan buffer', { schema: 'ijazah' }))
      .rejects.toThrow(TypeError);
  });

  test('throws for empty Buffer', async () => {
    await expect(validatePDF(Buffer.alloc(0), { schema: 'ijazah' }))
      .rejects.toThrow(TypeError);
  });

  test('throws for Uint8Array input accepted', async () => {
    const arr = new Uint8Array(100);
    // Should NOT throw — Uint8Array is valid
    const result = await validatePDF(arr, { schema: 'ijazah' });
    expect(result.status).toBeDefined();
  });

  test('throws for missing schema option', async () => {
    await expect(validatePDF(makeBuffer(), {}))
      .rejects.toThrow(/schema/);
  });

  test('throws for null options', async () => {
    await expect(validatePDF(makeBuffer(), null))
      .rejects.toThrow(TypeError);
  });
});

// =============================================================================
//  validatePDF — Output Shape
// =============================================================================

describe('validatePDF — Output Shape', () => {
  test('result has correct top-level shape', async () => {
    const result = await validatePDF(makeBuffer(12345), {
      schema: 'ijazah',
      fileName: 'test.pdf',
    });

    expect(result).toHaveProperty('status');
    expect(result).toHaveProperty('schema');
    expect(result).toHaveProperty('fileName');
    expect(result).toHaveProperty('fileSizeKb');
    expect(result).toHaveProperty('pageCount');
    expect(result).toHaveProperty('totalDurationMs');
    expect(result).toHaveProperty('timestamp');
    expect(result).toHaveProperty('layer1');
    expect(result).toHaveProperty('layer2');

    expect(result.fileName).toBe('test.pdf');
  });

  test('fileSizeKb calculation is correct', async () => {
    const result = await validatePDF(makeBuffer(10240), { schema: 'ijazah' });
    expect(result.fileSizeKb).toBe(10.0);
  });

  test('timestamp is valid ISO string', async () => {
    const result = await validatePDF(makeBuffer(), { schema: 'ijazah' });
    expect(() => new Date(result.timestamp)).not.toThrow();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  test('totalDurationMs is a positive number', async () => {
    const result = await validatePDF(makeBuffer(), { schema: 'ijazah' });
    expect(typeof result.totalDurationMs).toBe('number');
    expect(result.totalDurationMs).toBeGreaterThanOrEqual(0);
  });

  test('layer1 result shape is complete', async () => {
    const result = await validatePDF(makeBuffer(), { schema: 'ijazah' });
    expect(result.layer1).toHaveProperty('passed');
    expect(result.layer1).toHaveProperty('detectedType');
    expect(result.layer1).toHaveProperty('failReason');
    expect(result.layer1).toHaveProperty('rules');
    expect(result.layer1).toHaveProperty('heuristics');
    expect(result.layer1).toHaveProperty('durationMs');
    expect(result.layer1.heuristics).toHaveProperty('passed');
    expect(result.layer1.heuristics).toHaveProperty('wordCount');
    expect(result.layer1.heuristics).toHaveProperty('flags');
  });

  test('layer2 result shape is complete', async () => {
    const result = await validatePDF(makeBuffer(), { schema: 'ijazah' });
    expect(result.layer2).toHaveProperty('passed');
    expect(result.layer2).toHaveProperty('hasSignature');
    expect(result.layer2).toHaveProperty('issuer');
    expect(result.layer2).toHaveProperty('issuedTo');
    expect(result.layer2).toHaveProperty('validFrom');
    expect(result.layer2).toHaveProperty('validTo');
    expect(result.layer2).toHaveProperty('certExpired');
    expect(result.layer2).toHaveProperty('integrityOk');
    expect(result.layer2).toHaveProperty('signedAt');
    expect(result.layer2).toHaveProperty('failReason');
    expect(result.layer2).toHaveProperty('durationMs');
  });
});

// =============================================================================
//  PDF Parse Error Handling
// =============================================================================

describe('validatePDF — Error Handling', () => {
  test('PDF parse error → graceful FAILED result', async () => {
    mockParsePdf.mockRejectedValue(new Error('Invalid PDF structure'));
    const result = await validatePDF(makeBuffer(), { schema: 'ijazah' });
    expect(result.status).toBe('FAILED');
    expect(result.failReason).toContain('Gagal membaca PDF');
  });
});

// =============================================================================
//  generateSchema + validatePDF Integration
// =============================================================================

describe('generateSchema + validatePDF', () => {
  test('generate schema from text and validate with it', async () => {
    const templateText = `
SURAT KETERANGAN
Nomor : 001/SK/2024

Nama : Ahmad Fauzi
Alamat : Jl. Merdeka No. 10
Keperluan : Melamar Pekerjaan

Kepala Desa
`;

    mockParsePdf.mockResolvedValue(mockPdfResult(templateText));

    const { schema, confidence, warnings } = await generateSchema(makeBuffer(), {
      name: 'surat-ket',
      label: 'Surat Keterangan',
    });

    expect(schema.name).toBe('surat-ket');
    expect(schema.label).toBe('Surat Keterangan');
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
    expect(Array.isArray(schema.rules)).toBe(true);
    expect(Array.isArray(schema.fingerprints)).toBe(true);

    // Register and validate another PDF
    registerSchema(schema);
    mockParsePdf.mockResolvedValue(mockPdfResult(templateText));
    mockRunLayer2.mockResolvedValue(mockLayer2NoSignature());

    const result = await validatePDF(makeBuffer(), { schema: 'surat-ket' });
    expect(result.status).toBe('PLAUSIBLE');
  });
});
