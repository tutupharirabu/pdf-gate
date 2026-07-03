/**
 * @module schemas/category-map
 * @description Schema category normalization helper – groups schemas into
 *              semantically meaningful categories for bulk operations and
 *              user-facing labels.
 *
 *              Categories:
 *              - PENDIDIKAN    Education-related documents
 *              - KEPENDUDUKAN  Civil registry documents
 *              - IDENTITAS     Identity documents
 *              - SEMUA         All registered schemas
 */

// ---------------------------------------------------------------------------
// Category definitions
// ---------------------------------------------------------------------------

/**
 * Schema-to-category mapping.
 * A schema may belong to multiple categories (e.g. KTP is both KEPENDUDUKAN and IDENTITAS).
 * @type {Record<string, string[]>}
 */
export const CATEGORY_MAP = {
  PENDIDIKAN: ['ijazah', 'transkrip', 'sertifikat'],
  KEPENDUDUKAN: ['ktp', 'kk', 'akte-kelahiran'],
  IDENTITAS: ['ktp', 'sim', 'passport'],
  SEMUA: [
    'ijazah',
    'transkrip',
    'sertifikat',
    'ktp',
    'kk',
    'akte-kelahiran',
    'sim',
    'passport',
  ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Return schema names belonging to a given category.
 *
 * @param {string} category – One of 'PENDIDIKAN', 'KEPENDUDUKAN', 'IDENTITAS', 'SEMUA'.
 * @returns {string[]} Array of schema name strings (empty array if category unknown).
 *
 * @example
 * import { getSchemasByCategory } from './category-map.js';
 * const pendidikan = getSchemasByCategory('PENDIDIKAN');
 * // ['ijazah', 'transkrip', 'sertifikat']
 */
export function getSchemasByCategory(category) {
  const upper = category.toUpperCase();
  return CATEGORY_MAP[upper] ?? [];
}
