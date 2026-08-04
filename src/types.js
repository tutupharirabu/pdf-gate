/**
 * @module types
 * @description Shared JSDoc type definitions for the pdf-gate package.
 *              These typedefs document the actual runtime shapes of objects
 *              flowing through Layer 1 (content sanity), Layer 2 (cryptographic
 *              signature verification), and the schema configuration system.
 *
 *              Synced with runtime as of v0.1.0+security-fixes.
 *
 *              NOTE: This file contains only JSDoc type definitions.
 *              It has no runtime exports.
 */

/**
 * Top-level result returned by `validatePDF()`.
 * @typedef {object} ValidationResult
 * @property {'VERIFIED'|'PLAUSIBLE'|'FAILED'} status  - Tri-state validation outcome.
 * @property {string}             schema              - Schema name used for validation.
 * @property {string|null}        fileName            - Original file name (or null).
 * @property {number}             fileSizeKb          - File size in KB (rounded to 1 decimal).
 * @property {number}             pageCount           - Number of parsed PDF pages.
 * @property {number}             totalDurationMs     - Total wall-clock time in ms (2 decimals).
 * @property {string}             timestamp           - ISO-8601 timestamp of the validation run.
 * @property {Layer1Result}       layer1              - Content sanity-check result.
 * @property {Layer2Result}       layer2              - Cryptographic signature verification result.
 * @property {string|null}        failReason          - Human-readable failure reason, or null when VERIFIED.
 */

/**
 * Result of the Layer 1 content sanity check (schema-driven field validation).
 * @typedef {object} Layer1Result
 * @property {boolean}            passed              - True when all required rules pass.
 * @property {string|null}        detectedType        - Schema name detected by fingerprint matching, or null.
 * @property {string|null}        failReason          - Human-readable reason, or null when passed.
 * @property {RuleResult[]}       rules               - Per-rule results.
 * @property {{ passed: boolean, wordCount: number, flags: string[] }} heuristics
 *                                                     - Heuristic analysis summary.
 * @property {number}             durationMs          - Layer 1 wall-clock time in ms.
 */

/**
 * Result of the Layer 2 cryptographic signature verification.
 * @typedef {object} Layer2Result
 * @property {boolean}            hasSignature        - True when at least one digital signature is present.
 * @property {boolean}            passed              - True when the signature verifies successfully.
 * @property {string|null}        issuer              - Issuing CA distinguished name, or null.
 * @property {string|null}        issuedTo            - Subject the certificate was issued to, or null.
 * @property {string|null}        validFrom           - Certificate validity start, or null.
 * @property {string|null}        validTo             - Certificate validity end, or null.
 * @property {boolean}            certExpired         - True when the signer certificate is expired.
 * @property {boolean}            integrityOk         - True when document integrity is intact.
 * @property {string|null}        signedAt            - Signature timestamp, or null.
 * @property {string|null}        failReason          - Human-readable failure reason.
 * @property {number}             durationMs          - Layer 2 wall-clock time in ms.
 */

/**
 * Outcome of a single schema rule evaluated against a PDF.
 * @typedef {object} RuleResult
 * @property {string}             id                  - Rule identifier from the schema.
 * @property {string}             label               - Human-readable rule label.
 * @property {boolean}            required            - Whether this rule is mandatory.
 * @property {boolean}            passed              - True when the pattern matched.
 * @property {string}             found               - Up-to-80-char snippet of matched text, or empty string.
 */

/**
 * Full document validation schema.
 * @typedef {object} Schema
 * @property {string}             name                - Schema identifier (e.g. "ijazah").
 * @property {string}             label               - Human-readable label (e.g. "Ijazah").
 * @property {RegExp[]}           fingerprints        - Per-document-type fingerprint regexes.
 * @property {number}             fingerprintMin      - Minimum fingerprint matches to claim detection.
 * @property {{ minWords: number, maxWords: number }} heuristics
 *                                                     - Word-count heuristic bounds.
 * @property {SchemaRule[]}       rules               - Array of field-validation rules.
 */

/**
 * Options accepted by `validatePDF(buffer, options)`.
 * @typedef {object} ValidateOptions
 * @property {string|Schema}      schema              - Schema name or custom Schema object (mandatory).
 * @property {boolean}            [skipLayer2]        - Skip Layer 2 signature verification (default: false).
 * @property {string}             [fileName]          - Original file name for the result.
 * @property {string[]}           [trustedIssuers]    - Allowlist of trusted issuer name substrings for
 *                                                       CA pinning (defense-in-depth).
 */

/**
 * A single field-validation rule inside a schema.
 * @typedef {object} SchemaRule
 * @property {string}             id                  - Rule identifier from the schema.
 * @property {string}             label               - Human-readable rule label.
 * @property {RegExp}             pattern             - Regex pattern evaluated against the extracted PDF text.
 * @property {boolean}            required            - Whether this rule is mandatory.
 */

export {};
