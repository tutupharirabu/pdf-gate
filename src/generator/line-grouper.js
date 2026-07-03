/**
 * @module generator/line-grouper
 * @description Groups parsed PDF text items into logical lines by their
 *              Y-coordinate, with tolerance for slight vertical variations.
 */

/**
 * @typedef {Object} TextItem
 * @property {number} page
 * @property {number} x
 * @property {number} y
 * @property {number} width
 * @property {number} height
 * @property {string} str
 */

/**
 * @typedef {Object} GroupedLine
 * @property {number} page
 * @property {number} y
 * @property {TextItem[]} items
 * @property {string} fullText
 */

/**
 * Group text items into lines by Y-coordinate.
 *
 * @param {TextItem[]} textItems - Parsed PDF text items.
 * @param {number} [tolerance=2] - Y-axis grouping tolerance in points.
 * @returns {GroupedLine[]}
 */
export function groupTextByLines(textItems, tolerance = 2) {
  if (!Array.isArray(textItems) || textItems.length === 0) {
    return [];
  }

  // Partition by page
  const byPage = new Map();
  for (const item of textItems) {
    const page = item.page ?? 1;
    if (!byPage.has(page)) {
      byPage.set(page, []);
    }
    byPage.get(page).push(item);
  }

  const allLines = [];

  for (const [page, pageItems] of byPage) {
    // Sort by Y descending (top of page = higher Y in PDF coordinate space)
    const sorted = [...pageItems].sort((a, b) => b.y - a.y);

    const lines = [];
    for (const item of sorted) {
      let placed = false;
      for (const line of lines) {
        if (Math.abs(line.y - item.y) <= tolerance) {
          line.items.push(item);
          // Update Y to the weighted average
          line.y =
            (line.y * (line.items.length - 1) + item.y) / line.items.length;
          placed = true;
          break;
        }
      }
      if (!placed) {
        lines.push({ y: item.y, items: [item] });
      }
    }

    // Sort each line's items by X-coordinate (left to right)
    for (const line of lines) {
      line.items.sort((a, b) => a.x - b.x);
      line.page = page;
      line.fullText = line.items
        .map((it) => it.str)
        .join(' ')
        .trim();
      allLines.push(line);
    }
  }

  // Final sort: by page then by Y descending
  allLines.sort((a, b) => {
    if (a.page !== b.page) return a.page - b.page;
    return b.y - a.y;
  });

  return allLines;
}
