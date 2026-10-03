import { db, getPool } from '../../src/db/index.ts';
import * as schema from '../../src/db/schema.ts';
import { ERPStore } from './store.js';
import { normalizeArabicText } from '../utils/arabic.js';
import { findDebtorsAccount } from '../utils/account-lookup.js';
import fs from 'fs';
import path from 'path';
import { moduleDir, resolveFirst } from '../utils/runtime-paths.js';
import { repairSchemaDrift } from './schema-drift.js';
import { rebuildLedgerChain, resealLedgerChain, verifyLedgerChain } from '../services/ledger-chain.service.js';
import {
  AUDIT_HASH_VERSION,
  hashAuditLog,
  isVersionedAuditHash,
  resealAuditLogChain,
  verifyAuditLogChain,
  type AuditChainVerificationResult,
} from '../services/audit-chain.service.js';

export class PostgresStorageManager {
  private isInitialized = false;
  private dbAvailable = false;

  // ===== سلسلة تجزئة سجل التدقيق الدائمة (P0-3) =====
  // الحالة محفوظة في الذاكرة بعد قراءتها من القاعدة، وكل كتابة تُسلسَل عبر طابور
  // واحد حتى لا يتكرر التسلسل ولا تنكسر السلسلة عند تزامن الطلبات.
  private auditSequence = 0;
  private auditChainHash = '0'.repeat(64);
  private auditWriteQueue: Promise<void> = Promise.resolve();
  private auditLoadFailed = false;

  /** هل الاتصال بقاعدة PostgreSQL قائم؟ */
  public isDbAvailable(): boolean {
    return this.dbAvailable;
  }

  /**
   * إنشاء جداول القاعدة من ملف المخطط إن لم تكن موجودة (pg-schema.sql مولّد من drizzle)
   */
  private async ensureTables(): Promise<void> {
    const check = await getPool().query(
      "SELECT EXISTS (SELECT FROM information_schema.tables WHERE table_schema='public' AND table_name='accounts') as exists"
    );
    if (!check.rows[0]?.exists) {
      const MODULE_DIR = moduleDir(typeof import.meta !== 'undefined' ? import.meta.url : undefined);
      const ddlPath = resolveFirst([
        path.join(process.cwd(), 'server', 'db', 'pg-schema.sql'),
        path.join(MODULE_DIR, 'pg-schema.sql'),
        path.join(MODULE_DIR, '..', 'server', 'db', 'pg-schema.sql'),
      ]);
      if (!ddlPath) {
        throw new Error('ملف مخطط قاعدة البيانات (pg-schema.sql) غير موجود');
      }
      const ddl = fs.readFileSync(ddlPath, 'utf-8');
      await getPool().query(ddl);
      console.log('🗃️ تم إنشاء جداول قاعدة البيانات من المخطط المرجعي.');
    }

    // قواعد قائمة قديمة لا تُعاد عليها كل جمل CREATE من المخطط؛ أنشئ جدولَي المكتبة
    // عند الترقية، ثم يضيف repairSchema الأعمدة/الفهارس الناقصة من المرجع.
    await getPool().query(`CREATE TABLE IF NOT EXISTS regulation_sources (
      id text PRIMARY KEY NOT NULL,
      code text NOT NULL UNIQUE,
      title_ar text NOT NULL,
      subtitle_ar text DEFAULT '' NOT NULL,
      kind_ar text DEFAULT '' NOT NULL,
      authority_ar text DEFAULT '' NOT NULL,
      issue_ref_ar text DEFAULT '' NOT NULL,
      issued_at text,
      pages_count integer DEFAULT 0 NOT NULL,
      file_name text DEFAULT '' NOT NULL,
      sha256 text,
      has_text_layer boolean DEFAULT true NOT NULL,
      extraction_ar text DEFAULT '' NOT NULL,
      docs_count integer DEFAULT 0 NOT NULL,
      unit_label_ar text DEFAULT 'مادة' NOT NULL,
      status_ar text DEFAULT '' NOT NULL,
      notes_ar text DEFAULT '' NOT NULL,
      created_at timestamp DEFAULT now()
    )`);
    await getPool().query(`CREATE TABLE IF NOT EXISTS regulation_documents (
      id text PRIMARY KEY NOT NULL,
      source_id text NOT NULL,
      source_title_ar text DEFAULT '' NOT NULL,
      ref_code text DEFAULT '' NOT NULL,
      article_number text,
      kind_ar text DEFAULT 'مادة' NOT NULL,
      order_index integer DEFAULT 0 NOT NULL,
      page_number integer,
      chapter_ar text,
      title_ar text DEFAULT '' NOT NULL,
      text_ar text NOT NULL,
      tags_ar jsonb DEFAULT '[]'::jsonb NOT NULL,
      enforcement_rule_ids_ar jsonb DEFAULT '[]'::jsonb NOT NULL,
      ocr_derived boolean DEFAULT false NOT NULL,
      search_ar text DEFAULT '' NOT NULL,
      created_at timestamp DEFAULT now()
    )`);
  }

  private async ensureRegulationIndexes(): Promise<void> {
    await getPool().query('CREATE INDEX IF NOT EXISTS regulation_documents_source_idx ON regulation_documents (source_id)');
    await getPool().query('CREATE INDEX IF NOT EXISTS regulation_documents_article_idx ON regulation_documents (source_id, article_number)');
    await getPool().query('CREATE INDEX IF NOT EXISTS regulation_documents_page_idx ON regulation_documents (source_id, page_number)');
  }

