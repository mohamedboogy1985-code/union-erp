import assert from 'node:assert';
import { accountingService } from '../server/services/accounting.service.js';
import { portalDataService } from '../server/services/portal-data.service.js';
import { erpStore } from '../server/db/store.js';
import { User } from '../src/types/erp.js';

console.log('🧪 Starting Journal Entry Delete & 2024 CRUD Test Suite...');

const mockUser: User = {
  id: 'u-test',
  username: 'testadmin',
  fullName: 'مدير الاختبار',
  role: 'FINANCIAL_MANAGER',
  permissions: ['*'],
  organizationId: 'org-main',
};

// Filter accounts that are strictly child accounts (isHeader is false or explicitly transaction accounts)
const validAccounts = erpStore.accounts.filter(a => !a.isHeader && a.type !== 'HEADER' && a.code.length > 3);
const acc1 = validAccounts.find(a => !a.requiresSubledger) || validAccounts[0];
const acc2 = validAccounts.find(a => a.id !== acc1.id && !a.requiresSubledger) || validAccounts[1];

// Test 1: Delete Draft Entry
const draftRes = accountingService.createJournalEntry(
  {
    organizationId: 'org-main',
    entryDate: '2026-03-01',
    description: 'قيد تجريبي قابل للحذف',
    lines: [
      { accountId: acc1.id, debit: 1000, credit: 0 },
      { accountId: acc2.id, debit: 0, credit: 1000 },
    ],
  },
  mockUser
);

const entryId = draftRes.entry ? draftRes.entry.id : (draftRes as any).id;
assert.ok(entryId, 'Draft entry created');

const delRes = accountingService.deleteJournalEntry(entryId, mockUser);
assert.strictEqual(delRes.id, entryId, 'Draft entry deleted successfully');
console.log('  ✅ Passed: Delete draft journal entry works.');

// Test 2: Journal 2024 CRUD
const initialLen = portalDataService.getJournal2024().length;
const newRow = portalDataService.addJournal2024Row({
  description: 'قيد جديد 2024 لاختبار الوحدة',
  amount: '5000',
  debitAccount: 'البنك',
  creditAccount: 'الصندوق',
});
assert.ok(newRow.id, '2024 Row created');
assert.strictEqual(portalDataService.getJournal2024().length, initialLen + 1, '2024 Count incremented');

const updated = portalDataService.updateJournal2024Row(newRow.id, { description: 'قيد جديد 2024 معدل' });
assert.strictEqual(updated.description, 'قيد جديد 2024 معدل', '2024 Row updated');

portalDataService.deleteJournal2024Row(newRow.id);
assert.strictEqual(portalDataService.getJournal2024().length, initialLen, '2024 Row deleted');
console.log('  ✅ Passed: Journal 2024 Add, Edit, and Delete CRUD works.');

console.log('🎉 ALL JOURNAL DELETE AND 2024 CRUD TESTS PASSED SUCCESSFULLY!');
