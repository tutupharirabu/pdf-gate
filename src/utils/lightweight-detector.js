/**
 * @module pdf-gate/utils/lightweight-detector
 * @description Lightweight PDF text extractor using only Node.js built-ins.
 *              Used as a fast fallback when pdfjs-dist is unavailable or fails.
 *              Parses ~90% of basic PDFs without the 2MB pdfjs-dist overhead.
 *
 *              Strategy:
 *                1. Locate text blocks between BT / ET markers.
 *                2. Decompress FlateDecode streams via zlib when possible.
 *                3. Extract page count from the catalog / page-tree.
 *
 * @license MIT
 */

import { inflateSync } from 'node:zlib';

// ── Constants ──────────────────────────────────────────────────────────────────

const BT = 0x42_54; // 'BT'
const ET = 0x45_54; // 'ET'
const STREAM = 0x73_74_72_65_61_6d; // 'stream'
const ENDSTREAM = 0x65_6e_64_73_74_72_65_61_6d; // 'endstream'

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Find all byte offsets of a substring within a Buffer.
 * @param {Buffer} buf
 * @param {string|Buffer} needle
 * @returns {number[]}
 */
function indexOfAll(buf, needle) {
  const n = typeof needle === 'string' ? Buffer.from(needle) : needle;
  const offsets = [];
  let pos = 0;
  while (pos < buf.length) {
    const idx = buf.indexOf(n, pos);
    if (idx === -1) break;
    offsets.push(idx);
    pos = idx + 1;
  }
  return offsets;
}

/**
 * Find the byte offset of a pattern AFTER a given position.
 * @param {Buffer} buf
 * @param {string|Buffer} needle
 * @param {number} after
 * @returns {number} -1 if not found
 */
function indexOfAfter(buf, needle, after) {
  const n = typeof needle === 'string' ? Buffer.from(needle) : needle;
  return buf.indexOf(n, after);
}

/**
 * Try to decompress a FlateDecode stream.
 * @param {Buffer} raw - raw bytes between 'stream' and 'endstream'
 * @returns {Buffer} decompressed content, or raw if decompression fails
 */
function tryDecompress(raw) {
  // Strip leading whitespace / CRLF after 'stream' keyword
  let data = raw;
  while (data.length > 0 && (data[0] === 0x0a || data[0] === 0x0d || data[0] === 0x20)) {
    data = data.subarray(1);
  }
  // Strip trailing whitespace / CRLF before 'endstream'
  while (data.length > 0 && (data[data.length - 1] === 0x0a || data[data.length - 1] === 0x0d || data[data.length - 1] === 0x20)) {
    data = data.subarray(0, -1);
  }

  try {
    return inflateSync(data);
  } catch {
    return data; // not compressed or unsupported — return as-is
  }
}

/**
 * Extract all text from BT…ET blocks in a buffer.
 * Handles PDF string escaping and Tj/TJ operators.
 * @param {Buffer} buf
 * @returns {string}
 */
function extractTextFromContent(buf) {
  const text = buf.toString('latin1');
  const fragments = [];

  // Find all BT…ET pairs
  let i = 0;
  while (i < text.length) {
    const btIdx = text.indexOf('BT', i);
    if (btIdx === -1) break;
    const etIdx = text.indexOf('ET', btIdx + 2);
    if (etIdx === -1) break;

    const block = text.substring(btIdx + 2, etIdx);
    i = etIdx + 2;

    // Extract text from Tj operator:  (string) Tj
    const tjPattern = /\(([^)]*)\)\s*Tj/g;
    let m;
    while ((m = tjPattern.exec(block)) !== null) {
      const raw = unescapePDFString(m[1]);
      if (raw.trim()) fragments.push(raw);
    }

    // Extract text from TJ operator:  [(string) num (string) ...] TJ
    const tjArrayPattern = /\[([^\]]*)\]\s*TJ/g;
    while ((m = tjArrayPattern.exec(block)) !== null) {
      const inner = m[1];
      const strPattern = /\(([^)]*)\)/g;
      let sm;
      while ((sm = strPattern.exec(inner)) !== null) {
        const raw = unescapePDFString(sm[1]);
        if (raw.trim()) fragments.push(raw);
      }
    }
  }

  return fragments.join('\n');
}

