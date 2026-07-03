/**
 * @module generator/field-detector
 * @description Detects field-value pairs in grouped PDF text lines using
 *              four layout patterns common in Indonesian documents:
 *              colon-separated, tabular, stacked label-value, and
 *              header key-value.
 */

/**
 * @typedef {Object} DetectedPair
 * @property {string} label
 * @property {string} value
 * @property {'colon'|'tabular'|'stacked'|'header'} pattern
 * @property {number} confidence - 0 to 1
 */

/**
 * @typedef {import('./line-grouper.js').GroupedLine} GroupedLine
 */

const COLON_PATTERN_RE = /^(.+?)\s*:\s*(.+)$/;
const HEADER_LABEL_RE = /^[A-Z][A-Z\s]{2,}$/;
const TABULAR_GAP_THRESHOLD = 50; // points

/**
 * Detect field-value pairs from grouped lines and full text.
 *
 * @param {GroupedLine[]} lines
 * @param {string} fullText - The complete extracted document text.
 * @returns {DetectedPair[]}
 */
export function detectFieldValuePairs(lines, fullText) {
  const detected = [];
  const fullTextClean = fullText || '';

  if (!Array.isArray(lines) || lines.length === 0) {
    return detected;
  }

  // ---- Pattern A: Colon-separated on a single line ----
  for (const line of lines) {
    const txt = (line.fullText || '').trim();
    if (!txt) continue;
    const match = txt.match(COLON_PATTERN_RE);
    if (match) {
      const label = match[1].trim();
      const value = match[2].trim();
      if (label.length >= 2 && value.length >= 1) {
        detected.push({
          label,
          value,
          pattern: 'colon',
          confidence: 0.95,
        });
      }
    }
  }

  // ---- Pattern B: Tabular (two-column, left label / right value) ----
  for (const line of lines) {
    const items = line.items || [];
    if (items.length < 2) continue;

    // Look for a large horizontal gap between consecutive items
    for (let i = 0; i < items.length - 1; i++) {
      const a = items[i];
      const b = items[i + 1];
      const gap = b.x - (a.x + a.width);
      if (gap > TABULAR_GAP_THRESHOLD) {
        const label = a.str.trim();
        const rightItems = items.slice(i + 1);
        const value = rightItems.map((it) => it.str).join(' ').trim();
        if (label.length >= 1 && value.length >= 1) {
          // Avoid duplicating colon-detected entries
          const alreadyColon = detected.some(
            (d) =>
              (d.pattern === 'colon' &&
                d.label === label &&
                d.value.startsWith(value)) ||
              d.label === label,
          );
          if (!alreadyColon) {
            detected.push({
              label,
              value,
              pattern: 'tabular',
              confidence: 0.8,
            });
          }
        }
        break; // only one gap per line
      }
    }
  }

  // ---- Pattern C: Stacked label-value ----
  // Label line (ALL CAPS, short) followed immediately by a longer value line
  for (let i = 0; i < lines.length - 1; i++) {
    const thisLine = (lines[i].fullText || '').trim();
    const nextLine = (lines[i + 1].fullText || '').trim();

    if (
      thisLine.length >= 3 &&
      thisLine.length <= 60 &&
      HEADER_LABEL_RE.test(thisLine) &&
      nextLine.length > 1 &&
      lines[i].page === lines[i + 1].page
    ) {
      // Ensure the label isn't already captured
      const already = detected.some(
        (d) => d.label === thisLine || d.value === nextLine,
      );
      if (!already) {
        detected.push({
          label: thisLine,
          value: nextLine,
          pattern: 'stacked',
          confidence: 0.7,
        });
      }
    }
  }

  // ---- Pattern D: Header key-value ----
  // Geographic/institutional headers (e.g. "PEMERINTAH KOTA ...") followed
  // by colon-separated fields; the header itself becomes a pseudo-field.
  const headerLines = [];
  for (let i = 0; i < lines.length; i++) {
    const txt = (lines[i].fullText || '').trim();
    if (txt.length > 10 && txt === txt.toUpperCase() && !txt.includes(':')) {
      // Look ahead for colon-separated lines on same page
      const page = lines[i].page;
      let hasColonChild = false;
      for (let j = i + 1; j < lines.length && lines[j].page === page; j++) {
        if ((lines[j].fullText || '').includes(':')) {
          hasColonChild = true;
          break;
        }
      }
      if (hasColonChild) {
        headerLines.push({ index: i, page, text: txt });
      }
    }
  }

  for (const hdr of headerLines) {
    const already = detected.some((d) => d.label === hdr.text);
    if (!already) {
      detected.push({
        label: hdr.text,
        value: fullTextClean.substring(
          0,
          Math.min(fullTextClean.length, 200),
        ),
        pattern: 'header',
        confidence: 0.6,
      });
    }
  }

  return detected;
}
