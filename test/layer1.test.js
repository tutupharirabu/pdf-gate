/**
 * @module test/layer1.test
 * @description Unit tests for Layer 1 sanity check modules.
 */

import { detectDocumentType } from '../src/layer1/detector.js';
import { runHeuristics } from '../src/layer1/heuristic.js';
import { validateFields } from '../src/layer1/validator.js';
import { runLayer1 } from '../src/layer1/index.js';
import { SCHEMAS } from '../src/schemas/index.js';

const ijazahSchema = SCHEMAS.get('ijazah');
const transkripSchema = SCHEMAS.get('transkrip');
const ktpSchema = SCHEMAS.get('ktp');

const IJAZAH_TEXT = 'KEMENTERIAN PENDIDIKAN IJAZAH No: 1234/UN/DIP/2024 Dinyatakan bahwa: Nama : Ahmad Fauzi Rahman NIM  : 20190001 Program Studi : Teknik Informatika Telah menyelesaikan program sarjana dan dinyatakan lulus pada tanggal 15 Juli 2024 Gelar : Sarjana Komputer Rektor : Universitas Teknologi Indonesia Dekan : Fakultas Ilmu Komputer';

const SERTIFIKAT_TEXT = 'SERTIFIKAT Diberikan kepada Nama Ahmad Fauzi Rahman Telah mengikuti pelatihan Full Stack Web Development Diselenggarakan oleh Lembaga Training Indonesia Tanggal 10 Januari 2024 Dinyatakan kompeten dalam bidang Web Development Direktur TTD';

const TRANSCRIPT_TEXT = 'TRANSKRIP NILAI Universitas Teknologi Indonesia Nama Ahmad Fauzi Rahman NIM 20190001 Program Studi Teknik Informatika IPK 3.75 Total SKS 144 Mata Kuliah SKS Nilai Algoritma 3 A Basis Data 3 A minus Jaringan Komputer 3 B plus';

const KTP_TEXT = 'NIK 3275011501900001 Nama AHMAD FAUZI RAHMAN Tempat Tgl Lahir JAKARTA 15 01 1990 Alamat JL MERDEKA NO 10 RT RW 001 002 Kelurahan MENTENG Kecamatan MENTENG Agama ISLAM Status Perkawinan BELUM KAWIN Pekerjaan KARYAWAN SWASTA Kewarganegaraan INDONESIA';

function makeItems(text, topCount) {
  const words = text.trim().split(/\s+/);
  return words.map((w, i) => ({
    str: w, x: 50, page: 1, width: w.length * 8, height: 12,
    y: i < topCount ? 100 : 700,
  }));
}

// =============================================================================
// DETECTOR
// =============================================================================
describe('detector — detectDocumentType', () => {
  test('detects ijazah text correctly (2+ fingerprints match)', () => {
    const result = detectDocumentType(IJAZAH_TEXT, ijazahSchema, SCHEMAS);
    expect(result.passed).toBe(true);
    expect(result.detectedType).toBe('ijazah');
  });

  test('fails when 0 fingerprints match', () => {
    const result = detectDocumentType('teks acak tidak mengandung kata kunci', ijazahSchema, SCHEMAS);
    expect(result.passed).toBe(false);
  });

  test('fails when only 1 fingerprint matches but fingerprintMin is 2', () => {
    const result = detectDocumentType('Dokumen ini menyebutkan ijazah sekali', ijazahSchema, SCHEMAS);
    expect(result.passed).toBe(false);
  });

  test('cross-detects wrong schema type', () => {
    const result = detectDocumentType(SERTIFIKAT_TEXT, ijazahSchema, SCHEMAS);
    expect(result.passed).toBe(false);
    expect(result.failReason).toContain('Dokumen terdeteksi');
  });

  test('detects transkrip text correctly', () => {
    const result = detectDocumentType(TRANSCRIPT_TEXT, transkripSchema, SCHEMAS);
    expect(result.passed).toBe(true);
  });

  test('detects ktp text correctly', () => {
    const result = detectDocumentType(KTP_TEXT, ktpSchema, SCHEMAS);
    expect(result.passed).toBe(true);
  });
});

// =============================================================================
// HEURISTIC
// =============================================================================
describe('heuristic — runHeuristics', () => {
  test('passes when word count is within range and spatial OK', () => {
    const items = makeItems(IJAZAH_TEXT, 10);
    const result = runHeuristics(IJAZAH_TEXT, items, ijazahSchema);
    expect(result.passed).toBe(true);
    expect(result.wordCount).toBeGreaterThanOrEqual(ijazahSchema.heuristics.minWords);
  });

  test('fails when word count is below minWords', () => {
    const result = runHeuristics('kata pendek', [], ijazahSchema);
    expect(result.passed).toBe(false);
    expect(result.failReason).toBeTruthy();
  });

  test('fails when word count is above maxWords', () => {
    const longText = Array(1000).fill('kata').join(' ');
    const result = runHeuristics(longText, [], ijazahSchema);
    expect(result.passed).toBe(false);
  });

  test('passes spatial check with top and bottom zone items', () => {
    const items = [
      { str: 'header', y: 10, page: 1, height: 12, width: 50 },
      { str: 'footer', y: 700, page: 1, height: 12, width: 50 },
      { str: 'middle', y: 400, page: 1, height: 12, width: 50 },
    ];
    const result = runHeuristics('header middle footer test word extra more text enough to meet min', items, { heuristics: { minWords: 5, maxWords: 100 } });
    expect(result.passed).toBe(true);
  });
});

// =============================================================================
// VALIDATOR
// =============================================================================
describe('validator — validateFields', () => {
  test('all required fields matched → passes', () => {
    const result = validateFields(IJAZAH_TEXT, ijazahSchema);
    expect(result.passed).toBe(true);
    expect(result.rules.length).toBe(ijazahSchema.rules.length);
  });

  test('required field not matched → fails with message', () => {
    const result = validateFields('teks tanpa field apapun', ijazahSchema);
    expect(result.passed).toBe(false);
    expect(result.failReason).toBeTruthy();
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
// LAYER 1 ORCHESTRATOR
// =============================================================================
describe('layer1 — runLayer1 orchestrator', () => {
  test('empty text → immediate FAIL with scan message', async () => {
    const result = await runLayer1('   ', [], 1, ijazahSchema, SCHEMAS);
    expect(result.passed).toBe(false);
    expect(result.failReason).toContain('tidak memiliki teks');
  });

  test('full flow passes when all gates pass', async () => {
    const items = makeItems(IJAZAH_TEXT, 15);
    const result = await runLayer1(IJAZAH_TEXT, items, 1, ijazahSchema, SCHEMAS);
    expect(result.passed).toBe(true);
    expect(result.rules.length).toBeGreaterThan(0);
    expect(result.heuristics.passed).toBe(true);
  });

  test('returns correct Layer1Result shape', async () => {
    const items = makeItems(IJAZAH_TEXT, 15);
    const result = await runLayer1(IJAZAH_TEXT, items, 1, ijazahSchema, SCHEMAS);
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
    const items = makeItems(IJAZAH_TEXT, 10);
    const result = await runLayer1(IJAZAH_TEXT, items, 1, ijazahSchema, SCHEMAS);
    expect(typeof result.durationMs).toBe('number');
  });
});
