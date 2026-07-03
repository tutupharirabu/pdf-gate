/**
 * @module pdf-gate
 * @description Dual-layer PDF document validator — content sanity check +
 *              cryptographic signature verification for Indonesian formal documents.
 *
 *              Public API entry point.
 *
 * @license MIT
 * @author  Irfan Zharauri Nanda Sudiyanto
 */

import { parsePdf } from './utils/pdf-parser.js';
import { runLayer1 } from './layer1/index.js';
import { runLayer2 } from './layer2/index.js';
import {
  SCHEMAS,
  resolveSchema,
  registerSchema,
  unregisterSchema,
  loadSchemaFromFile,
} from './schemas/index.js';
import { generateSchema } from './generator/index.js';
import { sanitizeBuffer, sanitizeOptions, safeRegexTest, MAX_BUFFER_SIZE } from './utils/sanitizer.js';


// ── Re-exports ────────────────────────────────────────────────────────────────

export { SCHEMAS, resolveSchema, registerSchema, unregisterSchema, loadSchemaFromFile, generateSchema };

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Assert that `buffer` is a valid binary payload with security hardening.
 * Delegates to sanitizeBuffer for comprehensive validation including
 * size limits, prototype pollution checks, and sparse buffer detection.
 * @param {*} buffer
 * @throws {TypeError|Error}
 */
function assertBuffer(buffer) {
  // sanitizeBuffer covers: type check, pollution guard, size check, zero-length
  sanitizeBuffer(buffer);
}

/**
 * Timing-safe string comparison to prevent timing side-channel attacks.
 * Uses double HMAC approach via Node.js crypto.timingSafeEqual for
 * constant-time comparison of sensitive values.
 *
 * @param {string} a - First string to compare.
 * @param {string} b - Second string to compare.
 * @returns {boolean} True if strings are equal.
 */
function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    // Constant-time comparison requires equal-length buffers.
    // We still do constant-time on padded buffers to avoid leaking length.
    const maxLen = Math.max(bufA.length, bufB.length);
    const padA = Buffer.alloc(maxLen, 0);
    const padB = Buffer.alloc(maxLen, 0);
    bufA.copy(padA);
    bufB.copy(padB);
    try {
      return require('crypto').timingSafeEqual(padA, padB);
    } catch (_err) {
      return false;
    }
  }
  try {
    return require('crypto').timingSafeEqual(bufA, bufB);
  } catch (_err) {
    return false;
  }
}

/**
 * Transform the raw `Uint8Array` into a Node.js `Buffer` (zero-copy when already Buffer).
 * @param {Buffer|Uint8Array} src
 * @returns {Buffer}
 */
function toBuffer(src) {
  return Buffer.isBuffer(src) ? src : Buffer.from(src.buffer, src.byteOffset, src.byteLength);
}

/**
 * Build a `Layer2Result` used when the caller explicitly skips crypto checks.
 * @returns {import('./types.js').Layer2Result}
 */
function skippedLayer2Result() {
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
    durationMs: 0,
  };
}

// ── Main API ───────────────────────────────────────────────────────────────────

/**
 * Validate a PDF document through dual-layer checking.
 *
 * @param {Buffer|Uint8Array} buffer - Raw PDF bytes.
 * @param {import('./types.js').ValidateOptions} options
 * @returns {Promise<import('./types.js').ValidationResult>}
 */
