/**
 * backend/lib/nameNorm.js
 *
 * Employee name normalization and fuzzy-identity matching for the backend.
 * Prevents duplicate employee rows during Excel shiftplan imports.
 *
 * Rules (in order):
 * 1. Normalize: lowercase, remove diacritics, collapse whitespace.
 * 2. Compute Levenshtein edit distance.
 * 3. Compute token overlap (handles "Last, First" vs "First Last").
 * 4. fuzzyScore = max(nameSimilarity, tokenOverlap).
 * 5. Two names are "same employee" if fuzzyScore >= SIMILARITY_THRESHOLD.
 *
 * Thresholds are intentionally conservative to avoid wrong merges.
 * Require BOTH similarity >= 0.75 AND at least one token pair match (overlap > 0).
 */

/** Minimum fuzzy score to consider two names the "same employee". */
export const SIMILARITY_THRESHOLD = 0.75;

/**
 * Normalize a name string:
 * - Lowercase
 * - German diacritic substitution: ä→ae, ö→oe, ü→ue, ß→ss
 * - Strip remaining diacritics (NFD + remove combining chars)
 * - Replace comma+space with space (for "Last, First" format)
 * - Collapse whitespace / trim
 */
export function normalizeName(name) {
  if (!name || typeof name !== "string") return "";
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Levenshtein edit distance between two strings.
 * @param {string} a
 * @param {string} b
 * @returns {number}
 */
export function levenshtein(a, b) {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  const matrix = [];
  for (let i = 0; i <= b.length; i++) matrix[i] = [i];
  for (let j = 0; j <= a.length; j++) matrix[0][j] = j;

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b[i - 1] === a[j - 1]) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = 1 + Math.min(
          matrix[i - 1][j],     // delete
          matrix[i][j - 1],     // insert
          matrix[i - 1][j - 1]  // replace
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

/**
 * Similarity score 0..1 based on edit distance.
 * 1.0 = identical, 0.0 = completely different.
 */
export function nameSimilarity(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (!na || !nb) return 0;
  const maxLen = Math.max(na.length, nb.length);
  if (maxLen === 0) return 1;
  return 1 - levenshtein(na, nb) / maxLen;
}

/**
 * Token overlap score 0..1.
 * Splits names into word tokens (handles "Last, First" vs "First Last").
 * Returns fraction of tokens from `a` that have a match in `b` at >= 0.8 similarity.
 */
export function tokenOverlap(a, b) {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  const tokensA = na.split(/\s+/).filter(Boolean);
  const tokensB = nb.split(/\s+/).filter(Boolean);
  if (!tokensA.length || !tokensB.length) return 0;

  let matched = 0;
  for (const ta of tokensA) {
    const best = tokensB.reduce((max, tb) => Math.max(max, nameSimilarity(ta, tb)), 0);
    if (best >= 0.8) matched++;
  }
  return matched / tokensA.length;
}

/**
 * Combined fuzzy score: max of character similarity and token overlap.
 * Ensures both full-name similarity AND partial token matching are considered.
 */
export function fuzzyScore(a, b) {
  return Math.max(nameSimilarity(a, b), tokenOverlap(a, b));
}

/**
 * Returns true if two employee names should be considered the same person.
 * Requires BOTH:
 *   - fuzzyScore >= SIMILARITY_THRESHOLD
 *   - tokenOverlap > 0 (at least one word token pair matches at >= 0.8)
 * This prevents e.g. "John Smith" from merging with "Jane Smith" (overlap=0.5 but
 * different person) while still catching "Müller, Hans" vs "Hans Mueller".
 *
 * @param {string} a
 * @param {string} b
 * @param {number} [threshold=SIMILARITY_THRESHOLD]
 * @returns {boolean}
 */
export function isSameEmployee(a, b, threshold = SIMILARITY_THRESHOLD) {
  const score = fuzzyScore(a, b);
  const overlap = tokenOverlap(a, b);
  return score >= threshold && overlap > 0;
}

/**
 * Find the best matching canonical name from a list of candidates.
 * Returns { name, score } of the best match above threshold, or null.
 *
 * @param {string} input
 * @param {string[]} candidates
 * @param {number} [threshold=SIMILARITY_THRESHOLD]
 * @returns {{ name: string, score: number } | null}
 */
export function findBestMatch(input, candidates, threshold = SIMILARITY_THRESHOLD) {
  let best = null;
  for (const c of candidates) {
    const score = fuzzyScore(input, c);
    const overlap = tokenOverlap(input, c);
    if (score >= threshold && overlap > 0) {
      if (!best || score > best.score) {
        best = { name: c, score };
      }
    }
  }
  return best;
}
