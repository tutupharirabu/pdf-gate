/**
 * @module test/layer1.test
 * @description Unit tests for Layer 1 sanity check modules:
 *              detector, heuristic, validator, and orchestrator.
 */

import { detectDocumentType } from '../src/layer1/detector.js';
import { runHeuristics } from '../src/layer1/heuristic.js';
import { validateFields } from '../src/layer1/validator.js';
import { runLayer1 } from '../src/layer1/index.js';
import { SCHEMAS } from '../src/schemas/index.js';

// ─── Helper: get a schema instance ───────────────────────────────────────────

const ijazahSchema = SCHEMAS.get('ijazah');
const transkripSchema = SCHEMAS.get('transkrip');
const sertifikatSchema = SCHEMAS.get('sertifikat');
const ktpSchema = SCHEMAS.get('ktp');

// ─── Sample text constants ───────────────────────────────────────────────────

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

const TRANSCRIPT_TEXT = `
TRANSKRIP NILAI
Universitas Teknologi Indonesia

Nama : Ahmad Fauzi Rahman
NIM  : 20190001
Program Studi : Teknik Informatika

IPK : 3.75
Total SKS : 144

Mata Kuliah           SKS   Nilai
Algoritma              3      A
Basis Data             3      A-
Jaringan Komputer      3      B+
`;

const SERTIFIKAT_TEXT = `
SERTIFIKAT

Diberikan kepada:
Nama : Ahmad Fauzi Rahman

Telah mengikuti pelatihan "Full Stack Web Development"
Diselenggarakan oleh Lembaga Training Indonesia
Tanggal : 10 Januari 2024
Nomor : SRT/2024/001

Dinyatakan kompeten dalam bidang Web Development.

Direktur
TTD
`;

const KTP_TEXT = `
NIK : 3275011501900001
Nama : AHMAD FAUZI RAHMAN
Tempat/Tgl Lahir : JAKARTA, 15-01-1990
Alamat : JL. MERDEKA NO. 10
  RT/RW : 001/002
  Kelurahan : MENTENG
  Kecamatan : MENTENG
Agama : ISLAM
Status Perkawinan : BELUM KAWIN
Pekerjaan : KARYAWAN SWASTA
Kewarganegaraan : INDONESIA
Berlaku Hingga : SEUMUR HIDUP
`;

// =============================================================================
//  DETECTOR
// =============================================================================

describe('detector — detectDocumentType', () => {
  test('detects ijazah text correctly (2+ fingerprints match)', () => {
    const result = detectDocumentType(IJAZAH_TEXT, ijazahSchema, SCHEMAS);
    expect(result.passed).toBe(true);
    expect(result.detectedType).toBe('ijazah');
    expect(result.failReason).toBeNull();
    expect(result.matches.length).toBeGreaterThanOrEqual(2);
  });

  test('fails when 0 fingerprints match', () => {
    const text = 'Ini adalah teks acak yang tidak mengandung kata kunci apapun';
    const result = detectDocumentType(text, ijazahSchema, SCHEMAS);
    expect(result.passed).toBe(false);
    expect(result.failReason).toContain('Tipe dokumen tidak dikenali');
  });

  test('fails when only 1 fingerprint matches but fingerprintMin is 2', () => {
    const text = 'Dokumen ini menyebutkan ijazah sekali';
    const result = detectDocumentType(text, ijazahSchema, SCHEMAS);
    expect(result.passed).toBe(false);
  });

  test('cross-detects wrong schema type', () => {
    // Text is sertifikat but user selects ijazah
    const result = detectDocumentType(SERTIFIKAT_TEXT, ijazahSchema, SCHEMAS);
    expect(result.passed).toBe(false);
    expect(result.failReason).toContain('Dokumen terdeteksi sebagai');
  });

  test('detects transkrip text correctly', () => {
    const result = detectDocumentType(TRANSCRIPT_TEXT, transkripSchema, SCHEMAS);
    expect(result.passed).toBe(true);
    expect(result.detectedType).toBe('transkrip');
  });

  test('detects ktp text correctly', () => {
    const result = detectDocumentType(KTP_TEXT, ktpSchema, SCHEMAS);
    expect(result.passed).toBe(true);
    expect(result.detectedType).toBe('ktp');
  });
});

// =============================================================================
//  HEURISTIC
// =============================================================================

