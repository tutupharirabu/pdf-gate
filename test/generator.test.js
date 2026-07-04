/**
 * @module test/generator.test
 * @description Unit and integration tests for the Schema Generator module.
 */

import { groupTextByLines } from '../src/generator/line-grouper.js';
import { detectFieldValuePairs } from '../src/generator/field-detector.js';
import { buildRules } from '../src/generator/rule-builder.js';
import { extractFingerprints } from '../src/generator/fingerprint-extractor.js';
import { calculateConfidence } from '../src/generator/confidence-scorer.js';

// =============================================================================
//  line-grouper
// =============================================================================

describe('line-grouper — groupTextByLines', () => {
  test('groups items by Y within tolerance', () => {
    const items = [
      { str: 'A', x: 10, y: 100, page: 1, width: 10, height: 12 },
      { str: 'B', x: 50, y: 101, page: 1, width: 10, height: 12 },
      { str: 'C', x: 10, y: 200, page: 1, width: 10, height: 12 },
    ];
    const lines = groupTextByLines(items, 2);
    expect(lines.length).toBe(2); // A+B grouped (Y~100), C alone (Y=200)
    // Items sorted by Y descending, so C (Y=200) comes first in lines
    expect(lines[0].items.length + lines[1].items.length).toBe(3);
  });

  test('separates items by page', () => {
    const items = [
      { str: 'P1', x: 10, y: 100, page: 1, width: 50, height: 12 },
      { str: 'P2', x: 10, y: 100, page: 2, width: 50, height: 12 },
    ];
    const lines = groupTextByLines(items, 2);
    expect(lines.length).toBe(2);
    expect(lines[0].page).toBe(1);
    expect(lines[1].page).toBe(2);
  });

  test('sorts items within line by X coordinate', () => {
    const items = [
      { str: 'Right', x: 200, y: 100, page: 1, width: 50, height: 12 },
      { str: 'Left', x: 10, y: 100, page: 1, width: 50, height: 12 },
    ];
    const lines = groupTextByLines(items, 2);
    expect(lines[0].items[0].str).toBe('Left');
    expect(lines[0].items[1].str).toBe('Right');
  });
});

// =============================================================================
//  field-detector
// =============================================================================

describe('field-detector — detectFieldValuePairs', () => {
  test('detects colon-separated fields (pattern A)', () => {
    const items = [
      { str: 'Nama', x: 10, y: 100, page: 1, width: 40, height: 12 },
      { str: ':', x: 55, y: 100, page: 1, width: 5, height: 12 },
      { str: 'Ahmad', x: 65, y: 100, page: 1, width: 50, height: 12 },
      { str: 'Fauzi', x: 120, y: 100, page: 1, width: 50, height: 12 },
    ];
    const lines = groupTextByLines(items);
    const pairs = detectFieldValuePairs(lines, 'Nama : Ahmad Fauzi');
    expect(pairs.length).toBeGreaterThanOrEqual(1);
    const colonPair = pairs.find(p => p.pattern === 'colon');
    expect(colonPair).toBeDefined();
    if (colonPair) {
      expect(colonPair.label).toMatch(/nama/i);
      expect(colonPair.value).toMatch(/ahmad/i);
    }
  });

  test('detects tabular layout (pattern B)', () => {
    const items = [
      { str: 'NIK', x: 10, y: 100, page: 1, width: 30, height: 12 },
      { str: '3275011501900001', x: 100, y: 100, page: 1, width: 150, height: 12 },
    ];
    const lines = groupTextByLines(items);
    const pairs = detectFieldValuePairs(lines, 'NIK 3275011501900001');
    // Should detect tabular if gap > 50pt
    const tabularPair = pairs.find(p => p.pattern === 'tabular');
    expect(tabularPair).toBeDefined();
    if (tabularPair) {
      expect(tabularPair.label).toMatch(/NIK/i);
    }
    // At minimum, some pairs should be detected
    expect(pairs.length).toBeGreaterThan(0);
  });

  test('detects stacked label-value (pattern C)', () => {
    const items = [
      { str: 'NAMA', x: 10, y: 100, page: 1, width: 50, height: 12 },
      { str: 'LENGKAP', x: 10, y: 115, page: 1, width: 60, height: 12 },
      { str: 'Ahmad Fauzi', x: 10, y: 145, page: 1, width: 100, height: 12 },
    ];
    const lines = groupTextByLines(items);
    const pairs = detectFieldValuePairs(lines, 'NAMA LENGKAP\nAhmad Fauzi');
    expect(pairs.length).toBeGreaterThanOrEqual(1);
  });

  test('returns array of detected pairs', () => {
    const items = [
      { str: 'Nama', x: 10, y: 100, page: 1, width: 40, height: 12 },
      { str: ':', x: 55, y: 100, page: 1, width: 5, height: 12 },
      { str: 'Test', x: 65, y: 100, page: 1, width: 40, height: 12 },
    ];
    const lines = groupTextByLines(items);
    const pairs = detectFieldValuePairs(lines, 'Nama : Test');
    expect(Array.isArray(pairs)).toBe(true);
    for (const pair of pairs) {
      expect(pair).toHaveProperty('label');
      expect(pair).toHaveProperty('value');
      expect(pair).toHaveProperty('pattern');
      expect(pair).toHaveProperty('confidence');
      expect(pair.confidence).toBeGreaterThanOrEqual(0);
      expect(pair.confidence).toBeLessThanOrEqual(1);
    }
  });
});

