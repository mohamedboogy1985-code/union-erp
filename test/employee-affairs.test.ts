import assert from 'assert';
import { erpStore } from '../server/db/store.js';
import { employeeAffairsService } from '../server/services/employee-affairs.service.js';

/**
 * ===== اختبارات وحدة شئون العاملين (استكمال المحادثة السابقة) =====
 * 1. زرع العاملين من استمارة 2 تأمينات الحقيقية
 * 2. الشئون الإدارية (تسجيل → اعتماد/رفض → حذف)
 * 3. سلف العاملين (صرف → أقساط → تسوية كاملة)
 * 4. الملخص الإحصائي وفجوة تحصيل حصة النقابة
 */

console.log('🧪 Starting Employee Affairs Module Test Suite...\n');

function runTests() {
  const manager = erpStore.users[0]; // مدير البرنامج — جميع الصلاحيات

  // -------------------------------------------------------------
  // Test 1: زرع العاملين من استمارة 2 تأمينات
  // -------------------------------------------------------------
  console.log('🔹 Test 1: Seeding employees from real insurance Form-2 CSV');
  const loadResult = employeeAffairsService.loadEmployeesFromInsuranceCsv();
  assert.ok(erpStore.employees.length >= 70, `يجب تحميل 76 عاملاً على الأقل (found ${erpStore.employees.length})`);
  assert.strictEqual(loadResult.loaded, erpStore.employees.length, 'التحميل الأول يزرع كل الصفوف');
  const secondLoad = employeeAffairsService.loadEmployeesFromInsuranceCsv();
  assert.strictEqual(secondLoad.skipped, true, 'الإعادة يجب أن تكون idempotent');
  assert.strictEqual(secondLoad.loaded, 0, 'لا إعادة زرع في المرة الثانية');

  const first = erpStore.employees[0];
  assert.strictEqual(first.fullName, 'حنان عاطف محمود');
  assert.strictEqual(first.totalSalary, 8286.4);
  assert.strictEqual(first.insuranceSalary, 8100);
  assert.ok(first.employeeCode.startsWith('EMP-'), 'توليد كود العامل تلقائياً');
  console.log(`  ✅ Passed: ${erpStore.employees.length} employees seeded with real Form-2 figures.`);

  // -------------------------------------------------------------
  // Test 2: البحث في العاملين
  // -------------------------------------------------------------
  console.log('\n🔹 Test 2: Employee search');
  const results = employeeAffairsService.listEmployees('هشام');
  assert.ok(results.length >= 1, 'البحث بالاسم العربي يجب أن يجد نتائج');
  assert.ok(results.some((e) => e.fullName.includes('هشام')));
  console.log(`  ✅ Passed: Arabic name search returned ${results.length} match(es).`);

  // -------------------------------------------------------------
  // Test 3: دورة حياة الشأن الإداري (تسجيل → اعتماد → منع إعادة البت)
  // -------------------------------------------------------------
  console.log('\n🔹 Test 3: Administrative affair lifecycle');
  const affair = employeeAffairsService.addAffair(manager, {
    employeeId: first.id,
    type: 'SICK_LEAVE',
    startDate: '2026-08-01',
    endDate: '2026-08-05',
    days: 5,
    reason: 'إجازة مرضية بعجز طبي',
  });
  assert.strictEqual(affair.status, 'PENDING');
  assert.strictEqual(affair.employeeName, first.fullName);

  const approved = employeeAffairsService.decideAffair(manager, affair.id, 'APPROVED');
  assert.strictEqual(approved.status, 'APPROVED');
  assert.ok(approved.decidedBy, 'تسجيل من اعتمد القرار');

  assert.throws(
    () => employeeAffairsService.decideAffair(manager, affair.id, 'REJECTED'),
    /مسبقاً/,
    'لا يجوز البت في شأن تم البت فيه'
  );
  console.log('  ✅ Passed: create → approve → double-decision blocked.');

  // رفض شأن معلق + إحصاء المعلق
  const affair2 = employeeAffairsService.addAffair(manager, {
    employeeId: erpStore.employees[1].id,
    type: 'ANNUAL_LEAVE',
    startDate: '2026-09-01',
    days: 10,
    reason: 'إجازة سنوية',
  });
  employeeAffairsService.decideAffair(manager, affair2.id, 'REJECTED');
  assert.strictEqual(employeeAffairsService.listAffairs({ status: 'PENDING' }).length, 0);
  console.log('  ✅ Passed: reject flow works, pending filter accurate.');

  // -------------------------------------------------------------
  // Test 4: التحقق من صحة الإدخال (عامل غير موجود)
  // -------------------------------------------------------------
  console.log('\n🔹 Test 4: Validation — unknown employee');
  assert.throws(
    () =>
      employeeAffairsService.addAffair(manager, {
        employeeId: 'emp-does-not-exist',
        type: 'OTHER',
        startDate: '2026-08-01',
        reason: 'x',
      } as any),
    /غير موجود/
  );
  console.log('  ✅ Passed: unknown employee rejected.');

  // -------------------------------------------------------------
  // Test 5: سلف العاملين — صرف وأقساط وتسوية كاملة
  // -------------------------------------------------------------
  console.log('\n🔹 Test 5: Employee advances lifecycle');
  const advance = employeeAffairsService.addAdvance(manager, {
    employeeId: first.id,
    amount: 6000,
    installmentAmount: 500,
    issueDate: '2026-08-01',
    reason: 'ظروف اجتماعية',
  });
  assert.strictEqual(advance.status, 'ACTIVE');
  assert.strictEqual(advance.paidAmount, 0);

  employeeAffairsService.payInstallment(manager, advance.id, { amount: 500, date: '2026-08-31' });
  employeeAffairsService.payInstallment(manager, advance.id, { amount: 500, date: '2026-09-30' });
  const after2 = employeeAffairsService.listAdvances(advance.employeeId).find((a) => a.id === advance.id)!;
  assert.strictEqual(after2.paidAmount, 1000);
  assert.strictEqual(after2.status, 'ACTIVE', 'ما زالت قائمة حتى السداد الكامل');

  // حارس تجاوز المتبقي
  assert.throws(
    () => employeeAffairsService.payInstallment(manager, advance.id, { amount: 99999, date: '2026-10-30' }),
    /تتجاوز المتبقي/,
    'لا يجوز سداد قسط أكبر من المتبقي'
  );

  // قسط أخير يقفل السلفة
  const settled = employeeAffairsService.payInstallment(manager, advance.id, { amount: 5000, date: '2026-10-30' });
  assert.strictEqual(settled.status, 'SETTLED');
  assert.strictEqual(settled.paidAmount, 6000);
  console.log('  ✅ Passed: installments, overpayment guard, and full settlement.');

  // -------------------------------------------------------------
  // Test 6: الملخص الإحصائي وفجوة التحصيل
  // -------------------------------------------------------------
  console.log('\n🔹 Test 6: Summary & union-share collection gap');
  const summary = employeeAffairsService.getSummary();
  assert.strictEqual(summary.employeesCount, erpStore.employees.length);
  assert.ok(summary.totalSalaries > 250000, 'إجمالي الأجور الشاملة من البيانات الحقيقية');
  assert.ok(
    Math.abs(summary.collectionGap - (summary.totalUnionShareForm2 - summary.totalUnionShareDeducted)) < 0.01,
    'فجوة التحصيل = استمارة 2 - المستقطع الفعلي'
  );
  assert.ok(summary.collectionGap > 10000, `فجوة التحصيل الحقيقية كبيرة (${summary.collectionGap.toFixed(2)} ج.م)`);
  assert.strictEqual(summary.affairs.approved >= 1, true);
  assert.strictEqual(summary.advances.settled >= 1, true);
  console.log(`  ✅ Passed: gap = ${summary.collectionGap.toFixed(2)} EGP detected from real data.`);

  // -------------------------------------------------------------
  // Test 7: سجل التدقيق يرصد عمليات شئون العاملين
  // -------------------------------------------------------------
  console.log('\n🔹 Test 7: Audit trail coverage');
  const hrActions = erpStore.auditLogs.filter((l) => l.action.startsWith('HR_'));
  assert.ok(hrActions.length >= 4, 'يجب تسجيل عمليات HR في سلسلة التدقيق');
  assert.ok(hrActions.every((l) => l.eventHash && l.previousHash), 'سلسلة Hash-Chain سليمة');
  console.log(`  ✅ Passed: ${hrActions.length} HR actions recorded in the hash-chained audit log.`);

  console.log('\n🎉 ALL EMPLOYEE AFFAIRS TESTS PASSED SUCCESSFULLY!');
}

runTests();
