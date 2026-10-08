import {
  Account,
  JournalEntry,
  JournalEntryLine,
  JournalEntryStatus,
  SubledgerParty,
  User,
} from '../../src/types/erp.js';
import { erpStore } from '../db/store.js';
import { regulationService } from './regulation.service.js';
import { isSodExempt } from '../security/permissions.js';
import { appendToLedgerChain } from './ledger-chain.service.js';
import { calculateSimilarity, normalizeArabicText } from '../utils/arabic.js';

export interface CreateJournalEntryDto {
  date: string;
  organizationId: string;
  description: string;
  journalName?: string; // اسم دفتر اليومية (يومية النقابة / يومية لجان الشركات)
  type?: 'MANUAL' | 'RECEIPT' | 'PAYMENT' | 'DISTRIBUTION' | 'DEPRECIATION' | 'CLOSING' | 'REVERSAL';
  sourceDocumentType?: string;
  sourceDocumentId?: string;
  governmentAccountId?: string; // التصنيف الحكومي (بند الموازنة) الاختياري
  lines: {
    accountId: string;
    subledgerPartyId?: string;
    subledgerPartyNameInput?: string; // If user typed a party name for 1301
    costCenterId?: string;
    debit: number;
    credit: number;
    description: string;
  }[];
  userId: string;
}

