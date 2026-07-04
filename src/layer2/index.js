/**
 * @module layer2
 * @description Layer 2 crypto wrapper over @ninja-labs/verify-pdf.
 *              Validates PDF digital signatures and maps results to a
 *              standardized Layer2Result per PRD §4.3.
 *
 *              Supports optional trusted-CA pinning via `options.trustedIssuers`:
 *              when provided (non-empty array of issuer name substrings), any
 *              signature whose issuer does not match an entry in the allowlist
 *              is rejected (passed=false) as a defense-in-depth measure against
 *              forged/untrusted certificates.
 */

import verifyPDF from '@ninja-labs/verify-pdf';

/**
 * Run Layer 2 PDF digital-signature verification.
 *
 * @param {Buffer} pdfBuffer - Raw PDF bytes.
 * @param {object} [options={}]
 * @param {string[]} [options.trustedIssuers] - Optional allowlist of trusted
 *        issuer name substrings. When set, signatures from issuers NOT matching
 *        any entry are rejected (defense-in-depth / trusted-CA pinning).
 * @returns {Promise<import('../types.js').Layer2Result>}
 */
export async function runLayer2(pdfBuffer, options = {}) {
  const t0 = performance.now();
  const result = {
    hasSignature: false,
    passed: false,
    issuer: null,
    issuedTo: null,
    validFrom: null,
    validTo: null,
    certExpired: false,
    integrityOk: false,
    signedAt: null,
    failReason: null,
    durationMs: 0,
  };

  // ── Defense-in-depth: trusted-CA pinning allowlist ────────────────────
  const trustedIssuers = Array.isArray(options && options.trustedIssuers)
    ? options.trustedIssuers.filter((s) => typeof s === 'string' && s.length > 0)
    : null;

  let verifyOutput;

  // ---- invoke the underlying verifier ----
  try {
    verifyOutput = await verifyPDF(pdfBuffer);
  } catch (err) {
    result.failReason = err.message;
    result.durationMs = Math.round(performance.now() - t0);
    return result;
  }

  // ---- normalize API shape across verify-pdf versions ──────────────────
  // verify-pdf 0.3.x returns a FLAT object { verified, integrity, meta: { certs } }
  // verify-pdf 1.x    returns { ..., signatures: [{ verified, integrity, meta }] }
  // Normalize both into a `signatures` array so downstream mapping is uniform.
  const hasFlat =
    verifyOutput &&
    !Array.isArray(verifyOutput.signatures) &&
    (verifyOutput.meta || verifyOutput.verified !== undefined);
  const signatures = Array.isArray(verifyOutput && verifyOutput.signatures)
    ? verifyOutput.signatures
    : hasFlat
      ? [{ verified: verifyOutput.verified, integrity: verifyOutput.integrity, meta: verifyOutput.meta }]
      : [];

  // ---- no signatures at all ----
  if (signatures.length === 0) {
    result.failReason =
      'Dokumen tidak memiliki tanda tangan digital.';
    result.durationMs = Math.round(performance.now() - t0);
    return result;
  }

  // ---- map first signature per PRD §4.3 ----
  const sig = signatures[0];
  const certs =
    sig.meta && sig.meta.certs && sig.meta.certs.length > 0
      ? sig.meta.certs[0]
      : null;

  result.hasSignature = true;
  // Read from per-signature object (sig) first, fall back to top-level for
  // verify-pdf 0.3.x flat API compatibility.
  result.passed = !!(sig.verified ?? verifyOutput.verified);
  result.integrityOk = !!(sig.integrity ?? verifyOutput.integrity);

  if (certs) {
    result.issuer = certs.issuedBy || null;
    result.issuedTo = certs.issuedTo || null;

    if (certs.validityPeriod) {
      result.validFrom = certs.validityPeriod.notBefore || null;
      result.validTo = certs.validityPeriod.notAfter || null;
    }
  }

  // signingTime may live at sig.signingTime (1.x) or sig.meta.signatureMeta
  const signingTime =
    sig.signingTime ||
    (sig.meta && sig.meta.signatureMeta && sig.meta.signatureMeta.signingTime) ||
    null;
  if (signingTime) {
    result.signedAt = signingTime;
  }

  // ---- cert expiry check ----
  const now = new Date();
  if (result.validTo) {
    const notAfter = new Date(result.validTo);
    if (!isNaN(notAfter.getTime()) && notAfter < now) {
      result.certExpired = true;
      result.passed = false;
      result.failReason =
        'Sertifikat digital telah expired pada ' + result.validTo;
    }
  }

  // ---- trusted-CA pinning: reject untrusted issuers ─────────────────────
  if (trustedIssuers && trustedIssuers.length > 0 && result.issuer) {
    const isTrusted = trustedIssuers.some(
      (trusted) =>
        typeof result.issuer === 'string' && result.issuer.includes(trusted),
    );
    if (!isTrusted) {
      result.passed = false;
      result.failReason =
        `Issuer sertifikat ("${result.issuer}") tidak ada dalam daftar CA tepercaya ` +
        '(trustedIssuers). Tanda tangan ditolak demi keamanan.';
    }
  }

  // ---- integrity failure override ----
  if (!result.integrityOk && !result.failReason) {
    result.passed = false;
    result.failReason =
      'Integritas dokumen gagal — PDF kemungkinan dimodifikasi setelah ditandatangani.';
  }

  // ---- generic failure fallback ----
  if (!result.passed && !result.failReason) {
    result.failReason =
      'Verifikasi tanda tangan digital gagal.';
  }

  result.durationMs = Math.round(performance.now() - t0);
  return result;
}
