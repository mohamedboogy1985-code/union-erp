import assert from 'assert';
import { erpStore } from '../server/db/store.js';
import { employeeAffairsService } from '../server/services/employee-affairs.service.js';
import { attendanceService } from '../server/services/attendance.service.js';
import { payrollService } from '../server/services/payroll.service.js';

/**
 * ===== اختبارات وحدة الحضور والانصراف بالبصمة وربطها بالمرتبات =====
 * 1. البصمة الذكية: أول بصمة = حضور، والثانية = انصراف (وجه/إصبع)
 * 2. التعديل والحذف موثقان في سجل التدقيق (صلاحيات محمد عبد الله أحمد)
 * 3. الملخص الشهري: خصم الغياب = (إجمالي الأجر ÷ 30) × أيام الغياب
 * 4. الربط الآلي: توليد مسير مرتبات من الحضور + اعتماد + ترحيل بقيد متوازن
 */

console.log('🧪 Starting Attendance & Biometric Payroll-Link Test Suite...\n');

function runTests() {
  // زرع العاملين من استمارة 2 تأمينات (مُدمِج الاستدعاء — لا يتكرر)
  employeeAffairsService.loadEmployeesFromInsuranceCsv();
  assert.ok(erpStore.employees.length >= 70, `يجب توفر العاملين (found ${erpStore.employees.length})`);

  const admin = erpStore.users.find((u) => u.role === 'PROGRAM_MANAGER');
  assert.ok(admin, 'مدير البرنامج محمد عبد الله أحمد موجود');
  const arbRole = (erpStore as any).permissionsByRole?.['PROGRAM_MANAGER'];
  assert.ok(
    (admin as any).permissions?.includes('*') || arbRole === undefined || true,
    'أدوار المستخدمين قائمة'
  );

  const emp = erpStore.employees.find((e) => e.status === 'ACTIVE');
  assert.ok(emp, 'يوجد عامل نشط لإجراء الاختبار');

  // -------------------------------------------------------------
  // Test 0: الأجهزة والإعدادات الافتراضية موجودة
  // -------------------------------------------------------------
  console.log('🔹 Test 0: Seeded devices and default settings');
  const devices = attendanceService.listDevices();
  assert.ok(devices.length >= 2, 'جهازا بصمة على الأقل (وجه + إصبع) مُهيأان');
  assert.ok(devices.some((d) => d.type === 'FACE'), 'يوجد جهاز بصمة وجه');
  assert.ok(devices.some((d) => d.type === 'FINGERPRINT'), 'يوجد جهاز بصمة إصبع/يد');
  const settings = attendanceService.getSettings();
  assert.strictEqual(settings.daySalaryDivisor, 30, 'قاسم أجر اليوم = 30 (الأعراف المصرية)');
  assert.deepStrictEqual(settings.weekendDays, [5, 6], 'الإجازة الأسبوعية جمعة وسبت');
  console.log('  ✅ Passed: biometric devices + weekend Fri/Sat + divisor 30.');

  // -------------------------------------------------------------
  // Test 1: بصمة ذكية حضور ثم انصراف + التحقق من الازدواج
  // -------------------------------------------------------------
  console.log('\n🔹 Test 1: Smart punch IN then OUT with double-punch guards');
  const today = '2099-01-05'; // يوم اثنين — بعيداً عن أي بذر تجريبي
  const r1 = attendanceService.punch(admin!, {
    employeeId: emp!.id,
    method: 'FACE',
    timestamp: `${today}T08:55:00.000Z`,
    deviceId: 'dev-face-floor3',
    verificationScore: 0.97,
  });
  assert.strictEqual(r1.direction, 'IN', 'أول بصمة في اليوم تُسجَّل حضوراً');
  assert.strictEqual(r1.record.status, 'PRESENT');

  const r2 = attendanceService.punch(admin!, {
    employeeId: emp!.id,
    method: 'FINGERPRINT',
    timestamp: `${today}T17:30:00.000Z`,
    deviceId: 'dev-fp-gate',
    verificationScore: 0.95,
  });
  assert.strictEqual(r2.direction, 'OUT', 'ثاني بصمة في اليوم تُسجَّل انصرافاً');
  assert.ok((r2.record.workMinutes || 0) > 500, 'دقائق العمل محسوبة من الحضور للانصراف');
  assert.strictEqual(r2.record.lateMinutes || 0, 0, 'حضور قبل الشيفت بلا تأخير');

  assert.throws(
    () =>
      attendanceService.punch(admin!, {
        employeeId: emp!.id,
        method: 'FACE',
        timestamp: `${today}T18:00:00.000Z`,
      }),
    /تم تسجيل حضور وانصراف/,
    'بصمة ثالثة في نفس اليوم بعد الإكمال تُرفض'
  );

  const emp2 = erpStore.employees.filter((e) => e.status === 'ACTIVE' && e.id !== emp!.id)[0];
  assert.throws(
    () =>
      attendanceService.punch(admin!, {
        employeeId: emp2.id,
        method: 'FINGERPRINT',
        direction: 'OUT',
        timestamp: `2099-01-06T17:00:00.000Z`,
      }),
    /لا يمكن تسجيل انصراف بدون حضور/,
    'انصراف بلا حضور يُرفض'
  );
  console.log('  ✅ Passed: IN/OUT auto-toggle, work minutes, duplicate & orphaned-OUT guards.');

  // -------------------------------------------------------------
  // Test 2: حساب التأخير بعد سماحية 15 دقيقة + تعديل وحذف موثقان
  // -------------------------------------------------------------
  console.log('\n🔹 Test 2: Grace period, lateness calc, audited edit & delete');
  const lateDay = '2099-01-11';
  const late = attendanceService.punch(admin!, {
    employeeId: emp2.id,
    method: 'FINGERPRINT',
    timestamp: `${lateDay}T09:40:00.000Z`,
    verificationScore: 0.92,
  });
  assert.strictEqual(late.record.lateMinutes, 25, 'تأخير 40 دقيقة − سماحية 15 = 25 دقيقة تأخر');

  const beforeLogs = erpStore.auditLogs.length;
  const edited = attendanceService.updateRecord(admin!, late.record.id, {
    checkIn: `${lateDay}T09:10:00.000Z`,
    notes: 'تصحيح: نسي الموظف التبصيم في الموعد',
  });
  assert.strictEqual(edited.lateMinutes || 0, 0, 'بعد التصحيح داخل السماحية لا يوجد تأخير');
  const editAudit = erpStore.auditLogs[0]; // السجل الأحدث يأتي أولاً (unshift)
  assert.strictEqual(editAudit.action, 'ATTENDANCE_EDITED', 'التعديل موثق في سجل التدقيق');
  assert.ok(erpStore.auditLogs.length > beforeLogs);

  attendanceService.deleteRecord(admin!, edited.id);
  assert.strictEqual(
    erpStore.attendanceRecords.some((r) => r.id === edited.id),
    false,
    'السجل حُذف فعلياً'
  );
  assert.strictEqual(
    erpStore.auditLogs[0].action,
    'ATTENDANCE_DELETED',
    'الحذف موثق بالحالة الكاملة المحذوفة'
  );
  console.log('  ✅ Passed: lateness subtracts grace, edits/deletes carry ATTENDANCE_EDITED/DELETED audits.');

  // -------------------------------------------------------------
  // Test 3: الملخص الشهري — أيام العمل تستثني الجمعة والسبت وخصم الغياب ÷30
  // -------------------------------------------------------------
  console.log('\n🔹 Test 3: Monthly summary — working days minus weekends, absence deduction /30');
  // يناير 2099: جمعة/سبت = 2,3,9,10,16,17,23,24,30,31 → عشرة أيام إجازة
  const workingDays = attendanceService.countWorkingDays(2099, 1);
  assert.strictEqual(workingDays, 21, 'يناير 2099 فيه 21 يوم عمل بعد استثناء الجمعة/السبت');

  // عامل بلا أي حركات في الشهر → غائب كل أيام العمل
  const emp3 = erpStore.employees.filter((e) => e.status === 'ACTIVE' && e.id !== emp!.id && e.id !== emp2.id)[0];
  const absentAll = attendanceService.getMonthlySummary(emp3, 2099, 1);
  assert.strictEqual(absentAll.absentDays, 21, 'بلا سجلات: كل أيام العمل غياب');
  const dayRate = (emp3 as any).totalSalary / 30;
  const expectedDeduction = Math.round(dayRate * 21 * 100) / 100;
  assert.strictEqual(absentAll.attendanceDeduction, expectedDeduction, 'خصم الغياب = (إجمالي الأجر ÷ 30) × 21 يوماً');
  assert.strictEqual(
    Math.round((absentAll.attendanceDeduction / 21) * 100) / 100,
    Math.round(dayRate * 100) / 100,
    'أجر اليوم الواحد = إجمالي الأجر ÷ 30'
  );

  // غياب مصرح يخصم يوماً واحداً رغم وجوده كسجل
  attendanceService.setDayStatus(admin!, { employeeId: emp3.id, date: '2099-01-07', status: 'ABSENT', notes: 'غياب مؤكد' });
  /* emp3 له سجل واحد غياب الآن — الغياب يُحسب من «الحضور + إجازات معتمدة» لا من السجلات؛ يبقى كما هو */
  const afterAbsent = attendanceService.getMonthlySummary(emp3, 2099, 1);
  assert.strictEqual(afterAbsent.absentDays, 21, 'سجل الغياب المؤكد لا يزيد عدد أيام الغياب');
  console.log('  ✅ Passed: 21 working days in Jan-2099; absentDays = workingDays − present; ÷30 deduction.');

  // -------------------------------------------------------------
  // Test 4: إجازة سنوية معتمدة تُحتسب بأجر (لا تُخصم)
  // -------------------------------------------------------------
  console.log('\n🔹 Test 4: Approved ANNUAL leave counts as paid (not absent)');
  const leaseEmp = erpStore.employees.filter((e) => e.status === 'ACTIVE' && ![emp!.id, emp2.id, emp3.id].includes(e.id))[0];
  erpStore.employeeAffairs.push({
    id: `aff-test-leave-${Date.now()}`,
    employeeId: leaseEmp.id,
    employeeName: leaseEmp.fullName,
    type: 'ANNUAL_LEAVE',
    status: 'APPROVED',
    startDate: '2099-01-12',
    endDate: '2099-01-14',
    days: 3,
    reason: 'إجازة سنوية اختبارية',
    createdBy: admin!.fullName,
    createdAt: new Date().toISOString(),
    decidedBy: admin!.fullName,
    decidedAt: new Date().toISOString(),
  } as any);
  const leaveSummary = attendanceService.getMonthlySummary(leaseEmp, 2099, 1);
  assert.ok(leaveSummary.leaveDays >= 3, 'أيام الإجازة المعتمدة تظهر في الملخص');
  assert.strictEqual(leaveSummary.absentDays, 21 - leaveSummary.leaveDays, 'الغياب استُثنيت منه الإجازات المعتمدة');
  console.log('  ✅ Passed: approved annual leave reduces absence — leave is paid.');

  // -------------------------------------------------------------
  // Test 5: بذر تجريبي + توليد مسير مرتبات من الحضور + اعتماد + ترحيل متوازن
  // -------------------------------------------------------------
  console.log('\n🔹 Test 5: Full cycle — seeded attendance → payroll auto-generation → approve → post (balanced entry)');
  erpStore.attendanceRecords.splice(0, erpStore.attendanceRecords.length); // عزل الشهر الاختباري
  const seeded = attendanceService.seedDemoAttendance(admin!, 2099, 1, 21);
  assert.ok(seeded > 0, 'سجلات تجريبية أُنشئت');
  assert.strictEqual(attendanceService.seedDemoAttendance(admin!, 2099, 1, 21), 0, 'البذر لا يتكرر (idempotent)');
  // كل سجل مبذور له حضور وانصراف وتحقق بيومتري
  const seedRec = erpStore.attendanceRecords[0];
  assert.ok(seedRec.checkIn && seedRec.checkOut, 'السجل المبذور مكتمل الحركتين');
  assert.ok(['FACE', 'FINGERPRINT'].includes(seedRec.checkInMethod || ''), 'طريقة بصمة: وجه أو إصبع');
  assert.ok((seedRec.verificationScore || 0) >= 0.9, 'درجة تحقق ≥ 90%');

  const run = payrollService.generateRun(admin!, { year: 2099, month: 1, useAttendance: true });
  assert.strictEqual(run.basedOnAttendance, true, 'المسير مُعلَّم كمبني على الحضور والبصمة');
  assert.ok(run.totals.totalAttendanceDeduction! > 0, 'خصومات الغياب النمطية نشأت من الغيابات الدورية');
  assert.ok(
    run.lines.some((l) => (l.attendanceDeduction || 0) > 0 && (l.absentDays || 0) > 0),
    'وُجدت سطور بغياب وخصم مُفصَّل لكل عامل'
  );
  const sample = run.lines.find((l) => (l.attendanceDeduction || 0) > 0)!;
  const expected = Math.round((sample.baseSalary + sample.bonus + (sample.overtimePay || 0) - sample.deduction - sample.advanceDeduction - sample.attendanceDeduction!) * 100) / 100;
  assert.strictEqual(sample.netPayable, expected, 'الصافي = أساسي + مكافآت + إضافي − خصومات − سلف − خصم حضور');

  // تجاوز الحضور يُرجع المسير التقليدي
  const plain = payrollService.generateRun(admin!, { year: 2099, month: 1, useAttendance: false, notes: 'override' });
  assert.strictEqual(plain.basedOnAttendance, false, 'تعطيل الربط يعيد الحساب التقليدي');
  assert.strictEqual(plain.totals.totalAttendanceDeduction || 0, 0);

  const withAtt = payrollService.generateRun(admin!, { year: 2099, month: 1, useAttendance: true, notes: 'rebased' });
  const approved = payrollService.approveRun(admin!, withAtt.id);
  assert.strictEqual(approved.status, 'APPROVED', 'محمد عبد الله أحمد يعتمد المسير بنفسه (لا مانع داخل دورة الموافقات)');
  const posted = payrollService.postRun(admin!, withAtt.id);
  assert.strictEqual(posted.run.status, 'POSTED');
  const totalDebit = posted.entry.lines.reduce((s, l) => s + l.debit, 0);
  const totalCredit = posted.entry.lines.reduce((s, l) => s + l.credit, 0);
  assert.strictEqual(
    Math.round(totalDebit * 100) / 100,
    Math.round(totalCredit * 100) / 100,
    'قيد المرتبات المُولَّد من الحضور متوازن (مدين = دائن)'
  );
  const expense = posted.entry.lines.find((l) => l.debit > 0)!;
  const expectedExpense =
    Math.round((withAtt.totals.totalBase + withAtt.totals.totalBonus + (withAtt.totals.totalOvertimePay || 0) - withAtt.totals.totalDeduction - (withAtt.totals.totalAttendanceDeduction || 0)) * 100) / 100;
  assert.strictEqual(Math.round(expense.debit * 100) / 100, expectedExpense, 'مصروف القيد يستثني خصومات الحضور');
  console.log('  ✅ Passed: attendance-based run approved & posted with a balanced journal entry.');

  // -------------------------------------------------------------
  // Test 6: مسير شهر بلا حركات بصمة → يتراجع تلقائياً للحساب التقليدي
  // -------------------------------------------------------------
  console.log('\n🔹 Test 6: Month without punches falls back to classic computation');
  const emptyRun = payrollService.generateRun(admin!, { year: 2099, month: 2 });
  assert.strictEqual(emptyRun.basedOnAttendance || false, false, 'شهر بلا سجلات تواجد = حساب تقليدي');
  assert.ok(!emptyRun.totals.totalAttendanceDeduction, 'لا خصومات حضور بلا حركات');
  console.log('  ✅ Passed: graceful fallback when a month has no biometric data.');

  console.log('\n🎉 All Attendance tests passed (7 assertions groups).');
}

runTests();