export class AccountingService {
  /**
   * Find or automatically create a Subledger Party for accounts requiring subledger (e.g. 1301 Miscellaneous Debtors)
   */
  public findOrCreateSubledgerParty(
    nameInput: string,
    accountId: string,
    organizationId: string,
    user: User
  ): { party: SubledgerParty; isNew: boolean; similarPartyWarning?: string } {
    const rawName = nameInput.trim();
    if (!rawName) {
      throw new Error('يجب إدخال اسم الشخص أو الجهة - البيان التحليلي للحساب المساعد.');
    }

    const normalized = normalizeArabicText(rawName);

    // 1. Direct normalized match on party or aliases
    let existing = erpStore.subledgerParties.find(
      (p) => p.associatedAccountId === accountId && p.normalizedName === normalized
    );

    if (!existing) {
      const aliasMatch = erpStore.subledgerAliases.find((a) => a.normalizedAlias === normalized);
      if (aliasMatch) {
        existing = erpStore.subledgerParties.find((p) => p.id === aliasMatch.partyId);
      }
    }

    if (existing) {
      return { party: existing, isNew: false };
    }

    // 2. Check for similar names to issue a warning
    let similarWarning: string | undefined;
    for (const p of erpStore.subledgerParties) {
      if (p.associatedAccountId === accountId) {
        const similarity = calculateSimilarity(rawName, p.name);
        if (similarity >= 0.75 && similarity < 1.0) {
          similarWarning = `تنبيه: يوجد حساب مساعد مشابه باسم "${p.name}" (كود: ${p.partyCode}) بدرجة تطابق ${Math.round(similarity * 100)}%. تم إنشاء الحساب بناءً على طلبك.`;
          break;
        }
      }
    }

    // 3. Create new Subledger Party automatically
    const account = erpStore.accounts.find((a) => a.id === accountId);
    const subType = account?.subledgerType || 'MISC_DEBTOR';
    const count = erpStore.subledgerParties.filter((p) => p.associatedAccountId === accountId).length + 1;
    const prefix = subType === 'MISC_DEBTOR' ? 'DEBT' : subType === 'VENDOR' ? 'VEND' : 'SUB';
    const partyCode = `${prefix}-${String(count + 100).padStart(3, '0')}`;

    const newParty: SubledgerParty = {
      id: `party-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      partyCode,
      name: rawName,
      normalizedName: normalized,
      type: subType,
      organizationId,
      associatedAccountId: accountId,
      totalDebit: 0,
      totalCredit: 0,
      currentBalance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    erpStore.subledgerParties.push(newParty);

    // Record audit for automatic party creation
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      organizationId,
      'SUBLEDGER_PARTY_AUTO_CREATED',
      'SUBLEDGER_PARTY',
      newParty.id,
      `إنشاء حساب أستاذ مساعد تلقائي للطرف [${rawName}] على الحساب [${account?.code} - ${account?.name}] برقم كود [${partyCode}]`
    );

    return { party: newParty, isNew: true, similarPartyWarning: similarWarning };
  }

  /**
   * Create a balanced Journal Entry with ACID validation and SoD rules
   */
  public createJournalEntry(dto: CreateJournalEntryDto, user: User): { entry: JournalEntry; warnings: string[] } {
    const warnings: string[] = [];

    // 1. Verify Fiscal Period
    const entryDate = new Date(dto.date);
    const year = entryDate.getFullYear();
    const periodNumber = entryDate.getMonth() + 1;

    let period = erpStore.fiscalPeriods.find(
      (fp) => fp.year === year && fp.periodNumber === periodNumber
    );

    if (!period) {
      // Auto register period if within current operating range
      period = {
        id: `fp-${year}-${String(periodNumber).padStart(2, '0')}`,
        year,
        periodNumber,
        name: `فترة ${periodNumber} / ${year}`,
        startDate: `${year}-${String(periodNumber).padStart(2, '0')}-01`,
        endDate: `${year}-${String(periodNumber).padStart(2, '0')}-28`,
        status: 'OPEN',
      };
      erpStore.fiscalPeriods.push(period);
    }

    if (period.status === 'CLOSED') {
      throw new Error(`لا يمكن تسجيل قيد في فترة مالية مغلقة (${period.name}). يجب تقديم طلب إعادة فتح فترة بصلاحيات معتمدة.`);
    }

    // 2. Validate Lines and Balancing
    if (!dto.lines || dto.lines.length < 2) {
      throw new Error('يجب أن يحتوي القيد المحاسبي على طرفين على الأقل (طرف مدين وطرف دائن).');
    }

    let totalDebit = 0;
    let totalCredit = 0;

    const processedLines: JournalEntryLine[] = [];
    const entryId = `je-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const entryNumber = `JV-${year}-${String(erpStore.journalEntries.length + 1).padStart(4, '0')}`;

    for (let i = 0; i < dto.lines.length; i++) {
      const line = dto.lines[i];
      const debit = Number(line.debit) || 0;
      const credit = Number(line.credit) || 0;

      if (debit < 0 || credit < 0) {
        throw new Error(`السطر رقم (${i + 1}): المبالغ المالية لا يمكن أن تكون سالبة.`);
      }

      if (debit > 0 && credit > 0) {
        throw new Error(`السطر رقم (${i + 1}): لا يمكن إدخال مبلغ مدين ومبلغ دائن في نفس السطر المحاسبي.`);
      }

      if (debit === 0 && credit === 0) {
        throw new Error(`السطر رقم (${i + 1}): يجب إدخال مبلغ مدين أو دائن أكبر من الصفر.`);
      }

      totalDebit += debit;
      totalCredit += credit;

      // Find Account
      const account = erpStore.getAccountById(line.accountId) || erpStore.getAccountByCode(line.accountId);
      if (!account) {
        throw new Error(`السطر رقم (${i + 1}): الحساب المحاسبي غير موجود.`);
      }

      if (account.isParent) {
        throw new Error(`السطر رقم (${i + 1}): لا يجوز القيد المباشر على حساب تجميعي رئيسي (${account.code} - ${account.name}). يرجى اختيار حساب فرعي.`);
      }

      // Check Subledger Requirement (Mandatory for 1301 and accounts with requiresSubledger)
      let subledgerPartyId = line.subledgerPartyId;
      let subledgerPartyName: string | undefined;

      if (account.requiresSubledger || account.code === '1301') {
        if (!subledgerPartyId && !line.subledgerPartyNameInput) {
          throw new Error(
            `السطر رقم (${i + 1}): الحساب [${account.code} - ${account.name}] يتطلب تحديد حساب الأستاذ المساعد (اسم الشخص أو الجهة - البيان التحليلي) إلزاميًا.`
          );
        }

        if (line.subledgerPartyNameInput && !subledgerPartyId) {
          const { party, isNew, similarPartyWarning } = this.findOrCreateSubledgerParty(
            line.subledgerPartyNameInput,
            account.id,
            dto.organizationId,
            user
          );
          subledgerPartyId = party.id;
          subledgerPartyName = party.name;
          if (similarPartyWarning) warnings.push(similarPartyWarning);
          if (isNew) warnings.push(`تم إنشاء كشف حساب أستاذ مساعد جديد للطرف "${party.name}" بكود [${party.partyCode}].`);
        } else if (subledgerPartyId) {
          const existingParty = erpStore.subledgerParties.find((p) => p.id === subledgerPartyId);
          if (existingParty) {
            subledgerPartyName = existingParty.name;
          }
        }
      }

      // Cost center
      let costCenterName: string | undefined;
      if (line.costCenterId) {
        const cc = erpStore.costCenters.find((c) => c.id === line.costCenterId);
        costCenterName = cc?.name;
      }

      processedLines.push({
        id: `jel-${Date.now()}-${i + 1}`,
        journalEntryId: entryId,
        lineNumber: i + 1,
        accountId: account.id,
        accountCode: account.code,
        accountName: account.name,
        subledgerPartyId,
        subledgerPartyName,
        costCenterId: line.costCenterId,
        costCenterName,
        debit: Math.round(debit * 100) / 100,
        credit: Math.round(credit * 100) / 100,
        description: line.description || dto.description,
      });
    }

    // Check Balance with precision
    const diff = Math.abs(Math.round((totalDebit - totalCredit) * 100) / 100);
    if (diff > 0.001) {
      throw new Error(`القيد غير متوازن! إجمالي المدين (${totalDebit.toLocaleString()} ج.م) لا يساوي إجمالي الدائن (${totalCredit.toLocaleString()} ج.م). الفارق: ${diff.toLocaleString()} ج.م.`);
    }

    // ===== اللائحة المالية: فحص قواعد الإنفاذ النافذة (خاملة حتى ترقيم مواد اللائحة) =====
    const regViolations = regulationService.checkJournalEntry({
      totalDebit,
      linesCount: processedLines.length,
      attachmentIds: dto.sourceDocumentId ? [dto.sourceDocumentId] : [],
      type: dto.type || 'MANUAL',
      lines: processedLines,
    });
    const blocking = regViolations.find((v) => v.severity === 'BLOCK');
    if (blocking) {
      throw new Error(`مخالفة اللائحة المالية: ${blocking.message}`);
    }
    for (const v of regViolations) warnings.push(v.message);

    const org = erpStore.organizations.find((o) => o.id === dto.organizationId);

    // ===== التصنيف الحكومي (بند الموازنة) =====
    // أولوية: بند صريح من المستخدم، وإلا خريطة تلقائية من أول حساب في القيد لأقرب بند موازنة
    let govAccount: { id: string; code: string; name: string } | undefined;
    if (dto.governmentAccountId) {
      const gov = erpStore.governmentAccounts.find((g) => g.id === dto.governmentAccountId);
      if (gov) govAccount = { id: gov.id, code: gov.code, name: gov.name };
    }
    if (!govAccount) {
      const firstAccount = processedLines.find((l) => l.debit > 0) || processedLines[0];
      const govByMap = erpStore.governmentAccounts.find(
        (g) => g.level === 'BAND' && g.mappedAccountCode === firstAccount?.accountCode && g.isActive
      );
      if (govByMap) {
        govAccount = { id: govByMap.id, code: govByMap.code, name: govByMap.name };
        warnings.push(`تم ربط القيد تلقائياً ببند الموازنة الحكومية [${govByMap.code} - ${govByMap.name}].`);
      }
    }

    // التنبيه على غياب التصنيف الحكومي (إلزامي اختياري): يُنبّه دون منع الإنشاء
    // لضمان أن كل قيد مرصود ببند الموازنة الحكومية للمراجعة الرقابية،
    // مع عدم كسر القيود التلقائية (رواتب/استهلاك/إيصالات) التي قد لا تحمل بنداً دائماً.
    if (!govAccount) {
      warnings.push(
        'تنبيه: لم يُحدد بند للموازنة الحكومية لهذا القيد. يوصى بربطه بأحد بنود الدليل الحكومي (الباب/المجموعة/النوع/الحساب/البند) لتغذية تقارير الموازنة، أو سيُحوَّل إلى صندوق موازنة عام عند الترحيل.'
      );
    }

    const entry: JournalEntry = {
      id: entryId,
      entryNumber,
      date: dto.date,
      organizationId: dto.organizationId,
      organizationName: org?.name || 'النقابة العامة',
      fiscalPeriodId: period.id,
      fiscalPeriodName: period.name,
      type: dto.type || 'MANUAL',
      status: 'DRAFT',
      description: dto.description,
      journalName: dto.journalName || 'يومية النقابة',
      sourceDocumentType: dto.sourceDocumentType,
      sourceDocumentId: dto.sourceDocumentId,
      governmentAccountId: govAccount?.id,
      governmentCode: govAccount?.code,
      governmentName: govAccount?.name,
      totalDebit: Math.round(totalDebit * 100) / 100,
      totalCredit: Math.round(totalCredit * 100) / 100,
      lines: processedLines,
      createdBy: user.id,
      createdByName: user.fullName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    erpStore.journalEntries.unshift(entry);

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      dto.organizationId,
      'JOURNAL_ENTRY_CREATED',
      'JOURNAL_ENTRY',
      entry.id,
      `إنشاء مسودة القيد المحاسبي رقم [${entry.entryNumber}] بإجمالي متوازن ${totalDebit.toLocaleString()} ج.م - البيان: ${dto.description}`,
      undefined,
      entry
    );

    return { entry, warnings };
  }

  /**
   * Submit entry for approval
   */
  public submitJournalEntry(entryId: string, user: User): JournalEntry {
    const entry = erpStore.journalEntries.find((e) => e.id === entryId);
    if (!entry) throw new Error('القيد غير موجود.');
    if (entry.status !== 'DRAFT') throw new Error('يمكن تقديم القيود التي في حالة مسودة فقط.');

    entry.status = 'SUBMITTED';
    entry.submittedBy = user.id;
    entry.updatedAt = new Date().toISOString();

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      entry.organizationId,
      'JOURNAL_ENTRY_SUBMITTED',
      'JOURNAL_ENTRY',
      entry.id,
      `تقديم القيد المحاسبي رقم [${entry.entryNumber}] للمراجعة والاعتماد`
    );

    return entry;
  }

