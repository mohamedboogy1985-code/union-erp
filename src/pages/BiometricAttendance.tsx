import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  BadgeCheck,
  Camera,
  CheckCircle2,
  Fingerprint,
  Loader2,
  RefreshCw,
  ScanFace,
  ShieldCheck,
  UserCheck,
  XCircle,
} from 'lucide-react';
import { api } from '../services/api.js';
import { Combobox } from '../components/Combobox.js';
import { User } from '../types/erp.js';
import type {
  BiometricOverview,
  BiometricPunchLog,
  PayrollLinkState,
} from '../types/erp.biometric.js';

interface BiometricAttendanceProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (
    type: 'success' | 'error' | 'warning' | 'info',
    msg: string,
  ) => void;
}

const fmt = (value: number | undefined): string =>
  (value ?? 0).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
const fmtInt = (value: number | undefined): string =>
  (value ?? 0).toLocaleString('en-US');

const STATUS_LABEL: Record<PayrollLinkState['status'], string> = {
  NOT_LINKED: 'غير مربوط',
  PENDING: 'بانتظار اعتماد محمد عبد الله',
  APPROVED: 'معتمد — يُخصم الغياب والتأخير',
  REJECTED: 'لم يُعتمد — المسير بدون خصم بصمة',
};

const STATUS_TONE: Record<PayrollLinkState['status'], string> = {
  NOT_LINKED: 'text-slate-300 border-slate-700',
  PENDING: 'text-amber-300 border-amber-800/60',
  APPROVED: 'text-emerald-300 border-emerald-800/60',
  REJECTED: 'text-rose-300 border-rose-800/60',
};

