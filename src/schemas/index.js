/**
 * @module schemas/index
 * @description Schema registry – central hub for managing, resolving, and
 *              loading document validation schemas.
 *
 *              Built-in schemas (8 total):
 *              - ijazah           (Indonesian university diploma)
 *              - transkrip        (Academic transcript)
 *              - sertifikat       (Certificate)
 *              - ktp              (Indonesian ID card)
 *              - akte-kelahiran   (Birth certificate)
 *              - sim              (Driving license)
 *              - passport         (Indonesian passport)
 *              - kk               (Family card / Kartu Keluarga)
 *
 *              Exports:
 *              - SCHEMAS               Map of name → schema
 *              - resolveSchema()       Lookup or validate an ad-hoc schema
 *              - registerSchema()      Add a custom schema at runtime
 *              - unregisterSchema()    Remove a previously registered custom schema
 *              - loadSchemaFromFile()  Load a schema from .json or .js file
 *              - CATEGORY_MAP          Schema categories (PENDIDIKAN, KEPENDUDUKAN, IDENTITAS)
 *              - getSchemasByCategory() Get schema names by category
 */

import { parsePattern } from '../utils/pattern-parser.js';

import ijazah from './ijazah.js';
import transkrip from './transkrip.js';
import sertifikat from './sertifikat.js';
import ktp from './ktp.js';
import akteKelahiran from './akte-kelahiran.js';
import sim from './sim.js';
import passport from './passport.js';
import kk from './kk.js';

export { CATEGORY_MAP, getSchemasByCategory } from './category-map.js';

// ---------------------------------------------------------------------------
// Built-in schema names – immutable; cannot be unregistered or overwritten.
// ---------------------------------------------------------------------------
const BUILTIN_NAMES = new Set([
  'ijazah', 'transkrip', 'sertifikat', 'ktp',
  'akte-kelahiran', 'sim', 'passport', 'kk',
]);

// ---------------------------------------------------------------------------
// SCHEMAS – the central registry Map.
// ---------------------------------------------------------------------------

/**
 * Registry of all known schemas (built-in + custom).
 * Keys are schema names, values are fully validated schema objects.
 * @type {Map<string, import('../types.js').Schema>}
 */
const SCHEMAS = new Map();

