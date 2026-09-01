/**
 * Arabic String Normalization and Duplicate Prevention Utility
 * Used for Subledger Parties, Debtors (1301), Vendors, and Members
 */

export function normalizeArabicText(text: string): string {
  if (!text) return '';

  return text
    .trim()
    // Replace multiple spaces with a single space
    .replace(/\s+/g, ' ')
    // Normalize Alefs
    .replace(/[أإآٱ]/g, 'ا')
    // Normalize Taa Marbouta to Haa
    .replace(/ة/g, 'ه')
    // Normalize Yaa
    .replace(/ى/g, 'ي')
    // Remove Arabic diacritics (Tashkeel)
    .replace(/[\u064B-\u065F\u0670]/g, '')
    // Remove Tatweel (Kashida)
    .replace(/\u0640/g, '')
    // Lowercase for any Latin characters
    .toLowerCase();
}

/**
 * Calculates Levenshtein similarity ratio between 0 and 1
 */
export function calculateSimilarity(str1: string, str2: string): number {
  const s1 = normalizeArabicText(str1);
  const s2 = normalizeArabicText(str2);

  if (s1 === s2) return 1.0;
  if (!s1.length || !s2.length) return 0.0;

  const track = Array(s2.length + 1)
    .fill(null)
    .map(() => Array(s1.length + 1).fill(null));

  for (let i = 0; i <= s1.length; i += 1) {
    track[0][i] = i;
  }
  for (let j = 0; j <= s2.length; j += 1) {
    track[j][0] = j;
  }

  for (let j = 1; j <= s2.length; j += 1) {
    for (let i = 1; i <= s1.length; i += 1) {
      const indicator = s1[i - 1] === s2[j - 1] ? 0 : 1;
      track[j][i] = Math.min(
        track[j][i - 1] + 1, // deletion
        track[j - 1][i] + 1, // insertion
        track[j - 1][i - 1] + indicator // substitution
      );
    }
  }

  const distance = track[s2.length][s1.length];
  const maxLength = Math.max(s1.length, s2.length);
  return 1 - distance / maxLength;
}
