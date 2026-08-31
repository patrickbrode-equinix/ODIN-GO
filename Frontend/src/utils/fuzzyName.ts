/* ------------------------------------------------ */
/* FUZZY NAME MATCHING UTILITY                      */
/* Used for matching shiftplan employee names to    */
/* system users when exact match is not possible.   */
/* ------------------------------------------------ */

/**
 * Normalize a name for comparison:
 * - Lowercase
 * - Remove diacritics (ä → a, ü → u, ö → o, ß → ss, etc.)
 * - Remove non-alpha characters (hyphens, dots, apostrophes)
 * - Collapse whitespace
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .normalize("NFD")               // decompose accented chars
    .replace(/[\u0300-\u036f]/g, "") // strip combining marks
    .replace(/[^a-z0-9\s]/g, " ")   // non-alphanumeric → space
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Levenshtein edit distance between two strings.
 */
export function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1];
      } else {
        dp[i][j] = 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
      }
    }
  }
  return dp[m][n];
}

/**
 * Similarity score between 0 and 1 (1 = identical).
 */
export function nameSimilarity(a: string, b: string): number {
  const na = normalizeName(a);
  const nb = normalizeName(b);
  if (na === nb) return 1;
  if (!na || !nb) return 0;
  const dist = levenshtein(na, nb);
  return 1 - dist / Math.max(na.length, nb.length);
}

/**
 * Token-based overlap: what fraction of tokens from `a` appear in `b`?
 * Good for "Lastname, Firstname" vs "Firstname Lastname" cases.
 */
export function tokenOverlap(a: string, b: string): number {
  const ta = new Set(normalizeName(a).split(" ").filter(Boolean));
  const tb = new Set(normalizeName(b).split(" ").filter(Boolean));
  if (ta.size === 0) return 0;
  let common = 0;
  for (const t of ta) {
    if (tb.has(t)) common++;
  }
  return common / ta.size;
}

/**
 * Combined fuzzy score: max of character similarity and token overlap.
 */
export function fuzzyScore(a: string, b: string): number {
  return Math.max(nameSimilarity(a, b), tokenOverlap(a, b));
}

/**
 * Find the best match for `query` from a list of `candidates`.
 * Returns the best match and its score, or null if no match exceeds threshold.
 *
 * @param query        The name to search for
 * @param candidates   List of known names
 * @param threshold    Minimum score to consider a match (default: 0.65)
 */
export function findBestMatch(
  query: string,
  candidates: string[],
  threshold = 0.65
): { match: string; score: number } | null {
  let best: { match: string; score: number } | null = null;

  for (const c of candidates) {
    const score = fuzzyScore(query, c);
    if (score >= threshold && (!best || score > best.score)) {
      best = { match: c, score };
    }
  }

  return best;
}

/**
 * Find all candidates from a list that exceed the threshold, sorted by score descending.
 */
export function findAllMatches(
  query: string,
  candidates: string[],
  threshold = 0.55
): Array<{ match: string; score: number }> {
  return candidates
    .map(c => ({ match: c, score: fuzzyScore(query, c) }))
    .filter(r => r.score >= threshold)
    .sort((a, b) => b.score - a.score);
}
