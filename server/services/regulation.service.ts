import {
  FINANCIAL_REGULATION_ARTICLES,
  REGULATION_THRESHOLDS_SEED,
  REGULATION_ACTIVATED_RULES,
  type FinancialRegulationArticle,
  type RegulationThresholdSeed,
} from '../data/financial-regulation.js';

/**
 * ===== محرك إنفاذ اللائحة المالية (Regulation Enforcement Engine) =====
 * طبقة الإنفاذ الثانية للائحة المالية المرفقة:
 * - تفصل «الآلية» (جاهزة ومختبرة) عن «القيمة» (تُنقل من نص المادة).
 * - أي قاعدة بلا قيمة معتمدة (value=null أو enabled=false) خاملة تماماً
 *   ← صفر تغيير في سلوك النظام قبل وصول نص اللائحة.
 * - كل مخالفة/تحذير يحمل رقم المادة (articleNo) لأثر تدقيقي كامل.
 */

export type RuleScope = RegulationThresholdSeed['scope'];

export interface LiveRegulationRule extends RegulationThresholdSeed {
  /** القيمة المعتمدة المنقولة من نص المادة (null = غير مُرقَّمة بعد) */
  value: number | string | null;
  /** رقم المادة المرجع في الوثيقة */
  articleNo: string | null;
  /** التفعيل النهائي — لا تُنفَّذ القاعدة إلا بـ value + enabled */
  enabled: boolean;
  /** صرامة المخالفة: BLOCK يرمي خطأً ويمنع العملية، WARN يرد كتحذير */
  severity: 'BLOCK' | 'WARN';
}

export interface RegulationViolation {
  ruleId: string;
  articleNo: string | null;
  severity: 'BLOCK' | 'WARN';
  message: string;
}

export interface RegulationJournalLine {
  /** كود الحساب المحاسبي (مثال: 1101 للخزينة الرئيسية) */
  accountCode?: string;
  /** اسم الحساب */
  accountName?: string;
  /** بيان السطر — تُستخرج منه الكلمات المفتاحية للقواعد التخصصية */
  description?: string;
  debit: number;
  credit: number;
}

// الحالة الحية: المانيفست الأصلي لا يتغير، والقيم تُرقَّم هنا فقط
const liveRules: LiveRegulationRule[] = REGULATION_THRESHOLDS_SEED.map((seed) => ({
  ...seed,
  value: null,
  articleNo: null,
  enabled: false,
  severity: 'WARN',
}));

// ===== التفعيل الافتراضي منذ الإقلاع =====
// القيم المنقولة من نصوص الوثيقة (اللائحة 86 مادة) تُطبَّق مباشرة دون انتظار
// ترقيم يدوي — أي قاعدة في REGULATION_ACTIVATED_RULES تصبح نافذة فوراً.
for (const config of REGULATION_ACTIVATED_RULES) {
  const rule = liveRules.find((r) => r.ruleId === config.ruleId);
  if (!rule) continue;
  rule.value = config.value;
  rule.articleNo = config.articleNo;
  rule.enabled = true;
  rule.severity = config.severity ?? rule.severity;
}

/** هل بيان السطر يطابق أي كلمة مفتاحية؟ */
function keywordHit(description: string | undefined, keywords: string[]): boolean {
  if (!description) return false;
  const d = description.replace(/\s|ـ/g, '').toLowerCase();
  return keywords.some((kw) => d.includes(kw.replace(/\s|ـ/g, '').toLowerCase()));
}

export class RegulationService {
  // ------------------------- إدارة القواعد -------------------------

  /** ترقيم قاعدة من نص المادة: القيمة + رقم المادة + التفعيل + الصرامة (يُستدعى عند تعبئة اللائحة) */
  public configureRule(
    ruleId: string,
    value: number | string,
    articleNo: string,
    opts: { enabled?: boolean; severity?: 'BLOCK' | 'WARN' } = {}
  ): LiveRegulationRule {
    const rule = liveRules.find((r) => r.ruleId === ruleId);
    if (!rule) throw new Error(`قاعدة اللائحة غير معروفة: ${ruleId}`);
    rule.value = value;
    rule.articleNo = articleNo;
    rule.enabled = opts.enabled ?? true;
    rule.severity = opts.severity ?? rule.severity;
    return rule;
  }

