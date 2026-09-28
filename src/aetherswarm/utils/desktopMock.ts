import { ProductPriceItem } from '../types/swarm';

/**
 * ===== بيانات سطح المكتب داخل سطح السرب =====
 *
 * كان هذا الملف يزرع ملفاً باسم `RTX5090_Comparison.xlsx` بحجم «42.8 KB» وخمسة أسعار لكرت
 * رسومي بمصادر مثل «Newegg Direct Merchant API» وثقة 0.99 — أي بيانات مُصنَّعة داخل
 * واجهة يُفترض أنها تعرض نتائج تنفيذ (docs/AI_AGENT_AUDIT.md بند P0-1).
 *
 * بعد التصلّب: لا ملفات ولا أسعار مبدئية. هذا السطح يقرأ بيانات ERP للقراءة فقط،
 * ولا يكتب ملفاً على جهازك، ولا يقرأ شاشتك. أي ملف أو سعر يظهر لاحقاً يجب أن يأتي
 * من تنفيذ أداة حقيقية — وإلا فالصحيح أن يظهر «لا شيء».
 */
export interface DesktopFile {
  id: string;
  name: string;
  path: string;
  size: string;
  modified: string;
  type: 'file' | 'folder';
  content?: string;
}

export const INITIAL_FILES: DesktopFile[] = [];

export const INITIAL_PRODUCTS: ProductPriceItem[] = [];
