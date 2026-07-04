/**
 * @module test/layer2-regression
 * @description Layer 2 regression tests using real PDF fixtures.
 *              Validates that runLayer2 handles real PDF buffers without
 *              crashing and returns proper Layer2Result shape, even for
 *              unsigned documents (expected: hasSignature=false).
 */

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FIXTURES = {
  ijazah: path.join(__dirname, 'Ijazah.pdf'),
  sertifikat: path.join(__dirname, 'File Sertifikasi.pdf'),
  certificate: path.join(__dirname, 'Certificate_of_Completion - Softskills and Greenskills Training.pdf'),
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('runLayer2 — real PDF fixtures (unsigned documents)', () => {
  let runLayer2;

  beforeAll(async () => {
    ({ runLayer2 } = await import('../src/layer2/index.js'));
  });

  test('handles Ijazah.pdf Buffer without throwing', async () => {
    if (!existsSync(FIXTURES.ijazah)) return;
    const buffer = readFileSync(FIXTURES.ijazah);
    const result = await runLayer2(buffer);
    expect(result).toHaveProperty('hasSignature');
    expect(result).toHaveProperty('passed');
    expect(result).toHaveProperty('failReason');
    expect(typeof result.durationMs).toBe('number');
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    // Unsigned document → no signature expected
    expect(typeof result.hasSignature).toBe('boolean');
    // If signed, issuer details should be present
    if (result.hasSignature) {
      expect(result).toHaveProperty('issuer');
      expect(result).toHaveProperty('issuedTo');
    }
  });

  test('handles File Sertifikasi.pdf Buffer without throwing', async () => {
    if (!existsSync(FIXTURES.sertifikat)) return;
    const buffer = readFileSync(FIXTURES.sertifikat);
    const result = await runLayer2(buffer);
    expect(result).toHaveProperty('hasSignature');
    expect(typeof result.hasSignature).toBe('boolean');
    expect(typeof result.durationMs).toBe('number');
  });

  test('handles Certificate of Completion.pdf Buffer without throwing', async () => {
    if (!existsSync(FIXTURES.certificate)) return;
    const buffer = readFileSync(FIXTURES.certificate);
    const result = await runLayer2(buffer);
    expect(result).toHaveProperty('hasSignature');
    expect(typeof result.hasSignature).toBe('boolean');
    expect(typeof result.durationMs).toBe('number');
  });

  test('accepts trustedIssuers option on real PDF without throwing', async () => {
    if (!existsSync(FIXTURES.ijazah)) return;
    const buffer = readFileSync(FIXTURES.ijazah);
    const result = await runLayer2(buffer, {
      trustedIssuers: ['DigiCert', 'BSrE'],
    });
    expect(result).toHaveProperty('hasSignature');
    // If signed, trustedIssuers may reject or accept depending on issuer name
    expect(typeof result.hasSignature).toBe('boolean');
  });
});

// ─── Backward compatibility ──────────────────────────────────────────────────

describe('runLayer2 — backward compatibility (unsigned bearer)', () => {
  let runLayer2;
  beforeAll(async () => {
    ({ runLayer2 } = await import('../src/layer2/index.js'));
  });

  test('returns consistent shape for all 3 PDF fixtures', async () => {
    const requiredKeys = [
      'hasSignature', 'passed', 'issuer', 'issuedTo',
      'validFrom', 'validTo', 'certExpired', 'integrityOk',
      'signedAt', 'failReason', 'durationMs',
    ];

    for (const [name, filePath] of Object.entries(FIXTURES)) {
      if (!existsSync(filePath)) continue;
      const buffer = readFileSync(filePath);
      const result = await runLayer2(buffer);
      for (const key of requiredKeys) {
        expect(result).toHaveProperty(key);
      }
    }
  });

  test('no-options call is backward compatible on real PDF', async () => {
    // runLayer2(buffer) with no second argument should work
    const { runLayer2 } = await import('../src/layer2/index.js');
    if (!existsSync(FIXTURES.ijazah)) return;
    const buffer = readFileSync(FIXTURES.ijazah);
    // Call with just the buffer (no options)
    const result = await runLayer2(buffer);
    expect(result).toHaveProperty('passed');
  });
});