  public getRule(ruleId: string): LiveRegulationRule | undefined {
    return liveRules.find((r) => r.ruleId === ruleId);
  }

  public listRules(): LiveRegulationRule[] {
    return liveRules;
  }

  public listArticles(): FinancialRegulationArticle[] {
    return FINANCIAL_REGULATION_ARTICLES;
  }

  /** هل القاعدة نافذة فعلياً الآن؟ */
  private active(rule: LiveRegulationRule | undefined): rule is LiveRegulationRule & { value: number | string } {
    return !!rule && rule.enabled && rule.value !== null && rule.value !== '';
  }

  // ------------------------- نقاط الإنفاذ -------------------------

  /**
   * فحص قيد يومية مقابل قواعد اللائحة النافذة.
   * يُستدعى من AccountingService.createJournalEntry بعد التحققات المحاسبية.
   * القواعد الخاملة لا تُنتج شيئاً — سلوك النظام الحالي محفوظ بالكامل.
   */
  public checkJournalEntry(input: {
    totalDebit: number;
    linesCount: number;
    attachmentIds?: string[];
    type?: string;
    /** سطور القيد — تُستخدم للقواعد التخصصية (الصرف النقدي / البدلات / الهدايا / المشتريات) */
    lines?: RegulationJournalLine[];
  }): RegulationViolation[] {
    const violations: RegulationViolation[] = [];

    const maxApprove = this.getRule('MAX_JOURNAL_ENTRY_AUTO_APPROVE');
    if (this.active(maxApprove) && input.totalDebit > Number(maxApprove.value)) {
      violations.push(this.violate(maxApprove, `قيمة القيد (${input.totalDebit.toLocaleString()} ج.م) تتجاوز حد سلطة الاعتماد المقرر باللائحة (${Number(maxApprove.value).toLocaleString()} ج.م) — يتطلب اعتماد درجة أعلى قبل الاعتماد.`));
    }

    const docRequired = this.getRule('DOCUMENT_REQUIRED_ABOVE');
    const hasDocument = (input.attachmentIds?.length ?? 0) > 0;
    const isReversal = (input.type ?? 'MANUAL') === 'REVERSAL';
    if (
      this.active(docRequired) &&
      input.totalDebit > Number(docRequired.value) &&
      !isReversal &&
      !hasDocument
    ) {
      violations.push(this.violate(docRequired, `القيد بقيمة ${input.totalDebit.toLocaleString()} ج.م يتجاوز حد إلزامية المستند المؤيد (${Number(docRequired.value).toLocaleString()} ج.م) وفق اللائحة — أرفق المستند قبل الاعتماد.`));
    }

    // ---- القواعد التخصصية المنقولة من نصوص المواد (تعتمد على سطور القيد) ----
    // القيود العكسية (تصحيحات) مستثناة من الفحوص التخصصية — لا تمثل صرفاً فعلياً.
    if (isReversal) return violations;

    const lines = input.lines ?? [];
    const isCashAccount = (line: RegulationJournalLine) =>
      line.accountCode === '1101' || (line.accountName ?? '').includes('خزينة');

    // مادة 9: مجموع الصرف النقدي في الغرض الواحد
    const cashCeiling = this.getRule('CASH_PAYMENT_CEILING');
    const cashOut = lines.filter(isCashAccount).reduce((sum, l) => sum + (l.credit || 0), 0);
    if (this.active(cashCeiling) && cashOut > Number(cashCeiling.value)) {
      violations.push(this.violate(cashCeiling, `إجمالي الصرف نقداً من الخزينة في هذا الغرض (${cashOut.toLocaleString()} ج.م) يتجاوز سقف الصرف النقدي (${Number(cashCeiling.value).toLocaleString()} ج.م) — يُصرف ما زاد بشيك/تحويل باسم المستحق.`));
    }

    for (const line of lines) {
      const amount = Math.max(line.debit || 0, line.credit || 0);
      if (amount <= 0) continue;
      const desc = `${line.description ?? ''} ${line.accountName ?? ''}`;

      // مادة 37: بدل السفر (حد أدنى للقيمة عن الليلة + أقصى زيادة عن الحد الأدنى)
      if (keywordHit(desc, ['سفر', 'مأمورية', 'مدة سفر'])) {
        const floor = this.getRule('TRAVEL_ALLOWANCE_DAILY_CAP');
        if (this.active(floor) && amount < Number(floor.value)) {
          violations.push(this.violate(floor, `قيمة بدل السفر (${amount.toLocaleString()} ج.م) أقل من الحد الأدنى المقرر (${Number(floor.value).toLocaleString()} ج.م عن الليلة) وفق اللائحة.`));
        }
        const incPct = this.getRule('TRAVEL_ALLOWANCE_MAX_INCREASE_PCT');
        if (this.active(floor) && this.active(incPct)) {
          const maxWithIncrease = Number(floor.value) * (1 + Number(incPct.value) / 100);
          if (amount > maxWithIncrease) {
            violations.push(this.violate(incPct, `قيمة بدل السفر (${amount.toLocaleString()} ج.م) تتجاوز الحد الأدنى (${Number(floor.value).toLocaleString()} ج.م) بنسبة تزيد على المسموح (${Number(incPct.value)}%) — الزيادة تتطلب قرار مجلس الإدارة.`));
          }
        }
      }

      // مادة 39: بدل الانتقال الشهري
      if (keywordHit(desc, ['بدل انتقال', 'انتقال', 'مواصلات'])) {
        const transport = this.getRule('MONTHLY_TRANSPORT_ALLOWANCE_CAP');
        if (this.active(transport) && amount > Number(transport.value)) {
          violations.push(this.violate(transport, `بدل الانتقال (${amount.toLocaleString()} ج.م) يتجاوز الحد الشهري المقرر (${Number(transport.value).toLocaleString()} ج.م) إلا بقرار من مجلس الإدارة.`));
        }
      }

      // مادة 40: بدل الأعباء الشهري
      if (keywordHit(desc, ['أعباء'])) {
        const burden = this.getRule('MONTHLY_BURDEN_ALLOWANCE_CAP');
        if (this.active(burden) && amount > Number(burden.value)) {
          violations.push(this.violate(burden, `بدل الأعباء (${amount.toLocaleString()} ج.م) يتجاوز الحد الشهري المقرر (${Number(burden.value).toLocaleString()} ج.م) وفق اللائحة.`));
        }
      }

      // مادتا 50/51: هدايا الوفود
      if (keywordHit(desc, ['هدايا', 'وفود', 'ضيافة'])) {
        const exceptional = this.getRule('GIFTS_CEILING_EXCEPTIONAL');
        const regular = this.getRule('GIFTS_CEILING_REGULAR');
        if (this.active(exceptional) && amount > Number(exceptional.value)) {
          violations.push(this.violate(exceptional, `قيمة الهدايا (${amount.toLocaleString()} ج.م) تتجاوز الحد الاستثنائي (${Number(exceptional.value).toLocaleString()} ج.م) — ما فوقه يتطلب موافقة مجلس الإدارة.`));
        } else if (this.active(regular) && amount > Number(regular.value)) {
          violations.push(this.violate(regular, `قيمة الهدايا (${amount.toLocaleString()} ج.م) تتجاوز الحد العادي (${Number(regular.value).toLocaleString()} ج.م) — الجائز حتى الحد الاستثنائي بقرار من رئيس المنظمة.`));
        }
      }

      // مادة 61: طريقة الشراء تبعاً لقيمة العملية
      if (keywordHit(desc, ['شراء', 'توريد', 'مشتريات', 'لوازم', 'مهمات'])) {
        const tender = this.getRule('PROC_TENDER_CEILING');
        const direct = this.getRule('PROC_DIRECT_ORDER_CEILING');
        if (this.active(tender) && amount > Number(tender.value)) {
          violations.push(this.violate(tender, `قيمة عملية الشراء/التوريد (${amount.toLocaleString()} ج.م) تتجاوز حد الممارسة (${Number(tender.value).toLocaleString()} ج.م) — تستلزم مناقصة/ممارسة حسب إجراءات اللائحة.`));
        } else if (this.active(direct) && amount > Number(direct.value)) {
          violations.push(this.violate(direct, `قيمة عملية الشراء (${amount.toLocaleString()} ج.م) تتجاوز حد الأمر المباشر (${Number(direct.value).toLocaleString()} ج.م) — يستلزم إجراء ممارسة/مزاد وفق اللائحة.`));
        }
      }
    }

    return violations;
  }

