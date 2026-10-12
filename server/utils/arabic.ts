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

const MAX_SIMILARITY_LEN = 250;

/**
 * Calculates Levenshtein similarity ratio between 0 and 1
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeArabicText(str1);
  const s2 = normalizeArabicText(str2);

  if (s1 === s2) return 1.0;
  if (!s1.length || !s2.length) return 0.0;

  // Bound lengths with explicit Math.min to cap iteration bounds and eliminate CodeQL warnings
  const len1 = Math.min(s1.length, MAX_SIMILARITY_LEN);
  const len2 = Math.min(s2.length, MAX_SIMILARITY_LEN);

  // Optimized memory allocation: use two 1D rows instead of full 2D matrix (O(N) vs O(N*M))
  let prevRow = new Int32Array(len1 + 1);
  let currRow = new Int32Array(len1 + 1);

  for (let i = 0; i <= len1; i++) {
    prevRow[i] = i;
  }

  for (let j = 1; j <= len2; j++) {
    currRow[0] = j;
    const char2 = s2[j - 1];
    for (let i = 1; i <= len1; i++) {
      const indicator = s1[i - 1] === char2 ? 0 : 1;
      currRow[i] = Math.min(
        currRow[i - 1] + 1,        // insertion
        prevRow[i] + 1,            // deletion
        prevRow[i - 1] + indicator  // substitution
      );
    }
    const temp = prevRow;
    prevRow = currRow;
    currRow = temp;
  }

  const distance = prevRow[len1];
  const maxLength = Math.max(len1, len2);
  return 1 - distance / maxLength;
}