/** شاشة بصمة اليد والوجه وربطها بالمراتب — الاعتماد مقصور على محمد عبد الله أحمد. */
export const BiometricAttendance: React.FC<BiometricAttendanceProps> = ({
  organizationId,
  currentUser,
  onShowToast,
}) => {
  const [data, setData] = useState<BiometricOverview | null>(null);
  const [busy, setBusy] = useState(false);
  const [employeeId, setEmployeeId] = useState('');
  const [employeeQuery, setEmployeeQuery] = useState('');
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState('');
  const [faceShot, setFaceShot] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const load = useCallback(async () => {
    try {
      const overview = await api.getBiometricOverview(organizationId);
      setData(overview);
      if (!employeeId && overview.employees.length) {
        const first = overview.employees[0];
        setEmployeeId(first.id);
        setEmployeeQuery(`${first.code} — ${first.fullName}`);
      }
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذّر تحميل شاشة البصمة.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [organizationId, onShowToast]);

  useEffect(() => {
    void load();
    return () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [load]);

  const startCamera = async () => {
    setCameraError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 480, height: 360, facingMode: 'user' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }
      setCameraReady(true);
    } catch (err: any) {
      setCameraReady(false);
      setCameraError(
        err?.name === 'NotAllowedError'
          ? 'المتصفح رفض إذن الكاميرا — اسمح بالوصول من إعدادات الموقع.'
          : 'مفيش كاميرا متاحة على الجهاز ده.',
      );
    }
  };

  const stopCamera = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    setCameraReady(false);
  };

  const captureFace = () => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || !video.videoWidth) {
      onShowToast('warning', 'شغّل الكاميرا الأول ثم اضغط «التقط الوجه».');
      return null;
    }
    const width = 180;
    const height =
      Math.round((video.videoHeight / video.videoWidth) * width) || 135;
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d');
    if (!context) return null;
    context.drawImage(video, 0, 0, width, height);
    const shot = canvas.toDataURL('image/jpeg', 0.6);
    setFaceShot(shot);
    return shot;
  };

  const enroll = async () => {
    if (!employeeId) {
      onShowToast('warning', 'اختر العامل الأول.');
      return;
    }
    setBusy(true);
    try {
      // حفظ الصورة في معاينة المتصفح فقط؛ لا نرسلها ولا نخزنها على الخادم.
      captureFace();
      const enrollment = await api.enrollBiometric({
        employeeId,
        methods: ['FINGERPRINT', 'FACE'],
      });
      onShowToast(
        'success',
        `اتسجّلت بصمة ${enrollment.employeeName} (إصبع ${enrollment.fingerQuality}% — وجه ${enrollment.faceQuality}%).`,
      );
      await load();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذّر تسجيل البصمة.');
    } finally {
      setBusy(false);
    }
  };

  const punch = async (method: 'FINGERPRINT' | 'FACE') => {
    if (!employeeId) {
      onShowToast('warning', 'اختر العامل الأول.');
      return;
    }
    setBusy(true);
    try {
      const result = await api.punchBiometric({ employeeId, method });
      onShowToast(
        'success',
        `${result.punch.messageAr || 'اتسجّلت البصمة'} (درجة المطابقة ${result.punch.score}%).`,
      );
      await load();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذّر تسجيل البصمة.');
    } finally {
      setBusy(false);
    }
  };

  const requestLink = async () => {
    setBusy(true);
    try {
      await api.requestBiometricPayrollLink();
      onShowToast(
        'success',
        'اتسجّل طلب ربط البصمة بالمراتب — الاعتماد بيد محمد عبد الله أحمد.',
      );
      await load();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذّر تسجيل الطلب.');
    } finally {
      setBusy(false);
    }
  };

  const decideLink = async (approved: boolean) => {
    setBusy(true);
    try {
      const state = await api.decideBiometricPayrollLink(approved);
      onShowToast(
        approved ? 'success' : 'info',
        state.noteAr || 'اتسجّل القرار.',
      );
      await load();
    } catch (err: any) {
      onShowToast('error', err.message || 'تعذّر تسجيل القرار.');
    } finally {
      setBusy(false);
    }
  };

  const link = data?.payrollLink;
  const canDecide = Boolean(data?.canDecideLink);
  const selectedEmployee = data?.employees.find((row) => row.id === employeeId);
  const selectedEnrollment = data?.enrollments.find(
    (row) => row.employeeId === employeeId,
  );

  return (
    <div className="space-y-4">
      {/* لوحة حالة الربط */}
      <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-md space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-cyan-400" />
            <div>
              <h2 className="text-sm font-bold text-slate-100">
                الحضور والانصراف ببصمة اليد والوجه — وربطها بالمراتب
              </h2>
              <p className="text-[10px] text-slate-500 mt-0.5">
                القوالب تُحفظ محلياً على الخادم، وربط البصمة بالمراتب لا يُفعَّل
                إلا باعتماد {data?.approverNameAr ?? 'محمد عبد الله أحمد'}.
              </p>
            </div>
          </div>
          <span
            className={`text-[11px] px-3 py-1.5 rounded-xl border bg-slate-950 ${link ? STATUS_TONE[link.status] : 'text-slate-300 border-slate-700'}`}
            data-biometric-link-status={link?.status ?? 'NOT_LINKED'}
          >
            حالة الربط: {link ? STATUS_LABEL[link.status] : '—'}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            data-action="biometric-request-link"
            onClick={requestLink}
            disabled={
              busy || !data?.canRequestLink || link?.status === 'APPROVED'
            }
            className="flex items-center gap-2 rounded-xl border border-amber-700/50 bg-slate-950 px-3 py-2 text-[11px] font-bold text-amber-300 hover:bg-slate-800 disabled:opacity-50"
          >
            <RefreshCw className="w-3.5 h-3.5" /> طلب ربط البصمة بالمراتب
          </button>
          <button
            type="button"
            data-action="biometric-approve-link"
            onClick={() => decideLink(true)}
            disabled={busy || !canDecide}
            title={
              canDecide
                ? 'اعتماد الربط'
                : `الاعتماد مقصور على ${data?.approverNameAr ?? ''}`
            }
            className="flex items-center gap-2 rounded-xl bg-emerald-700 px-3 py-2 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-40"
          >
            <CheckCircle2 className="w-3.5 h-3.5" /> اعتماد الربط
          </button>
          <button
            type="button"
            data-action="biometric-reject-link"
            onClick={() => decideLink(false)}
            disabled={busy || !canDecide}
            title={
              canDecide
                ? 'عدم الاعتماد'
                : `الاعتماد مقصور على ${data?.approverNameAr ?? ''}`
            }
            className="flex items-center gap-2 rounded-xl border border-rose-700/50 bg-slate-950 px-3 py-2 text-[11px] font-bold text-rose-300 hover:bg-slate-800 disabled:opacity-40"
          >
            <XCircle className="w-3.5 h-3.5" /> عدم الاعتماد
          </button>
          {!canDecide && (
            <span
              className="text-[10px] text-slate-500"
              data-biometric-approver-note
            >
              زر الاعتماد/عدم الاعتماد مُتاح فقط لحساب{' '}
              {data?.approverNameAr ?? 'محمد عبد الله أحمد'} — أنت داخل بحساب{' '}
              {currentUser?.fullName ?? 'غير معروف'}.
            </span>
          )}
          {link?.decidedBy && (
            <span className="text-[10px] text-slate-400">
              القرار بقلم {link.decidedByName} في{' '}
              {String(link.decidedAt).slice(0, 16).replace('T', ' ')}
            </span>
          )}
        </div>

        <ul className="grid grid-cols-1 md:grid-cols-3 gap-2">
          {(data?.effectsAr ?? []).map((effect) => (
            <li
              key={effect}
              className="rounded-xl border border-slate-800 bg-slate-950 px-3 py-2 text-[10px] leading-5 text-slate-400"
            >
              • {effect}
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* التسجيل */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3">
          <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
            <ScanFace className="w-4 h-4 text-cyan-400" /> تسجيل بصمة (إصبع +
            وجه)
          </h3>
          <label className="block space-y-1">
            <span className="block text-[10px] text-slate-400">
              اختر العامل
            </span>
            <Combobox
              value={employeeQuery}
              onChange={setEmployeeQuery}
              onSelect={(option) => {
                setEmployeeId(String(option.id));
                setEmployeeQuery(option.label);
              }}
              options={(data?.employees ?? []).map((employee) => ({
                id: employee.id,
                label: `${employee.code} — ${employee.fullName}`,
                sub: employee.enrolled ? 'بصمة مسجَّلة' : 'بدون بصمة',
              }))}
              placeholder="ابحث بالكود أو الاسم"
              inputClassName="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-[12px] text-slate-200"
            />
          </label>

          <div className="rounded-xl border border-slate-800 bg-black/40 overflow-hidden">
            {cameraReady ? (
              <video
                ref={videoRef}
                playsInline
                muted
                className="w-full h-40 object-cover"
                data-biometric-camera="on"
              />
            ) : (
              <div className="h-40 flex flex-col items-center justify-center gap-2 text-slate-500 text-[10px]">
                <Camera className="w-5 h-5" />
                {cameraError ||
                  'الكاميرا مقفولة — اضغط «تشغيل الكاميرا» لالتقاط صورة الوجه'}
              </div>
            )}
            {faceShot && (
              <img
                src={faceShot}
                alt="لقطة الوجه المسجَّلة"
                className="w-16 h-16 absolute opacity-0"
                data-biometric-face-shot
              />
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" />

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={cameraReady ? stopCamera : startCamera}
              className="rounded-lg border border-slate-700 px-3 py-1.5 text-[10px] text-slate-200 hover:bg-slate-800"
            >
              {cameraReady ? 'إيقاف الكاميرا' : 'تشغيل الكاميرا'}
            </button>
            <button
              type="button"
              data-action="biometric-enroll"
              onClick={enroll}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg bg-cyan-700 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-cyan-600 disabled:opacity-50"
            >
              {busy ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <UserCheck className="w-3 h-3" />
              )}{' '}
              تسجيل البصمة
            </button>
          </div>

          {selectedEnrollment && (
            <div className="rounded-xl border border-emerald-800/50 bg-slate-950 px-3 py-2 text-[10px] text-emerald-200/90 space-y-1">
              <p>
                قالب مسجَّل:{' '}
                {selectedEnrollment.methods
                  .map((method) => (method === 'FACE' ? 'وجه' : 'إصبع'))
                  .join(' + ')}
              </p>
              <p>
                جود   الإصبع {selectedEnrollment.fingerQuality}% • الوجه{' '}
                {selectedEnrollment.faceQuality}%
              </p>
              <p className="text-slate-500">
                سجّله {selectedEnrollment.enrolledByName} —{' '}
                {selectedEnrollment.enrolledAt.slice(0, 16).replace('T', ' ')}
              </p>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              data-action="biometric-punch-finger"
              onClick={() => punch('FINGERPRINT')}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg bg-teal-700 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-teal-600 disabled:opacity-50"
            >
              <Fingerprint className="w-3 h-3" /> بصمة إصبع
            </button>
            <button
              type="button"
              data-action="biometric-punch-face"
              onClick={() => punch('FACE')}
              disabled={busy}
              className="flex items-center gap-1 rounded-lg bg-indigo-700 px-3 py-1.5 text-[10px] font-bold text-white hover:bg-indigo-600 disabled:opacity-50"
            >
              <ScanFace className="w-3 h-3" /> بصمة وجه
            </button>
          </div>
          <p className="text-[9px] text-slate-500">
            {selectedEmployee
              ? `العامل المختار: ${selectedEmployee.fullName} — ${selectedEmployee.enrolled ? 'بصمته مسجَّلة' : 'لسه مش مسجّل بصمة'}`
              : 'اختر عاملاً لتسجيل أو تسجيل بصمته.'}{' '}
            لما مفيش عتاد بصمة حقيقي، التسجيل والتسجيل يعملان بالمحاكاة ويظل
            القالب والقرار محفوظين بالبرنامج.
          </p>
        </div>

        {/* حركات البصمة */}
        <div className="bg-slate-900 border border-slate-800 rounded-2xl p-4 space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-xs font-bold text-slate-100 flex items-center gap-2">
              <BadgeCheck className="w-4 h-4 text-emerald-400" /> حركات البصمة
              الأخيرة
            </h3>
            <div className="flex items-center gap-2 text-[10px] text-slate-400">
              <span>قوالب: {fmtInt(data?.enrollments.length)}</span>
              <span>•</span>
              <span>حركات: {fmtInt(data?.punches.length)}</span>
              <button
                type="button"
                onClick={() => void load()}
                className="flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 hover:bg-slate-800"
              >
                <RefreshCw className="w-3 h-3" /> تحديث
              </button>
            </div>
          </div>
          <div className="overflow-auto rounded-xl border border-slate-800 max-h-64">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-950 text-slate-400 sticky top-0">
                <tr>
                  <th className="text-right py-2 px-2 font-medium">الوقت</th>
                  <th className="text-right py-2 px-2 font-medium">العامل</th>
                  <th className="text-right py-2 px-2 font-medium">الطريقة</th>
                  <th className="text-right py-2 px-2 font-medium">النوع</th>
                  <th className="text-right py-2 px-2 font-medium">المطابقة</th>
                </tr>
              </thead>
              <tbody>
                {(data?.punches ?? []).map((punch: BiometricPunchLog) => (
                  <tr key={punch.id} className="border-t border-slate-800/70">
                    <td className="py-1.5 px-2 font-mono text-slate-400">
                      {punch.timestamp.slice(0, 16).replace('T', ' ')}
                    </td>
                    <td className="py-1.5 px-2 text-slate-200">
                      {punch.employeeName}
                    </td>
                    <td className="py-1.5 px-2 text-slate-300">
                      {punch.method === 'FACE' ? 'وجه' : 'إصبع'}
                    </td>
                    <td className="py-1.5 px-2">
                      {punch.direction === 'IN' ? (
                        <span className="text-emerald-300">حضور</span>
                      ) : (
                        <span className="text-sky-300">انصراف</span>
                      )}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-slate-300">
                      {punch.score}%
                    </td>
                  </tr>
                ))}
                {(data?.punches ?? []).length === 0 && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-slate-500">
                      مفيش حركات بصمة بعد — سجّل بصمة العامل ثم اضغط «بصمة إصبع»
                      أو «بصمة وجه».
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <div className="overflow-auto rounded-xl border border-slate-800 max-h-56">
            <table className="w-full text-[11px]">
              <thead className="bg-slate-950 text-slate-400 sticky top-0">
                <tr>
                  <th className="text-right py-2 px-2 font-medium">العامل</th>
                  <th className="text-right py-2 px-2 font-medium">
                    أيام حضور
                  </th>
                  <th className="text-right py-2 px-2 font-medium">غياب</th>
                  <th className="text-right py-2 px-2 font-medium">
                    تأخير (دقيقة)
                  </th>
                  <th className="text-right py-2 px-2 font-medium">
                    خصم الغياب والتأخير
                  </th>
                  <th className="text-right py-2 px-2 font-medium">
                    عمل إضافي (دقيقة)
                  </th>
                </tr>
              </thead>
              <tbody>
                {(data?.summaries ?? []).slice(0, 25).map((summary) => (
                  <tr
                    key={summary.employeeId}
                    className="border-t border-slate-800/70"
                  >
                    <td className="py-1.5 px-2 text-slate-200">
                      {summary.employeeName}
                    </td>
                    <td className="py-1.5 px-2 text-slate-300">
                      {fmtInt(summary.presentDays)}
                    </td>
                    <td className="py-1.5 px-2 text-amber-300">
                      {fmtInt(summary.absentDays)}
                    </td>
                    <td className="py-1.5 px-2 text-sky-300">
                      {fmtInt(summary.totalLateMinutes)}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-rose-300">
                      {fmt(summary.attendanceDeduction ?? 0)}
                    </td>
                    <td className="py-1.5 px-2 font-mono text-slate-400">
                      {fmtInt(summary.totalOvertimeMinutes)} دقيقة
                    </td>
                  </tr>
                ))}
                {(data?.summaries ?? []).length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-6 text-center text-slate-500">
                      مفيش سجلات حضور للشهر الحالي — سجّل بصمة الأول ليظهر
                      الملخص.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="text-[9px] text-slate-500">
            الخصومات دي تُطبَّق في مسير المرتبات فقط بعد اعتماد الربط. قبل
            الاعتماد المسير يطلع بالراتب كاملاً بلا خصم بصمة.
          </p>
        </div>
      </div>
    </div>
  );
};

export default BiometricAttendance;
