/**
 * @module generator
 * @description Schema Generator orchestrator. Takes a PDF template buffer,
 *              parses it, detects field-value pairs, builds rules,
 *              extracts fingerprints, estimates heuristics, and
 *              calculates a confidence score — producing a complete
 *              Schema object per PRD §3.4.
 *
 *              The generated schema can be used directly with
 *              validatePDF() after registration via registerSchema().
 */

import { parsePdf } from '../utils/pdf-parser.js';
import { groupTextByLines } from './line-grouper.js';
import { detectFieldValuePairs } from './field-detector.js';
import { buildRules } from './rule-builder.js';
import { extractFingerprints } from './fingerprint-extractor.js';
import { calculateConfidence } from './confidence-scorer.js';

/**
 * Count words in text for heuristic estimation.
 *
 * @param {string} text
 * @returns {number}
 */
function countWords(text) {
  const matches = (text || '').match(/\b\w+\b/g);
  return matches ? matches.length : 0;
}

/**
 * Generate a complete Schema from a PDF template buffer.
 *
 * The engine automatically:
 * - Groups text by Y-coordinate into lines
 * - Detects field-value pairs using 4 layout patterns
 * - Builds validation rules from detected fields
 * - Extracts unique fingerprints for document type detection
 * - Estimates word-count heuristics with ±30% tolerance
 * - Calculates a confidence score (0-1)
 *
 * @param {Buffer|Uint8Array} pdfBuffer - Raw PDF bytes of the template
 * @param {{ name: string, label: string, hintFingerprints?: RegExp[] }} options
 * @returns {Promise<{ schema: import('../types.js').Schema, confidence: number, detectedFields: string[], warnings: string[] }>}
 */
export async function generateSchema(pdfBuffer, options = {}) {
  const t0 = performance.now();
  const warnings = [];

  const {
    name = 'untitled',
    label = 'Untitled Schema',
    hintFingerprints = [],
  } = options;

  if (!name || typeof name !== 'string') {
    throw new TypeError('options.name wajib diisi (string).');
  }

  // Step 1: Parse PDF using our pdfjs-dist wrapper
  let fullText, items;
  try {
    const parsed = await parsePdf(pdfBuffer);
    fullText = parsed.fullText;
    items = parsed.items;
  } catch (err) {
    return {
      schema: null,
      confidence: 0,
      detectedFields: [],
      warnings: [`Gagal mem-parsing PDF: ${err.message}`],
    };
  }

  if (!fullText || fullText.trim().length === 0) {
    return {
      schema: null,
      confidence: 0,
      detectedFields: [],
      warnings: ['PDF tidak memiliki teks — tidak dapat menghasilkan schema. Gunakan PDF digital.']
    };
  }

  // Step 2: Group lines by Y-coordinate
  const lines = groupTextByLines(items, 2);

  // Step 3: Detect field-value pairs (4 layout patterns)
  const detectedPairs = detectFieldValuePairs(lines, fullText);

  if (detectedPairs.length === 0) {
    warnings.push('Tidak ada field terdeteksi. Schema mungkin perlu dibuat manual.');
  }

  // Step 4: Build rules from detected fields
  const { rules, warnings: ruleWarnings } = buildRules(
    detectedPairs,
    fullText,
    name,
  );
  warnings.push(...ruleWarnings);

  // Step 5: Extract unique fingerprints
  const fingerprints = extractFingerprints(
    fullText,
    lines,
    hintFingerprints,
  );

  // Step 6: Estimate heuristics (word count with ±30% tolerance)
  const wordCount = countWords(fullText);
  const minWords = Math.max(1, Math.round(wordCount * 0.7));
  const maxWords = Math.round(wordCount * 1.3);

  // Step 7: Calculate confidence score
  const confidenceResult = calculateConfidence(
    detectedPairs,
    lines.length,
    fullText,
    { rules },
  );
  const { confidence } = confidenceResult;
  if (confidenceResult.warnings) {
    warnings.push(...confidenceResult.warnings);
  }

  // Build schema object per PRD §3.4 shape
  const fingerprintMin = Math.max(1, Math.min(2, fingerprints.length));

  const schema = {
    name,
    label: label || name,
    fingerprints: fingerprints.length > 0 ? fingerprints : [/dokumen/i],
    fingerprintMin,
    heuristics: {
      minWords,
      maxWords,
    },
    rules: rules.length > 0 ? rules : [
      { id: 'placeholder', label: 'Placeholder', pattern: /dokumen/i, required: false }
    ],
  };

  const detectedFields = detectedPairs.map((p) => p.label);

  if (confidence < 0.6) {
    warnings.push('Confidence rendah (< 0.6) — schema perlu review manual sebelum digunakan.');
  }

  const durationMs = Math.round((performance.now() - t0) * 100) / 100;

  return { schema, confidence, detectedFields, warnings, durationMs };
}
