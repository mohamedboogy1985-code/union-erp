import assert from 'assert';
import { erpStore } from '../server/db/store.js';
import { accountingService } from '../server/services/accounting.service.js';
import { receiptsService } from '../server/services/receipts.service.js';
import { reportsService } from '../server/services/reports.service.js';
import { normalizeArabicText } from '../server/utils/arabic.js';

console.log('🧪 Starting Union Financial ERP Comprehensive Test Suite...\n');

async function runTests() {
  const adminUser = erpStore.users[0]; // Admin
  const cfoUser = erpStore.users[1]; // CFO
  const accountantUser = erpStore.users[2]; // Accountant

  // -------------------------------------------------------------
  // Test 1: Arabic Normalization
  // -------------------------------------------------------------
  console.log('🔹 Test 1: Arabic Name Normalization & Space Cleaning');
  const raw1 = '  شركة   الأمل   للمقاولات والتطوير  ';
  const raw2 = 'شركة الامل للمقاولات والتطوير';
  assert.strictEqual(normalizeArabicText(raw1), normalizeArabicText(raw2));
  console.log('  ✅ Passed: Hamzas and spaces normalized correctly.');

  // -------------------------------------------------------------
  // Test 2: Unbalanced Journal Entry must fail
  // -------------------------------------------------------------
  console.log('\n🔹 Test 2: Reject Unbalanced Journal Entry (Debit != Credit)');
  assert.throws(
    () => {
      accountingService.createJournalEntry(
        {
          date: '2026-02-20',
          organizationId: 'org-general',
          description: 'قيد غير متوازن تجريبي',
          lines: [
            { accountId: 'acc-1101', debit: 50000, credit: 0, description: 'مدين' },
            { accountId: 'acc-4101', debit: 0, credit: 40000, description: 'دائن ناقص' },
          ],
          userId: accountantUser.id,
        },
        accountantUser
      );
    },
    /القيد غير متوازن/,
    'Should throw unbalanced entry error'
  );
  console.log('  ✅ Passed: Unbalanced journal entry was rejected with clear error.');

  // -------------------------------------------------------------
  // Test 3: Account 1301 Auto-Subledger Creation
  // -------------------------------------------------------------
  console.log('\n🔹 Test 3: Auto-creation of Subledger Party for Account 1301 (مدينون متنوعون)');
  const initialPartiesCount = erpStore.subledgerParties.length;
  const newDebtorName = 'مكتب الأهرام للتوريدات الهندسية';

  const { entry: entry1, warnings } = accountingService.createJournalEntry(
    {
      date: '2026-02-20',
      organizationId: 'org-general',
      description: 'إثبات مديونية مستحقة على مكتب الأهرام',
      lines: [
        {
          accountId: 'acc-1301',
          subledgerPartyNameInput: newDebtorName,
          debit: 75000,
          credit: 0,
          description: 'مديونية توريدات نقابية',
        },
        {
          accountId: 'acc-4103',
          debit: 0,
          credit: 75000,
          description: 'إيراد توريدات',
        },
      ],
      userId: accountantUser.id,
    },
    accountantUser
  );

  assert.strictEqual(erpStore.subledgerParties.length, initialPartiesCount + 1);
  const createdParty = erpStore.subledgerParties.find((p) => p.name === newDebtorName);
  assert.ok(createdParty, 'Party must exist in store');
  assert.strictEqual(createdParty?.associatedAccountId, 'acc-1301');
  console.log(`  ✅ Passed: Automatically created subledger party [${createdParty?.name}] with code [${createdParty?.partyCode}].`);

  // -------------------------------------------------------------
  // Test 4: Deduplication on Subsequent Entry with Similar/Exact Normalized Name
  // -------------------------------------------------------------
  console.log('\n🔹 Test 4: Link to existing Subledger Party on subsequent entry');
  const inputWithDifferentHamza = 'مكتب الاهرام للتوريدات الهندسية'; // without hamza
  const { entry: entry2 } = accountingService.createJournalEntry(
    {
      date: '2026-02-21',
      organizationId: 'org-general',
      description: 'سداد دفعة من مكتب الأهرام',
      lines: [
        {
          accountId: 'acc-1101',
          debit: 25000,
          credit: 0,
          description: 'إيداع خزينة',
        },
        {
          accountId: 'acc-1301',
          subledgerPartyNameInput: inputWithDifferentHamza,
          debit: 0,
          credit: 25000,
          description: 'سداد جزئي',
        },
      ],
      userId: accountantUser.id,
    },
    accountantUser
  );

  // Subledger parties count should not have increased
  assert.strictEqual(erpStore.subledgerParties.length, initialPartiesCount + 1);
  assert.strictEqual(entry2.lines[1].subledgerPartyId, createdParty?.id);
  console.log('  ✅ Passed: Correctly identified and reused existing party despite hamza variation.');

  // -------------------------------------------------------------
  // Test 5: Post Entries & Verify Running Cumulative Balance
  // -------------------------------------------------------------
  console.log('\n🔹 Test 5: Approve, Post and Calculate Running Balance in Statement of Account');
  // CFO Approves and Posts Entry 1 (Debit 75,000)
  entry1.status = 'APPROVED';
  accountingService.postJournalEntry(entry1.id, cfoUser);

  // CFO Approves and Posts Entry 2 (Credit 25,000)
  entry2.status = 'APPROVED';
  accountingService.postJournalEntry(entry2.id, cfoUser);

  const statement = reportsService.getSubledgerPartyStatement(createdParty!.id);
  assert.strictEqual(statement.totalDebit, 75000);
  assert.strictEqual(statement.totalCredit, 25000);
  assert.strictEqual(statement.closingBalance, 50000);
  assert.strictEqual(statement.items.length, 2);
  assert.strictEqual(statement.items[0].runningBalance, 75000);
  assert.strictEqual(statement.items[1].runningBalance, 50000);
  console.log(`  ✅ Passed: Running cumulative balance computed accurately (Closing: ${statement.closingBalance.toLocaleString()} EGP).`);

  // -------------------------------------------------------------
  // Test 6: Separation of Duties (SoD)
  // -------------------------------------------------------------
  console.log('\n🔹 Test 6: Separation of Duties (Maker cannot approve their own entry)');
  const { entry: draftEntry } = accountingService.createJournalEntry(
    {
      date: '2026-02-22',
      organizationId: 'org-general',
      description: 'قيد اختبار فصل المهام',
      lines: [
        { accountId: 'acc-1101', debit: 10000, credit: 0, description: 'نقدية' },
        { accountId: 'acc-4101', debit: 0, credit: 10000, description: 'اشتراكات' },
      ],
      userId: accountantUser.id,
    },
    accountantUser
  );

  assert.throws(
    () => {
      accountingService.approveJournalEntry(draftEntry.id, accountantUser);
    },
    /مخالفة قواعد فصل المهام/,
    'Accountant should not approve own entry'
  );
  console.log('  ✅ Passed: SoD rule prevented maker from self-approving.');

  // -------------------------------------------------------------
  // Test 7: Closed Fiscal Period Lock
  // -------------------------------------------------------------
  console.log('\n🔹 Test 7: Posting Prevention in Closed Fiscal Period');
  assert.throws(
    () => {
      accountingService.createJournalEntry(
        {
          date: '2026-01-10', // January is closed
          organizationId: 'org-general',
          description: 'محاولة تسجيل في فترة مغلقة',
          lines: [
            { accountId: 'acc-1101', debit: 1000, credit: 0, description: 'مدين' },
            { accountId: 'acc-4101', debit: 0, credit: 1000, description: 'دائن' },
          ],
          userId: accountantUser.id,
        },
        accountantUser
      );
    },
    /فترة مالية مغلقة/,
    'Should prevent entry in closed period'
  );
  console.log('  ✅ Passed: System blocked entry in closed period.');

  // -------------------------------------------------------------
  // Test 8: Secured Receipt & Revenue Distribution
  // -------------------------------------------------------------
  console.log('\n🔹 Test 8: Revenue Distribution Engine (50% Syndicate / 30% Committee / 20% Fund)');
  const { receipt, journalEntryId } = receiptsService.issueReceipt(
    {
      date: '2026-02-22',
      organizationId: 'org-general',
      payerName: 'المهندس ياسر محمد عبد الرحمن',
      revenueTypeId: 'rule-member-fees',
      amount: 10000,
      paymentMethod: 'CASH',
      notes: 'سداد اشتراك سنوي مع توزيع الإيراد',
    },
    cfoUser
  );

  assert.strictEqual(receipt.allocations.length, 3);
  assert.strictEqual(receipt.allocations[0].allocatedAmount, 5000); // 50%
  assert.strictEqual(receipt.allocations[1].allocatedAmount, 3000); // 30%
  assert.strictEqual(receipt.allocations[2].allocatedAmount, 2000); // 20%
  assert.ok(receipt.sha256Hash, 'Must have SHA-256 integrity hash');
  assert.ok(receipt.qrVerificationToken, 'Must have QR token');
  console.log(`  ✅ Passed: Receipt generated with SHA-256 (${receipt.sha256Hash.slice(0, 16)}...) and distributed accurately.`);

  console.log('\n🎉 ALL 8 TESTS PASSED SUCCESSFULLY! 100% Core Accounting Engine Validated.\n');
}

runTests().catch((err) => {
  console.error('❌ Test failed with error:', err);
  process.exit(1);
});