  /**
   * Approve entry with SoD (Separation of Duties) checks
   */
  public approveJournalEntry(entryId: string, user: User): JournalEntry {
    const entry = erpStore.journalEntries.find((e) => e.id === entryId);
    if (!entry) throw new Error('القيد غير موجود.');
    if (entry.status !== 'SUBMITTED' && entry.status !== 'DRAFT') {
      throw new Error('حالة القيد لا تسمح بالاعتماد.');
    }

    // SoD Check: Maker cannot be the sole approver unless System Admin / exempt user
    if (entry.createdBy === user.id && !isSodExempt(user)) {
      throw new Error('مخالفة قواعد فصل المهام (SoD): لا يجوز لمنشئ القيد اعتماده بنفسه.');
    }

    // Role check: Only authorized financial roles can approve
    const allowedRoles: string[] = ['CHIEF_FINANCIAL_OFFICER', 'SYSTEM_ADMIN', 'COMMITTEE_PRESIDENT', 'PROGRAM_MANAGER'];
    if (!allowedRoles.includes(user.role)) {
      throw new Error('لا تملك الصلاحية المالية لاعتماد القيود المحاسبية.');
    }

    entry.status = 'APPROVED';
    entry.approvedBy = user.id;
    entry.updatedAt = new Date().toISOString();

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      entry.organizationId,
      'JOURNAL_ENTRY_APPROVED',
      'JOURNAL_ENTRY',
      entry.id,
      `اعتماد القيد المحاسبي رقم [${entry.entryNumber}] بواسطة [${user.fullName}]`
    );

