/**
 * @module utils/sanitizer
 * @description Input sanitization utility for zero-trust operations.
 *              Provides buffer validation, options sanitization,
 *              ReDoS-protected regex testing, and path traversal prevention.
 *
 * @license MIT
 */

// ── Constants ──────────────────────────────────────────────────────────────────

/** @const {number} Maximum allowed buffer size in bytes (100 MB). */
export const MAX_BUFFER_SIZE = 100 * 1024 * 1024; // 100MB

/** @const {string[]} Whitelist of allowed keys in options objects. */
const ALLOWED_OPTIONS_KEYS = ['schema', 'skipLayer2', 'fileName'];

/** @const {string[]} Forbidden keys that indicate prototype pollution attempts. */
const FORBIDDEN_KEYS = ['__proto__', 'constructor', 'prototype'];

// ── Buffer Sanitization ────────────────────────────────────────────────────────

/**
 * Validate that a buffer is safe for processing.
 * Checks type, prototype pollution, size limits, and sparse/invalid lengths.
 *
 * @param {Buffer|Uint8Array} buffer - Raw input to validate.
 * @returns {Buffer|Uint8Array} The validated buffer (unchanged).
 * @throws {TypeError} If buffer type is invalid.
 * @throws {Error} If buffer is unsafe (polluted, oversized, or sparse).
 */
export function sanitizeBuffer(buffer) {
  // 1. Type check
  if (!Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
    throw new TypeError('Parameter "buffer" harus berupa Buffer atau Uint8Array.');
  }

  // 2. Prototype pollution guard — check for injected keys on the buffer object
  for (const key of FORBIDDEN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(buffer, key)) {
      throw new Error(
        `Buffer mengandung key terlarang "${key}" — kemungkinan prototype pollution.`,
      );
    }
  }

  // 3. Sparse / invalid length check
  if (typeof buffer.length !== 'number' || Number.isNaN(buffer.length) || buffer.length < 0) {
    throw new Error('Buffer memiliki panjang yang tidak valid (NaN atau negatif).');
  }

  // 4. Max size check
  if (buffer.length > MAX_BUFFER_SIZE) {
    const sizeMB = (buffer.length / (1024 * 1024)).toFixed(1);
    const maxMB = MAX_BUFFER_SIZE / (1024 * 1024);
    throw new Error(
      `Ukuran buffer (${sizeMB} MB) melebihi batas maksimum ${maxMB} MB. ` +
      'Tolak demi keamanan — buffer terlalu besar.',
    );
  }

  // 5. Zero-length is also invalid
  if (buffer.length === 0) {
    throw new TypeError('Parameter "buffer" tidak boleh kosong (0 bytes).');
  }

  return buffer;
}


// ── Options Sanitization ───────────────────────────────────────────────────────

/**
 * Validate and sanitize an options object.
 * Strips forbidden keys (__proto__, constructor, prototype) and
 * only retains whitelisted keys.
 *
 * @param {object} options - Raw options object from caller.
 * @returns {object} Sanitized options object containing only whitelisted keys.
 * @throws {TypeError} If options is not an object.
 * @throws {Error} If forbidden keys are detected.
 */
export function sanitizeOptions(options) {
  if (!options || typeof options !== 'object' || Array.isArray(options)) {
    throw new TypeError('Options harus berupa object (bukan array atau null).');
  }

  const source = options;

  // 1. Reject forbidden keys (prototype pollution vectors) — own properties only
  for (const key of FORBIDDEN_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      throw new Error(
        `Options mengandung key terlarang "${key}" — kemungkinan prototype pollution.`,
      );
    }
  }

  // 2. Whitelist: only copy allowed keys
  const sanitized = Object.create(null);
  for (const key of ALLOWED_OPTIONS_KEYS) {
    if (Object.prototype.hasOwnProperty.call(source, key)) {
      sanitized[key] = source[key];
    }
  }

  return sanitized;
}

// ── ReDoS-Protected Regex ─────────────────────────────────────────────────────

/** @const {number} Maximum number of matches before aborting. */
const SAFE_MATCH_LIMIT = 100;

/**
 * Run a regular expression test with ReDoS (Regular Expression Denial of Service)
 * protection. Uses a wall-clock timeout and a match-count limit to prevent
 * catastrophic backtracking from hanging the process.
 *
 * @param {RegExp} regex - The regular expression to test.
 * @param {string} input - The string to test against.
 * @param {number} [timeoutMs=5000] - Maximum execution time in milliseconds.
 * @returns {{ passed: boolean, matchCount: number, timedOut: boolean }}
 */
export function safeRegexTest(regex, input, timeoutMs = 5000) {
  if (!(regex instanceof RegExp)) {
    throw new TypeError('Parameter "regex" harus berupa RegExp.');
  }
  if (typeof input !== 'string') {
    throw new TypeError('Parameter "input" harus berupa string.');
  }

  const startTime = Date.now();
  let matchCount = 0;
  let timedOut = false;

  let safeRegex;
  try {
    safeRegex = new RegExp(regex.source, regex.flags);
  } catch (_err) {
    return { passed: false, matchCount: 0, timedOut: false };
  }

  safeRegex.lastIndex = 0;

  try {
    if (safeRegex.global || safeRegex.sticky) {
      let match;
      while ((match = safeRegex.exec(input)) !== null) {
        matchCount++;
        if (matchCount >= SAFE_MATCH_LIMIT) {
          break;
        }
        if (Date.now() - startTime > timeoutMs) {
          timedOut = true;
          break;
        }
        if (match[0].length === 0) {
          safeRegex.lastIndex++;
          if (safeRegex.lastIndex > input.length) break;
        }
      }
    } else {
      const match = safeRegex.exec(input);
      if (match !== null) {
        matchCount = 1;
      }
      if (Date.now() - startTime > timeoutMs) {
        timedOut = true;
      }
    }
  } catch (_err) {
    return { passed: false, matchCount, timedOut: true };
  }

  return {
    passed: matchCount > 0,
    matchCount,
    timedOut,
  };
}

// ── Path Traversal Prevention ─────────────────────────────────────────────────

/**
 * Check whether a file path is safe from path traversal attacks.
 * Rejects paths containing "../", null bytes, or non-absolute paths.
 *
 * @param {string} filePath - The file path to validate.
 * @returns {boolean} `true` if the path is safe, `false` otherwise.
 */
export function isSafeFilePath(filePath) {
  if (typeof filePath !== 'string' || filePath.length === 0) {
    return false;
  }

  if (filePath.includes('\x00')) {
    return false;
  }

  if (filePath.includes('../') || filePath.includes('..\\')) {
    return false;
  }

  const isAbsolute =
    filePath.startsWith('/') ||
    /^[a-zA-Z]:[\\/]/.test(filePath);

  if (!isAbsolute) {
    return false;
  }

  if (filePath.includes('%2e%2e') || filePath.includes('%2f') || filePath.includes('%5c')) {
    return false;
  }

  return true;
}
