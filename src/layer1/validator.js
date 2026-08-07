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
 *              Best-effort — full ReDoS isolation requires Worker threads,
 *              because a single catastrophic `exec()` cannot be interrupted
 *              from JavaScript; it is only detected (and reported as timed out)
 *              once it returns.
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
 * And alternation inside a group followed by a quantifier, e.g.:
 * - `(a|a)+` — ambiguous alternation, repeated
 * - `(a|aa)*` — varying-length alternatives, repeated
 *
 * @param {RegExp|string} pattern - The regex pattern to inspect.
 * @returns {boolean} `true` if the pattern looks malicious.
 */
export function isRegexMalicious(pattern) {
  try {
    const src = typeof pattern === 'string' ? pattern : pattern.source;

    // Single linear scan over the source. Tracks paren depth (via a
    // stack of per-group states) to detect nested quantifiers
    // ((a+)+, (a*)*, (a+)*) and alternation-inside-a-group followed
    // immediately by a quantifier ((a|a)+, (a|aa)*) WITHOUT running any
    // regex against the pattern itself, so the detector cannot be the
    // victim of the very ReDoS it exists to find.
    /** @type {Array<{hasQuantifier: boolean, hasAlternation: boolean}>} */
    const groupStack = [];
    let lastClosedGroupDangerous = false;
    let prevSignificant = '';

    for (let i = 0; i < src.length; i++) {
      const ch = src[i];

      if (ch === '\\') {
        // Escaped character (e.g. \( \) \* \|). The escaped char is
        // still a real token (e.g. `\s`, `\d`) that sits between a
        // closed group and any later quantifier, so it disarms the
        // "quantifier immediately after )" alarm.
        if (i + 1 < src.length) {
          prevSignificant = src[i + 1];
          lastClosedGroupDangerous = false;
          i++;
        }
        continue;
      }
      if (ch === '[') {
        // Skip character classes — quantifiers inside are literal
        while (i < src.length && src[i] !== ']') i++;
        continue;
      }
      if (ch === '(') {
        // A quantifier attached to the previous group (e.g. `(a|a)+`)
        // is the dangerous nested case
        if (lastClosedGroupDangerous) return true;
        lastClosedGroupDangerous = false;
        // Push a fresh state for this group; the parent's state stays
        // on the stack so alternations/quantifiers in one group never
        // leak into a nested group.
        groupStack.push({ hasQuantifier: false, hasAlternation: false });
        prevSignificant = ch;
        continue;
      }
      if (ch === ')') {
        const state = groupStack.pop();
        if (state === undefined) {
          // Unmatched `)` — treat as literal/benign
          prevSignificant = ch;
          continue;
        }
        prevSignificant = ch;
        // Mark whether THIS group (now closed) was dangerous —
        // a quantifier IMMEDIATELY following it triggers the alarm
        lastClosedGroupDangerous = state.hasAlternation || state.hasQuantifier;
        continue;
      }
      if (ch === '|') {
        const state = groupStack[groupStack.length - 1];
        if (state !== undefined) {
          state.hasAlternation = true;
          lastClosedGroupDangerous = false;
        }
        continue;
      }
      if (ch === '+' || ch === '*') {
        // Quantifier immediately after a dangerous group: (a|a)+, (a+)+
        if (lastClosedGroupDangerous) return true;
        const state = groupStack[groupStack.length - 1];
        if (state !== undefined) {
          // Remember the group contains a quantifier; the actual
          // danger is only when a quantifier lands on the group
          // itself (`(a+)+`), which the `lastClosedGroupDangerous`
          // check above catches at the group's closing paren.
          // A quantifier on a plain token inside an alternation
          // group (`(?:A|B\s+)`) is harmless, so no trigger here.
          state.hasQuantifier = true;
        }
        lastClosedGroupDangerous = false;
        continue;
      }
      if (ch === '{') {
        // Bounded quantifier {n}, {n,}, {n,m} — same semantics
        // as +/* for nesting purposes: (\d{2,})+ is catastrophic
        const end = src.indexOf('}', i + 1);
        if (end !== -1) {
          if (lastClosedGroupDangerous) return true;
          const state = groupStack[groupStack.length - 1];
          if (state !== undefined) state.hasQuantifier = true;
          lastClosedGroupDangerous = false;
          i = end;
        }
        continue;
      }
      if (ch !== ' ') {
        prevSignificant = ch;
        // Any ordinary character between a closed group and a
        // later quantifier (e.g. `(?:A|B)\s+`) disarms the alarm —
        // only a quantifier IMMEDIATELY after `)` is dangerous
        lastClosedGroupDangerous = false;
      }
    }
    return false;
  } catch (_err) {
    return true;
  }
}

/**
 * Execute a regex against input with ReDoS protection.
 * Wraps each `regex.exec()` call with a wall-clock timeout guard
 * and a match-count limit.
 *
 * **Isolation caveat:** the timeout is only enforced *between* exec() calls
 * and after the final exec() returns. A single catastrophic-backtracking
 * exec() on a non-global regex blocks the event loop until it completes;
 * it is then reported as `timedOut`. True isolation from hostile patterns
 * requires Worker threads.
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
    return { match: null, timedOut: false, error: 'Invalid regex: ' + (err instanceof Error ? err.message : String(err)) };
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
    return { match: null, timedOut: false, error: err instanceof Error ? err.message : String(err) };
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