  /**
   * فحص سلفة عامل مقابل قواعد اللائحة (سقف النسبة من الأجر).
   * يُستدعى من EmployeeAffairsService.addAdvance.
   */
  public checkEmployeeAdvance(input: { amount: number; annualOrMonthlySalary?: number }): RegulationViolation[] {
    const violations: RegulationViolation[] = [];
    const pct = this.getRule('ADVANCE_MAX_PERCENT_OF_SALARY');
    if (
      this.active(pct) &&
      input.annualOrMonthlySalary &&
      input.annualOrMonthlySalary > 0 &&
      input.amount > (Number(pct.value) / 100) * input.annualOrMonthlySalary
    ) {
      violations.push(
        this.violate(pct, `قيمة السلفة (${input.amount.toLocaleString()} ج.م) تتجاوز النسبة المقررة من الأجر (${Number(pct.value)}%) وفق اللائحة.`)
      );
    }
    return violations;
  }

  /**
   * فحص قاعدة توزيع إيراد مقابل نسب اللائحة الإلزامية (عند ترقيمها).
   * النسبة enforce كـ JSON نصي {beneficiaryOrgId: percent} عند value.
   */
  public checkDistributionPercentages(lines: { beneficiaryOrgId: string; percentage: number }[]): RegulationViolation[] {
    const violations: RegulationViolation[] = [];
    const mandate = this.getRule('REVENUE_DISTRIBUTION_MANDATE');
    if (!this.active(mandate)) return violations;
    try {
      const mandated = JSON.parse(String(mandate.value)) as Record<string, number>;
      for (const [orgId, pct] of Object.entries(mandated)) {
        const actual = lines.find((l) => l.beneficiaryOrgId === orgId)?.percentage ?? 0;
        if (Math.abs(actual - pct) > 0.01) {
          violations.push(this.violate(mandate, `نسبة الجهة ${orgId} (${actual}%) تخالف النسبة المقررة باللائحة (${pct}%).`));
        }
      }
    } catch {
      /* قيمة غير قابلة للتحليل = قاعدة غير مكتملة */
    }
    return violations;
  }

