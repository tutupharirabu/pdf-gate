/**
 * @module utils/pattern-parser
 * @description Converts string patterns into RegExp instances.
 *
 *              Supports two input formats:
 *              1. `/pattern/flags`  – classic slash-delimited regex literal.
 *              2. Plain string       – auto-wrapped as case-insensitive regex.
 *
 *              Export: `parsePattern(string)` → RegExp
 *                       `escapeRegex(string)`  → string
 */

/**
 * Supported regex flags as a frozen Set for validation.
 * @type {Set<string>}
 */
const VALID_FLAGS = new Set(['i', 'g', 'm', 's', 'u', 'y', 'd', 'v']);

/**
 * Regex that detects the `/pattern/flags` format.
 * Group 1 → pattern body, Group 2 → flags.
 */
const SLASH_REGEX_PATTERN = /^\/(.+)\/([a-z]*)$/s;

/**
 * Parse a string representation into a `RegExp`.
 *
 * **Input formats:**
 * - `/pattern/flags`  — e.g. `"/ijazah|diploma/gi"`
 * - Plain string      — e.g. `"Nama Lengkap"` → `/Nama Lengkap/i`
 *
 * @param {string} raw – The raw pattern string.
 * @returns {RegExp}
 * @throws {SyntaxError} When the regex body or flags are invalid.
 *
 * @example
 * // slash-delimited
 * parsePattern('/hello world/i');   // → /hello world/i
 *
 * @example
 * // plain string (auto case-insensitive)
 * parsePattern('Universitas Indonesia'); // → /Universitas Indonesia/i
 */
export function parsePattern(raw) {
  if (typeof raw !== 'string') {
    throw new SyntaxError(
      `Pattern must be a string, received ${typeof raw}`,
    );
  }

  const trimmed = raw.trim();
  if (trimmed.length === 0) {
    throw new SyntaxError('Pattern string must not be empty');
  }

  // ------------------------------------------------------------------
  // 1. Try `/pattern/flags` format
  // ------------------------------------------------------------------
  const slashMatch = trimmed.match(SLASH_REGEX_PATTERN);
  if (slashMatch) {
    const [, body, flags] = slashMatch;

    // Validate flags.
    for (const flag of flags) {
      if (!VALID_FLAGS.has(flag)) {
        throw new SyntaxError(
          `Invalid regex flag "${flag}" in pattern "${trimmed}"`,
        );
      }
    }

    try {
      return new RegExp(body, flags);
    } catch (err) {
      throw new SyntaxError(
        `Invalid regex body in pattern "${trimmed}": ${err.message}`,
      );
    }
  }

  // ------------------------------------------------------------------
  // 2. Plain string → auto-wrap with case-insensitive flag
  // ------------------------------------------------------------------
  try {
    return new RegExp(escapeRegex(trimmed), 'i');
  } catch (err) {
    throw new SyntaxError(
      `Failed to compile pattern "${trimmed}": ${err.message}`,
    );
  }
}

/**
 * Escape a string so it can be used as a literal inside a `RegExp`.
 * Escapes: `. * + ? ^ $ { } ( ) | [ ] \\`
 *
 * @param {string} str
 * @returns {string}
 *
 * @example
 * escapeRegex('3.14 [USD]'); // → '3\\.14 \\[USD\]'
 */
export function escapeRegex(str) {
  if (typeof str !== 'string') {
    return '';
  }
  // Escapes every character that has special meaning in a regex.
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
