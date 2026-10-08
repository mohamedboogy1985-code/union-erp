import { erpStore } from '../db/store.js';
import type {
  AttendanceDevice,
  AttendanceMonthlySummary,
  AttendanceRecord,
  AttendanceSettings,
  AttendanceStatus,
  BiometricMethod,
  Employee,
  User,
} from '../../src/types/erp.js';

/**
 * ===== خدمة الحضور والانصراف بالبصمة (وجه/إصبع/يدوي) =====
 * - تسجيل بصمة حضور/انصراف تلقائي التبديل (أول بصمة = حضور، الثانية = انصراف)
 * - حساب دقائق العمل والتأخير (بعد سماحية الوردية) والعمل الإضافي
 * - ملخص شهري لكل عامل: أيام عمل/حضور/غياب/إجازات معتمدة ونسبة الحضور
 * - خصم الغياب = (الأجر الشامل ÷ 30) × أيام الغياب — يغذي توليد مسير المرتبات
 * - صلاحيات التعديل والحذف والاعتماد: attendance:manage (مدير البرنامج — محمد عبد الله أحمد)
 */

const ROUND2 = (n: number) => Math.round(n * 100) / 100;

const METHOD_AR: Record<BiometricMethod, string> = {
  FINGERPRINT: 'بصمة إصبع',
  FACE: 'بصمة وجه',
  MANUAL: 'يدوي',
  CARD: 'كارت',
};

export class AttendanceService {
  // ------------------------- الإعدادات والأجهزة -------------------------

  public getSettings(): AttendanceSettings {
    return erpStore.attendanceSettings;
  }

