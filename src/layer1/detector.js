/**
 * @module layer1/detector
 * @description Gate 2 - Fingerprint-based document type detection.
 */

import { safeRegexTest } from '../utils/sanitizer.js';
import { isRegexMalicious } from './validator.js';

/** @const {number} Maximum input text size before skipping fingerprint regexes (1 MB). */
const MAX_FINGERPRINT_INPUT_SIZE = 1 * 1024 * 1024; // 1 MB

/**
 * Test each fingerprint regex of a schema against the full extracted text.
 *
 * **Security hardened:** attacker-supplied fingerprint patterns are routed
 * through `safeRegexTest` (wall-clock timeout + match-count limit) instead of
 * a raw `RegExp.test()`. Patterns flagged as ReDoS vectors by
 * `isRegexMalicious()` are skipped, and oversized inputs skip regex execution
 * entirely. A timed-out or errored regex counts as a non-match.
 *
 * @param {string} fullText - Full extracted PDF text.
 * @param {import('../types.js').Schema} schema - Schema whose fingerprints
 *   are tested.
 * @returns {string[]} Sources (`fp.source`) of matching fingerprints.
 */
function matchFingerprints(fullText, schema) {
  /** @type {string[]} */
  const matches = [];

  // Input-size cap: refuse to run any fingerprint regex on huge inputs.
  if (fullText.length > MAX_FINGERPRINT_INPUT_SIZE) {
    return matches;
  }

  for (const fp of schema.fingerprints) {
    // Only RegExp instances can be executed safely; skip anything else.
    if (!(fp instanceof RegExp)) continue;
    // Skip patterns that look like ReDoS vectors (e.g. (a|a)+, (a+)+).
    if (isRegexMalicious(fp)) continue;
    // Run through the ReDoS-protected helper; timeout/error => non-match.
    const { passed, timedOut } = safeRegexTest(fp, fullText);
    if (passed && !timedOut) {
      matches.push(fp.source);
    }
  }
  return matches;
}

/**
 * @param {string} name - Schema name.
 * @returns {string} Human-readable display label for the schema name.
 */
function displayName(name) {
  /** @type {Record<string, string>} */
  const labels = {
    ijazah: 'Ijazah',
    transkrip: 'Transkrip Nilai',
    sertifikat: 'Sertifikat',
    ktp: 'KTP',
    'akte-kelahiran': 'Akte Kelahiran',
    sim: 'SIM',
    passport: 'Paspor',
    kk: 'Kartu Keluarga',
  };
  return labels[name] || name;
}

/**
 * Gate 2: Detect the document type via fingerprint matching.
 *
 * First tests the selected schema's fingerprints. If fewer than
 * `fingerprintMin` match, cross-checks every other registered schema and,
 * finally, falls back to a "unknown document type" failure listing all
 * known schema names.
 *
 * @param {string} fullText - Full extracted PDF text.
 * @param {import('../types.js').Schema} selectedSchema - Schema selected
 *   by the caller for validation.
 * @param {Map<string, import('../types.js').Schema>|Record<string, import('../types.js').Schema>} allSchemas -
 *   Registry of all known schemas for cross-detection.
 * @returns {{
 *   passed: boolean,
 *   detectedType: string | null,
 *   failReason: string | null,
 *   matches: string[]
 * }}
 */
export function detectDocumentType(fullText, selectedSchema, allSchemas) {
  const selectedMatches = matchFingerprints(fullText, selectedSchema);
  const minRequired = selectedSchema.fingerprintMin;

  if (selectedMatches.length >= minRequired) {
    return {
      passed: true,
      detectedType: selectedSchema.name,
      failReason: null,
      matches: selectedMatches,
    };
  }

  const schemaEntries =
    allSchemas instanceof Map
      ? [...allSchemas.entries()]
      : Object.entries(allSchemas);

  for (const [name, schema] of schemaEntries) {
    if (name === selectedSchema.name) continue;

    const otherMatches = matchFingerprints(fullText, schema);
    if (otherMatches.length >= schema.fingerprintMin) {
      return {
        passed: false,
        detectedType: name,
        failReason:
          'Dokumen terdeteksi sebagai "' +
          displayName(name) +
          '", bukan "' +
          displayName(selectedSchema.name) +
          '" yang dipilih.',
        matches: selectedMatches,
      };
    }
  }

  // Build dynamic list of known document types from registered schemas
  const knownTypes = (allSchemas instanceof Map ? [...allSchemas.keys()] : Object.keys(allSchemas))
    .map((n) => displayName(n))
    .join(', ');

  return {
    passed: false,
    detectedType: null,
    failReason:
      'Tipe dokumen tidak dikenali — dikenal: ' + knownTypes + '.',
    matches: selectedMatches,
  };
}