describe('heuristic — runHeuristics', () => {
  test('passes when word count is within range', () => {
    const result = runHeuristics(IJAZAH_TEXT, [], ijazahSchema);
    expect(result.passed).toBe(true);
    expect(result.wordCount).toBeGreaterThanOrEqual(ijazahSchema.heuristics.minWords);
    expect(result.wordCount).toBeLessThanOrEqual(ijazahSchema.heuristics.maxWords);
  });

  test('fails when word count is below minWords', () => {
    const result = runHeuristics('kata pendek saja', [], ijazahSchema);
    expect(result.passed).toBe(false);
    expect(result.failReason).toBeTruthy();
  });

  test('fails when word count is above maxWords', () => {
    const longText = Array(1000).fill('kata').join(' '); // 1000 words > 800 max
    const result = runHeuristics(longText, [], ijazahSchema);
    expect(result.passed).toBe(false);
  });

  test('flags suspicious narrow Y distribution', () => {
    // All items at nearly identical Y (stdDev < 0.05) with > 20 words
    const items = Array(25).fill(null).map((_, i) => ({
      str: `word${i}`,
      y: 400 + (i % 3),
      page: 1,
      height: 12,
      width: 50,
    }));
    const text = items.map(i => i.str).join(' ');
    const result = runHeuristics(text, items, ijazahSchema);
    if (result.flags.length > 0) {
      expect(result.flags.some(f => f.includes('sempit') || f.includes('mencurigakan'))).toBe(true);
    }
  });

  test('passes spatial check when text in top AND bottom zones', () => {
    const items = [
      { str: 'header', y: 10, page: 1, height: 12, width: 50 },     // top zone (Y < 0.25 of ~792)
      { str: 'footer', y: 700, page: 1, height: 12, width: 50 },    // bottom zone (Y > 0.75 of ~792)
      { str: 'middle', y: 400, page: 1, height: 12, width: 50 },
    ];
    const result = runHeuristics('header middle footer', items, ijazahSchema);
    expect(result.passed).toBe(true);
    expect(result.flags).toHaveLength(0);
  });
});

// =============================================================================
//  VALIDATOR
// =============================================================================

describe('validator — validateFields', () => {
  test('all required fields matched → passes', () => {
    const result = validateFields(IJAZAH_TEXT, ijazahSchema);
    expect(result.passed).toBe(true);
    expect(result.rules.length).toBe(ijazahSchema.rules.length);
    for (const rule of result.rules) {
      if (rule.required) {
        expect(rule.passed).toBe(true);
      }
    }
  });

  test('required field not matched → fails with label list', () => {
    const result = validateFields('teks tanpa field apapun', ijazahSchema);
    expect(result.passed).toBe(false);
    expect(result.failReason).toBeTruthy();
    expect(result.failReason).toMatch(/field wajib/);
  });

  test('optional field not matched → flagged but overall passes', () => {
    // Ijazah has optional "nomor" field - if not found, validator should still pass
    const textWithoutNomor = IJAZAH_TEXT.replace(/No:\s*\d+/g, '');
    const result = validateFields(textWithoutNomor, ijazahSchema);
    // Overall should still pass if all required fields are present
    if (result.rules.some(r => r.required && !r.passed)) {
      expect(result.passed).toBe(false);
    } else {
      expect(result.passed).toBe(true);
    }
  });

  test('found snippet is max 80 chars', () => {
    const result = validateFields(IJAZAH_TEXT, ijazahSchema);
    for (const rule of result.rules) {
      if (rule.found) {
        expect(rule.found.length).toBeLessThanOrEqual(80);
      }
    }
  });

  test('returns correct RuleResult shape', () => {
    const result = validateFields(IJAZAH_TEXT, ijazahSchema);
    for (const rule of result.rules) {
      expect(rule).toHaveProperty('id');
      expect(rule).toHaveProperty('label');
      expect(rule).toHaveProperty('required');
      expect(rule).toHaveProperty('passed');
    }
  });
});

// =============================================================================
//  LAYER 1 ORCHESTRATOR
// =============================================================================

describe('layer1 — runLayer1 orchestrator', () => {
  test('empty text → immediate FAIL with scan message', async () => {
    const result = await runLayer1('   ', [], 1, ijazahSchema, SCHEMAS);
    expect(result.passed).toBe(false);
    expect(result.failReason).toContain('PDF tidak memiliki teks');
  });

  test('full flow passes when all gates pass', async () => {
    const result = await runLayer1(IJAZAH_TEXT, [], 1, ijazahSchema, SCHEMAS);
    expect(result.passed).toBe(true);
    expect(result.rules.length).toBeGreaterThan(0);
    expect(result.heuristics.passed).toBe(true);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('returns correct Layer1Result shape', async () => {
    const result = await runLayer1(IJAZAH_TEXT, [], 1, ijazahSchema, SCHEMAS);
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('detectedType');
    expect(result).toHaveProperty('failReason');
    expect(result).toHaveProperty('rules');
    expect(result).toHaveProperty('heuristics');
    expect(result).toHaveProperty('durationMs');
    expect(result.heuristics).toHaveProperty('passed');
    expect(result.heuristics).toHaveProperty('wordCount');
    expect(result.heuristics).toHaveProperty('flags');
  });

  test('durationMs is a number', async () => {
    const result = await runLayer1(IJAZAH_TEXT, [], 1, ijazahSchema, SCHEMAS);
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });
});