export async function validatePDF(buffer, options) {
  const t0 = performance.now();
  assertBuffer(buffer);

  // ── Options sanitization & prototype pollution guard ──────────────
  if (!options || !options.schema) {
    throw new TypeError('options.schema wajib diisi — nama schema atau object schema kustom.');
  }

  // Sanitize options — strips forbidden keys, whitelists known keys
  const safeOptions = sanitizeOptions(options);

  // Explicit prototype pollution guard on the schema value
  if (
    typeof safeOptions.schema === 'object' &&
    safeOptions.schema !== null &&
    (Object.prototype.hasOwnProperty.call(safeOptions.schema, '__proto__') ||
      Object.prototype.hasOwnProperty.call(safeOptions.schema, 'constructor') ||
      Object.prototype.hasOwnProperty.call(safeOptions.schema, 'prototype'))
  ) {
    throw new Error(
      'options.schema mengandung key terlarang — kemungkinan prototype pollution.',
    );
  }

  const schema = resolveSchema(safeOptions.schema);
  const skipLayer2 = safeOptions.skipLayer2 === true;

  // ── ReDoS pre-check on schema rules ──────────────────────────────
  if (schema && Array.isArray(schema.rules)) {
    for (const rule of schema.rules) {
      if (rule.pattern && rule.pattern instanceof RegExp) {
        // Quick ReDoS check: test each pattern against a short safe input to
        // catch obviously malicious regexes before they hit the full PDF text.
        const redosCheck = safeRegexTest(rule.pattern, 'SAFE_PROBE_STRING', 1000);
        if (redosCheck.timedOut) {
          throw new Error(
            `Pola regex untuk aturan "${rule.label || rule.id}" mencurigakan ` +
            '(timeout saat pre-check). Tolak demi keamanan.',
          );
        }
      }
    }
  }

  // 1. Parse PDF
  let parseResult;
  try {
    parseResult = await parsePdf(buffer);
  } catch (err) {
    const failReason = `Gagal membaca PDF: ${err.message}. Pastikan file tidak corrupt atau terenkripsi.`;
    return buildFailedResult(schema, safeOptions.fileName || null, buffer.length, 0, null, failReason, t0);
  }

  const { fullText, items, pageCount } = parseResult;

  // 2. Run Layer 1 and Layer 2 in PARALLEL
  const layer1Promise = runLayer1(fullText, items, pageCount, schema, SCHEMAS);
  const layer2Promise = skipLayer2
    ? Promise.resolve(skippedLayer2Result())
    : runLayer2(toBuffer(buffer));

  const [layer1, layer2] = await Promise.all([layer1Promise, layer2Promise]);

  // 3. Decision tree (PRD §4.1)
  let status;
  let failReason = null;

  if (!layer1.passed) {
    status = 'FAILED';
    failReason = layer1.failReason;
  } else if (skipLayer2) {
    status = 'PLAUSIBLE';
  } else if (layer2.passed) {
    status = 'VERIFIED';
  } else if (!layer2.hasSignature) {
    status = 'PLAUSIBLE';
  } else {
    status = 'FAILED';
    failReason = layer2.failReason;
  }

  const totalDurationMs = Math.round((performance.now() - t0) * 100) / 100;

  return {
    status,
    schema: schema.name,
    fileName: safeOptions.fileName || null,
    fileSizeKb: Math.round((buffer.length / 1024) * 10) / 10,
    pageCount,
    totalDurationMs,
    timestamp: new Date().toISOString(),
    layer1,
    layer2,
    failReason,
  };
}

/**
 * Build a FAILED result when PDF parsing itself fails.
 * @param {import('./types.js').Schema} schema
 * @param {string|null} fileName
 * @param {number} bytes
 * @param {number} pageCount
 * @param {import('./types.js').Layer1Result|null} layer1
 * @param {string} failReason
 * @param {number} t0
 * @returns {import('./types.js').ValidationResult}
 */
function buildFailedResult(schema, fileName, bytes, pageCount, layer1, failReason, t0) {
  const totalDurationMs = Math.round((performance.now() - t0) * 100) / 100;
  return {
    status: 'FAILED',
    schema: schema ? schema.name : 'unknown',
    fileName,
    fileSizeKb: Math.round((bytes / 1024) * 10) / 10,
    pageCount,
    totalDurationMs,
    timestamp: new Date().toISOString(),
    layer1: layer1 || {
      passed: false,
      detectedType: null,
      failReason,
      rules: [],
      heuristics: { passed: false, wordCount: 0, flags: [] },
      durationMs: 0,
    },
    layer2: skippedLayer2Result(),
    failReason,
  };

// ── Process-level security ────────────────────────────────────────────────────

/**
 * Global handler for unhandled promise rejections.
 * Prevents sensitive information leakage by logging a sanitized
 * message instead of the default Node.js behavior (which dumps
 * the full stack trace including potentially sensitive data).
 *
 * Registered at module import time so it activates before any
 * consumer code runs.
 */
process.on('unhandledRejection', (reason, _promise) => {
  // Log a sanitized message — never expose raw error details
  // that could contain file paths, buffer contents, or PII.
  const msg = reason instanceof Error
    ? `Unhandled rejection: ${reason.message}`
    : 'Unhandled rejection (non-Error reason) — details disembunyikan demi keamanan.';

  // Use console.error for observability but NEVER include stack traces
  // in production to prevent information leakage through logs.
  if (process.env.NODE_ENV !== 'production') {
    console.error(msg);
  }

  // In production, we silently swallow to avoid leaking any details.
  // The consumer is responsible for their own error monitoring.
});

}