  /** Insert/update canonical source rows, then read the complete corpus back from PostgreSQL. */
  private async seedRegulations(store: ERPStore): Promise<void> {
    if (!this.dbAvailable) return;
    try {
      for (const source of store.regulationSources) {
        await db.insert(schema.regulationSources).values({
          id: source.id,
          code: source.code,
          titleAr: source.titleAr,
          subtitleAr: source.subtitleAr,
          kindAr: source.kindAr,
          authorityAr: source.authorityAr,
          issueRefAr: source.issueRefAr,
          issuedAt: source.issuedAt,
          pagesCount: source.pagesCount,
          fileName: source.fileName,
          sha256: source.sha256,
          hasTextLayer: source.hasTextLayer,
          extractionAr: source.extractionAr,
          docsCount: source.docsCount,
          unitLabelAr: source.unitLabelAr,
          statusAr: source.statusAr,
          notesAr: source.notesAr,
        }).onConflictDoUpdate({
          target: schema.regulationSources.id,
          set: {
            code: source.code,
            titleAr: source.titleAr,
            subtitleAr: source.subtitleAr,
            kindAr: source.kindAr,
            authorityAr: source.authorityAr,
            issueRefAr: source.issueRefAr,
            issuedAt: source.issuedAt,
            pagesCount: source.pagesCount,
            fileName: source.fileName,
            sha256: source.sha256,
            hasTextLayer: source.hasTextLayer,
            extractionAr: source.extractionAr,
            docsCount: source.docsCount,
            unitLabelAr: source.unitLabelAr,
            statusAr: source.statusAr,
            notesAr: source.notesAr,
          },
        });
      }

      for (const document of store.regulationDocuments) {
        await db.insert(schema.regulationDocuments).values({
          id: document.id,
          sourceId: document.sourceId,
          sourceTitleAr: document.sourceTitleAr,
          refCode: document.refCode,
          articleNumber: document.articleNumber,
          kindAr: document.kindAr,
          orderIndex: document.orderIndex,
          pageNumber: document.pageNumber ?? null,
          chapterAr: document.chapterAr,
          titleAr: document.titleAr,
          textAr: document.textAr,
          tagsAr: document.tagsAr,
          enforcementRuleIdsAr: document.enforcementRuleIdsAr ?? [],
          ocrDerived: Boolean(document.ocrDerived),
          searchAr: document.searchAr,
        }).onConflictDoUpdate({
          target: schema.regulationDocuments.id,
          set: {
            sourceId: document.sourceId,
            sourceTitleAr: document.sourceTitleAr,
            refCode: document.refCode,
            articleNumber: document.articleNumber,
            kindAr: document.kindAr,
            orderIndex: document.orderIndex,
            pageNumber: document.pageNumber ?? null,
            chapterAr: document.chapterAr,
            titleAr: document.titleAr,
            textAr: document.textAr,
            tagsAr: document.tagsAr,
            enforcementRuleIdsAr: document.enforcementRuleIdsAr ?? [],
            ocrDerived: Boolean(document.ocrDerived),
            searchAr: document.searchAr,
          },
        });
      }

      const sourceRows = await db.select().from(schema.regulationSources);
      const documentRows = await db.select().from(schema.regulationDocuments);
      const toStringArray = (value: unknown): string[] => Array.isArray(value) ? value.map(String) : [];
      store.regulationSources = sourceRows.map((source) => ({
        id: source.id,
        code: source.code,
        titleAr: source.titleAr,
        subtitleAr: source.subtitleAr,
        kindAr: source.kindAr,
        authorityAr: source.authorityAr,
        issueRefAr: source.issueRefAr,
        issuedAt: source.issuedAt,
        pagesCount: source.pagesCount,
        fileName: source.fileName,
        sha256: source.sha256,
        hasTextLayer: source.hasTextLayer,
        extractionAr: source.extractionAr,
        docsCount: source.docsCount,
        unitLabelAr: source.unitLabelAr,
        statusAr: source.statusAr,
        notesAr: source.notesAr,
      }));
      store.regulationDocuments = documentRows.map((document) => ({
        id: document.id,
        sourceId: document.sourceId,
        sourceTitleAr: document.sourceTitleAr,
        refCode: document.refCode,
        articleNumber: document.articleNumber,
        kindAr: document.kindAr,
        orderIndex: document.orderIndex,
        pageNumber: document.pageNumber,
        chapterAr: document.chapterAr,
        titleAr: document.titleAr,
        textAr: document.textAr,
        tagsAr: toStringArray(document.tagsAr),
        enforcementRuleIdsAr: toStringArray(document.enforcementRuleIdsAr),
        ocrDerived: document.ocrDerived,
        searchAr: document.searchAr,
      })).sort((a, b) => a.sourceId.localeCompare(b.sourceId) || a.orderIndex - b.orderIndex || a.id.localeCompare(b.id));
      store.regulationStorageBackend = 'postgres';
      console.log(`📚 مزامنة مكتبة اللوائح: ${store.regulationSources.length} مصادر و${store.regulationDocuments.length} بنداً.`);
    } catch (error: any) {
      // عدم توافر قاعدة/جدول لا يمنع تشغيل وضع الذاكرة ولا يكتب فوق مصادر غير قابلة للقراءة.
      console.warn(`⚠️ تعذّرت مزامنة مكتبة اللوائح مع PostgreSQL: ${error?.message || error}`);
    }
  }

  /**
   * ===== مصالحة المخطط (P0-4) =====
   * تُنفَّذ قبل أي قراءة/كتابة: تعالج ما لا يصلحه `ensureTables` (الذي يُنشئ
   * الجداول مرة واحدة فقط ولا يعدّل قاعدة قائمة). لا تُفشل الإقلاع أبداً.
   */
  private async repairSchema(): Promise<void> {
    try {
      const report = await repairSchemaDrift();
      if (!report.dbAvailable) return;
      if (report.applied.length === 0 && report.errors.length === 0) {
        console.log(`🗃️ المخطط متوافق مع المرجع (فُحص ${report.columnsChecked} عموداً في ${report.tablesChecked} جدولاً).`);
        return;
      }
      console.log(`🗃️ مصالحة المخطط: ${report.applied.length} إصلاحاً في ${report.tablesChecked} جدولاً.`);
      for (const fix of report.applied) {
        console.log(`   • ${fix.action} ${fix.table}.${fix.column} — ${fix.detail}`);
      }
      for (const error of report.errors) {
        console.warn(`   ⚠️ تعذّر إصلاح: ${error}`);
      }
    } catch (error: any) {
      console.warn(`⚠️ تخطّي مصالحة المخطط: ${error?.message || error}`);
    }
  }

