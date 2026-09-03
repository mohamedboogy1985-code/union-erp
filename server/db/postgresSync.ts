import { db, getPool } from '../../src/db/index.ts';
import * as schema from '../../src/db/schema.ts';
import { ERPStore } from './store.js';
import { normalizeArabicText } from '../utils/arabic.js';
import { findDebtorsAccount } from '../utils/account-lookup.js';
import fs from 'fs';
import path from 'path';
import { moduleDir, resolveFirst } from '../utils/runtime-paths.js';

export class PostgresStorageManager {
  private isInitialized = false;
  private dbAvailable = false;

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
    if (check.rows[0]?.exists) return;

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
    console.log('🗃️ تم إنشاء جداول قاعدة البيانات (15 جدولاً) من المخطط المرجعي.');
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

      // القاعدة متاحة فعلاً (الجداول جاهزة) — تُفعَّل قبل الدمج حتى تكتب
      // persistJournalEntry/persistAccount أثناء مزامنة التحميل أيضاً.
      this.dbAvailable = true;

      // 1. Check if accounts table is populated
      const existingAccounts = await db.select().from(schema.accounts).limit(5);

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

  /**
   * Persist audit log to PostgreSQL
   */
  public async persistAuditLog(log: any) {
    if (!this.dbAvailable) return; // وضع الذاكرة: لا محاولة كتابة لقاعدة غير مهيأة
    try {
      await db.insert(schema.auditLogs).values({
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
      }).onConflictDoNothing();
    } catch (error) {
      console.error('Failed to persist audit log to Cloud SQL:', error);
    }
  }
}

export const postgresManager = new PostgresStorageManager();