    return entry;
  }

  /**
   * Post entry to General Ledger and Subledger Parties (FINAL ACID POSTING)
   */
  public postJournalEntry(entryId: string, user: User): JournalEntry {
    const entry = erpStore.journalEntries.find((e) => e.id === entryId);
    if (!entry) throw new Error('القيد غير موجود.');
    if (entry.status === 'POSTED') throw new Error('القيد مرحل بالفعل ولا يمكن إعادة ترحيله.');
    if (entry.status !== 'APPROVED' && !isSodExempt(user)) {
      throw new Error('لا يمكن ترحيل القيد قبل اعتماده من المدير المالي.');
    }

    // Check Fiscal Period status again
    const period = erpStore.fiscalPeriods.find((p) => p.id === entry.fiscalPeriodId);
    if (period && period.status === 'CLOSED') {
      throw new Error(`فترة القيد المالية (${period.name}) مغلقة. لا يمكن الترحيل.`);
    }

    // Apply balances to Accounts and Subledger Parties
    for (const line of entry.lines) {
      // 1. Update Account balance (+ تسجيل سجل التحديثات المحاسبية - IMPROVEMENTS 1.1)
      const account = erpStore.accounts.find((a) => a.id === line.accountId);
      if (account) {
        const previousBalance = account.currentBalance;
        if (account.nature === 'DEBIT') {
          account.currentBalance += line.debit - line.credit;
        } else {
          account.currentBalance += line.credit - line.debit;
        }
        const changeAmount = account.currentBalance - previousBalance;
        if (Math.abs(changeAmount) > 0.001) {
          erpStore.recordAccountingHistory(
            account,
            previousBalance,
            changeAmount,
            `ترحيل القيد [${entry.entryNumber}] - ${line.description || entry.description}`,
            entry.id
          );
        }
      }

      // 2. Update Subledger Party balance
      if (line.subledgerPartyId) {
        const party = erpStore.subledgerParties.find((p) => p.id === line.subledgerPartyId);
        if (party) {
          party.totalDebit += line.debit;
          party.totalCredit += line.credit;
          party.currentBalance = party.totalDebit - party.totalCredit;
          party.updatedAt = new Date().toISOString();
        }
      }
    }

    entry.status = 'POSTED';
    entry.postedBy = user.id;
    entry.postedAt = new Date().toISOString();
    entry.updatedAt = new Date().toISOString();

    // ربط القيد بالسلسلة المضادة للتلاعب (Blockchain-style Ledger Chain)
    appendToLedgerChain(erpStore.journalEntries, entry);

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      entry.organizationId,
      'JOURNAL_ENTRY_POSTED',
      'JOURNAL_ENTRY',
      entry.id,
      `ترحيل نهائي للقيد المحاسبي رقم [${entry.entryNumber}] إلى الأستاذ العام والأستاذ المساعد وتحديث الأرصدة`
    );

    return entry;
  }

  /**
   * Reverse a Posted Journal Entry (Creates exact inverted balanced entry)
   */
  public reverseJournalEntry(entryId: string, reason: string, user: User): { original: JournalEntry; reversal: JournalEntry } {
    const original = erpStore.journalEntries.find((e) => e.id === entryId);
    if (!original) throw new Error('القيد الأصلي غير موجود.');
    if (original.status !== 'POSTED') throw new Error('يمكن عكس القيود المرحلة فقط.');
    if (original.reversedEntryId) throw new Error('تم عكس هذا القيد مسبقاً.');

    const reversalLines = original.lines.map((line, idx) => ({
      accountId: line.accountId,
      subledgerPartyId: line.subledgerPartyId,
      costCenterId: line.costCenterId,
      debit: line.credit, // Invert Debit and Credit
      credit: line.debit,
      description: `قيد عكسي لتصحيح القيد ${original.entryNumber}: ${line.description}`,
    }));

    const { entry: reversal } = this.createJournalEntry(
      {
        date: new Date().toISOString().split('T')[0],
        organizationId: original.organizationId,
        description: `قيد عكسي لتسوية وإلغاء القيد رقم [${original.entryNumber}] - السبب: ${reason}`,
        type: 'REVERSAL',
        sourceDocumentType: 'JOURNAL_ENTRY',
        sourceDocumentId: original.id,
        lines: reversalLines,
        userId: user.id,
      },
      user
    );

    // Auto-approve and post the reversal if permitted
    reversal.status = 'APPROVED';
    this.postJournalEntry(reversal.id, user);

    original.status = 'REVERSED';
    original.reversedEntryId = reversal.id;
    original.updatedAt = new Date().toISOString();

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      original.organizationId,
      'JOURNAL_ENTRY_REVERSED',
      'JOURNAL_ENTRY',
      original.id,
      `عكس وإلغاء القيد رقم [${original.entryNumber}] بالقيد العكسي رقم [${reversal.entryNumber}] - السبب: ${reason}`
    );

    return { original, reversal };
  }

  /**
   * Delete a Journal Entry (Draft or Unposted)
   */
  public deleteJournalEntry(entryId: string, user: User): { id: string } {
    const index = erpStore.journalEntries.findIndex((e) => e.id === entryId);
    if (index === -1) throw new Error('القيد غير موجود.');

    const entry = erpStore.journalEntries[index];
    if (entry.status === 'POSTED') {
      throw new Error('لا يمكن حذف القيد المرحّل. استخدم خيار العكس بدلاً من ذلك.');
    }

    erpStore.journalEntries.splice(index, 1);

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      entry.organizationId,
      'JOURNAL_ENTRY_DELETED',
      'JOURNAL_ENTRY',
      entryId,
      `حذف القيد رقم [${entry.entryNumber}] (${entry.status})`
    );

    return { id: entryId };
  }
}


export const accountingService = new AccountingService();