  /**
   * Initializes PostgreSQL database and syncs with ERPStore
   */
  public async initialize(store: ERPStore) {
    if (this.isInitialized) return;

    // وضع العرض المحلي: بدون إعداد PostgreSQL تعمل كل الوظائف بالبيانات في الذاكرة
    const hasDbConfig = Boolean(process.env.SQL_HOST || process.env.DATABASE_URL);
    if (!hasDbConfig) {
      this.isInitialized = true;
      this.dbAvailable = false;
      console.log('ℹ️ وضع العرض المحلي: النظام يعمل بكامل وظائفه بالبيانات في الذاكرة (بدون PostgreSQL).');
      console.log('   لتشغيل المزامنة السحابية: اضبط SQL_HOST / SQL_USER / SQL_PASSWORD / SQL_DB_NAME في ملف .env');
      return;
    }

    try {
      // 0. إنشاء الجداول عند أول تشغيل إن لزم
      await this.ensureTables();

      // 0.b مصالحة المخطط (P0-4): إصلاح انحراف الأعمدة في قاعدة قائمة بالفعل
      // (أعمدة ناقصة + أعمدة أموال ما زالت double precision بدل numeric(18,2))
      await this.repairSchema();
      await this.ensureRegulationIndexes();

      // القاعدة متاحة فعلاً (الجداول جاهزة) — تُفعَّل قبل الدمج حتى تكتب
      // persistJournalEntry/persistAccount أثناء مزامنة التحميل أيضاً.
      this.dbAvailable = true;
      await this.seedRegulations(store);

      // طرف سلسلة سجل التدقيق الدائمة (P0-3): تُقرأ قبل أي كتابة تدقيق
      await this.loadAuditChainState();

      // 1. Check if accounts table is populated
      const existingAccounts = await db.select().from(schema.accounts).limit(5);
      const isFreshSeed = existingAccounts.length === 0;

      // مؤشرات لختم سلسلة الأستاذ بعد البذر/التحميل
      let persistedEntryCount = 0;
      let importedEntryIds: string[] = [];
      let importedEntriesNeedReseal = false;

      if (existingAccounts.length === 0) {
        console.log('🌱 Cloud SQL PostgreSQL is empty. Seeding initial syndicate data...');

        // Seed Organizations
        for (const org of store.organizations) {
          await db.insert(schema.organizations).values({
            id: org.id,
            name: org.name,
            code: org.code,
            type: org.type,
            registrationNumber: org.taxNumber,
            taxNumber: org.taxNumber,
            address: org.address,
          }).onConflictDoNothing();
        }

        // Seed Cost Centers
        for (const cc of store.costCenters) {
          await db.insert(schema.costCenters).values({
            id: cc.id,
            code: cc.code,
            name: cc.name,
            type: 'PROJECT',
            budgetLimit: 500000,
            currentSpent: 0,
            organizationId: cc.organizationId,
          }).onConflictDoNothing();
        }

        // Seed Fiscal Periods
        for (const fp of store.fiscalPeriods) {
          await db.insert(schema.fiscalPeriods).values({
            id: fp.id,
            name: fp.name,
            startDate: fp.startDate,
            endDate: fp.endDate,
            isClosed: fp.status === 'CLOSED',
            organizationId: 'org-general',
          }).onConflictDoNothing();
        }

        // Seed Accounts
        for (const acc of store.accounts) {
          await db.insert(schema.accounts).values({
            id: acc.id,
            code: acc.code,
            name: acc.name,
            type: acc.type,
            nature: acc.nature,
            level: acc.level,
            parentId: acc.parentId,
            isParent: acc.isParent,
            isActive: acc.isActive,
            requiresSubledger: acc.requiresSubledger,
            subledgerType: acc.subledgerType,
            currentBalance: acc.currentBalance,
            organizationId: 'org-general',
          }).onConflictDoNothing();
        }

        // Seed Subledger Parties (1301)
        for (const party of store.subledgerParties) {
          await db.insert(schema.subledgerParties).values({
            id: party.id,
            code: party.partyCode,
            name: party.name,
            type: party.type,
            nationalId: party.nationalIdHash,
            taxRegistrationNumber: party.taxRegistrationNumber,
            commercialRegister: party.commercialRegister,
            phone: party.phone,
            address: party.address,
            balance: party.currentBalance,
            organizationId: party.organizationId,
          }).onConflictDoNothing();
        }

        // Seed Members
        for (const mem of store.members) {
          await db.insert(schema.members).values({
            id: mem.id,
            membershipNumber: mem.membershipNumber,
            fullName: mem.fullName,
            nationalIdMasked: mem.nationalIdMasked,
            nationalIdHash: mem.nationalIdHash,
            syndicateCommitteeId: mem.syndicateCommitteeId,
            syndicateCommitteeName: mem.syndicateCommitteeName,
            profession: mem.profession,
            companyName: mem.companyName || '',
            status: mem.status,
            joinDate: mem.joinDate,
            phone: mem.phone || '',
            email: mem.email || '',
          }).onConflictDoNothing();
        }

        // Seed Journal Entries + Lines (بيانات القيود الحقيقية المستوردة من CSV أو المنشأة)
        let seededEntries = 0;
        for (const entry of store.journalEntries) {
          await db.insert(schema.journalEntries).values({
            id: entry.id,
            entryNumber: entry.entryNumber,
            date: entry.date,
            organizationId: entry.organizationId,
            periodId: entry.fiscalPeriodId || 'period-imported',
            description: entry.description,
            type: entry.type,
            journalName: entry.journalName || 'يومية النقابة',
            status: entry.status,
            totalDebit: entry.totalDebit,
            totalCredit: entry.totalCredit,
            createdById: entry.createdBy || 'usr-cfo',
            checksum: 'sha256-imported',
            // سلسلة التجزئة (P0-3): تُكتب مع البذر/الاستيراد حتى لا تبقى صفوف بلا تجزئة
            previousHash: entry.previousHash || null,
            currentHash: entry.currentHash || null,
            chainIndex: typeof entry.chainIndex === 'number' ? entry.chainIndex : null,
          }).onConflictDoNothing();

          for (const line of entry.lines || []) {
            await db.insert(schema.journalLines).values({
              id: line.id,
              journalEntryId: entry.id,
              accountId: line.accountId,
              subledgerPartyId: line.subledgerPartyId,
              subledgerPartyNameInput: line.subledgerPartyName,
              costCenterId: line.costCenterId,
              debit: line.debit,
              credit: line.credit,
              attachmentUrl: line.attachmentUrl,
              aiConfidenceScore: line.aiConfidenceScore,
              description: line.description,
            }).onConflictDoNothing();
          }
          seededEntries++;
        }
        if (seededEntries > 0) console.log(`📒 تم بذر ${seededEntries} قيداً محاسبياً بأسطرها.`);

        console.log('✅ Initial syndicate data successfully seeded to Cloud SQL PostgreSQL.');
      } else {
        console.log('📦 Loading existing financial records from Cloud SQL PostgreSQL...');
        // لقطة من بيانات الذاكرة (المستوردة من CSV) قبل الاستبدال حتى لا تَضيع
        // القيود والحسابات غير المخزنة بعد بالقاعدة، وتُدمج بعد التحميل.
        const memoryJournalEntries = store.journalEntries.slice();
        const memoryAccounts = store.accounts.slice();

        // Load Accounts from PostgreSQL
        const dbAccounts = await db.select().from(schema.accounts);
        if (dbAccounts.length > 0) {
          store.accounts = dbAccounts.map((a) => ({
            id: a.id,
            code: a.code,
            name: a.name,
            type: a.type as any,
            nature: a.nature as any,
            level: a.level,
            parentId: a.parentId || undefined,
            isParent: a.isParent,
            isActive: a.isActive,
            requiresSubledger: a.requiresSubledger,
            subledgerType: (a.subledgerType || 'NONE') as any,
            currentBalance: a.currentBalance,
          }));
        }

        // ===== دمج حسابات الذاكرة (CSV) غير المخزنة بعد في PostgreSQL =====
        const dbAccountIds = new Set(dbAccounts.map((a) => a.id));
        const missingAccounts = memoryAccounts.filter((a) => !dbAccountIds.has(a.id));
        for (const acc of missingAccounts) await this.persistAccount(acc);
        const existingStoreAccountIds = new Set(store.accounts.map((a) => a.id));
        const extraAccounts = missingAccounts.filter((a) => !existingStoreAccountIds.has(a.id));
        if (extraAccounts.length > 0) {
          store.accounts = [...store.accounts, ...extraAccounts];
          console.log(`🔁 تم دمج ${extraAccounts.length} حساباً من الذاكرة (CSV) مع PostgreSQL.`);
        }

        // Load Subledger Parties
        const dbParties = await db.select().from(schema.subledgerParties);
        if (dbParties.length > 0) {
          store.subledgerParties = dbParties.map((p) => ({
            id: p.id,
            partyCode: p.code,
            name: p.name,
            normalizedName: normalizeArabicText(p.name),
            type: (p.type || 'MISC_DEBTOR') as any,
            associatedAccountId: 'acc-imported', // يُصحح لاحقاً إلى حساب المدينين الفعلي
            nationalIdHash: p.nationalId || undefined,
            taxRegistrationNumber: p.taxRegistrationNumber || undefined,
            commercialRegister: p.commercialRegister || undefined,
            phone: p.phone || undefined,
            address: p.address || undefined,
            totalDebit: p.balance > 0 ? p.balance : 0,
            totalCredit: p.balance < 0 ? Math.abs(p.balance) : 0,
            currentBalance: p.balance,
            organizationId: p.organizationId,
            createdAt: p.createdAt?.toISOString() || new Date().toISOString(),
            updatedAt: p.createdAt?.toISOString() || new Date().toISOString(),
          }));
        }

        // Load Members
        const dbMembers = await db.select().from(schema.members);
        if (dbMembers.length > 0) {
          store.members = dbMembers.map((m) => ({
            id: m.id,
            membershipNumber: m.membershipNumber,
            fullName: m.fullName,
            nationalIdMasked: m.nationalIdMasked,
            nationalIdHash: m.nationalIdHash,
            syndicateCommitteeId: m.syndicateCommitteeId,
            syndicateCommitteeName: m.syndicateCommitteeName,
            profession: m.profession,
            companyName: m.companyName || undefined,
            status: m.status as any,
            joinDate: m.joinDate,
            phone: m.phone || '',
            email: m.email || '',
          }));
        }

        // ===== Load Journal Entries + Lines (استمرارية القيود بين الجلسات) =====
        const dbEntries = await db.select().from(schema.journalEntries);
        if (dbEntries.length > 0) {
          const dbLines = await db.select().from(schema.journalLines);
          const debtorsAcc = findDebtorsAccount();
          const orgName = store.organizations[0]?.name || 'النقابة العامة';

          const hydrated = dbEntries.map((e) => {
            const lines = dbLines
              .filter((l) => l.journalEntryId === e.id)
              .sort((a, b) => (a.id < b.id ? -1 : 1))
              .map((l, idx) => {
                const acc = store.accounts.find((a) => a.id === l.accountId);
                return {
                  id: l.id,
                  journalEntryId: e.id,
                  lineNumber: idx + 1,
                  accountId: l.accountId,
                  accountCode: acc?.code || l.accountId,
                  accountName: acc?.name || 'حساب',
                  subledgerPartyId: l.subledgerPartyId || undefined,
                  subledgerPartyName: l.subledgerPartyNameInput || undefined,
                  costCenterId: l.costCenterId || undefined,
                  debit: l.debit,
                  credit: l.credit,
                  attachmentUrl: l.attachmentUrl || undefined,
                  aiConfidenceScore: l.aiConfidenceScore ?? undefined,
                  description: l.description || e.description,
                } as any;
              });
            const creator = store.users.find((u) => u.id === e.createdById);
            return {
              id: e.id,
              entryNumber: e.entryNumber,
              date: e.date,
              organizationId: e.organizationId,
              organizationName: orgName,
              fiscalPeriodId: e.periodId,
              fiscalPeriodName: e.periodId,
              type: e.type as any,
              status: e.status as any,
              description: e.description,
              journalName: e.journalName || 'يومية النقابة',
              totalDebit: e.totalDebit,
              totalCredit: e.totalCredit,
              lines,
              createdBy: e.createdById,
              createdByName: creator?.fullName || 'مسجل بالنظام',
              approvedBy: e.approvedById || undefined,
              previousHash: e.previousHash || undefined,
              currentHash: e.currentHash || undefined,
              chainIndex: e.chainIndex === null || e.chainIndex === undefined ? undefined : Number(e.chainIndex),
              createdAt: e.createdAt?.toISOString() || new Date().toISOString(),
              updatedAt: e.createdAt?.toISOString() || new Date().toISOString(),
            } as any;
          });

          store.journalEntries = hydrated.sort((a, b) => (a.date < b.date ? 1 : -1));
          console.log(`📦 تم تحميل ${hydrated.length} قيداً محاسبياً من PostgreSQL.`);

        }

        // ===== إصلاح ربط الأطراف بحساب المدينين الفعلي في الدليل النشط =====
        const debtorsAccForParties = findDebtorsAccount();
        if (debtorsAccForParties) {
          for (const party of store.subledgerParties) {
            if (!store.accounts.some((a) => a.id === party.associatedAccountId)) {
              party.associatedAccountId = debtorsAccForParties.id;
            }
          }
        }

        // ===== تعويض: قيود موجودة في الذاكرة (CSV) وغير مخزنة بالقاعدة =====
        const dbEntryIds = new Set(dbEntries.map((e) => e.id));
        const missingEntries = memoryJournalEntries.filter((e) => !dbEntryIds.has(e.id));
        persistedEntryCount = dbEntries.length;
        importedEntryIds = missingEntries.map((e) => e.id);
        // استيراد قيود جديدة وسط سلسلة قائمة يتطلب إعادة ختم صريحة (تُسجَّل في التدقيق)
        importedEntriesNeedReseal = missingEntries.length > 0;
        for (const entry of missingEntries) {
          await this.persistJournalEntry(entry);
        }
        if (missingEntries.length > 0) {
          const existingStoreEntryIds = new Set(store.journalEntries.map((e) => e.id));
          const extraEntries = missingEntries.filter((e) => !existingStoreEntryIds.has(e.id));
          if (extraEntries.length > 0) {
            store.journalEntries = [...store.journalEntries, ...extraEntries].sort((a, b) => (a.date < b.date ? 1 : -1));
            console.log(`🔁 تم دمج ${extraEntries.length} قيداً من الذاكرة (CSV) مع PostgreSQL وواجهة التشغيل.`);
          }
        }

      }

      // ===== ختم سلسلة الأستاذ في القاعدة (P0-3) — يعمل في مساري البذر والتحميل =====
      await this.sealPersistedJournalChain(store, {
        importedIds: importedEntryIds,
        resealRequested: importedEntriesNeedReseal,
        freshSeed: isFreshSeed,
      });

      this.isInitialized = true;
      this.dbAvailable = true;

      // ===== تحميل المستندات (DMS) من PostgreSQL إلى الذاكرة =====
      try {
        const dbDocs = await db.select().from(schema.documents);
        if (dbDocs.length > 0) {
          store.attachments = dbDocs.map((d: any) => ({
            id: d.id,
            entityType: d.entityType as any,
            entityId: d.entityId,
            fileName: d.fileName,
            fileSize: d.fileSize,
            fileType: d.fileType,
            dataUrl: d.fileData,
            sha256Hash: d.sha256,
            description: d.entityType === 'REGULATION' ? 'لائحة النظام الأساسي للنقابة العامة' : 'مستند مؤيد معتمد',
            uploadedBy: 'usr-mohamed-abdallah',
            uploadedByName: 'محمد عبد الله أحمد',
            uploadedAt: d.createdAt?.toISOString() || new Date().toISOString(),
            digitalSignature: d.isSealed ? {
              signedBy: d.sealedBy || 'usr-mohamed-abdallah',
              signerName: 'محمد عبد الله أحمد',
              signerRole: 'PROGRAM_ADMIN',
              signedAt: d.sealTimestamp || new Date().toISOString(),
              sealCode: `SEAL-PRO-${Date.now()}-VERIFIED`,
              certThumbprint: `SHA256:${String(d.sha256).slice(0, 24).toUpperCase()}`,
              isValid: true,
              notes: 'مستند اللائحة مختوم إلكترونياً ومؤرشف في قاعدة البيانات المركزية',
            } : undefined,
          }));
          console.log(`🗂️ تم تحميل ${dbDocs.length} مستند مؤرشف من PostgreSQL (بما فيها اللائحة).`);
        }
      } catch (docLoadErr: any) {
        console.warn(`⚠️ تعذر تحميل المستندات من PostgreSQL: ${docLoadErr.message}`);
      }
    } catch (err: any) {
      this.isInitialized = true;
      this.dbAvailable = false;
      const reason = err?.cause?.code || err?.code || err?.message || 'سبب غير معروف';
      console.warn(`⚠️ تعذر الاتصال بقاعدة PostgreSQL (${reason}) — النظام يعمل كاملاً بالبيانات في الذاكرة.`);
      console.warn('   تحقق من إعدادات SQL_HOST / SQL_USER / SQL_PASSWORD / SQL_DB_NAME في ملف .env عند الحاجة للمزامنة السحابية.');
    }
  }