  public updateSettings(user: User, patch: Partial<AttendanceSettings>): AttendanceSettings {
    const prev = { ...erpStore.attendanceSettings };
    const next = { ...prev };
    if (patch.shiftStart && /^\d{1,2}:\d{2}$/.test(patch.shiftStart)) next.shiftStart = patch.shiftStart;
    if (typeof patch.shiftMinutes === 'number' && patch.shiftMinutes >= 60 && patch.shiftMinutes <= 960) next.shiftMinutes = patch.shiftMinutes;
    if (typeof patch.graceMinutes === 'number' && patch.graceMinutes >= 0 && patch.graceMinutes <= 120) next.graceMinutes = patch.graceMinutes;
    if (Array.isArray(patch.weekendDays) && patch.weekendDays.every((d) => d >= 0 && d <= 6) && patch.weekendDays.length < 7)
      next.weekendDays = [...patch.weekendDays];
    if (typeof patch.daySalaryDivisor === 'number' && patch.daySalaryDivisor >= 1 && patch.daySalaryDivisor <= 31)
      next.daySalaryDivisor = patch.daySalaryDivisor;
    if (typeof patch.payOvertime === 'boolean') next.payOvertime = patch.payOvertime;
    if (typeof patch.overtimeRate === 'number' && patch.overtimeRate > 0 && patch.overtimeRate <= 5) next.overtimeRate = patch.overtimeRate;
    erpStore.attendanceSettings = next;

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'ATTENDANCE_SETTINGS_UPDATED',
      'ATTENDANCE_SETTINGS',
      'GLOBAL',
      `تحديث إعدادات الحضور: الوردية ${next.shiftStart} (${next.shiftMinutes}د) سماحية ${next.graceMinutes}د إجازة أسبوعية [${next.weekendDays.join(',')}]`,
      prev,
      next
    );
    return next;
  }

  public listDevices(): AttendanceDevice[] {
    return erpStore.attendanceDevices;
  }

  public addDevice(user: User, data: { name: string; type: AttendanceDevice['type']; location: string }): AttendanceDevice {
    if (!data.name?.trim() || !data.location?.trim()) throw new Error('اسم الجهاز وموقعه حقول إلزامية.');
    if (!['FINGERPRINT', 'FACE', 'HYBRID'].includes(data.type)) throw new Error('نوع الجهاز غير صالح.');
    const device: AttendanceDevice = {
      id: `dev-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: data.name.trim(),
      type: data.type,
      location: data.location.trim(),
      isActive: true,
    };
    erpStore.attendanceDevices.push(device);
    erpStore.recordAudit(
      user.id, user.fullName, user.role, user.organizationId,
      'ATTENDANCE_DEVICE_ADDED', 'ATTENDANCE_DEVICE', device.id,
      `إضافة جهاز بصمة جديد [${device.name}] (${device.type}) بموقع [${device.location}]`
    );
    return device;
  }

  // ------------------------- تسجيل البصمة -------------------------

  /**
   * تسجيل بصمة (تبديل تلقائي حضور/انصراف ما لم يُحدَّد direction).
   * أول بصمة في اليوم = حضور، التالية = انصراف وحساب دقائق العمل/التأخير/الإضافي.
   */
  public punch(
    user: User,
    data: {
      employeeId?: string;
      employeeCode?: string;
      method?: BiometricMethod;
      direction?: 'IN' | 'OUT';
      timestamp?: string;
      deviceId?: string;
      verificationScore?: number;
      notes?: string;
    }
  ): { record: AttendanceRecord; direction: 'IN' | 'OUT'; message: string } {
    const employee = this.resolveEmployee(data.employeeId, data.employeeCode);
    if (!employee) throw new Error('العامل غير موجود في قاعدة البيانات (استمارة 2 تأمينات).');
    if (employee.status !== 'ACTIVE') throw new Error('هذا العامل غير نشط.');

    const method: BiometricMethod = data.method || 'FINGERPRINT';
    if (!['FINGERPRINT', 'FACE', 'MANUAL', 'CARD'].includes(method)) throw new Error('طريقة البصمة غير صالحة.');

    if (data.deviceId && !erpStore.attendanceDevices.some((d) => d.id === data.deviceId && d.isActive)) {
      throw new Error('جهاز البصمة غير معروف أو معطل.');
    }

    const ts = data.timestamp ? new Date(data.timestamp) : new Date();
    if (Number.isNaN(ts.getTime())) throw new Error('توقيت البصمة غير صالح.');
    const date = ts.toISOString().split('T')[0];

    let record = erpStore.attendanceRecords.find((r) => r.employeeId === employee.id && r.date === date);

    // لا يصح انصراف بدون حضور
    const direction: 'IN' | 'OUT' = data.direction || (!record || !record.checkIn ? 'IN' : record.checkOut ? 'IN' : 'OUT');
    if (direction === 'OUT' && (!record || !record.checkIn)) {
      throw new Error(`لا يمكن تسجيل انصراف بدون حضور لنفس اليوم (${employee.fullName} — ${date}).`);
    }
    if (direction === 'IN' && record?.checkIn && !data.direction) {
      // موجود سجل حضور وانصراف بلا تحديد جهة → ارفض لتفادي الازدواج
      if (record.checkOut) throw new Error(`تم تسجيل حضور وانصراف ${employee.fullName} اليوم بالفعل — استخدم التعديل اليدوي للتصحيح.`);
    }
    if (direction === 'OUT' && record?.checkOut) {
      throw new Error(`تم تسجيل انصراف ${employee.fullName} اليوم بالفعل — استخدم التعديل اليدوي للتصحيح.`);
    }

    if (!record) {
      record = {
        id: `att-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        employeeName: employee.fullName,
        date,
        status: 'PRESENT',
        createdBy: user.fullName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      erpStore.attendanceRecords.push(record);
    }

    if (direction === 'IN') {
      if (record.checkIn) throw new Error(`تم تسجيل حضور ${employee.fullName} اليوم بالفعل — استخدم التعديل اليدوي.`);
      record.checkIn = ts.toISOString();
      record.checkInMethod = method;
      record.status = 'PRESENT';
    } else {
      record.checkOut = ts.toISOString();
      record.checkOutMethod = method;
    }

    if (data.verificationScore !== undefined) record.verificationScore = ROUND2(Number(data.verificationScore));
    if (data.deviceId) record.deviceId = data.deviceId;
    if (data.notes) record.notes = data.notes;
    record.updatedAt = new Date().toISOString();

    this.recomputeDerived(record);

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'ATTENDANCE_PUNCH',
      'ATTENDANCE',
      record.id,
      `بصمة ${direction === 'IN' ? 'حضور' : 'انصراف'} [${employee.fullName}] بتاريخ ${date} (${ts.toISOString().slice(11, 16)}) عبر ${METHOD_AR[method]}${record.deviceId ? ` — جهاز ${record.deviceId}` : ''}${record.verificationScore !== undefined ? ` — تطابق ${(record.verificationScore * 100).toFixed(1)}%` : ''}`
    );

    const directionAr = direction === 'IN' ? 'حضور' : 'انصراف';
    return {
      record,
      direction,
      message: `تم تسجيل بصمة ${directionAr} لـ ${employee.fullName} (${METHOD_AR[method]}) الساعة ${ts.toISOString().slice(11, 16)} — ${date}.`,
    };
  }

  /** إعادة احتساب الحقول المشتقة بعد حضور/انصراف/تعديل */
  private recomputeDerived(record: AttendanceRecord): void {
    const s = erpStore.attendanceSettings;
    if (record.checkIn && record.checkOut) {
      const inMs = new Date(record.checkIn).getTime();
      const outMs = new Date(record.checkOut).getTime();
      record.workMinutes = Math.max(0, Math.round((outMs - inMs) / 60000));
      record.overtimeMinutes = Math.max(0, record.workMinutes - s.shiftMinutes);
    } else {
      record.workMinutes = undefined;
      record.overtimeMinutes = undefined;
    }
    if (record.checkIn) {
      const [sh, sm] = s.shiftStart.split(':').map(Number);
      const checkIn = new Date(record.checkIn);
      const shiftStart = new Date(checkIn);
      shiftStart.setUTCHours(sh, sm, 0, 0);
      record.lateMinutes = Math.max(0, Math.round((checkIn.getTime() - shiftStart.getTime()) / 60000) - s.graceMinutes);
    } else {
      record.lateMinutes = undefined;
    }
  }

  // ------------------------- العرض والتعديل والحذف -------------------------

  public listRecords(params: { employeeId?: string; date?: string; from?: string; to?: string } = {}): AttendanceRecord[] {
    return erpStore.attendanceRecords
      .filter(
        (r) =>
          (!params.employeeId || r.employeeId === params.employeeId) &&
          (!params.date || r.date === params.date) &&
          (!params.from || r.date >= params.from) &&
          (!params.to || r.date <= params.to)
      )
      .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.employeeCode.localeCompare(b.employeeCode)));
  }

  /** تعديل يدوي (تصحيح) لتوقيتات/حالة سجل — يعيد الاحتساب ويوثق */
  public updateRecord(
    user: User,
    recordId: string,
    patch: {
      checkIn?: string | null;
      checkOut?: string | null;
      checkInMethod?: BiometricMethod;
      checkOutMethod?: BiometricMethod;
      status?: AttendanceStatus;
      notes?: string;
    }
  ): AttendanceRecord {
    const record = erpStore.attendanceRecords.find((r) => r.id === recordId);
    if (!record) throw new Error('سجل الحضور غير موجود.');

    const before = { ...record };
    if (patch.checkIn !== undefined) record.checkIn = patch.checkIn ?? undefined;
    if (patch.checkOut !== undefined) record.checkOut = patch.checkOut ?? undefined;
    if (patch.checkInMethod) record.checkInMethod = patch.checkInMethod;
    if (patch.checkOutMethod) record.checkOutMethod = patch.checkOutMethod;
    if (patch.status && ['PRESENT', 'ABSENT', 'LEAVE', 'HOLIDAY', 'MISSION'].includes(patch.status)) record.status = patch.status;
    if (patch.notes !== undefined) record.notes = patch.notes;
    record.updatedAt = new Date().toISOString();
    this.recomputeDerived(record);

    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'ATTENDANCE_EDITED',
      'ATTENDANCE',
      record.id,
      `تعديل يدوي لسجل حضور [${record.employeeName}] بتاريخ ${record.date}`,
      before,
      { ...record }
    );
    return record;
  }

  /** حذف سجل — موثق بكامل الحالة السابقة */
  public deleteRecord(user: User, recordId: string): void {
    const index = erpStore.attendanceRecords.findIndex((r) => r.id === recordId);
    if (index === -1) throw new Error('سجل الحضور غير موجود.');
    const [removed] = erpStore.attendanceRecords.splice(index, 1);
    erpStore.recordAudit(
      user.id,
      user.fullName,
      user.role,
      user.organizationId,
      'ATTENDANCE_DELETED',
      'ATTENDANCE',
      removed.id,
      `حذف سجل حضور [${removed.employeeName}] بتاريخ ${removed.date} حالة [${removed.status}]`,
      removed,
      undefined
    );
  }

  /** إثبات حالة يوم بلا بصمة (غياب/إجازة/مهمة رسمية) لعامل معين */
  public setDayStatus(user: User, data: { employeeId: string; date: string; status: AttendanceStatus; notes?: string }): AttendanceRecord {
    const employee = erpStore.employees.find((e) => e.id === data.employeeId);
    if (!employee) throw new Error('العامل غير موجود.');
    if (data.status === 'PRESENT') throw new Error('الحضور يُثبت بالبصمة فقط.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(data.date)) throw new Error('صيغة التاريخ غير صالحة (YYYY-MM-DD).');

    let record = erpStore.attendanceRecords.find((r) => r.employeeId === employee.id && r.date === data.date);
    if (!record) {
      record = {
        id: `att-${Date.now()}-${Math.floor(Math.random() * 10000)}`,
        employeeId: employee.id,
        employeeCode: employee.employeeCode,
        employeeName: employee.fullName,
        date: data.date,
        status: data.status,
        createdBy: user.fullName,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      erpStore.attendanceRecords.push(record);
    } else {
      record.status = data.status;
      record.updatedAt = new Date().toISOString();
      this.recomputeDerived(record);
    }
    if (data.notes) record.notes = data.notes;

    erpStore.recordAudit(
      user.id, user.fullName, user.role, user.organizationId,
      'ATTENDANCE_STATUS_SET', 'ATTENDANCE', record.id,
      `إثبات حالة يوم [${data.date}] للعامل ${employee.fullName} = ${data.status}`
    );
    return record;
  }

  /** استيراد سجل حركات جهاز بصمة دفعة واحدة */
  public importFromDevice(
    user: User,
    rows: { employeeCode: string; date: string; checkIn: string; checkOut?: string; method?: BiometricMethod; deviceId?: string }[]
  ): { imported: number; skipped: number; errors: { row: number; message: string }[] } {
    let imported = 0;
    let skipped = 0;
    const errors: { row: number; message: string }[] = [];
    rows.forEach((row, i) => {
      try {
        const employee = this.resolveEmployee(undefined, row.employeeCode);
        if (!employee) throw new Error(`كود عامل غير معروف: ${row.employeeCode}`);
        const existing = erpStore.attendanceRecords.find((r) => r.employeeId === employee.id && r.date === row.date);
        if (existing) {
          skipped++;
          return;
        }
        const record: AttendanceRecord = {
          id: `att-${Date.now()}-${i}-${Math.floor(Math.random() * 1000)}`,
          employeeId: employee.id,
          employeeCode: employee.employeeCode,
          employeeName: employee.fullName,
          date: row.date,
          checkIn: new Date(`${row.date}T${row.checkIn}:00Z`).toISOString(),
          checkInMethod: row.method || 'FINGERPRINT',
          checkOut: row.checkOut ? new Date(`${row.date}T${row.checkOut}:00Z`).toISOString() : undefined,
          checkOutMethod: row.checkOut ? row.method || 'FINGERPRINT' : undefined,
          status: 'PRESENT',
          deviceId: row.deviceId,
          createdBy: user.fullName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.recomputeDerived(record);
        erpStore.attendanceRecords.push(record);
        imported++;
      } catch (err: any) {
        errors.push({ row: i + 1, message: err.message });
      }
    });

    erpStore.recordAudit(
      user.id, user.fullName, user.role, user.organizationId,
      'ATTENDANCE_IMPORTED', 'ATTENDANCE', 'BATCH',
      `استيراد حركات بصمة من الجهاز: ${imported} سجل جديد و${skipped} متخطى و${errors.length} أخطاء`
    );
    return { imported, skipped, errors };
  }

  // ------------------------- الملخص الشهري (يغذي المرتبات) -------------------------

  /** أيام العمل المقررة (يستبعد الإجازات الأسبوعية) — uptoDay لحصر الحساب عند حد زمني */
  public countWorkingDays(year: number, month: number, uptoDay?: number): number {
    const s = erpStore.attendanceSettings;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const lastDay = Math.min(uptoDay ?? daysInMonth, daysInMonth);
    let count = 0;
    for (let d = 1; d <= lastDay; d++) {
      const day = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
      if (!s.weekendDays.includes(day)) count++;
    }
    return count;
  }

  /** أيام الإجازات المعتمدة (سنوية/مرضية/عارضة) للعامل داخل الشهر (تُحتسب أيام عمل فقط) */
  private approvedLeaveDays(employeeId: string, year: number, month: number, uptoDay?: number): number {
    const s = erpStore.attendanceSettings;
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const lastDay = Math.min(uptoDay ?? daysInMonth, daysInMonth);
    const leaves = erpStore.employeeAffairs.filter(
      (a) =>
        a.employeeId === employeeId &&
        a.status === 'APPROVED' &&
        ['ANNUAL_LEAVE', 'SICK_LEAVE', 'CASUAL_LEAVE'].includes(a.type)
    );
    let count = 0;
    for (let d = 1; d <= lastDay; d++) {
      const date = `${prefix}-${String(d).padStart(2, '0')}`;
      const inLeave = leaves.some((l) => l.startDate <= date && (!l.endDate || l.endDate >= date));
      if (inLeave && !s.weekendDays.includes(new Date(Date.UTC(year, month - 1, d)).getUTCDay())) count++;
    }
    return count;
  }

  /** ملخص شهر لعامل (أرقام نهائية تُغذي مسير المرتبات) */
  public getMonthlySummary(employee: Employee, year: number, month: number): AttendanceMonthlySummary {
    const prefix = `${year}-${String(month).padStart(2, '0')}`;
    const records = erpStore.attendanceRecords.filter(
      (r) => r.employeeId === employee.id && r.date.startsWith(prefix)
    );
    // للشهر الجاري لا تُخصم أيام المستقبل: الغياب يُحتسب حتى يومنا الحالي فقط
    const nowU = new Date();
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    let uptoDay = daysInMonth;
    if (year === nowU.getFullYear() && month === nowU.getMonth() + 1) {
      uptoDay = nowU.getDate();
    }
    const workingDays = this.countWorkingDays(year, month, uptoDay);
    const presentDays = records.filter((r) => r.status === 'PRESENT' && Number(r.date.slice(8, 10)) <= uptoDay).length;
    const leaveDays = this.approvedLeaveDays(employee.id, year, month, uptoDay);
    const absentDays = Math.max(0, workingDays - presentDays - leaveDays);
    const s = erpStore.attendanceSettings;
    const attendanceDeduction = ROUND2((employee.totalSalary / s.daySalaryDivisor) * absentDays);

    return {
      employeeId: employee.id,
      employeeCode: employee.employeeCode,
      employeeName: employee.fullName,
      year,
      month,
      workingDays,
      presentDays,
      absentDays,
      leaveDays,
      totalWorkMinutes: records.reduce((sum, r) => sum + (r.workMinutes || 0), 0),
      totalLateMinutes: records.reduce((sum, r) => sum + (r.lateMinutes || 0), 0),
      totalOvertimeMinutes: records.reduce((sum, r) => sum + (r.overtimeMinutes || 0), 0),
      attendanceRate: workingDays > 0 ? ROUND2((presentDays / workingDays) * 100) : 0,
      attendanceDeduction,
    };
  }

  /** ملخصات كل العاملين النشطين لشهر معين — المصدر المباشر لشاشة المرتبات */
  public getMonthSummaries(year: number, month: number): AttendanceMonthlySummary[] {
    return erpStore.employees
      .filter((e) => e.status === 'ACTIVE')
      .map((e) => this.getMonthlySummary(e, year, month));
  }

  // ------------------------- بذر عرض توضيحي -------------------------

  /**
   * بذر حركات بصمة توضيحية لشهر (حتمي — يعمل مرة واحدة فقط):
   * حضور 09:00±دقائق وانصراف بعد 8 ساعات إلا أيام الإجازة الأسبوعية،
   * مع غيابات وتأخير معلومي لإظهار الخصومات في شاشة المرتبات.
   */
  public seedDemoAttendance(user: User, year: number, month: number, uptoDay: number): number {
    if (erpStore.attendanceRecords.length > 0) return 0;
    const s = erpStore.attendanceSettings;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const lastDay = Math.min(uptoDay, daysInMonth);
    let seeded = 0;
    const employees = erpStore.employees.filter((e) => e.status === 'ACTIVE');

    for (let d = 1; d <= lastDay; d++) {
      const dow = new Date(Date.UTC(year, month - 1, d)).getUTCDay();
      if (s.weekendDays.includes(dow)) continue;
      const date = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      employees.forEach((emp, idx) => {
        // غياب نمطي: كل عامل يغيب يوماً كل 13 يوم عمل (تباين بالترتيب)
        if ((d + idx) % 13 === 0) return;
        const jitterIn = (idx * 7 + d * 3) % 40 - 10; // -10..+29 دقيقة حول 9:00
        const inMin = 9 * 60 + jitterIn;
        const inH = String(Math.floor(inMin / 60)).padStart(2, '0');
        const inM = String(inMin % 60).padStart(2, '0');
        const outMin = inMin + s.shiftMinutes + ((idx * 5 + d) % 50 - 10); // ± إضافي بسيط
        const outH = String(Math.floor(outMin / 60)).padStart(2, '0');
        const outM = String(outMin % 60).padStart(2, '0');
        const isFace = idx % 3 === 0;
        const record: AttendanceRecord = {
          id: `att-seed-${emp.id}-${date}`,
          employeeId: emp.id,
          employeeCode: emp.employeeCode,
          employeeName: emp.fullName,
          date,
          checkIn: `${date}T${inH}:${inM}:00.000Z`,
          checkInMethod: isFace ? 'FACE' : 'FINGERPRINT',
          checkOut: `${date}T${outH}:${outM}:00.000Z`,
          checkOutMethod: isFace ? 'FACE' : 'FINGERPRINT',
          status: 'PRESENT',
          verificationScore: ROUND2(0.93 + ((idx + d) % 7) / 100),
          deviceId: isFace ? 'dev-face-floor3' : 'dev-fp-gate',
          createdBy: user.fullName,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        this.recomputeDerived(record);
        erpStore.attendanceRecords.push(record);
        seeded++;
      });
    }

    if (seeded > 0) {
      erpStore.recordAudit(
        user.id, user.fullName, user.role, user.organizationId,
        'ATTENDANCE_SEEDED', 'ATTENDANCE', 'DEMO',
        `بذر ${seeded} حركة بصمة توضيحية لشهر ${month}/${year} (${erpStore.employees.length} عاملاً)`
      );
    }
    return seeded;
  }

  private resolveEmployee(employeeId?: string, employeeCode?: string): Employee | undefined {
    return erpStore.employees.find(
      (e) => (employeeId && e.id === employeeId) || (employeeCode && e.employeeCode.toLowerCase() === employeeCode.toLowerCase())
    );
  }
}

export const attendanceService = new AttendanceService();
