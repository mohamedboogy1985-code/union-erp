import { db, getPool } from '../../src/db/index.js';
import * as dbSchema from '../../src/db/schema.js';
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
  /** عدد ليالي المأمورية؛ يلزم حتى يمكن مقارنة بدل السفر بحد الليلة */
  travelNights?: number;
  /** يتيح تطبيق استثناء المادة 40 على عضو هيئة المكتب عند تسجيله صراحةً */
  boardMember?: boolean;
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

  /**
   * إعدادات القواعد تُحفظ في PostgreSQL، لا في الذاكرة فقط.  يحتفظ هذا الطابور
   * بالكتابة الأخيرة لكل قاعدة حتى لا يعود طلبان متزامنان إلى قيمة قديمة.
   */
  private readonly pendingWrites = new Map<string, Promise<void>>();
  private storageInitialized = false;

  /**
   * إنشاء جدول القواعد عند الحاجة.  ملف pg-schema.sql يغطي قواعد البيانات
   * الجديدة، أما قواعد البيانات الموجودة قبل هذه الميزة فتُرقّى هنا دون إسقاط
   * أي جدول أو إنشاء منظومة لوائح جديدة.
   */
  private async ensureStorageTable(): Promise<void> {
    await getPool().query(`
      CREATE TABLE IF NOT EXISTS "regulation_rules" (
        "rule_id" text PRIMARY KEY NOT NULL,
        "value" text NOT NULL,
        "value_type" text DEFAULT 'string' NOT NULL,
        "article_no" text NOT NULL,
        "enabled" boolean DEFAULT true NOT NULL,
        "severity" text DEFAULT 'WARN' NOT NULL,
        "updated_at" timestamp DEFAULT now() NOT NULL
      )
    `);
  }

  private hasDatabaseConfiguration(): boolean {
    return Boolean(
      process.env.SQL_HOST ||
      process.env.PGHOST ||
      process.env.SQL_DB_NAME ||
      process.env.PGDATABASE
    );
  }

  private decodeStoredValue(value: string, valueType: string): number | string {
    if (valueType === 'number') {
      const numberValue = Number(value);
      return Number.isFinite(numberValue) ? numberValue : value;
    }
    return value;
  }

  private snapshot(rule: LiveRegulationRule): LiveRegulationRule {
    return { ...rule };
  }

  private persistRule(rule: LiveRegulationRule): Promise<void> {
    if (!this.hasDatabaseConfiguration()) return Promise.resolve();

    const snapshot = this.snapshot(rule);
    const previous = this.pendingWrites.get(snapshot.ruleId) || Promise.resolve();
    const write = previous.catch(() => undefined).then(async () => {
      await db
        .insert(dbSchema.regulationRules)
        .values({
          ruleId: snapshot.ruleId,
          value: String(snapshot.value),
          valueType: typeof snapshot.value === 'number' ? 'number' : 'string',
          articleNo: snapshot.articleNo || '',
          enabled: snapshot.enabled,
          severity: snapshot.severity,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: dbSchema.regulationRules.ruleId,
          set: {
            value: String(snapshot.value),
            valueType: typeof snapshot.value === 'number' ? 'number' : 'string',
            articleNo: snapshot.articleNo || '',
            enabled: snapshot.enabled,
            severity: snapshot.severity,
            updatedAt: new Date(),
          },
        });
    });

    this.pendingWrites.set(snapshot.ruleId, write);
    void write.finally(() => {
      if (this.pendingWrites.get(snapshot.ruleId) === write) this.pendingWrites.delete(snapshot.ruleId);
    }).catch(() => undefined);
    return write;
  }

  /**
   * تحميل التعديلات المحفوظة بعد اتصال PostgreSQL وقبل تسجيل المسارات.
   * القيم الافتراضية من financial-regulation.ts تبقى fallback عند عدم وجود
   * تخزين أو عند تعذر الاتصال.
   */
  public async initialize(): Promise<void> {
    if (this.storageInitialized || !this.hasDatabaseConfiguration()) return;
    try {
      await this.ensureStorageTable();
      const storedRules = await db.select().from(dbSchema.regulationRules);
      for (const stored of storedRules) {
        const rule = liveRules.find((candidate) => candidate.ruleId === stored.ruleId);
        if (!rule) continue;
        rule.value = this.decodeStoredValue(stored.value, stored.valueType);
        rule.articleNo = stored.articleNo;
        rule.enabled = stored.enabled;
        rule.severity = stored.severity === 'BLOCK' ? 'BLOCK' : 'WARN';
      }
      this.storageInitialized = true;
    } catch (error) {
      // PostgreSQL is optional in local/demo mode; the in-memory defaults remain usable.
      console.warn(`⚠️ تعذر تحميل إعدادات اللائحة المحفوظة: ${(error as Error)?.message || 'خطأ غير معروف'}`);
    }
  }

  /** انتظار الكتابات المطلوبة قبل إرسال استجابة configureRule */
  public async flushPersistence(): Promise<void> {
    await Promise.all([...this.pendingWrites.values()]);
  }

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
    void this.persistRule(rule).catch((error) => {
      console.warn(`⚠️ تعذر حفظ إعداد قاعدة اللائحة ${ruleId}: ${(error as Error)?.message || 'خطأ غير معروف'}`);
    });
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
    /** تصنيف الجهة اللازمة لاختيار حدود النقابة العامة أو اللجان المنصوص عليها في المواد 6 و9 و37 و61. */
    entityLevel?: 'GENERAL_UNION' | 'COMMITTEE' | 'OTHER';
    /** سطور القيد — تُستخدم للقواعد التخصصية (الصرف النقدي / البدلات / الهدايا / المشتريات). */
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

    // مادة 9: مجموع الصرف النقدي في الغرض الواحد؛ حد اللجنة يختلف عن النقابة العامة.
    const cashCeiling = input.entityLevel === 'OTHER'
      ? undefined
      : this.getRule(input.entityLevel === 'COMMITTEE' ? 'CASH_PAYMENT_CEILING_BRANCH' : 'CASH_PAYMENT_CEILING');
    const cashOut = lines.filter(isCashAccount).reduce((sum, l) => sum + (l.credit || 0), 0);
    if (this.active(cashCeiling) && cashOut > Number(cashCeiling.value)) {
      violations.push(this.violate(cashCeiling, `إجمالي الصرف النقدي في القيد الحالي للغرض المسجل (${cashOut.toLocaleString()} ج.م) يتجاوز حد المادة 9 (${Number(cashCeiling.value).toLocaleString()} ج.م). يجوز للرئيس الموافقة على الزيادة بأسباب موضحة؛ يلزم التحقق من الاستثناء ومستنداته.`));
    }

    for (const line of lines) {
      const amount = Math.max(line.debit || 0, line.credit || 0);
      if (amount <= 0) continue;
      const desc = `${line.description ?? ''} ${line.accountName ?? ''}`;

      // مادة 37: القيمة في السطر قد تجمع عدة ليالٍ؛ لا تُقارن بحد الليلة إلا عند توفير عدد الليالي صراحةً.
      if (keywordHit(desc, ['سفر', 'مأمورية', 'مدة سفر']) && Number.isInteger(line.travelNights) && (line.travelNights ?? 0) > 0) {
        const floor = input.entityLevel === 'OTHER'
          ? undefined
          : this.getRule(input.entityLevel === 'COMMITTEE' ? 'TRAVEL_ALLOWANCE_DAILY_CAP_BRANCH' : 'TRAVEL_ALLOWANCE_DAILY_CAP');
        const nightlyAmount = amount / Number(line.travelNights);
        if (this.active(floor) && nightlyAmount < Number(floor.value)) {
          violations.push(this.violate(floor, `متوسط بدل السفر عن الليلة (${nightlyAmount.toLocaleString()} ج.م) أقل من الحد الأدنى المقرر (${Number(floor.value).toLocaleString()} ج.م) وفق المادة 37.`));
        }
        const incPct = this.getRule('TRAVEL_ALLOWANCE_MAX_INCREASE_PCT');
        if (this.active(floor) && this.active(incPct)) {
          const maxWithIncrease = Number(floor.value) * (1 + Number(incPct.value) / 100);
          if (nightlyAmount > maxWithIncrease) {
            violations.push(this.violate(incPct, `متوسط بدل السفر عن الليلة (${nightlyAmount.toLocaleString()} ج.م) يتجاوز الحد الأدنى (${Number(floor.value).toLocaleString()} ج.م) بنسبة تزيد على المسموح (${Number(incPct.value)}%) — الزيادة تتطلب مذكرة أسباب وقرار مجلس الإدارة.`));
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

      // مادة 40: يوجد استثناء صريح لأعضاء هيئة المكتب؛ لا يُفحص الحد إلا إذا عُرفت الصفة صراحةً بأنها ليست عضو هيئة مكتب.
      if (keywordHit(desc, ['أعباء']) && line.boardMember === false) {
        const burden = this.getRule('MONTHLY_BURDEN_ALLOWANCE_CAP');
        if (this.active(burden) && amount > Number(burden.value)) {
          violations.push(this.violate(burden, `بدل الأعباء (${amount.toLocaleString()} ج.م) يتجاوز الحد الشهري المقرر (${Number(burden.value).toLocaleString()} ج.م)؛ تحقّق من انطباق استثناء عضو هيئة المكتب بالمادة 40.`));
        }
      }

      // مادة 50: الحد 5,000 جنيه للوفد؛ الاستثناء حتى القيمة المذكورة بالمادة بقرار رئيس المنظمة.
      // صيغ المادة 51 الرقمية الملتبسة غير مفعلة ولا تُستخدم هنا.
      if (keywordHit(desc, ['هدايا', 'وفود', 'ضيافة'])) {
        const exceptional = this.getRule('GIFTS_CEILING_EXCEPTIONAL');
        const regular = this.getRule('GIFTS_CEILING_REGULAR');
        if (this.active(exceptional) && amount > Number(exceptional.value)) {
          violations.push(this.violate(exceptional, `قيمة الهدايا (${amount.toLocaleString()} ج.م) تتجاوز الحد الاستثنائي المطبوع في المادة 50 (${Number(exceptional.value).toLocaleString()} ج.م).`));
        } else if (this.active(regular) && amount > Number(regular.value)) {
          violations.push(this.violate(regular, `قيمة الهدايا (${amount.toLocaleString()} ج.م) تتجاوز حد 5,000 جنيه للوفد؛ يلزم قرار رئيس المنظمة وأسباب الحالة للتحقق من الاستثناء الوارد بالمادة 50.`));
        }
      }

      // مادة 61: تمييز حدود اللجنة والنقابة العامة والتحقق من درجات الممارسة والمناقصات.
      // قيمة سطر القيد ليست بديلاً عن قيمة العملية التقديرية؛ لذلك تصدر هذه القاعدة تحذيراً فقط.
      if (input.entityLevel !== 'OTHER' && keywordHit(desc, ['شراء', 'توريد', 'مشتريات', 'لوازم', 'مهمات'])) {
        const isCommittee = input.entityLevel === 'COMMITTEE';
        const direct = this.getRule(isCommittee ? 'PROC_DIRECT_ORDER_CEILING_BRANCH' : 'PROC_DIRECT_ORDER_CEILING');
        const practice = this.getRule(isCommittee ? 'PROC_TENDER_CEILING_BRANCH' : 'PROC_TENDER_CEILING');
        const limited = this.getRule(isCommittee ? 'PROC_LIMITED_TENDER_CEILING_BRANCH' : 'PROC_LIMITED_TENDER_CEILING');
        if (this.active(limited) && amount > Number(limited.value)) {
          violations.push(this.violate(limited, `قيمة عملية الشراء المسجلة (${amount.toLocaleString()} ج.م) تتجاوز سقف المناقصة المحدودة (${Number(limited.value).toLocaleString()} ج.م)؛ راجع لزوم المناقصة العامة واستثناءات الشراء المباشر الواردة بالمادة 61.`));
        } else if (this.active(practice) && amount > Number(practice.value)) {
          violations.push(this.violate(practice, `قيمة عملية الشراء المسجلة (${amount.toLocaleString()} ج.م) تتجاوز سقف الممارسة (${Number(practice.value).toLocaleString()} ج.م)؛ راجع إجراءات المناقصة المحدودة بالمادة 61.`));
        } else if (this.active(direct) && amount > Number(direct.value)) {
          violations.push(this.violate(direct, `قيمة عملية الشراء المسجلة (${amount.toLocaleString()} ج.م) تتجاوز سقف الأمر المباشر (${Number(direct.value).toLocaleString()} ج.م)؛ راجع إجراء الممارسة أو الاستثناءات بالمادة 61.`));
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
   * فحص نسب التوزيع مقابل لائحة الاشتراكات.
   * يقبل معرفات حرفية أو لاحقة اختيارية مثل *committee؛ تُجمع النسب عند تعدد الجهات.
   */
  public checkDistributionPercentages(lines: { beneficiaryOrgId: string; percentage: number }[]): RegulationViolation[] {
    const violations: RegulationViolation[] = [];
    const mandate = this.getRule('REVENUE_DISTRIBUTION_MANDATE');
    if (!this.active(mandate)) return violations;
    try {
      const mandated = JSON.parse(String(mandate.value)) as Record<string, number>;
      for (const [orgPattern, pct] of Object.entries(mandated)) {
        const isOptionalWildcard = orgPattern.startsWith('*');
        const suffix = isOptionalWildcard ? orgPattern.slice(1).toLowerCase() : '';
        const matchingLines = isOptionalWildcard
          ? lines.filter((line) => line.beneficiaryOrgId.toLowerCase().endsWith(suffix))
          : lines.filter((line) => line.beneficiaryOrgId === orgPattern);
        if (isOptionalWildcard && matchingLines.length === 0) continue;
        const actual = matchingLines.reduce((sum, line) => sum + line.percentage, 0);
        if (Math.abs(actual - pct) > 0.01) {
          violations.push(this.violate(mandate, `نسبة الجهة/الفئة ${orgPattern} (${actual}%) تخالف النسبة المقررة باللائحة (${pct}%).`));
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