/**
 * Unescape common PDF string escapes.
 * @param {string} s
 * @returns {string}
 */
function unescapePDFString(s) {
  return s
    .replace(/\\([nrtbf()\\])/g, (_, c) => {
      switch (c) {
        case 'n': return '\n';
        case 'r': return '\r';
        case 't': return '\t';
        case 'b': return '\b';
        case 'f': return '\f';
        default: return c;
      }
    })
    .replace(/\\(\d{1,3})/g, (_, octal) => String.fromCharCode(parseInt(octal, 8)));
}

/**
 * Count pages from the PDF catalog by counting /Type /Page entries.
 * Falls back to counting /Page object references.
 * @param {Buffer} buf
 * @returns {number}
 */
function countPages(buf) {
  const text = buf.toString('latin1');

  // Method 1: count /Type /Page (without /Parent — to avoid Page Tree nodes)
  const pagePattern = /\/Type\s*\/Page[^s]/g;
  const matches = text.match(pagePattern);
  if (matches) return matches.length;

  // Method 2: count /Pages with Kids references (rough estimate)
  const pagesPattern = /\/Type\s*\/Pages/g;
  const pagesMatches = text.match(pagesPattern);
  if (pagesMatches) {
    // Try to parse the Kids array count
    const kidsPattern = /\/Kids\s*\[([^\]]*)\]/g;
    let totalKids = 0;
    let m;
    while ((m = kidsPattern.exec(text)) !== null) {
      const refs = m[1].match(/\d+\s+\d+\s+R/g);
      if (refs) totalKids += refs.length;
    }
    if (totalKids > 0) return totalKids;
  }

  return 1;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Lightweight PDF text extraction without external dependencies.
 *
 * @param {Buffer} pdfBuffer - raw PDF file bytes
 * @returns {{ fullText: string, pageCount: number }}
 */
export function lightweightTextExtract(pdfBuffer) {
  // Quick sanity: check PDF header
  const header = pdfBuffer.toString('latin1', 0, 5);
  if (!header.startsWith('%PDF')) {
    return { fullText: '', pageCount: 0 };
  }

  // Collect all stream content (decompressed where possible)
  const streamStarts = indexOfAll(pdfBuffer, 'stream\n');
  // Also check for 'stream\r\n'
  const streamStartsCR = indexOfAll(pdfBuffer, 'stream\r\n');
  const allStarts = [...streamStarts, ...streamStartsCR].sort((a, b) => a - b);

  const decompressedBuffers = [];

  for (const start of allStarts) {
    // Find the end of 'stream' keyword
    let dataStart = start + 6; // 'stream' is 6 chars
    // Handle 'stream\r\n' (7 chars)
    if (pdfBuffer[start + 6] === 0x0d) dataStart = start + 8;

    const endIdx = indexOfAfter(pdfBuffer, 'endstream', dataStart);
    if (endIdx === -1) continue;

    const raw = pdfBuffer.subarray(dataStart, endIdx);
    const decompressed = tryDecompress(raw);
    decompressedBuffers.push(decompressed);
  }

  // Extract text from each decompressed stream
  const allText = decompressedBuffers
    .map(buf => extractTextFromContent(buf))
    .filter(t => t.length > 0)
    .join('\n');

  // Also extract text from the main body (non-stream content)
  const bodyText = extractTextFromContent(pdfBuffer);

  const fullText = [bodyText, allText].filter(Boolean).join('\n');
  const pageCount = countPages(pdfBuffer);

  return { fullText, pageCount };
}

export default lightweightTextExtract;
