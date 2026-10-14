/**
 * Arabic String Normalization and Duplicate Prevention Utility
 * Used for Subledger Parties, Debtors (1301), Vendors, and Members
 */

// Pre-compiled regular expressions for optimal Arabic normalization performance
const RE_MULTISPACE = /\s+/g;
const RE_ALEF = /[أإآٱ]/g;
const RE_TAA_MARBOUTA = /ة/g;
const RE_YAA = /ى/g;
const RE_TASHKEEL = /[\u064B-\u065F\u0670]/g;
const RE_TATWEEL = /\u0640/g;

export function normalizeArabicText(text: string): string {
  if (!text) return '';

  return text
    .trim()
    // Replace multiple spaces with a single space
    .replace(RE_MULTISPACE, ' ')
    // Normalize Alefs
    .replace(RE_ALEF, 'ا')
    // Normalize Taa Marbouta to Haa
    .replace(RE_TAA_MARBOUTA, 'ه')
    // Normalize Yaa
    .replace(RE_YAA, 'ي')
    // Remove Arabic diacritics (Tashkeel)
    .replace(RE_TASHKEEL, '')
    // Remove Tatweel (Kashida)
    .replace(RE_TATWEEL, '')
    // Lowercase for any Latin characters
    .toLowerCase();
}

/**
 * Calculates Levenshtein similarity ratio between 0 and 1
 * Uses single-array iterative Levenshtein algorithm with dynamic allocation
 * to avoid allocations while keeping runtime O(m*n) and space O(min(m,n)).
 */
const MAX_SIMILARITY_STRING_LENGTH = 1000;

export function calculateSimilarity(str1: string, str2: string): number {
  let s1 = normalizeArabicText(str1);
  let s2 = normalizeArabicText(str2);

  if (s1 === s2) return 1.0;
  if (!s1.length || !s2.length) return 0.0;

  // Bound string length to prevent unbounded O(N*M) CPU loop iteration / ReDoS / DoS
  if (s1.length > MAX_SIMILARITY_STRING_LENGTH) {
    s1 = s1.slice(0, MAX_SIMILARITY_STRING_LENGTH);
  }
  if (s2.length > MAX_SIMILARITY_STRING_LENGTH) {
    s2 = s2.slice(0, MAX_SIMILARITY_STRING_LENGTH);
  }

  // Ensure s1 is shorter to optimize space allocation
  let a = s1;
  let b = s2;
  if (a.length > b.length) {
    a = s2;
    b = s1;
  }

  const len1 = a.length;
  const len2 = b.length;

  const row = new Int32Array(len1 + 1);
  for (let i = 0; i <= len1; i++) {
    row[i] = i;
  }

  for (let j = 1; j <= len2; j++) {
    let prevDiag = row[0];
    row[0] = j;
    const char2 = b.charCodeAt(j - 1);

    for (let i = 1; i <= len1; i++) {
      const oldRowI = row[i];
      const cost = a.charCodeAt(i - 1) === char2 ? 0 : 1;

      // row[i] is del, row[i-1] is ins, prevDiag is sub
      const del = oldRowI + 1;
      const ins = row[i - 1] + 1;
      const sub = prevDiag + cost;

      row[i] = Math.min(del, Math.min(ins, sub));
      prevDiag = oldRowI;
    }
  }

  const distance = row[len1];
  const maxLength = Math.max(len1, len2);
  return 1 - distance / maxLength;
}
