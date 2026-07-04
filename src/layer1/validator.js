/**
 * @module layer1/validator
 * @description Gate 4 - Field-level rule validation.
 *              Iterates every rule in the schema and tests its
 *              regex pattern against the full extracted PDF text.
 *              Required rules that fail cause Layer 1 to fail;
 *              optional rules produce warnings (flags) but do
 *              not block.
 *
 *              Per PRD 4.2 Gate 4 - Field Validation.
 *
 *              **Security hardened**: ReDoS protection via
 *              per-regex loop-based timeouts, match-count limits,
 *              input size caps, and malicious pattern detection.
 *              Best-effort — full ReDoS isolation requires Worker threads.
 */

// ── Security Constants ─────────────────────────────────────────────────────────

/** @const {number} Maximum wall-clock time per regex execution (ms). */
const MAX_EXEC_TIME = 5000;

/** @const {number} Maximum number of matches before aborting a regex. */
const SAFE_MATCH_LIMIT = 100;

/** @const {number} Maximum input text size before skipping regex (1 MB). */
const MAX_INPUT_SIZE = 1 * 1024 * 1024; // 1 MB

// ── Helpers ────────────────────────────────────────────────────────────────────

/**
 * Truncate a string to at most `maxLen` characters, appending
 * an ellipsis when truncation occurs.
 *
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen) {
  if (str.length <= maxLen) return str;
  return str.slice(0, maxLen - 1) + '…';
}

/**
 * Detect regex patterns that are likely vulnerable to
 * catastrophic backtracking (ReDoS).
 *
 * Flags patterns with nested quantifiers, e.g.:
 * - `(a+)+ — nested greedy quantifiers
 * - `(a*)*`  — nested star quantifiers
 * - `(a+)*`  — mixed nested quantifiers
 *
 * @param {RegExp|string} pattern - The regex pattern to inspect.
 * @returns {boolean} `true` if the pattern looks malicious.
 */
function isRegexMalicious(pattern) {
  try {
    const src = typeof pattern === 'string' ? pattern : pattern.source;
    return /\([^)]*[+*][^)]*\)[+*]/.test(src);
  } catch (_err) {
    return true;
  }
}

/**
 * Execute a regex against input with ReDoS protection.
 * Wraps each `regex.exec()` call with a wall-clock timeout guard
 * and a match-count limit.
 *
 * @param {RegExp} regex - The regex to execute.
 * @param {string} input - The text to search.
 * @returns {{ match: RegExpExecArray|null, timedOut: boolean, error: string|null }}
 */
function safeExec(regex, input) {
  const startTime = Date.now();
  let timedOut = false;
  let match = null;

  let safeRegex;
  try {
    safeRegex = new RegExp(regex.source, regex.flags);
    safeRegex.lastIndex = 0;
  } catch (err) {
    return { match: null, timedOut: false, error: 'Invalid regex: ' + err.message };
  }

  try {
    let iterations = 0;
    let stepMatch;

    // Loop-based execution with timeout checks BETWEEN exec calls.
    // For global/sticky regexes, this provides real protection against
    // excessive match counts. For non-global single-exec regexes, the
    // isRegexMalicious() pre-check (nested-quantifier detection) is
    // the primary defense for single-exec catastrophic backtracking.
    while ((stepMatch = safeRegex.exec(input)) !== null) {
      iterations++;
      match = stepMatch;

      // Match-count limit: abort if too many matches
      if (iterations >= SAFE_MATCH_LIMIT) {
        timedOut = true;
        match = null;
        break;
      }

      // Wall-clock timeout: abort if execution takes too long
      if (Date.now() - startTime > MAX_EXEC_TIME) {
        timedOut = true;
        match = null;
        break;
      }

      // Prevent infinite loop on zero-length matches
      if (stepMatch[0].length === 0) {
        safeRegex.lastIndex++;
        if (safeRegex.lastIndex > input.length) break;
      }

      // Non-global/sticky regexes only need one match
      if (!safeRegex.global && !safeRegex.sticky) break;
    }

    // Final timeout check
    if (!timedOut && Date.now() - startTime > MAX_EXEC_TIME) {
      timedOut = true;
      match = null;
    }
  } catch (err) {
    return { match: null, timedOut: false, error: err.message };
  }

  return { match, timedOut, error: null };
}

/**
 * @typedef {object} RuleResult
 * @property {string}  id       - Rule identifier from the schema.
 * @property {string}  label    - Human-readable rule label.
 * @property {boolean} required - Whether this rule is mandatory.
 * @property {boolean} passed   - Whether the pattern matched.
 * @property {string}  found    - Up-to-80-char snippet of the
 *                                matched text, or empty string.
 */

/**
 * Gate 4: Validate all schema rules against the extracted text.
 *
 * Each rule's `pattern` (a RegExp) is tested via `regex.exec()`.
 * If a **required** rule does not match, the gate fails and
 * `failReason` lists every missing required label. Optional
 * rules that miss are noted in the per-rule result but do not
 * cause the gate to fail.
 *
 * @param {string} fullText - Full extracted text from the PDF.
 * @param {import('../types.js').Schema} schema - Active schema
 *   whose `rules` array will be evaluated.
 * @returns {{
 *   passed: boolean,
 *   rules: RuleResult[],
 *   failReason: string | null
 * }}
 */
export function validateFields(fullText, schema) {
  /** @type {RuleResult[]} */
  const rules = [];
  const missingRequired = [];

  // ── Input size cap ──────────────────────────────────────────────
  if (fullText.length > MAX_INPUT_SIZE) {
    return {
      passed: false,
      rules,
      failReason:
        `Teks PDF terlalu besar (${(fullText.length / 1024).toFixed(0)} KB) ` +
        `melebihi batas ${MAX_INPUT_SIZE / 1024} KB. Validasi regex dilewati demi keamanan.`,
    };
  }

  for (const rule of schema.rules) {
    // ── Malicious pattern detection ──────────────────────────────
    if (isRegexMalicious(rule.pattern)) {
      rules.push({
        id: rule.id,
        label: rule.label,
        required: rule.required,
        passed: false,
        found: '',
      });

      if (rule.required) {
        missingRequired.push(`${rule.label} (pola regex mencurigakan)`);
      }
      continue;
    }

    // ── ReDoS-protected execution ────────────────────────────────
    const { match, timedOut, error } = safeExec(rule.pattern, fullText);

    if (error) {
      rules.push({
        id: rule.id,
        label: rule.label,
        required: rule.required,
        passed: false,
        found: '',
      });

      if (rule.required) {
        missingRequired.push(`${rule.label} (error: ${error})`);
      }
      continue;
    }

    if (timedOut) {
      rules.push({
        id: rule.id,
        label: rule.label,
        required: rule.required,
        passed: false,
        found: '',
      });

      if (rule.required) {
        missingRequired.push(`${rule.label} (timeout — regex terlalu lambat)`);
      }
      continue;
    }

    const passed = match !== null;
    const found = passed ? truncate(match[0], 80) : '';

    rules.push({
      id: rule.id,
      label: rule.label,
      required: rule.required,
      passed,
      found,
    });

    if (!passed && rule.required) {
      missingRequired.push(rule.label);
    }
  }

  if (missingRequired.length > 0) {
    return {
      passed: false,
      rules,
      failReason:
        'Kolom wajib tidak ditemukan: ' + missingRequired.join(', '),
    };
  }

  return {
    passed: true,
    rules,
    failReason: null,
  };
}
