/**
 * @module test/layer2.test
 * @description Unit tests for Layer 2 cryptographic verification wrapper.
 */

// The runLayer2 function expects @ninja-labs/verify-pdf
// We mock it inline using a dynamic import pattern

let runLayer2;

beforeEach(async () => {
  // Reset module cache for fresh mock each test
  jest.resetModules();

  // Mock @ninja-labs/verify-pdf
  jest.unstable_mockModule('@ninja-labs/verify-pdf', () => ({
    default: jest.fn(),
  }));

  const mod = await import('../src/layer2/index.js');
  runLayer2 = mod.runLayer2;
});

// ─── Helper: get mocked verifyPDF ────────────────────────────────────────────

async function getMockVerifyPDF() {
  const mod = await import('@ninja-labs/verify-pdf');
  return mod.default;
}

// ─── Sample PKCS#7 verification output ────────────────────────────────────────

function makeVerifiedOutput(overrides = {}) {
  return {
    verified: true,
    signatures: [{
      integrity: true,
      signingTime: new Date('2024-06-15').toISOString(),
      meta: {
        certs: [{
          issuedBy: 'CN=BSrE Indonesia, O=Kominfo',
          issuedTo: 'CN=Universitas Teknologi Indonesia',
          validityPeriod: {
            notBefore: new Date('2023-01-01').toISOString(),
            notAfter: new Date('2028-01-01').toISOString(),
          },
        }],
      },
      ...overrides,
    }],
  };
}

// =============================================================================
//  TESTS
// =============================================================================

describe('layer2 — runLayer2', () => {
  test('returns correct Layer2Result when signature verified', async () => {
    const mockVerify = await getMockVerifyPDF();
    mockVerify.mockReturnValue(makeVerifiedOutput());

    const buffer = Buffer.from('fake-pdf');
    const result = await runLayer2(buffer);

    expect(result.passed).toBe(true);
    expect(result.hasSignature).toBe(true);
    expect(result.integrityOk).toBe(true);
    expect(result.certExpired).toBe(false);
    expect(result.issuer).toContain('BSrE');
    expect(result.issuedTo).toContain('Universitas');
    expect(result.validFrom).toBeTruthy();
    expect(result.validTo).toBeTruthy();
    expect(result.signedAt).toBeTruthy();
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  test('handles certificate expiry', async () => {
    const mockVerify = await getMockVerifyPDF();
    mockVerify.mockReturnValue(makeVerifiedOutput({
      meta: {
        certs: [{
          issuedBy: 'CN=Old CA',
          issuedTo: 'CN=Old Org',
          validityPeriod: {
            notBefore: '2020-01-01T00:00:00Z',
            notAfter: '2022-01-01T00:00:00Z',
          },
        }],
      },
    }));

    const result = await runLayer2(Buffer.from('fake'));

    expect(result.passed).toBe(false);
    expect(result.certExpired).toBe(true);
    expect(result.failReason).toContain('expired');
  });

  test('handles integrity failure', async () => {
    const mockVerify = await getMockVerifyPDF();
    mockVerify.mockReturnValue({
      verified: false,
      signatures: [{
        integrity: false,
        signingTime: new Date().toISOString(),
        meta: {
          certs: [{
            issuedBy: 'CN=Test CA',
            issuedTo: 'CN=Test Org',
            validityPeriod: {
              notBefore: '2023-01-01T00:00:00Z',
              notAfter: '2030-01-01T00:00:00Z',
            },
          }],
        },
      }],
    });

    const result = await runLayer2(Buffer.from('fake'));

    expect(result.passed).toBe(false);
    expect(result.integrityOk).toBe(false);
    expect(result.failReason).toContain('Integritas');
    expect(result.failReason).toContain('dimodifikasi');
  });

  test('handles no signature', async () => {
    const mockVerify = await getMockVerifyPDF();
    mockVerify.mockReturnValue({
      verified: false,
      signatures: [],
    });

    const result = await runLayer2(Buffer.from('fake'));

    expect(result.passed).toBe(false);
    expect(result.hasSignature).toBe(false);
  });

  test('handles verifyPDF throwing error', async () => {
    const mockVerify = await getMockVerifyPDF();
    mockVerify.mockImplementation(() => {
      throw new Error('PKCS#7 parsing failed: malformed signature');
    });

    const result = await runLayer2(Buffer.from('fake'));

    expect(result.passed).toBe(false);
    expect(result.failReason).toContain('PKCS#7');
  });
});
