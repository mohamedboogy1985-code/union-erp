import fs from 'fs';
import path from 'path';
import { normalizeArabicText, calculateSimilarity } from '../utils/arabic.js';
import { parseCsv } from '../utils/csv.js';
import { CSV_DATA_DIR } from './csv-import.service.js';
import { erpStore } from '../db/store.js';

export interface CommitteeSummary {
  id: string;
  name: string;
  rawName: string;
  category: 'COMPANY' | 'PROFESSIONAL'; // لجان الشركات / اللجان المهنية
  membershipNumber: string;
  totalSubscriptions?: number; // قيمة الاشتراك (من بيان_اللجان)
  unionShare?: number; // حصة الاتحاد
  membersCount: number; // عدد الأعضاء المسجلين بالنظام
}

/** قراءة اللجان من ملف بيانات اللجان النقابية (الكتل: الشركات ثم المهنية) */
export class CommitteesService {
  private committeeFile(): string {
    return path.join(CSV_DATA_DIR, 'بيانات_اللجان_النقابية.csv');
  }

  private statementFile(): string {
    return path.join(CSV_DATA_DIR, 'بيان_اللجان.csv');
  }

  private readIfExists(file: string): string {
    try {
      return fs.readFileSync(file, 'utf-8');
    } catch {
      return '';
    }
  }

  public getAll(): CommitteeSummary[] {
    const all: CommitteeSummary[] = [];

    // ---- 1) قائمة اللجان من بيانات_اللجان_النقابية.csv ----
    const raw = this.readIfExists(this.committeeFile());
    const rows = parseCsv(raw);
    let section: 'COMPANY' | 'PROFESSIONAL' | null = null;
    const seen = new Set<string>();

    for (const row of rows) {
      const first = (row[0] || '').trim();
      const name = (row[1] || '').trim();

      // رؤوس الكتل (غير مرقّمة): بداية كتلة اللجان المهنية / نهاية نطاق اللجان
      if (/بــيان\s*اللجان\s*النقابية\s*المهنية/i.test(name) || /لجان\s*النقابية\s*المهنية/i.test(name)) {
        section = 'PROFESSIONAL';
        continue;
      }
      if (/مكاتب\s*شئون\s*العضوية|بيان\s*مكاتب/i.test(name)) {
        section = null; // خارج نطاق اللجان
        continue;
      }

      // صف لجنة صالح: الخانة الأولى رقم تسلسلي والخانة الثانية اسم اللجنة
      if (!/^[0-9]+$/.test(first)) continue;
      if (!name || name.length < 6) continue;
      if (/مكاتب|مكتب\s*شئون/i.test(name)) continue;

      // تعيين القسم بذكاء إن لم يُضبط
      const norm = normalizeArabicText(name);
      const category: 'COMPANY' | 'PROFESSIONAL' =
        section === 'PROFESSIONAL' ? 'PROFESSIONAL' : /مهنية/i.test(norm) ? 'PROFESSIONAL' : 'COMPANY';

      const key = norm;
      if (seen.has(key)) continue;
      seen.add(key);

      all.push({
        id: `committee-${all.length + 1}`,
        name,
        rawName: name,
        category,
        membershipNumber: first,
        membersCount: 0,
      });
    }

    // ---- 2) بيانات الاشتراكات/الحصص من بيان_اللجان.csv ----
    const stmt = this.readIfExists(this.statementFile());
    const stmtRows = parseCsv(stmt);
    const stmtMap = new Map<string, { total?: number; share?: number; name: string }>();
    for (const row of stmtRows) {
      const name = (row[1] || '').trim();
      if (!name || name.length < 6) continue;
      const total = Number((row[2] || '').replace(/,/g, ''));
      const share = Number((row[3] || '').replace(/,/g, ''));
      stmtMap.set(normalizeArabicText(name), {
        name,
        total: total > 0 ? total : undefined,
        share: share > 0 ? share : undefined,
      });
    }

    // ---- 3) ربط عدد الأعضاء المسجلين بالنظام (مطابقة بالاسم) ----
    const members = erpStore.members || [];
    const membersByCommittee = new Map<string, number>();
    for (const m of members) {
      const cname = normalizeArabicText(m.syndicateCommitteeName || '');
      if (!cname) continue;
      membersByCommittee.set(cname, (membersByCommittee.get(cname) || 0) + 1);
    }

    for (const c of all) {
      // مطابقة الاسم مع بيان_اللجان بعد استخلاص "جوهر" اسم الشركة
      // (تجريد بادئة "اللجنة النقابية بشركة..." ولواحق المقر/الفرع)
      const st = takeStatementCore(stmtMap, coreKey(c.name));
      if (st) {
        c.totalSubscriptions = st.total;
        c.unionShare = st.share;
      }
      const norm = normalizeArabicText(c.name);
      c.membersCount = membersByCommittee.get(norm) || 0;
    }

    return all;
  }
}

