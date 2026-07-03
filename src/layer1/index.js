/**
 * @module layer1
 * @description Layer 1 orchestrator - Content sanity check.
 *              Runs four sequential gates against the extracted
 *              PDF text and spatial metadata:
 *
 *              Gate 1: Empty / scan detection (inline)
 *              Gate 2: Fingerprint-based document type detection
 *              Gate 3: Structural heuristic analysis
 *              Gate 4: Field-level rule validation
 *
 *              If any gate fails, execution stops immediately
 *              and the failure is returned.  All timing is measured
 *              via `performance.now()`.
 *
 *              Per PRD 4.2 - Layer 1 Sanity Check Pipeline.
 *              Error messages verbatim from PRD 9.
 */

import { detectDocumentType } from './detector.js';
import { runHeuristics } from './heuristic.js';
import { validateFields } from './validator.js';

/**
 * Run the full Layer 1 sanity-check pipeline.
 *
 * Gates execute sequentially:
 * 1. Empty-text check (< 10 non-whitespace chars).
 * 2. Fingerprint detection (selected schema + cross-detection).
 * 3. Heuristic analysis (word count, spatial distribution, anomaly).
 * 4. Field-level rule validation.
 *
 * @param {string} fullText - Full extracted text from the PDF.
 * @param {Array<{y: number, page: number, height: number}>} textItems -
 *   Text items with spatial metadata for heuristic analysis.
 * @param {number} pageCount - Total number of pages in the PDF.
 * @param {import('../types.js').Schema} schema - The schema selected
 *   by the user for validation.
 * @param {Map<string, import('../types.js').Schema>|Object<string, import('../types.js').Schema>} allSchemas -
 *   Registry of all known schemas for cross-detection.
 * @returns {Promise<{
 *   passed: boolean,
 *   detectedType: string | null,
 *   failReason: string | null,
 *   rules: Array<{id: string, label: string, required: boolean, passed: boolean, found: string}>,
 *   heuristics: { passed: boolean, wordCount: number, flags: string[] },
 *   durationMs: number
 * }>}
 */
export async function runLayer1(
  fullText,
  textItems,
  pageCount,
  schema,
  allSchemas,
) {
  const t0 = performance.now();

  // Default empty structures for early-exit returns.
  const emptyRules = [];
  const emptyHeuristics = { passed: false, wordCount: 0, flags: [] };

  // ------------------------------------------------------------------
  // Gate 1: Empty / scan detection
  // ------------------------------------------------------------------
  if (!fullText || fullText.trim().length < 10) {
    return {
      passed: false,
      detectedType: null,
      failReason:
        'PDF tidak memiliki teks - kemungkinan hasil scan. ' +
        'Gunakan file PDF digital dari sistem penerbit.',
      rules: emptyRules,
      heuristics: emptyHeuristics,
      durationMs: performance.now() - t0,
    };
  }

  // ------------------------------------------------------------------
  // Gate 2: Fingerprint detection
  // ------------------------------------------------------------------
  const detection = detectDocumentType(fullText, schema, allSchemas);
  if (!detection.passed) {
    return {
      passed: false,
      detectedType: detection.detectedType,
      failReason: detection.failReason,
      rules: emptyRules,
      heuristics: emptyHeuristics,
      durationMs: performance.now() - t0,
    };
  }

  // ------------------------------------------------------------------
  // Gate 3: Heuristic analysis
  // ------------------------------------------------------------------
  const heuristics = runHeuristics(fullText, textItems, schema);
  if (!heuristics.passed) {
    return {
      passed: false,
      detectedType: detection.detectedType,
      failReason: heuristics.failReason,
      rules: emptyRules,
      heuristics: {
        passed: false,
        wordCount: heuristics.wordCount,
        flags: heuristics.flags,
      },
      durationMs: performance.now() - t0,
    };
  }

  // ------------------------------------------------------------------
  // Gate 4: Field validation
  // ------------------------------------------------------------------
  const validation = validateFields(fullText, schema);

  return {
    passed: validation.passed,
    detectedType: detection.detectedType,
    failReason: validation.failReason,
    rules: validation.rules,
    heuristics: {
      passed: heuristics.passed,
      wordCount: heuristics.wordCount,
      flags: heuristics.flags,
    },
    durationMs: performance.now() - t0,
  };
}
