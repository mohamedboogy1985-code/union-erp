import { erpStore } from "../db/store.js";
import { normalizeArabicText } from "./arabic.js";
import type { Account } from "../../src/types/erp.js";

/** تطبيع عربي موحّد لمطابقة أسماء الحسابات (همزات، تاء مربوطة، ألف مقصورة، تشكيل، واو العطف). */
export const normalizeAccountName = (value: string): string =>
  normalizeArabicText(String(value ?? ""))
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/\bو(?=ال)/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

export interface AccountMatch {
  account: Account;
  score: number;
  reasonAr: string;
}

/**
 * حلّ الحساب الأنسب: أكواد صريحة أولاً، ثم مطابقة الاسم بترجيح جودة المطابقة وعمق الحساب،
 * مع تخفيض الحسابات التجميعية (العناوين) حتى لا يُرحَّل قيد على حساب غير قابل للترحيل.
 */
export const findBestAccount = (
  preferCodes: string[],
  keywords: string[],
): AccountMatch | null => {
  const accounts = erpStore.accounts ?? [];
  for (const code of preferCodes) {
    const exact = accounts.find((account) => account.code === code);
    if (exact)
      return { account: exact, score: 1000, reasonAr: `كود صريح ${code}` };
  }
  const normalizedKeywords = keywords
    .map((keyword) => normalizeAccountName(keyword))
    .filter(Boolean);
  let best: AccountMatch | null = null;
  for (const account of accounts) {
    const name = normalizeAccountName(account.name);
    if (!name) continue;
    for (const keyword of normalizedKeywords) {
      let score = 0;
      let reason = "";
      if (name === keyword) {
        score = 120;
        reason = "اسم مطابق تماماً";
      } else if (name.startsWith(keyword)) {
        score = 80;
        reason = "الاسم يبدأ بالكلمة";
      } else if (name.includes(keyword)) {
        score = 45;
        reason = "الاسم يحتوي الكلمة";
      } else {
        const keywordTokens = keyword
          .split(" ")
          .filter((token) => token.length > 3);
        const matched = keywordTokens.filter((token) => name.includes(token));
        if (
          keywordTokens.length > 1 &&
          matched.length === keywordTokens.length
        ) {
          score = 40;
          reason = "كل كلمات المفتاح موجودة";
        } else if (matched.length > 0) {
          score = 18;
          reason = "بعض كلمات المفتاح";
        }
      }
      if (score === 0) continue;
      const codeLength = String(account.code ?? "").length;
      if (codeLength >= 3) score += 12;
      if ((account.level ?? 0) >= 3) score += 8;
      if (codeLength <= 2) score -= 45;
      if (
        /^(الاصول المتداوله|المصروفات والمدفوعات|الايرادات والمقبوضات|الالتزامات المتداوله|حقوق الملكيه)/.test(
          name,
        ) &&
        score < 100
      )
        score -= 35;
      if (!best || score > best.score)
        best = { account, score, reasonAr: reason };
    }
  }
  return best && best.score >= 30 ? best : null;
};

export const accountLookupView = (
  preferCodes: string[],
  keywords: string[],
) => {
  const match = findBestAccount(preferCodes, keywords);
  return match
    ? { account: match.account, score: match.score, reasonAr: match.reasonAr }
    : null;
};