  // ------------------------- التقارير -------------------------

  /** حالة جاهزية اللائحة: ما فُعّل وما ينتظر نص الوثيقة */
  public getStatus(): {
    articlesCount: number;
    activeRules: LiveRegulationRule[];
    pendingRules: LiveRegulationRule[];
    isEnforcing: boolean;
  } {
    const activeRules = liveRules.filter((r) => this.active(r));
    return {
      articlesCount: FINANCIAL_REGULATION_ARTICLES.length,
      activeRules,
      pendingRules: liveRules.filter((r) => !this.active(r)),
      isEnforcing: activeRules.length > 0,
    };
  }

  /** بحث نصي داخل مواد اللائحة (يغذي المساعد الذكي) */
  public searchArticles(normalizedQueryIncludes: (keyword: string) => boolean): FinancialRegulationArticle[] {
    return FINANCIAL_REGULATION_ARTICLES.filter(
      (a) =>
        a.keywords.some((kw) => normalizedQueryIncludes(kw)) ||
        normalizedQueryIncludes(a.title) ||
        normalizedQueryIncludes(`المادة ${a.articleNo}`)
    );
  }

  private violate(rule: LiveRegulationRule, message: string): RegulationViolation {
    return {
      ruleId: rule.ruleId,
      articleNo: rule.articleNo,
      severity: rule.severity,
      message: `[لائحة مالية${rule.articleNo ? ` — م${rule.articleNo}` : ''}] ${message}`,
    };
  }
}

export const regulationService = new RegulationService();