// =============================================================================
//  rule-builder
// =============================================================================

describe('rule-builder — buildRules', () => {
  test('generates Rule objects from detected pairs', () => {
    const pairs = [
      { label: 'Nama', value: 'Ahmad Fauzi', pattern: 'colon', confidence: 0.95 },
      { label: 'NIM', value: '20190001', pattern: 'colon', confidence: 0.95 },
    ];
    const { rules } = buildRules(pairs, 'Nama : Ahmad Fauzi\nNIM : 20190001', 'test');
    expect(rules.length).toBe(2);
    expect(rules[0].id).toBeTruthy();
    expect(rules[0].label).toBe('Nama');
    expect(rules[0].pattern).toBeInstanceOf(RegExp);
    expect(rules[0].required).toBe(true);
  });

  test('deduplicates IDs with numeric suffix', () => {
    const pairs = [
      { label: 'Nama', value: 'A', pattern: 'colon', confidence: 0.9 },
      { label: 'Nama Lengkap', value: 'B', pattern: 'colon', confidence: 0.9 },
    ];
    const { rules } = buildRules(pairs, 'Nama : A\nNama Lengkap : B', 'test');
    const ids = rules.map(r => r.id);
    const uniqueIds = new Set(ids);
    expect(uniqueIds.size).toBe(rules.length); // All unique
  });

  test('truncates IDs to 20 chars', () => {
    const pairs = [
      { label: 'Ini Adalah Label Yang Sangat Panjang Sekali', value: 'x', pattern: 'colon', confidence: 0.9 },
    ];
    const { rules } = buildRules(pairs, 'label', 'test');
    expect(rules[0].id.length).toBeLessThanOrEqual(20);
  });

  test('returns warnings array', () => {
    const { rules, warnings } = buildRules([], '', 'test');
    expect(Array.isArray(rules)).toBe(true);
    expect(Array.isArray(warnings)).toBe(true);
  });
});

// =============================================================================
//  fingerprint-extractor
// =============================================================================

describe('fingerprint-extractor — extractFingerprints', () => {
  test('extracts fingerprints from text', () => {
    const fullText = 'SURAT KETERANGAN CATATAN KEPOLISIAN Nomor SKCK';
    const items = [{ str: 'SURAT', x: 10, y: 10, page: 1, width: 50, height: 12 }];
    const lines = groupTextByLines(items);
    const fingerprints = extractFingerprints(fullText, lines);
    expect(Array.isArray(fingerprints)).toBe(true);
    expect(fingerprints.length).toBeGreaterThan(0);
  });

  test('includes hint fingerprints in output', () => {
    const fullText = 'Dokumen SKCK resmi';
    const items = [{ str: 'Dokumen', x: 10, y: 10, page: 1, width: 50, height: 12 }];
    const lines = groupTextByLines(items);
    const hints = [/custom_hint/i];
    const fingerprints = extractFingerprints(fullText, lines, hints);
    const strList = fingerprints.map(f => f.toString());
    expect(strList.some(s => s.includes('custom_hint'))).toBe(true);
  });

  test('returns at most 5 fingerprints', () => {
    const fullText = 'A B C D E F G H I J K L M N O P Q R S T U V W X Y Z';
    const lines = [];
    const fingerprints = extractFingerprints(fullText, lines);
    expect(fingerprints.length).toBeLessThanOrEqual(5);
  });
});

// =============================================================================
//  confidence-scorer
// =============================================================================

describe('confidence-scorer — calculateConfidence', () => {
  test('calculates confidence between 0 and 1', () => {
    const fields = [
      { label: 'Nama', value: 'Test', pattern: 'colon', confidence: 0.95 },
      { label: 'NIM', value: '123', pattern: 'colon', confidence: 0.95 },
    ];
    const schema = { rules: [{ id: 'nama' }, { id: 'nim' }] };
    const { confidence } = calculateConfidence(fields, 5, 'Nama : Test\nNIM : 123', schema);
    expect(confidence).toBeGreaterThanOrEqual(0);
    expect(confidence).toBeLessThanOrEqual(1);
  });

  test('returns warnings for low confidence', () => {
    const fields = [
      { label: 'X', value: 'Y', pattern: 'stacked', confidence: 0.3 },
    ];
    const schema = { rules: [{ id: 'x' }] };
    const { confidence, warnings } = calculateConfidence(fields, 10, 'X\nY', schema);
    expect(confidence).toBeLessThan(0.8);
    expect(warnings.length).toBeGreaterThan(0);
  });

  test('returns warnings for too few fields', () => {
    const fields = [{ label: 'A', value: 'B', pattern: 'colon', confidence: 0.9 }];
    const schema = { rules: [{ id: 'a' }] };
    const { warnings } = calculateConfidence(fields, 10, 'A : B', schema);
    // Fewer than 3 fields should trigger a warning
    expect(warnings.some(w => w.includes('field') || w.includes('too few'))).toBe(true);
  });
});
