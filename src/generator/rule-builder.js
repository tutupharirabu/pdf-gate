/**
 * @module generator/rule-builder
 * @description Converts detected field-value pairs into structured Rule
 *              objects per PRD §3.4 Schema shape.
 */

/**
 * Escape special regex characters in a string.
 *
 * @param {string} s
 * @returns {string}
 */
function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * Produce a short, unique, safe ID from a label.
 *
 * @param {string} label
 * @param {Map<string, number>} used
 * @returns {string}
 */
function makeId(label, used) {
  let base = label
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '_')
    .replace(/^_|_$/g, '')
    .substring(0, 20);

  if (!base) {
    base = 'field';
  }

  const count = used.get(base) || 0;
  used.set(base, count + 1);
  return count === 0 ? base : base + '_' + count;
}

/**
 * Build schema Rule objects from detected field-value pairs.
 *
 * Each rule gets a RegExp pattern generated from the detected
 * field layout (colon, tabular, stacked, or header).
 *
 * @param {Array<{label: string, value: string, pattern: string, confidence: number}>} detectedPairs
 * @param {string} fullText
 * @param {string} name - Document/schema name.
 * @returns {{ rules: Array<{id: string, label: string, pattern: RegExp, required: boolean}>, warnings: string[] }}
 */
export function buildRules(detectedPairs, fullText, name) {
  const rules = [];
  const warnings = [];
  const usedIds = new Map();

  if (!Array.isArray(detectedPairs) || detectedPairs.length === 0) {
    warnings.push(
      'Tidak ada pasangan field-value terdeteksi — rules kosong.',
    );
    return { rules, warnings };
  }

  for (const pair of detectedPairs) {
    const escapedLabel = escapeRegex(pair.label);

    // Generate a regex pattern based on the pair's layout
    let patternStr;
    switch (pair.pattern) {
      case 'colon':
        // Matches "Label : value" with optional extra whitespace
        patternStr = escapedLabel + '\\s*:\\s*.+';
        break;
      case 'tabular':
        // Matches label followed by at least 2+ spaces then value
        patternStr = escapedLabel + '\\s{2,}.+';
        break;
      case 'stacked':
        // Matches label on one line, value on the next line
        patternStr = escapedLabel + '\\s*\\n\\s*.+';
        break;
      case 'header':
        // Matches the header line somewhere in the text
        patternStr = escapedLabel;
        break;
      default:
        patternStr = escapedLabel + '\\s*:\\s*.+';
    }

    rules.push({
      id: makeId(pair.label, usedIds),
      label: pair.label,
      pattern: new RegExp(patternStr, 'i'),
      required: true,
    });
  }

  if (rules.length < 3) {
    warnings.push(
      `Hanya ${rules.length} field terdeteksi — schema mungkin terlalu longgar.`,
    );
  }

  return { rules, warnings };
}
