/**
 * @module generator/fingerprint-extractor
 * @description Extracts distinctive textual fingerprints (unique phrases)
 *              from a document that can serve as strong anchoring points
 *              for schema-based validation.
 *
 *              Returns RegExp objects ready for use in Schema.fingerprints.
 */

const ALL_CAPS_WORD = /\b[A-Z]{2,}\b/g;
const WORD_RE = /\b[a-zA-Z]+\b/g;

/**
 * Compute word frequency across the full text.
 *
 * @param {string} text
 * @returns {Map<string, number>}
 */
function wordFrequency(text) {
  const freq = new Map();
  const matches = text.match(WORD_RE);
  if (!matches) return freq;
  for (const w of matches) {
    const lower = w.toLowerCase();
    freq.set(lower, (freq.get(lower) || 0) + 1);
  }
  return freq;
}

/**
 * Extract n-gram phrases from text.
 *
 * @param {string[]} words
 * @param {number} n
 * @returns {string[]}
 */
function ngrams(words, n) {
  const result = [];
  for (let i = 0; i <= words.length - n; i++) {
    result.push(words.slice(i, i + n).join(' '));
  }
  return result;
}

/**
 * Score a phrase for distinctiveness.
 * Higher score = more unique/distinctive.
 *
 * @param {string} phrase
 * @param {Map<string, number>} freq
 * @returns {number}
 */
function distinctivenessScore(phrase, freq) {
  const phraseWords = phrase.split(/\s+/);
  let score = 0;

  for (const w of phraseWords) {
    const count = freq.get(w.toLowerCase()) || 1;
    // Rarer words contribute more to score
    score += 1 / count;
  }

  // Longer phrases are more distinctive
  score *= Math.log(phraseWords.length + 1);

  // Bonus for ALL CAPS
  if (/^[A-Z]{2,}$/.test(phrase)) {
    score *= 2;
  }

  return score;
}

import { escapeRegex } from '../utils/pattern-parser.js';

/**
 * Extract distinctive fingerprints from document text.
 *
 * Combines:
 * - n-gram phrases (3-8 words) that contain rare words
 * - ALL-CAPS word runs (strong document type indicators)
 * - User-provided hint fingerprints
 *
 * Returns top 5 most distinctive fingerprints as RegExp objects
 * with case-insensitive matching.
 *
 * @param {string} text - Full document text
 * @param {Array} lines - Grouped text lines
 * @param {RegExp[]} hintFingerprints - User-provided hint patterns
 * @returns {RegExp[]}
 */
export function extractFingerprints(text, lines, hintFingerprints = []) {
  const freq = wordFrequency(text);
  const words = text.match(WORD_RE) || [];

  // Collect all candidate phrases (3 to 8-word ngrams)
  const candidates = new Set();
  for (let n = 3; n <= 8; n++) {
    for (const ng of ngrams(words, n)) {
      // Skip phrases that are too common (all words appear >5 times)
      const phraseWords = ng.split(/\s+/);
      const allCommon = phraseWords.every(
        (w) => (freq.get(w.toLowerCase()) || 0) > 5,
      );
      if (!allCommon) {
        candidates.add(ng);
      }
    }
  }

  // Also add any ALL-CAPS contiguous runs as single fingerprints
  const capsRuns = text.match(ALL_CAPS_WORD) || [];
  for (const cap of capsRuns) {
    if (cap.length >= 4) {
      candidates.add(cap);
    }
  }

  // Score and sort
  const scored = Array.from(candidates).map((phrase) => ({
    phrase,
    score: distinctivenessScore(phrase, freq),
  }));

  scored.sort((a, b) => b.score - a.score);

  // Take top 5, convert to RegExp (case-insensitive)
  const top5 = scored.slice(0, 5).map((s) => s.phrase);

  const fingerprints = top5.map((p) => new RegExp(escapeRegex(p), 'i'));

  // Add user hints (if they are RegExp, keep as-is; if string, convert)
  for (const hint of hintFingerprints) {
    if (hint instanceof RegExp) {
      fingerprints.push(hint);
    } else if (typeof hint === 'string') {
      fingerprints.push(new RegExp(escapeRegex(hint), 'i'));
    }
  }

  // Remove duplicates (by string representation)
  const seen = new Set();
  const unique = [];
  for (const fp of fingerprints) {
    const key = fp.toString();
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(fp);
    }
  }

  return unique.slice(0, 8); // max 8 fingerprints
}