// Register built-in schemas.
for (const schema of [ijazah, transkrip, sertifikat, ktp, akteKelahiran, sim, passport, kk]) {
  SCHEMAS.set(schema.name, schema);
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------

/**
 * Validate that a rule object has all required properties with correct types.
 * @param {object} rule
 * @param {number} index – Rule position in the array (for error messages).
 * @throws {TypeError}
 */
function validateRule(rule, index) {
  if (typeof rule.id !== 'string' || rule.id.length === 0) {
    throw new TypeError(`Rule at index ${index}: "id" must be a non-empty string`);
  }
  if (typeof rule.label !== 'string' || rule.label.length === 0) {
    throw new TypeError(`Rule "${rule.id}": "label" must be a non-empty string`);
  }
  if (!(rule.pattern instanceof RegExp) && typeof rule.pattern !== 'string') {
    throw new TypeError(`Rule "${rule.id}": "pattern" must be a string or RegExp`);
  }
  if (typeof rule.required !== 'boolean') {
    throw new TypeError(`Rule "${rule.id}": "required" must be a boolean`);
  }
}

/**
 * Fully validate a schema object.
 * @param {object} schema
 * @throws {TypeError}
 */
function validateSchema(schema) {
  if (typeof schema.name !== 'string' || schema.name.length === 0) {
    throw new TypeError('Schema "name" must be a non-empty string');
  }
  if (!Array.isArray(schema.fingerprints) || schema.fingerprints.length === 0) {
    throw new TypeError(`Schema "${schema.name}": "fingerprints" must be a non-empty array`);
  }
  if (typeof schema.fingerprintMin !== 'number' || schema.fingerprintMin < 1) {
    throw new TypeError(`Schema "${schema.name}": "fingerprintMin" must be >= 1`);
  }
  if (schema.fingerprintMin > schema.fingerprints.length) {
    throw new TypeError(`Schema "${schema.name}": fingerprintMin (${schema.fingerprintMin}) exceeds fingerprints length (${schema.fingerprints.length})`);
  }
  if (!Array.isArray(schema.rules) || schema.rules.length === 0) {
    throw new TypeError(`Schema "${schema.name}": "rules" must be a non-empty array`);
  }
  schema.rules.forEach((rule, i) => validateRule(rule, i));
  if (!schema.heuristics || typeof schema.heuristics.minWords !== 'number' || typeof schema.heuristics.maxWords !== 'number') {
    throw new TypeError(`Schema "${schema.name}": "heuristics" must have minWords and maxWords as numbers`);
  }
  if (schema.heuristics.minWords > schema.heuristics.maxWords) {
    throw new TypeError(`Schema "${schema.name}": heuristics.minWords (${schema.heuristics.minWords}) > maxWords (${schema.heuristics.maxWords})`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Resolve a schema by name (string) or validate a custom schema object.
 * @param {string|object} nameOrObject
 * @returns {import('../types.js').Schema}
 * @throws {Error|TypeError}
 */
export function resolveSchema(nameOrObject) {
  if (typeof nameOrObject === 'string') {
    const schema = SCHEMAS.get(nameOrObject);
    if (!schema) {
      throw new Error(`Schema "${nameOrObject}" tidak ditemukan. Gunakan --list-schemas untuk melihat opsi.`);
    }
    return schema;
  }

  if (typeof nameOrObject === 'object' && nameOrObject !== null) {
    validateSchema(nameOrObject);
    return nameOrObject;
  }

  throw new TypeError('resolveSchema() membutuhkan nama schema (string) atau object schema kustom.');
}

/**
 * Register a custom schema at runtime.
 * Schema rules with string patterns are auto-parsed to RegExp.
 * @param {object} schema
 * @returns {import('../types.js').Schema} The registered schema
 * @throws {Error|TypeError}
 */
export function registerSchema(schema) {
  validateSchema(schema);

  if (BUILTIN_NAMES.has(schema.name)) {
    throw new Error(`Schema "${schema.name}" adalah built-in dan tidak bisa ditimpa.`);
  }

  if (SCHEMAS.has(schema.name)) {
    throw new Error(`Schema "${schema.name}" sudah terdaftar. Gunakan unregisterSchema() terlebih dahulu.`);
  }

  // Parse string patterns to RegExp for fingerprints
  schema.fingerprints = schema.fingerprints.map(fp =>
    fp instanceof RegExp ? fp : parsePattern(fp),
  );

  // Parse string patterns to RegExp for rules
  schema.rules = schema.rules.map(rule => ({
    ...rule,
    pattern: rule.pattern instanceof RegExp ? rule.pattern : parsePattern(rule.pattern),
  }));

  SCHEMAS.set(schema.name, schema);
  return schema;
}

/**
 * Unregister a previously registered custom schema.
 * Built-in schemas cannot be unregistered.
 * @param {string} name
 * @throws {Error}
 */
export function unregisterSchema(name) {
  if (BUILTIN_NAMES.has(name)) {
    throw new Error(`Schema "${name}" adalah built-in dan tidak bisa dihapus.`);
  }

  if (!SCHEMAS.has(name)) {
    throw new Error(`Schema "${name}" tidak ditemukan.`);
  }

  SCHEMAS.delete(name);
}

/**
 * Load a schema from a .json or .js file.
 * - .json: JSON.parse, auto-converts "/pattern/flags" strings to RegExp
 * - .js: Dynamic import (expects export default) — mengeksekusi kode, hanya muat file tepercaya
 *
 * **Security:** Path yang di-resolve dibatasi pada `options.allowedRoot` (default:
 * `process.cwd()`) untuk mencegah path traversal dan arbitrary file read/RCE.
 * Pass `{ allowedRoot: null }` untuk menonaktifkan pembatasan pada konteks tepercaya
 * (mis. CLI yang dijalankan operator).
 *
 * @param {string} filePath – Path file schema (relatif atau absolut)
 * @param {object} [options={}]
 * @param {string|null} [options.allowedRoot=process.cwd()] – Direktori root untuk
 *        membatasi path. Pass `null` untuk mengizinkan path absolut mana pun (trusted use).
 * @returns {Promise<import('../types.js').Schema>}
 * @throws {Error}
 */
export async function loadSchemaFromFile(filePath, options = {}) {
  const { readFile } = await import('node:fs/promises');
  const path = await import('node:path');

  // ── Security: batasi path pada allowed root untuk cegah path traversal ──
  // Resolve ke path absolut dan tolak apa pun yang keluar dari direktori yang
  // diizinkan. Mencegah load file sistem arbitrer (mis. ../../etc/passwd) dan
  // membatasi .js dynamic import() — yang mengeksekusi kode — pada lokasi tepercaya.
  const allowedRoot = options.allowedRoot === null
    ? null
    : path.resolve(options.allowedRoot || process.cwd());
  const absPath = path.resolve(filePath);

  if (allowedRoot !== null) {
    const rel = path.relative(allowedRoot, absPath);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new Error(
        `Akses ditolak: path "${filePath}" berada di luar direktori yang diizinkan ` +
        `("${allowedRoot}"). Gunakan opsi { allowedRoot } untuk mengizinkan direktori lain.`
      );
    }
  }

  const ext = path.extname(absPath).toLowerCase();

  if (ext === '.json') {
    const raw = await readFile(absPath, 'utf-8');
    const obj = JSON.parse(raw);

    // Convert fingerprint strings to RegExp
    if (Array.isArray(obj.fingerprints)) {
      obj.fingerprints = obj.fingerprints.map(fp =>
        typeof fp === 'string' ? parsePattern(fp) : fp,
      );
    }

    // Convert rule pattern strings to RegExp
    if (Array.isArray(obj.rules)) {
      obj.rules = obj.rules.map(rule => ({
        ...rule,
        pattern: typeof rule.pattern === 'string' ? parsePattern(rule.pattern) : rule.pattern,
      }));
    }

    // Auto-register the loaded schema
    return registerSchema(obj);
  }

  if (ext === '.js') {
    const mod = await import(absPath);
    const schema = mod.default || mod;
    return registerSchema(schema);
  }

  throw new Error(`Format file tidak didukung: ${ext}. Gunakan .json atau .js.`);
}


/**
 * Return a read-only snapshot of all registered schemas.
 * Consumers that only need to read should use this to avoid
 * accidentally mutating the internal registry.
 * @returns {Map<string, import('../types.js').Schema>}
 */
export function getAllSchemas() {
  return new Map(SCHEMAS);
}

export { SCHEMAS };
