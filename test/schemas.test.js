/**
 * @module test/schemas.test
 * @description Unit tests for schema registry: resolveSchema,
 *              registerSchema, unregisterSchema, and loadSchemaFromFile.
 */

import {
  SCHEMAS,
  resolveSchema,
  registerSchema,
  unregisterSchema,
} from '../src/schemas/index.js';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function validCustomSchema(name = 'test-custom') {
  return {
    name,
    label: 'Test Schema',
    fingerprints: [/test/i, /dokumen/i],
    fingerprintMin: 1,
    heuristics: { minWords: 10, maxWords: 100 },
    rules: [
      { id: 'field1', label: 'Field 1', pattern: /test/i, required: true },
      { id: 'field2', label: 'Field 2', pattern: /dokumen/i, required: false },
    ],
  };
}

// ─── Cleanup after each test ───────────────────────────────────────────────────

afterEach(() => {
  // Clean up any registered custom schemas
  try { unregisterSchema('test-custom'); } catch (e) { /* ignore */ }
  try { unregisterSchema('test-custom-2'); } catch (e) { /* ignore */ }
  try { unregisterSchema('test-pattern'); } catch (e) { /* ignore */ }
});

// =============================================================================
//  resolveSchema
// =============================================================================

describe('resolveSchema', () => {
  test('resolves ijazah by name', () => {
    const schema = resolveSchema('ijazah');
    expect(schema.name).toBe('ijazah');
    expect(schema.label).toBe('Ijazah');
    expect(schema.rules.length).toBeGreaterThanOrEqual(6);
  });

  test('resolves transkrip by name', () => {
    const schema = resolveSchema('transkrip');
    expect(schema.name).toBe('transkrip');
    expect(schema.rules.every(r => r.required)).toBe(true);
  });

  test('resolves sertifikat by name', () => {
    const schema = resolveSchema('sertifikat');
    expect(schema.name).toBe('sertifikat');
  });

  test('resolves ktp by name', () => {
    const schema = resolveSchema('ktp');
    expect(schema.name).toBe('ktp');
    expect(schema.rules.find(r => r.id === 'nik').required).toBe(true);
  });

  test('throws for invalid schema name', () => {
    expect(() => resolveSchema('invalid-name')).toThrow();
  });

  test('resolves custom schema object', () => {
    const custom = validCustomSchema();
    const schema = resolveSchema(custom);
    expect(schema.name).toBe('test-custom');
    expect(schema.rules).toHaveLength(2);
  });

  test('throws for invalid custom schema object (missing name)', () => {
    expect(() => resolveSchema({ rules: [] }))
      .toThrow(/name/);
  });

  test('throws for custom schema with fingerprintMin > fingerprints.length', () => {
    expect(() => resolveSchema({
      name: 'bad',
      label: 'Bad',
      fingerprints: [/a/i],
      fingerprintMin: 5,
      heuristics: { minWords: 1, maxWords: 10 },
      rules: [],
    })).toThrow();
  });
});

// =============================================================================
//  registerSchema / unregisterSchema
// =============================================================================

describe('registerSchema / unregisterSchema', () => {
  test('registers a custom schema successfully', () => {
    const schema = registerSchema(validCustomSchema());
    expect(SCHEMAS.has('test-custom')).toBe(true);
    expect(SCHEMAS.get('test-custom').name).toBe('test-custom');
  });

  test('throws when registering duplicate custom schema name', () => {
    registerSchema(validCustomSchema());
    expect(() => registerSchema(validCustomSchema()))
      .toThrow(/sudah terdaftar/);
  });

  test('throws when registering built-in schema name', () => {
    const builtin = validCustomSchema('ijazah');
    expect(() => registerSchema(builtin))
      .toThrow(/built-in/);
  });

  test('unregisters a custom schema', () => {
    registerSchema(validCustomSchema());
    expect(SCHEMAS.has('test-custom')).toBe(true);
    unregisterSchema('test-custom');
    expect(SCHEMAS.has('test-custom')).toBe(false);
  });

  test('throws when unregistering built-in schema', () => {
    expect(() => unregisterSchema('ijazah'))
      .toThrow(/built-in/);
  });

  test('parses string patterns on registration', () => {
    const schema = registerSchema({
      name: 'test-pattern',
      label: 'Test Patterns',
      fingerprints: ['/test/i', 'dokumen'],
      fingerprintMin: 1,
      heuristics: { minWords: 5, maxWords: 50 },
      rules: [
        { id: 'r1', label: 'R1', pattern: '/\\d{4}/', required: true },
        { id: 'r2', label: 'R2', pattern: 'plain text', required: false },
      ],
    });

    expect(SCHEMAS.has('test-pattern')).toBe(true);
    const stored = SCHEMAS.get('test-pattern');
    expect(stored.fingerprints[0]).toBeInstanceOf(RegExp);
    expect(stored.fingerprints[1]).toBeInstanceOf(RegExp);
    expect(stored.rules[0].pattern).toBeInstanceOf(RegExp);
    expect(stored.rules[1].pattern).toBeInstanceOf(RegExp);
  });
});

// =============================================================================
//  Built-in Schemas Validation
// =============================================================================

describe('built-in schemas integrity', () => {
  const schemas = ['ijazah', 'transkrip', 'sertifikat', 'ktp'];

  for (const name of schemas) {
    test(`${name} schema has valid structure`, () => {
      const schema = SCHEMAS.get(name);
      expect(schema).toBeDefined();
      expect(schema.name).toBe(name);
      expect(typeof schema.label).toBe('string');
      expect(Array.isArray(schema.fingerprints)).toBe(true);
      expect(schema.fingerprints.length).toBeGreaterThan(0);
      expect(schema.fingerprintMin).toBeGreaterThanOrEqual(1);
      expect(schema.fingerprintMin).toBeLessThanOrEqual(schema.fingerprints.length);
      expect(Array.isArray(schema.rules)).toBe(true);
      expect(schema.rules.length).toBeGreaterThan(0);
      expect(schema.heuristics.minWords).toBeLessThanOrEqual(schema.heuristics.maxWords);

      for (const rule of schema.rules) {
        expect(typeof rule.id).toBe('string');
        expect(rule.id.length).toBeGreaterThan(0);
        expect(typeof rule.label).toBe('string');
        expect(rule.pattern).toBeInstanceOf(RegExp);
        expect(typeof rule.required).toBe('boolean');
      }
    });
  }
});

// =============================================================================
//  SCHEMAS Registry
// =============================================================================

describe('SCHEMAS registry', () => {
  test('contains all 4 built-in schemas', () => {
    expect(SCHEMAS.size).toBeGreaterThanOrEqual(4);
    expect(SCHEMAS.has('ijazah')).toBe(true);
    expect(SCHEMAS.has('transkrip')).toBe(true);
    expect(SCHEMAS.has('sertifikat')).toBe(true);
    expect(SCHEMAS.has('ktp')).toBe(true);
  });

  test('is a Map instance', () => {
    expect(SCHEMAS).toBeInstanceOf(Map);
  });
});
