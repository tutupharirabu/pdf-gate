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
  getAllSchemas,
} from './schemas/index.js';
import { generateSchema } from './generator/index.js';
import { sanitizeBuffer, sanitizeOptions, safeRegexTest, MAX_BUFFER_SIZE } from './utils/sanitizer.js';

// ── Re-exports ────────────────────────────────────────────────────────────────

export { SCHEMAS, resolveSchema, registerSchema, unregisterSchema, loadSchemaFromFile, getAllSchemas, generateSchema };

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
    : runLayer2(toBuffer(buffer), { trustedIssuers: safeOptions.trustedIssuers });

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
}

