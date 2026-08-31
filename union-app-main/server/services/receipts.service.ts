import {
  PaymentMethod,
  Receipt,
  ReceiptAllocation,
  User,
} from '../../src/types/erp.js';
import { erpStore } from '../db/store.js';
import { generateVerificationToken, sha256 } from '../utils/crypto.js';
import { accountingService } from './accounting.service.js';

export interface CreateReceiptDto {
  date: string;
  organizationId: string;
  payerName: string;
  memberId?: string;
  revenueTypeId: string;
  amount: number;
  paymentMethod: PaymentMethod;
  bankAccountId?: string;
  referenceNumber?: string;
  notes?: string;
  autoPostJournal?: boolean;
}

export class ReceiptsService {
  /**
   * Issue a secured collection receipt with Revenue Distribution and automatic Journal Entry
   */
  public issueReceipt(dto: CreateReceiptDto, user: User): { receipt: Receipt; journalEntryId?: string } {
    if (!dto.amount || dto.amount <= 0) {
      throw new Error('مبلغ الإيصال يجب أن يكون أكبر من الصفر.');
    }

    const org = erpStore.organizations.find((o) => o.id === dto.organizationId);
    if (!org) throw new Error('الجهة أو الكيان النقابي غير موجود.');

    const rule = erpStore.distributionRules.find((r) => r.id === dto.revenueTypeId || r.ruleCode === dto.revenueTypeId);
    const revenueTypeName = rule ? rule.revenueTypeName : 'إيرادات وتحصيلات متنوعة';

    const count = erpStore.receipts.length + 1;
    const year = new Date(dto.date).getFullYear();
    const receiptNumber = `RC-${year}-${String(count).padStart(4, '0')}`;
    const receiptId = `rc-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
    const qrVerificationToken = generateVerificationToken('REC');
    const sha256Hash = sha256(`${receiptNumber}:${dto.amount}:${dto.paymentMethod}:${dto.date}:${dto.payerName}`);

    // Calculate distribution allocations
    const allocations: ReceiptAllocation[] = [];
    if (rule && rule.lines.length > 0) {
      let allocatedTotal = 0;
      for (let i = 0; i < rule.lines.length; i++) {
        const line = rule.lines[i];
        const isLast = i === rule.lines.length - 1;
        const lineAmount = isLast
          ? Math.round((dto.amount - allocatedTotal) * 100) / 100
          : Math.round((dto.amount * (line.percentage / 100)) * 100) / 100;

        allocatedTotal += lineAmount;
        allocations.push({
          id: `al-${Date.now()}-${i + 1}`,
          receiptId,
          beneficiaryOrgId: line.beneficiaryOrgId,
          beneficiaryOrgName: line.beneficiaryOrgName,
          percentage: line.percentage,
          allocatedAmount: lineAmount,
          accountId: line.accountId,
        });
      }
    } else {
      // Direct 100% allocation
      allocations.push({
        id: `al-${Date.now()}-1`,
        receiptId,
        beneficiaryOrgId: dto.organizationId,
        beneficiaryOrgName: org.name,
        percentage: 100,
        allocatedAmount: dto.amount,
        accountId: 'acc-4101',
      });
    }

    // Determine Debit Cash/Bank Account
    let cashAccountId = 'acc-1101'; // Default Main Treasury
    if (dto.paymentMethod === 'BANK_TRANSFER' || dto.paymentMethod === 'CHEQUE' || dto.paymentMethod === 'POS') {
      cashAccountId = dto.bankAccountId ? dto.bankAccountId : 'acc-1102';
    }

    // Create balanced Journal Entry Lines
    const journalLines: any[] = [
      {
        accountId: cashAccountId,
        debit: dto.amount,
        credit: 0,
        description: `إثبات تحصيل إيصال رقم [${receiptNumber}] من [${dto.payerName}] - طريقة الدفع: ${dto.paymentMethod}`,
      },
    ];

    for (const alloc of allocations) {
      journalLines.push({
        accountId: alloc.accountId,
        debit: 0,
        credit: alloc.allocatedAmount,
        description: `توزيع إيراد إيصال [${receiptNumber}] لصالح [${alloc.beneficiaryOrgName}] بنسبة (${alloc.percentage}%)`,
      });
    }

    // Create the Journal Entry atomically
    const { entry: journalEntry } = accountingService.createJournalEntry(
      {
        date: dto.date,
        organizationId: dto.organizationId,
        description: `قيد تحصيل وإثبات إيراد إيصال رقم [${receiptNumber}] - ${dto.payerName} (${revenueTypeName})`,
        type: 'RECEIPT',
        sourceDocumentType: 'RECEIPT',
        sourceDocumentId: receiptId,
        lines: journalLines,
        userId: user.id,
      },
      user
    );

    // Auto post if requested
    if (dto.autoPostJournal || user.role === 'CHIEF_FINANCIAL_OFFICER' || user.role === 'SYSTEM_ADMIN') {
      journalEntry.status = 'APPROVED';
      accountingService.postJournalEntry(journalEntry.id, user);
    }

    const receipt: Receipt = {
      id: receiptId,
      receiptNumber,
      date: dto.date,
      organizationId: dto.organizationId,
      organizationName: org.name,
      memberId: dto.memberId,
      payerName: dto.payerName,
      revenueTypeId: dto.revenueTypeId,
      revenueTypeName,
      amount: dto.amount,
      paymentMethod: dto.paymentMethod,
      bankAccountId: dto.bankAccountId,
      referenceNumber: dto.referenceNumber,
      notes: dto.notes,
      status: 'APPROVED',
      journalEntryId: journalEntry.id,
      qrVerificationToken,
      sha256Hash,
      allocations,
      createdBy: user.id,
      approvedBy: user.id,
      createdAt: new Date().toISOString(),
    };

    erpStore.receipts.unshift(receipt);

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      dto.organizationId,
      'RECEIPT_ISSUED',
      'RECEIPT',
      receipt.id,
      `إصدار إيصال تحصيل مؤمن برقم [${receipt.receiptNumber}] بمبلغ [${dto.amount.toLocaleString()} ج.م] - الدافع: [${dto.payerName}] - رمز التحقق QR: [${qrVerificationToken}]`
    );

    return { receipt, journalEntryId: journalEntry.id };
  }
}

export const receiptsService = new ReceiptsService();
