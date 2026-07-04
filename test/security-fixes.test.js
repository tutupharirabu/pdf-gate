/**
 * @module test/security-fixes
 * @description Regression tests for the security hardening fixes:
 *              - zero-trust.js now importable & functional (was SyntaxError)
 *              - loadSchemaFromFile path-traversal / RCE bounding
 *              - runLayer2 trustedIssuers pinning (backward compatible)
 */

import { writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import {
  loadSchemaFromFile,
  unregisterSchema,
  SCHEMAS,
} from '../src/schemas/index.js';
import * as zeroTrust from '../src/utils/zero-trust.js';

// ─── Helpers ────────────────────────────────────────────────────────────────

const TMP = join(tmpdir(), 'pdf-gate-sec-test');

function validSchemaJson(name) {
  return JSON.stringify({
    name,
    label: 'Test External',
    fingerprints: ['/test/i', 'dokumen'],
    fingerprintMin: 1,
    heuristics: { minWords: 5, maxWords: 50 },
    rules: [
      { id: 'r1', label: 'R1', pattern: '/\\d{4}/', required: true },
      { id: 'r2', label: 'R2', pattern: 'plain text', required: false },
    ],
  });
}

beforeAll(() => {
  mkdirSync(TMP, { recursive: true });
});

afterAll(() => {
  rmSync(TMP, { recursive: true, force: true });
});

afterEach(() => {
  for (const name of ['ext-allowed', 'ext-null', 'ext-traversal']) {
    try { unregisterSchema(name); } catch (e) { /* ignore */ }
  }
});

// =============================================================================
//  zero-trust.js — module is importable & all functions work (was SyntaxError)
// =============================================================================

describe('zero-trust module (was broken by missing brace)', () => {
  test('exports ZERO_TRUST_MODE flag', () => {
    expect(zeroTrust.ZERO_TRUST_MODE).toBe(true);
  });

  test('assertNoNetwork returns a safe diagnostic object', () => {
    const r = zeroTrust.assertNoNetwork();
    expect(r).toHaveProperty('safe');
    expect(r).toHaveProperty('handles');
    expect(r).toHaveProperty('reason');
    expect(typeof r.safe).toBe('boolean');
    expect(typeof r.handles).toBe('number');
  });

  test('zeroBuffer zeroes out a Buffer', () => {
    const buf = Buffer.from([1, 2, 3, 4]);
    zeroTrust.zeroBuffer(buf);
    expect(Array.from(buf)).toEqual([0, 0, 0, 0]);
  });

  test('zeroBuffer zeroes out a Uint8Array', () => {
    const arr = new Uint8Array([9, 9, 9]);
    zeroTrust.zeroBuffer(arr);
    expect(Array.from(arr)).toEqual([0, 0, 0]);
  });

  test('validateDependencies returns a clean/diagnostic object', () => {
    const r = zeroTrust.validateDependencies();
    expect(r).toHaveProperty('clean');
    expect(r).toHaveProperty('loadedModules');
    expect(Array.isArray(r.loadedModules)).toBe(true);
  });

  test('createSecureContext returns a frozen null-prototype object', () => {
    const ctx = zeroTrust.createSecureContext({ a: 1, b: 'x' });
    expect(Object.getPrototypeOf(ctx)).toBeNull();
    expect(Object.isFrozen(ctx)).toBe(true);
    expect(ctx.a).toBe(1);
    expect(ctx.b).toBe('x');
  });

  test('createSecureContext rejects prototype-pollution keys', () => {
    const ctx = zeroTrust.createSecureContext({ __proto__: 'evil', constructor: 'x', prototype: 'y', ok: 1 });
    expect(ctx.ok).toBe(1);
    expect(ctx).not.toHaveProperty('constructor');
    expect(ctx).not.toHaveProperty('prototype');
  });
});

// =============================================================================
//  loadSchemaFromFile — path traversal / RCE bounding
// =============================================================================

describe('loadSchemaFromFile path-traversal bounding', () => {
  const schemaPath = join(TMP, 'schema.json');

  beforeAll(() => {
    writeFileSync(schemaPath, validSchemaJson('ext-allowed'));
  });

  test('accepts a path within allowedRoot', async () => {
    // use a fresh name to avoid duplicate-registration from earlier runs
    writeFileSync(schemaPath, validSchemaJson('ext-allowed'));
    const schema = await loadSchemaFromFile(schemaPath, { allowedRoot: TMP });
    expect(schema.name).toBe('ext-allowed');
    expect(SCHEMAS.has('ext-allowed')).toBe(true);
  });

  test('rejects a path outside allowedRoot (path traversal)', async () => {
    writeFileSync(schemaPath, validSchemaJson('ext-traversal'));
    await expect(
      loadSchemaFromFile(schemaPath, { allowedRoot: join(tmpdir(), 'some-other-dir') }),
    ).rejects.toThrow(/Akses ditolak/);
  });

  test('rejects arbitrary absolute path under default allowedRoot (cwd)', async () => {
    // /tmp/... is outside the project cwd by default → must be rejected
    writeFileSync(schemaPath, validSchemaJson('ext-traversal'));
    await expect(loadSchemaFromFile(schemaPath)).rejects.toThrow(/Akses ditolak/);
  });

  test('allows any path when allowedRoot is null (trusted context)', async () => {
    writeFileSync(schemaPath, validSchemaJson('ext-null'));
    const schema = await loadSchemaFromFile(schemaPath, { allowedRoot: null });
    expect(schema.name).toBe('ext-null');
  });
});

// =============================================================================
//  runLayer2 — trustedIssuers option is backward compatible
// =============================================================================

describe('runLayer2 trustedIssuers pinning (backward compatible)', () => {
  test('accepts an options second argument without throwing', async () => {
    const { runLayer2 } = await import('../src/layer2/index.js');
    const buffer = Buffer.from('not-a-real-pdf');
    // No options → backward compatible (behaves as before)
    const result = await runLayer2(buffer);
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('failReason');
  });

  test('accepts trustedIssuers option without throwing', async () => {
    const { runLayer2 } = await import('../src/layer2/index.js');
    const buffer = Buffer.from('not-a-real-pdf');
    const result = await runLayer2(buffer, { trustedIssuers: ['DigiCert', 'Adobe'] });
    expect(result).toHaveProperty('passed');
    // Invalid input → verifyPDF throws → failReason set (signature path not reached)
    expect(result.failReason).toBeTruthy();
  });
});
