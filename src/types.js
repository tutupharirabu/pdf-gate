/**
 * @module types
 * @description Shared JSDoc type definitions for the pdf-gate package.
 *              These typedefs document the shape of objects flowing through
 *              the Layer 1 (content sanity), Layer 2 (cryptographic signature)
 *              pipeline, and the schema/heuristic configuration system.
 */

// NOTE: This file contains only JSDoc @typedef declarations.
// It has no runtime exports — it serves as the canonical type reference.

/**
 * @typedef {object} ValidationResult
 * @description Top-level result returned by `validate()`.
 * @property {boolean}   valid              – Overall validity (true only when both layers pass).
 * @property {Layer1Result} layer1           – Content sanity-check result.
 * @property {Layer2Result} layer2           – Cryptographic signature verification result.
 * @property {number}    duration           – Total validation wall-clock time in milliseconds
 *                                             (measured via `performance.now()`).
 * @property {string}    fileName           – Original file name (or path) of the validated PDF.
 */

/**
 * @typedef {object} Layer1Result
 * @description Result of the Layer 1 content sanity check.
 * @property {boolean}        valid          – True when every rule in the schema passed.
 * @property {RuleResult[]}   rules          – Per-rule results.
 * @property {number}         duration       – Layer 1 wall-clock time in milliseconds.
 */

/**
 * @typedef {object} Layer2Result
 * @description Result of the Layer 2 cryptographic signature verification.
 * @property {boolean}        valid          – True when the PDF's digital signature is intact
 *                                             and the signer certificate chains to a trusted root.
 * @property {string|null}    signerName     – Common Name from the signer certificate, or null
 *                                             if no signature is present.
 * @property {string|null}    signerOrg      – Organisation from the signer certificate, or null.
 * @property {Date|null}      signedAt       – Signature timestamp, or null.
 * @property {string|null}    issuer         – Issuing CA distinguished name, or null.
 * @property {string|null}    error          – Human-readable error when `valid === false`.
 * @property {number}          duration      – Layer 2 wall-clock time in milliseconds.
 */

/**
 * @typedef {object} RuleResult
 * @description Outcome of a single schema rule evaluated against the PDF.
 * @property {string}  rule       – Rule identifier (matches the key in the SchemaRule map).
 * @property {boolean} pass       – True when the rule passed.
 * @property {string}  message    – Human-readable explanation.
 * @property {number}  duration   – Rule execution time in milliseconds.
 */

/**
 * @typedef {object} Schema
 * @description Full validation schema definition.
 * @property {string}                   name        – Human-readable schema name
 *                                                     (e.g. "Ijazah S1 – Universitas Indonesia").
 * @property {string}                   version     – Semantic version of the schema.
 * @property {Object<string, SchemaRule>} rules    – Map of rule-id → SchemaRule.
 * @property {HeuristicConfig}          heuristics  – Heuristic analysis configuration.
 */

/**
 * @typedef {object} SchemaRule
 * @description Definition of a single Layer 1 rule.
 * @property {string}              type        – Rule type discriminator.
 *                                               Supported values:
 *                                               'text_match', 'regex', 'count_range',
 *                                               'field_presence', 'anchor', 'forbidden',
 *                                               'page_range'.
 * @property {string|RegExp}       pattern     – Match pattern (string or RegExp).
 * @property {import('./utils/pattern-parser').PatternFlag} [flags] – Regex flags when pattern is a string.
 * @property {string}              [field]     – Target field / label.
 * @property {number}              [min]       – Minimum count (for 'count_range').
 * @property {number}              [max]       – Maximum count (for 'count_range').
 * @property {number}              [minPages]  – Minimum page count (for 'page_range').
 * @property {number}              [maxPages]  – Maximum page count (for 'page_range').
 * @property {string}              description – Human-readable rule description.
 * @property {boolean}             required    – When true, failing this rule invalidates Layer 1.
 */

/**
 * @typedef {object} HeuristicConfig
 * @description Configuration for heuristic (fuzzy) text-matching.
 * @property {boolean}            enabled         – Master switch for heuristic analysis.
 * @property {number}             minConfidence   – Minimum confidence threshold (0.0 – 1.0).
 * @property {number}             maxDistance     – Maximum Levenshtein / Jaro-Winkler distance.
 * @property {string[]}           stopwords       – Tokens ignored during fuzzy matching.
 * @property {Object<string, number>} fieldWeights – Per-field weight multipliers.
 */

/**
 * @typedef {object} ValidateOptions
 * @description Options accepted by the main `validate(filePath, options)` function.
 * @property {string}             schemaId     – Schema identifier to use (mandatory).
 * @property {boolean}            [layer2]     – Enable Layer 2 signature verification
 *                                               (default: true).
 * @property {boolean}            [heuristics] – Enable heuristic text matching
 *                                               (default: true).
 * @property {boolean}            [strict]     – When true, unknown/warning-level findings
 *                                               are treated as errors.
 * @property {number}             [timeout]    – Per-layer timeout in milliseconds
 *                                               (default: 30 000).
 * @property {string}             [logLevel]   – Override LOG_LEVEL for this run
 *                                               ('error' | 'warn' | 'info' | 'debug' | 'silent').
 */

/**
 * @typedef {object} GenerateOptions
 * @description Options accepted by `generateReport(result, options)`.
 * @property {('json'|'text'|'html')} format  – Output format (default: 'json').
 * @property {boolean}                 [pretty] – Pretty-print JSON output (default: true).
 * @property {string}                  [output] – File path to write the report to;
 *                                                stdout when omitted.
 * @property {boolean}                 [verbose] – Include per-rule timing and debug info
 *                                                  (default: false).
 */

export {};
