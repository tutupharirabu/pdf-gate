/**
 * @module generator/confidence-scorer
 * @description Calculates a confidence score (0-1) for an auto-generated
 *              schema based on four weighted components:
 *              clarity (40%), coverage (30%), consistency (20%),
 *              structure (10%).
 */

/**
 * @typedef {import('./field-detector.js').DetectedPair} DetectedPair
 * @typedef {import('./rule-builder.js').Rule} Rule
 */

/**
 * Calculate confidence score and warnings for a generated schema.
 *
 * @param {DetectedPair[]} detectedFields
 * @param {number} totalLines
 * @param {string} allText
 * @param {{ rules: Rule[] }} finalSchema
 * @returns {{ confidence: number, warnings: string[] }}
 */
export function calculateConfidence(
  detectedFields,
  totalLines,
  allText,
  finalSchema,
) {
  const warnings = [];
  const fieldCount = Array.isArray(detectedFields)
    ? detectedFields.length
    : 0;
  const text = allText || '';

  // ----- 1. Clarity score (40%) -----
  // What % of detected fields have clear separator patterns?
  let clarityScore = 0;
  if (fieldCount > 0) {
    const highConfidence = detectedFields.filter(
      (f) => f.confidence >= 0.8,
    ).length;
    clarityScore = highConfidence / fieldCount;
  }

  // ----- 2. Coverage score (30%) -----
  // What % of document text is captured by detected field values?
  let coverageScore = 0;
  if (fieldCount > 0 && text.length > 0) {
    let capturedChars = 0;
    for (const field of detectedFields) {
      capturedChars += (field.value || '').length;
    }
    // Normalize: if captured exceeds text length, cap at 1.0
    coverageScore = Math.min(1, capturedChars / text.length);
  }

  // ----- 3. Consistency score (20%) -----
  // How consistent is the format across detected fields?
  let consistencyScore = 0;
  if (fieldCount >= 2) {
    const patternCounts = { colon: 0, tabular: 0, stacked: 0, header: 0 };
    for (const field of detectedFields) {
      const p = field.pattern;
      if (patternCounts[p] !== undefined) {
        patternCounts[p]++;
      }
    }
    // The more one pattern dominates, the more consistent
    const maxCount = Math.max(...Object.values(patternCounts));
    consistencyScore = maxCount / fieldCount;
  } else if (fieldCount === 1) {
    consistencyScore = 0.5; // neutral for a single field
  }

  // ----- 4. Structure score (10%) -----
  // How many of the 4 layout patterns were detected?
  let structureScore = 0;
  if (fieldCount > 0) {
    const patternsSeen = new Set(detectedFields.map((f) => f.pattern));
    structureScore = patternsSeen.size / 4; // max 4 patterns
  }

  // ----- Weighted combination -----
  const confidence =
    clarityScore * 0.4 +
    coverageScore * 0.3 +
    consistencyScore * 0.2 +
    structureScore * 0.1;

  const rounded = Math.round(confidence * 100) / 100;

  // ----- Warnings -----
  if (rounded < 0.6) {
    warnings.push(
      'Confidence score rendah (' + rounded + ') \u2014 schema mungkin perlu ditinjau manual.',
    );
  }

  if (fieldCount < 3) {
    warnings.push(
      'Hanya ' + fieldCount + ' field terdeteksi \u2014 struktur dokumen mungkin tidak standar.',
    );
  }

  if (totalLines < 5) {
    warnings.push(
      'Dokumen sangat pendek \u2014 hasil deteksi mungkin tidak representatif.',
    );
  }

  return { confidence: rounded, warnings };
}
