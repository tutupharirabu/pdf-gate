/**
 * @module layer1/heuristic
 * @description Gate 3 - Structural heuristic analysis.
 *              Validates word count, spatial text distribution,
 *              and detects layout anomalies that may indicate
 *              a scanned or non-standard document.
 *
 *              Per PRD 4.2 Gate 3 - Heuristic Analysis.
 */

/**
 * Compute the estimated page height from text items on a given page.
 * Uses the maximum (y + height) across items as the page height.
 * Falls back to 792 (standard US Letter) when no items exist.
 *
 * @param {Array<{y: number, page: number, height: number}>} textItems
 * @param {number} pageNum
 * @returns {number}
 */
function getPageHeight(textItems, pageNum) {
  let maxY = 0;
  for (const item of textItems) {
    if (item.page === pageNum) {
      const bottom = item.y + (item.height || 12);
      if (bottom > maxY) maxY = bottom;
    }
  }
  return maxY > 0 ? maxY : 792;
}

/**
 * Compute the standard deviation of an array of numbers.
 *
 * @param {number[]} values
 * @returns {number}
 */
function stdDev(values) {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sqDiffs = values.map((v) => (v - mean) ** 2);
  return Math.sqrt(sqDiffs.reduce((a, b) => a + b, 0) / values.length);
}

/**
 * Gate 3: Run structural heuristics on the extracted text.
 *
 * Checks performed:
 * 1. Word count must fall within schema.heuristics.minWords - maxWords.
 * 2. Spatial distribution: must have text in the top zone
 *    (normalised Y < 0.25) AND bottom zone (normalised Y > 0.75)
 *    on at least one page.
 * 3. Anomaly detection: if the standard deviation of normalised Y
 *    positions is below 0.05 with more than 20 words, flag as
 *    suspicious (possible scanned/image-only PDF with uniform
 *    OCR output).
 *
 * @param {string} fullText - Full extracted text from the PDF.
 * @param {Array<{y: number, page: number, height: number}>} textItems -
 *   Array of text items with spatial metadata.
 * @param {import('../types.js').Schema} schema - Active schema.
 * @returns {{
 *   passed: boolean,
 *   wordCount: number,
 *   flags: string[],
 *   failReason: string | null
 * }}
 */
export function runHeuristics(fullText, textItems, schema) {
  const flags = [];
  const { minWords, maxWords } = schema.heuristics;

  // ------------------------------------------------------------------
  // 1. Word count check
  // ------------------------------------------------------------------
  const words = fullText.trim().split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  if (wordCount < minWords || wordCount > maxWords) {
    return {
      passed: false,
      wordCount,
      flags,
      failReason:
        `Jumlah kata (${wordCount}) di luar rentang yang diharapkan ` +
        `(${minWords}-${maxWords}).`,
    };
  }

  // ------------------------------------------------------------------
  // 2. Spatial distribution check (per-page normalised Y zones)
  // ------------------------------------------------------------------
  // Collect page numbers present in textItems.
  const pages = new Set(textItems.map((t) => t.page));
  let hasTopZone = false;
  let hasBottomZone = false;
  const allNormalizedY = [];

  for (const pageNum of pages) {
    const pageHeight = getPageHeight(textItems, pageNum);
    const pageItems = textItems.filter((t) => t.page === pageNum);

    for (const item of pageItems) {
      const yNorm = item.y / pageHeight;
      allNormalizedY.push(yNorm);

      if (yNorm < 0.25) hasTopZone = true;
      if (yNorm > 0.75) hasBottomZone = true;
    }
  }

  if (!hasTopZone || !hasBottomZone) {
    const missing = [];
    if (!hasTopZone) missing.push('atas (Y < 0.25)');
    if (!hasBottomZone) missing.push('bawah (Y > 0.75)');
    return {
      passed: false,
      wordCount,
      flags,
      failReason:
        `Distribusi teks spasial tidak valid - tidak ditemukan teks di zona ${missing.join(' dan ')}.`,
    };
  }

  // ------------------------------------------------------------------
  // 3. Anomaly detection - suspiciously uniform Y distribution
  // ------------------------------------------------------------------
  if (allNormalizedY.length > 20) {
    const sd = stdDev(allNormalizedY);
    if (sd < 0.05) {
      flags.push(
        'Distribusi Y mencurigakan seragam (stdDev=' +
          sd.toFixed(4) +
          ') - kemungkinan hasil scan/OCR.',
      );
    }
  }

  return {
    passed: true,
    wordCount,
    flags,
    failReason: null,
  };
}