/** استخلاص اسم الشركة/الجهة الجوهري من اسم اللجنة لمطابقة أسماء بيانات الاشتراكات */
function coreKey(name: string): string {
  let s = normalizeArabicText(name);
  // تجريد البادئة "اللجنة النقابية ..." ولواحق المقر/الفرع
  s = s
    .replace(/^اللجنه النقابيه\s+/i, '')
    .replace(/^(ل?شركه|بشركه)\s+/i, '')
    .replace(/\s*[-_–]\s*[\s\S]*$/, '') // شطب أي شيء بعد "-"/"_"/"–" (المقر/الفرع)
    .replace(/\s+/g, ' ')
    .trim();
  return s;
}

/** استخراج أطول "جوهر" مشترك بين اسمي لجنة وبيان — يطابق ما دام أحدهما يحتوي الآخر */
function takeStatementCore(
  stmtMap: Map<string, { total?: number; share?: number; name: string }>,
  committeeCore: string
): { total?: number; share?: number; name: string } | undefined {
  if (!committeeCore) return undefined;
  for (const [stmtNorm, st] of stmtMap) {
    const stmtCore = coreKey(st.name);
    // التطابق جيد إذا احتوى أيٌّ منهما على جوهر الآخر (بسلسلة كلمات ذات معنى)
    if (containsCore(committeeCore, stmtCore)) {
      stmtMap.delete(stmtNorm);
      return st;
    }
  }
  // محاولة تقريبية أخيرة: جوهر أحد الاسمين بادرة/جزء من الآخر
  let bestKey: string | undefined;
  let best: { total?: number; share?: number; name: string } | undefined;
  let bestScore = 0;
  for (const [stmtNorm, st] of stmtMap) {
    const stmtCore = coreKey(st.name);
    const score = calculateSimilarity(committeeCore, stmtCore);
    if (score > bestScore) {
      bestScore = score;
      bestKey = stmtNorm;
      best = st;
    }
  }
  if (bestScore >= 0.55 && bestKey !== undefined) {
    stmtMap.delete(bestKey);
    return best;
  }
  return undefined;
}

/** هل يحتوي جوهر أحدهما على جوهر الآخر كتسلسل كلمات؟ */
function containsCore(a: string, b: string): boolean {
  if (!a || !b) return false;
  const aWords = a.split(' ');
  const bWords = b.split(' ');
  // الاحتواء المباشر (مطابقة كاملة كتسلسل كلمات)
  const direct = a.includes(b) && bWords.length >= 2;
  const reverse = b.includes(a) && aWords.length >= 2;
  if (direct || reverse) return true;
  // الاحتواء عبر إعادة ترتيب الكلمات (مطابقة مجموعة كلمات)
  const min = bWords.length <= aWords.length ? bWords : aWords;
  const max = bWords.length <= aWords.length ? aWords : bWords;
  if (min.length < 2) return false;
  let covered = 0;
  const maxCopy = [...max];
  for (const w of min) {
    const i = maxCopy.indexOf(w);
    if (i >= 0) {
      maxCopy.splice(i, 1);
      covered++;
    }
  }
  return covered / min.length >= 0.9;
}

export const committeesService = new CommitteesService();