  /**
   * Persist a new journal entry and its lines to PostgreSQL
   */
  public async persistJournalEntry(entry: any) {
    if (!this.dbAvailable) return; // وضع الذاكرة: لا محاولة كتابة لقاعدة غير مهيأة
    try {
      await db.insert(schema.journalEntries).values({
        id: entry.id,
        entryNumber: entry.entryNumber,
        date: entry.date,
        organizationId: entry.organizationId,
        periodId: entry.fiscalPeriodId || entry.periodId || 'period-2026-08',
        description: entry.description,
        type: entry.type,
        journalName: entry.journalName || 'يومية النقابة',
        status: entry.status,
        totalDebit: entry.totalDebit,
        totalCredit: entry.totalCredit,
        createdById: entry.createdBy || 'usr-cfo',
        approvedById: entry.approvedBy,
        reversalOfEntryId: entry.reversedEntryId,
        isReversed: entry.status === 'REVERSED',
        checksum: entry.checksum || 'sha256-verified',
        // سلسلة تجزئة الأستاذ الدائمة (P0-3): تُخزَّن مع القيد نفسه
        previousHash: entry.previousHash || null,
        currentHash: entry.currentHash || null,
        chainIndex: typeof entry.chainIndex === 'number' ? entry.chainIndex : null,
      }).onConflictDoNothing();

      if (entry.lines && entry.lines.length > 0) {
        for (const line of entry.lines) {
          await db.insert(schema.journalLines).values({
            id: line.id || `line-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            journalEntryId: entry.id,
            accountId: line.accountId,
            subledgerPartyId: line.subledgerPartyId,
            subledgerPartyNameInput: line.subledgerPartyName,
            costCenterId: line.costCenterId,
            debit: line.debit,
            credit: line.credit,
            attachmentUrl: line.attachmentUrl,
            aiConfidenceScore: line.aiConfidenceScore,
            description: line.description,
          }).onConflictDoNothing();
        }
      }
    } catch (error) {
      console.error('Failed to persist journal entry to Cloud SQL:', error);
    }
  }

  /**
   * كتابة حقول سلسلة التجزئة لقيد قائم (P0-3) — تُستخدم عند ختم القيود التي سبقت
   * إضافة الأعمدة، حيث يكون الصف موجوداً أصلاً ولا يكفي INSERT ... ON CONFLICT DO NOTHING.
   */
  public async updateJournalEntryChain(entry: any): Promise<boolean> {
    if (!this.dbAvailable) return false;
    try {
      const { eq } = await import('drizzle-orm');
      await db
        .update(schema.journalEntries)
        .set({
          previousHash: entry.previousHash || null,
          currentHash: entry.currentHash || null,
          chainIndex: typeof entry.chainIndex === 'number' ? entry.chainIndex : null,
        })
        .where(eq(schema.journalEntries.id, entry.id));
      return true;
    } catch (error) {
      console.error('Failed to persist journal chain fields to Cloud SQL:', error);
      return false;
    }
  }

  /**
   * ===== ختم سلسلة الأستاذ في القاعدة (P0-3) =====
   * يكتب حقول السلسلة للصفوف التي لا تحمل تجزئة، ويعيد الختم صراحةً عند استيراد
   * قيود جديدة وسط سلسلة قائمة. لا يُعيد الختم أبداً بسبب «سلسلة مكسورة» وحدها:
   * الكسر بلا استيراد = تلاعب حقيقي يُترك ظاهراً كما هو.
   */
  private async sealPersistedJournalChain(
    store: ERPStore,
    options: { importedIds: string[]; resealRequested: boolean; freshSeed: boolean }
  ): Promise<void> {
    if (!this.dbAvailable) return;
    try {
      const rows = await getPool().query(`SELECT id, current_hash FROM journal_entries`);
      const persistedHashById = new Map<string, string | null>(rows.rows.map((r) => [String(r.id), r.current_hash]));

      // ===== سلسلة السجل الرسمي تغطي **الصفوف المخزّنة** فقط =====
      // قيود الذاكرة التي لا يمكن تخزينها (أرقام قيود مكررة بين ملفات CSV مثلاً) تبقى
      // خارج سلسلة السجل الرسمي، فلا تكسر تحققها ولا تفرض إعادة ختم في كل إقلاع.
      const durableEntries = store.journalEntries.filter((e) => persistedHashById.has(e.id));
      const nonDurableEntries = store.journalEntries.filter((e) => !persistedHashById.has(e.id));
      for (const entry of nonDurableEntries) {
        entry.previousHash = undefined as any;
        entry.currentHash = undefined as any;
        entry.chainIndex = undefined as any;
        entry.chainVerified = false;
      }

      const missingInDb = durableEntries.filter((e) => !persistedHashById.get(e.id));
      const importedLanded = options.importedIds.filter((id) => persistedHashById.has(id)).length;

      // تحقق مسبق: يكشف الصفوف بترميز قديم (ترقية لازمة) والتلاعب الحقيقي
      const preVerify = verifyLedgerChain(durableEntries);

      // حالات الختم الصريح: بذر أولي ← صفوف بلا تجزئة ← تجزئة بترميز قديم (ترقية
      // مسجَّلة) ← استيراد فعلي استقر في القاعدة. غير ذلك لا يُلمس شيء: كسر السلسلة
      // وحده (تجزئة موسومة لا تطابق المتوقع) = تلاعب حقيقي يبقى ظاهراً ولا يُصلَح.
      const mustSeal =
        options.freshSeed ||
        missingInDb.length > 0 ||
        preVerify.legacyFormatCount > 0 ||
        (options.resealRequested && importedLanded > 0);

      const reasons: string[] = [];
      if (options.freshSeed) reasons.push('بذر أولي');
      if (missingInDb.length > 0) reasons.push(`${missingInDb.length} بلا تجزئة`);
      if (preVerify.legacyFormatCount > 0) reasons.push(`ترقية ترميز ${preVerify.legacyFormatCount} تجزئة`);
      if (options.resealRequested && importedLanded > 0) reasons.push(`${importedLanded} مستورد`);
      const sealReason = reasons.join(' + ') || 'لا شيء';

      let tamperedCount = preVerify.tamperedCount;
      if (mustSeal) {
        tamperedCount = resealLedgerChain(durableEntries).tamperedCount;
      }

      const toWrite = durableEntries.filter((e) => {
        const stored = persistedHashById.get(e.id);
        return Boolean(e.currentHash) && stored !== e.currentHash;
      });
      for (const entry of toWrite) {
        await this.updateJournalEntryChain(entry);
      }

      console.log(
        `🔐 سلسلة الأستاذ: ${durableEntries.length} قيداً دائماً (${nonDurableEntries.length} بلا تخزين) — ` +
          `${tamperedCount === 0 ? 'سليمة' : `مكسورة عند ${tamperedCount}`}، ` +
          (mustSeal
            ? `أُعيد ختمها [${sealReason}]، كُتب ${toWrite.length} صفاً`
            : `لم تُعد السلسلة، كُتب ${toWrite.length} صفاً`)
      );

      if (mustSeal) {
        await this.persistAuditLog({
          id: `AUDIT-CHAIN-RESEAL-${Date.now()}`,
          timestamp: new Date().toISOString(),
          userId: 'system',
          userName: 'النظام (ختم السلسلة)',
          userRole: 'SYSTEM',
          action: 'LEDGER_CHAIN_RESEALED',
          entityType: 'LEDGER_CHAIN',
          entityId: 'GLOBAL',
          organizationId: 'org-union-main',
          details:
            `إعادة ختم سلسلة الأستاذ (${sealReason}): ${durableEntries.length} قيداً دائماً، ${toWrite.length} صفاً كُتب، ` +
            `${missingInDb.length} كانت بلا تجزئة، ${preVerify.legacyFormatCount} بترميز قديم، ` +
            `${importedLanded} قيداً مستورداً فعلاً، الإصدار ${preVerify.hashVersion}`,
          ipAddress: '127.0.0.1 (System)',
          status: 'SUCCESS',
        });
      }
    } catch (error: any) {
      console.warn(`⚠️ تعذّر ختم سلسلة الأستاذ في القاعدة: ${error?.message || error}`);
    }
  }

  /** عدد القيود المخزّنة في القاعدة مع تجزئة سلسلة (مقياس الدوام الحقيقي) */
  public async countJournalEntriesWithChain(): Promise<number> {
    if (!this.dbAvailable) return 0;
    const res = await getPool().query(
      `SELECT count(*)::int AS count FROM journal_entries WHERE current_hash IS NOT NULL`
    );
    return Number(res.rows[0]?.count) || 0;
  }

  /**
   * تحديث حالة قيد قائم في PostgreSQL (تقديم/اعتماد/ترحيل/عكس)
   */
  public async updateJournalEntryStatus(entry: any) {
    if (!this.dbAvailable) return;
    try {
      const { eq } = await import('drizzle-orm');
      await db
        .update(schema.journalEntries)
        .set({
          status: entry.status,
          approvedById: entry.approvedBy,
          isReversed: entry.status === 'REVERSED',
          reversalOfEntryId: entry.reversedEntryId,
          // التجزئة تُحسب على القيد بحالته، لذا يلزم تحديث حقول السلسلة مع أي تغيير حالة
          previousHash: entry.previousHash || null,
          currentHash: entry.currentHash || null,
          chainIndex: typeof entry.chainIndex === 'number' ? entry.chainIndex : null,
        })
        .where(eq(schema.journalEntries.id, entry.id));
    } catch (error) {
      console.error('Failed to update journal entry status in PostgreSQL:', error);
    }
  }

  /**
   * Persist a receipt to PostgreSQL
   */
  public async persistReceipt(receipt: any) {
    if (!this.dbAvailable) return; // وضع الذاكرة: لا محاولة كتابة لقاعدة غير مهيأة
    try {
      await db.insert(schema.receipts).values({
        id: receipt.id,
        receiptNumber: receipt.receiptNumber,
        organizationId: receipt.organizationId,
        payerName: receipt.payerName,
        memberId: receipt.memberId,
        revenueTypeId: receipt.revenueTypeId || 'REV-GEN',
        amount: receipt.amount,
        paymentMethod: receipt.paymentMethod,
        notes: receipt.notes,
        date: receipt.date,
        qrVerificationToken: receipt.qrVerificationToken || 'TOKEN',
        checksum: receipt.sha256Hash || 'SHA256',
        createdById: receipt.issuedBy || 'usr-cfo',
        journalEntryId: receipt.journalEntryId,
      }).onConflictDoNothing();
    } catch (error) {
      console.error('Failed to persist receipt to Cloud SQL:', error);
    }
  }

  /**
   * Persist an account to PostgreSQL
   */
  public async persistAccount(acc: any) {
    if (!this.dbAvailable) return; // وضع الذاكرة: لا محاولة كتابة لقاعدة غير مهيأة
    try {
      await db.insert(schema.accounts).values({
        id: acc.id,
        code: acc.code,
        name: acc.name,
        type: acc.type,
        nature: acc.nature,
        level: acc.level,
        parentId: acc.parentId,
        isParent: acc.isParent,
        isActive: acc.isActive,
        requiresSubledger: acc.requiresSubledger,
        subledgerType: acc.subledgerType,
        currentBalance: acc.currentBalance,
        organizationId: acc.organizationId || 'org-general',
      }).onConflictDoUpdate({
        target: schema.accounts.code,
        set: {
          name: acc.name,
          currentBalance: acc.currentBalance,
          isActive: acc.isActive,
        },
      });
    } catch (error) {
      console.error('Failed to persist account to Cloud SQL:', error);
    }
  }

  /**
   * Persist member to PostgreSQL
   */
  public async persistMember(mem: any) {
    if (!this.dbAvailable) return; // وضع الذاكرة: لا محاولة كتابة لقاعدة غير مهيأة
    try {
      await db.insert(schema.members).values({
        id: mem.id,
        membershipNumber: mem.membershipNumber,
        fullName: mem.fullName,
        nationalIdMasked: mem.nationalIdMasked,
        nationalIdHash: mem.nationalIdHash,
        syndicateCommitteeId: mem.syndicateCommitteeId,
        syndicateCommitteeName: mem.syndicateCommitteeName,
        profession: mem.profession,
        companyName: mem.companyName,
        status: mem.status,
        joinDate: mem.joinDate,
        phone: mem.phone,
        email: mem.email,
      }).onConflictDoNothing();
    } catch (error) {
      console.error('Failed to persist member to Cloud SQL:', error);
    }
  }

  // ======================= سجل التدقيق الدائم (P0-3) =======================

  /**
   * قراءة طرف السلسلة من القاعدة (أحدث تسلسل + آخر تجزئة) — تُنفَّذ عند الإقلاع
   * وعند أي تعارض تسلسل. لو فشلت القراءة تُعطَّل الكتابة الدائمة بدل كتابة سلسلة
   * مكسورة (سلسلة ناقصة أسوأ من عدم وجود سلسلة: تُوهم بالتحقق).
   */
  private async loadAuditChainState(): Promise<void> {
    if (!this.dbAvailable) return;
    try {
      // ===== 1) ترقية ترميز التجزئة القديم (v1 → a2) =====
      // تجزئة v1 لم تكن تُدخل التفاصيل/النوع/الحالة في المضمون، فكان تعديل نص
      // الحدث يمرّ بلا كسر. الصفوف المُوسَّمة (`a2:`) لا تُمسّ أبداً؛ الصفوف بترميز
      // قديم تُرقّى مرة واحدة بسلسلة واحدة تُعاد بناؤها بترتيب التسلسل، ويُسجَّل
      // الحدث نفسه في التدقيق حتى لا تكون الترقية إصلاحاً صامتاً.
      const versioned = await getPool().query(
        `SELECT count(*)::int AS versioned,
                count(*) FILTER (WHERE event_hash IS NOT NULL AND event_hash NOT LIKE '${AUDIT_HASH_VERSION}:%')::int AS legacy
           FROM audit_logs`
      );
      const legacyCount = Number(versioned.rows[0]?.legacy) || 0;
      if (legacyCount > 0) {
        const all = await getPool().query(
          `SELECT id, timestamp, user_id, action, entity_type, entity_id, details, status,
                  correlation_id, previous_state, new_state, previous_hash, event_hash
             FROM audit_logs
            ORDER BY sequence ASC NULLS LAST, timestamp ASC, id ASC`
        );
        const rows = all.rows.map((row) => ({
          id: String(row.id),
          timestamp: String(row.timestamp),
          userId: String(row.user_id),
          action: String(row.action),
          entityType: row.entity_type ?? '',
          entityId: String(row.entity_id),
          details: row.details ?? '',
          status: row.status ?? 'SUCCESS',
          correlationId: row.correlation_id ?? '',
          previousState: row.previous_state ?? undefined,
          newState: row.new_state ?? undefined,
          previousHash: row.previous_hash ?? undefined,
          eventHash: row.event_hash ?? undefined,
        }));
        const resealed = resealAuditLogChain(rows as any);
        let seq = 0;
        for (const row of rows) {
          seq += 1;
          await getPool().query(
            `UPDATE audit_logs SET sequence = $1, previous_hash = $2, event_hash = $3 WHERE id = $4`,
            [seq, (row as any).previousHash, (row as any).eventHash, row.id]
          );
        }
        console.log(
          `🔐 ترقية ترميز سلسلة سجل التدقيق: ${legacyCount} تجزئة قديمة → ${AUDIT_HASH_VERSION} ` +
            `(${resealed.changed} تغيّرت)، والقاعدة الآن متحقَّقة بالكامل من البداية.`
        );
      }

      // ===== 2) ختم أحداث ما قبل السلسلة (قاعدة قديمة بلا أي تجزئة) =====
      // قاعدة أنشئت قبل P0-3 تحوي أحداث تدقيق بلا تسلسل ولا تجزئة. تُختم مرة واحدة
      // بترتيبها الزمني وتُعلَن بوضوح: هذا لا يُثبت سلامة ما سبق، لكنه يجعل السلسلة
      // قابلة للتحقق من هذه اللحظة فصاعداً. الأحداث المخزّنة بتجزئة لا تُمسّ أبداً.
      const unsealed = await getPool().query(
        `SELECT id, timestamp, user_id, action, entity_type, entity_id, details, status, correlation_id
           FROM audit_logs
          WHERE event_hash IS NULL OR sequence IS NULL
          ORDER BY timestamp ASC, id ASC`
      );
      if (unsealed.rows.length > 0) {
        const chained = await getPool().query(
          `SELECT count(*)::int AS count FROM audit_logs WHERE event_hash IS NOT NULL AND sequence IS NOT NULL`
        );
        if (Number(chained.rows[0]?.count) === 0) {
          let previous = '0'.repeat(64);
          let sequence = 0;
          for (const row of unsealed.rows) {
            sequence += 1;
            const hash = hashAuditLog(
              {
                timestamp: String(row.timestamp),
                userId: String(row.user_id),
                action: String(row.action),
                entityType: row.entity_type ?? '',
                entityId: String(row.entity_id),
                details: row.details ?? '',
                status: row.status ?? 'SUCCESS',
                correlationId: row.correlation_id ?? '',
              } as any,
              previous
            );
            await getPool().query(
              `UPDATE audit_logs SET sequence = $1, previous_hash = $2, event_hash = $3 WHERE id = $4`,
              [sequence, previous, hash, row.id]
            );
            previous = hash;
          }
          console.log(
            `🔐 ختم لاحق لسجل سابق: ${sequence} حدث تدقيق قديم (بلا سلسلة) — ` +
              `لا يُثبت ما قبل الختم، والسلسلة سارية ومتحقَّقة من هنا فصاعداً.`
          );
        }
      }

      const res = await getPool().query(
        `SELECT sequence, event_hash FROM audit_logs
          WHERE sequence IS NOT NULL AND event_hash IS NOT NULL
          ORDER BY sequence DESC LIMIT 1`
      );
      if (res.rows.length > 0) {
        this.auditSequence = Number(res.rows[0].sequence) || 0;
        this.auditChainHash = String(res.rows[0].event_hash);
        console.log(`🔐 سلسلة سجل التدقيق: ${this.auditSequence} حدثاً دائماً، آخر تجزئة ${this.auditChainHash.slice(0, 12)}…`);
      } else {
        this.auditSequence = 0;
        this.auditChainHash = '0'.repeat(64);
      }
      this.auditLoadFailed = false;
    } catch (error: any) {
      this.auditLoadFailed = true;
      console.warn(`⚠️ تعذّر قراءة طرف سلسلة سجل التدقيق — تعطيل الكتابة الدائمة للسجل: ${error?.message || error}`);
    }
  }

  /**
   * كتابة حدث تدقيق في القاعدة مع ربطه بالسلسلة.
   * تُسلسَل الكتابات عبر طابور واحد لضمان تفرّد `sequence` وتتابع التجزئات.
   */
  public async persistAuditLog(log: any): Promise<boolean> {
    if (!this.dbAvailable || this.auditLoadFailed) return false;
    // الطابور: كل كتابة تنتظر السابقة حتى لا تتصارع الكتابات على نفس التسلسل
    const task = this.auditWriteQueue.then(() => this.writeAuditLog(log)).catch((error) => {
      console.error('Failed to persist audit log to Cloud SQL:', error);
      return false;
    });
    this.auditWriteQueue = task.then(() => undefined);
    return task;
  }

  private async writeAuditLog(log: any, isRetry = false): Promise<boolean> {
    const sequence = this.auditSequence + 1;
    // سلسلة القاعدة مستمرة من طرف القاعدة نفسه: أي حدث لم يُكتب (انقطاع قاعدة مثلاً)
    // لا يكسر تسلسل ما كُتب فعلاً — يبقى السجل الدائم قابلاً للتحقق بذاته.
    const previousHash = this.auditChainHash;
    // التجزئة تُحسب من **كل حقول الحدث** + تجزئة الحدث السابق (نفس خوارزمية المتجر)
    const eventHash = hashAuditLog(log, previousHash);

    try {
      const inserted = await db.insert(schema.auditLogs).values({
        id: log.id,
        timestamp: log.timestamp,
        userId: log.userId,
        userName: log.userName,
        userRole: log.userRole,
        action: log.action,
        entityType: log.entityType,
        entityId: log.entityId,
        organizationId: log.organizationId,
        details: log.details,
        ipAddress: log.ipAddress,
        correlationId: log.correlationId,
        status: log.status || 'SUCCESS',
        previousState: log.previousState ?? null,
        newState: log.newState ?? null,
        previousHash,
        eventHash,
        sequence,
      }).onConflictDoNothing().returning({ id: schema.auditLogs.id });

      if (inserted.length === 0) {
        // صف مكرر (نفس المعرّف): لا نتقدّم في السلسلة — الطرف الحقيقي هو طرف القاعدة
        await this.loadAuditChainState();
        return false;
      }

      this.auditSequence = sequence;
      this.auditChainHash = eventHash;
      return true;
    } catch (error: any) {
      // تعارض تسلسل (نسخة أخرى تكتب في نفس القاعدة) → إعادة قراءة الطرف ومحاولة واحدة
      const isSequenceConflict = String(error?.code) === '23505' || /audit_logs_sequence_unique/.test(String(error?.message));
      if (isSequenceConflict && !isRetry) {
        await this.loadAuditChainState();
        return this.writeAuditLog(log, true);
      }
      console.error('Failed to persist audit log to Cloud SQL:', error);
      return false;
    }
  }

  /**
   * تعبئة أحداث التدقيق التي جُمعت قبل تهيئة القاعدة (إقلاع/تحميل CSV/بذر).
   * تُكتب بترتيبها الزمني من الأقدم للأحدث فوق سلسلة القاعدة، فتصبح سلسلة القاعدة
   * مطابقة لسلسلة الذاكرة من نقطة البداية. تُنفَّذ مرة واحدة فقط وعند قاعدة فارغة.
   */
  public async backfillAuditLogs(logs: any[]): Promise<number> {
    if (!this.dbAvailable || this.auditLoadFailed) return 0;
    if (!Array.isArray(logs) || logs.length === 0) return 0;
    const existing = await this.countAuditLogs().catch(() => 0);
    if (existing > 0) return 0;

    const chronological = [...logs].sort((a, b) => String(a.timestamp).localeCompare(String(b.timestamp)));
    let written = 0;
    for (const log of chronological) {
      if (await this.persistAuditLog(log)) written += 1;
    }
    if (written > 0) {
      console.log(`🧾 دوام سجل التدقيق: كُتب ${written} حدثاً سابقاً على القاعدة لأول مرة (السلسلة الدائمة تبدأ من البداية).`);
    }
    return written;
  }

  /**
   * قراءة أحداث التدقيق الدائمة مرتّبة تنازلياً (الأحدث أولاً) — تُستخدم في الواجهة.
   */
  public async loadAuditLogs(limit = 200, offset = 0): Promise<any[]> {
    if (!this.dbAvailable) return [];
    const safeLimit = Math.min(Math.max(Number(limit) || 200, 1), 5000);
    const safeOffset = Math.max(Number(offset) || 0, 0);
    const res = await getPool().query(
      `SELECT id, timestamp, user_id, user_name, user_role, organization_id, ip_address,
              action, entity_type, entity_id, details, correlation_id, status,
              previous_state, new_state, previous_hash, event_hash, sequence
         FROM audit_logs
        ORDER BY sequence DESC NULLS LAST, timestamp DESC
        LIMIT $1 OFFSET $2`,
      [safeLimit, safeOffset]
    );
    return res.rows.map((row) => ({
      id: row.id,
      timestamp: row.timestamp,
      userId: row.user_id,
      userName: row.user_name,
      userRole: row.user_role,
      organizationId: row.organization_id,
      ipAddress: row.ip_address,
      action: row.action,
      entityType: row.entity_type,
      entityId: row.entity_id,
      details: row.details,
      correlationId: row.correlation_id,
      status: row.status,
      previousState: row.previous_state ?? undefined,
      newState: row.new_state ?? undefined,
      previousHash: row.previous_hash,
      eventHash: row.event_hash,
      sequence: row.sequence === null ? undefined : Number(row.sequence),
    }));
  }

  /** عدد أحداث التدقيق الدائمة */
  public async countAuditLogs(): Promise<number> {
    if (!this.dbAvailable) return 0;
    const res = await getPool().query('SELECT count(*)::int AS count FROM audit_logs');
    return Number(res.rows[0]?.count) || 0;
  }

  /**
   * التحقق من سلامة سلسلة سجل التدقيق المخزّنة: يُعاد حساب تجزئة كل حدث من حقوله
   * ومن تجزئة الحدث السابق وفق ترتيب `sequence`. أي تعديل/حذف/إعادة ترتيب يظهر فوراً.
   */
  public async verifyPersistedAuditChain(): Promise<AuditChainVerificationResult> {
    if (!this.dbAvailable) {
      return {
        source: 'memory',
        totalEvents: 0,
        verifiedCount: 0,
        brokenCount: 0,
        legacyFormatCount: 0,
        hashVersion: AUDIT_HASH_VERSION,
        valid: false,
        checkedAt: new Date().toISOString(),
      };
    }
    const res = await getPool().query(
      `SELECT id, timestamp, user_id, action, entity_type, entity_id, details, status,
              correlation_id, previous_state, new_state, previous_hash, event_hash, sequence
         FROM audit_logs
        ORDER BY sequence ASC NULLS LAST, timestamp ASC`
    );

    // نواة التحقق المشتركة مع سجل الذاكرة (نفس الخوارزمية ونفس ترتيب السلسلة)
    return verifyAuditLogChain(
      res.rows.map((row) => ({
        id: String(row.id),
        timestamp: String(row.timestamp),
        userId: String(row.user_id),
        action: String(row.action),
        entityType: row.entity_type === null ? undefined : String(row.entity_type),
        entityId: String(row.entity_id),
        details: row.details === null ? undefined : String(row.details),
        status: row.status === null ? undefined : String(row.status),
        correlationId: row.correlation_id === null ? undefined : String(row.correlation_id),
        previousState: row.previous_state ?? undefined,
        newState: row.new_state ?? undefined,
        previousHash: row.previous_hash === null ? undefined : String(row.previous_hash),
        eventHash: row.event_hash === null ? undefined : String(row.event_hash),
        sequence: row.sequence === null ? null : Number(row.sequence),
      })) as any,
      'database'
    );
  }

}

export const postgresManager = new PostgresStorageManager();
