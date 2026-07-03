/**
 * @module layer2
 * @description Layer 2 crypto wrapper over @ninja-labs/verify-pdf.
 *              Validates PDF digital signatures and maps results to a
 *              standardized Layer2Result per PRD §4.3.
 */

import verifyPDF from '@ninja-labs/verify-pdf';

/**
 * Run Layer 2 PDF digital-signature verification.
 *
 * @param {Buffer} pdfBuffer - Raw PDF bytes.
 * @returns {Promise<import('./types.js').Layer2Result>}
 */
export async function runLayer2(pdfBuffer) {
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

  let verifyOutput;

  // ---- invoke the underlying verifier ----
  try {
    verifyOutput = await verifyPDF(pdfBuffer);
  } catch (err) {
    result.failReason = err.message;
    result.durationMs = Math.round(performance.now() - t0);
    return result;
  }

  // ---- no signatures at all ----
  if (
    !verifyOutput ||
    !verifyOutput.signatures ||
    verifyOutput.signatures.length === 0
  ) {
    result.failReason =
      'Dokumen tidak memiliki tanda tangan digital.';
    result.durationMs = Math.round(performance.now() - t0);
    return result;
  }

  // ---- map first signature per PRD §4.3 ----
  const sig = verifyOutput.signatures[0];
  const certs =
    sig.meta && sig.meta.certs && sig.meta.certs.length > 0
      ? sig.meta.certs[0]
      : null;

  result.hasSignature = true;
  result.passed = !!verifyOutput.verified;
  result.integrityOk = !!verifyOutput.integrity;

  if (certs) {
    result.issuer = certs.issuedBy || null;
    result.issuedTo = certs.issuedTo || null;

    if (certs.validityPeriod) {
      result.validFrom = certs.validityPeriod.notBefore || null;
      result.validTo = certs.validityPeriod.notAfter || null;
    }
  }

  if (sig.signingTime) {
    result.signedAt = sig.signingTime;
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
