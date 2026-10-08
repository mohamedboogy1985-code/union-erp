import React, { useState, useEffect } from 'react';
import {
  User as UserIcon,
  LogOut,
  Database,
  ShieldCheck,
  CheckCircle2,
  Clock,
  Layers,
  FileSpreadsheet,
  X,
  Sparkles,
  Cloud,
  RefreshCw
} from 'lucide-react';
import { User } from 'firebase/auth';
import {
  auth,
  signInWithGoogle,
  logOut,
  testFirestoreConnection,
  loadUserSwarmSessions
} from '../lib/firebase';

interface AuthProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User | null;
  onUserChange: (user: User | null) => void;
}

export const AuthProfileModal: React.FC<AuthProfileModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUserChange,
}) => {
  const [isConnecting, setIsConnecting] = useState(false);
  const [firestoreStatus, setFirestoreStatus] = useState<'checking' | 'connected' | 'offline'>('checking');
  const [userSessions, setUserSessions] = useState<any[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      checkConnection();
      if (currentUser) {
        loadSessions(currentUser.uid);
      }
    }
  }, [isOpen, currentUser]);

  const checkConnection = async () => {
    setFirestoreStatus('checking');
    const ok = await testFirestoreConnection();
    setFirestoreStatus(ok ? 'connected' : 'offline');
  };

  const loadSessions = async (uid: string) => {
    setLoadingSessions(true);
    const sessions = await loadUserSwarmSessions(uid);
    setUserSessions(sessions);
    setLoadingSessions(false);
  };

  const handleSignIn = async () => {
    setIsConnecting(true);
    setAuthError(null);
    try {
      const user = await signInWithGoogle();
      onUserChange(user);
      if (user) {
        loadSessions(user.uid);
      }
    } catch (err: any) {
      console.error('Sign-in failed:', err);
      const code = err?.code || '';
      if (code === 'auth/popup-closed-by-user') {
        setAuthError('تم إغلاق نافذة تسجيل الدخول قبل إتمام العملية.');
      } else if (code === 'auth/popup-blocked') {
        setAuthError('المتصفح حظر النافذة المنبثقة. يرجى السماح بالنوافذ المنبثقة من شريط العناوين.');
      } else {
        setAuthError(err?.message || 'تعذر تسجيل الدخول، يرجى المحاولة لاحقاً.');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  const handleSignOut = async () => {
    await logOut();
    onUserChange(null);
    setUserSessions([]);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl max-w-lg w-full p-5 space-y-4 shadow-2xl animate-in fade-in zoom-in duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white">
              <Database className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                حساب المستخدم وقاعدة بيانات Firebase
              </h3>
              <p className="text-[11px] text-slate-400">
                تسجيل الدخول عبر Google ومزامنة الجلسات والملفات مع Firestore
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white rounded-lg transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Card / Login Section */}
        {currentUser ? (
          <div className="bg-slate-950 p-4 rounded-xl border border-slate-800 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {currentUser.photoURL ? (
                  <img
                    src={currentUser.photoURL}
                    alt={currentUser.displayName || ''}
                    className="w-12 h-12 rounded-full border-2 border-indigo-500 shadow"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-full bg-indigo-600 flex items-center justify-center text-white font-bold text-lg">
                    {currentUser.displayName?.charAt(0) || 'U'}
                  </div>
                )}
                <div>
                  <h4 className="text-xs font-bold text-white">
                    {currentUser.displayName || 'مستخدم مسجل'}
                  </h4>
                  <span className="text-[11px] text-slate-400 font-mono block">
                    {currentUser.email}
                  </span>
                  <span className="inline-block mt-0.5 text-[9px] font-mono px-2 py-0.2 rounded bg-emerald-950 text-emerald-300 border border-emerald-800">
                    مصدق رسمياً (Authenticated)
                  </span>
                </div>
              </div>

              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-red-950/80 hover:bg-red-900 text-red-200 border border-red-800 text-xs font-semibold transition-all"
              >
                <LogOut className="w-3.5 h-3.5" />
                <span>خروج</span>
              </button>
            </div>

            {/* Firestore Status Indicator */}
            <div className="flex items-center justify-between text-[11px] pt-2 border-t border-slate-800/80">
              <span className="flex items-center gap-1.5 text-slate-400">
                <Cloud className="w-3.5 h-3.5 text-cyan-400" />
                <span>اتصال Firestore Database:</span>
              </span>
              <span
                className={`font-mono font-bold ${
                  firestoreStatus === 'connected'
                    ? 'text-emerald-400'
                    : firestoreStatus === 'checking'
                    ? 'text-amber-400'
                    : 'text-cyan-400'
                }`}
              >
                {firestoreStatus === 'connected'
                  ? '✓ متصل ومتزامن'
                  : firestoreStatus === 'checking'
                  ? 'جاري الفحص...'
                  : 'جاهز للاستخدام'}
              </span>
            </div>
          </div>
        ) : (
          <div className="bg-slate-950 p-6 rounded-xl border border-slate-800 text-center space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-indigo-950 border border-indigo-800 flex items-center justify-center mx-auto text-indigo-400">
              <UserIcon className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-white">
                تسجيل الدخول باستخدام Google و Firebase
              </h4>
              <p className="text-[11px] text-slate-400 max-w-sm mx-auto">
                قم بتسجيل الدخول لحفظ واسترجاع جلسات السرب، جداول المقارنة وسجلات التدقيق عبر السحابة تلقائياً.
              </p>
            </div>

            <button
              onClick={handleSignIn}
              disabled={isConnecting}
              className="px-5 py-2.5 rounded-xl bg-white hover:bg-slate-100 text-slate-900 font-bold text-xs flex items-center justify-center gap-2 mx-auto shadow-lg hover:shadow-xl transition-all active:scale-95 disabled:opacity-50"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.8-2.4 3.66v3.05h3.88c2.27-2.09 3.66-5.17 3.66-9.15z"
                />
                <path
                  fill="#34A853"
                  d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.1-6.72-4.93H1.26v3.15C3.25 21.36 7.33 24 12 24z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.28 14.27c-.25-.72-.38-1.49-.38-2.27s.13-1.55.38-2.27V6.58H1.26C.46 8.17 0 9.99 0 12s.46 3.83 1.26 5.42l4.02-3.15z"
                />
                <path
                  fill="#EA4335"
                  d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.33 0 3.25 2.64 1.26 6.58l4.02 3.15c.95-2.83 3.6-4.98 6.72-4.98z"
                />
              </svg>
              <span>{isConnecting ? 'جاري الاتصال بـ Google...' : 'تسجيل الدخول بحساب Google'}</span>
            </button>

            {authError && (
              <div className="p-3 rounded-lg bg-red-950/60 border border-red-800 text-red-300 text-xs text-center animate-in fade-in">
                {authError}
              </div>
            )}
          </div>
        )}

        {/* Synced Sessions from Firestore */}
        {currentUser && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-400">
              <span className="font-semibold flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-cyan-400" />
                <span>جلسات السرب المحفوظة في Firestore:</span>
              </span>
              <button
                onClick={() => loadSessions(currentUser.uid)}
                className="text-[10px] text-cyan-400 hover:underline flex items-center gap-1"
              >
                <RefreshCw className={`w-3 h-3 ${loadingSessions ? 'animate-spin' : ''}`} />
                تحديث
              </button>
            </div>

            <div className="bg-slate-950/80 rounded-xl p-2.5 border border-slate-800 max-h-40 overflow-y-auto space-y-1.5 text-xs">
              {userSessions.length > 0 ? (
                userSessions.map((session, i) => (
                  <div
                    key={i}
                    className="p-2 rounded-lg bg-slate-900 border border-slate-800 flex items-center justify-between text-[11px]"
                  >
                    <div>
                      <span className="font-semibold text-slate-200 block">
                        {session.intentSummary || session.prompt}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {session.createdAt?.slice(0, 10)}
                      </span>
                    </div>
                    <span className="font-mono text-emerald-400 text-[10px]">
                      ثقة {(session.overallConfidence * 100 || 96).toFixed(0)}%
                    </span>
                  </div>
                ))
              ) : (
                <div className="text-center py-4 text-slate-500 text-[11px]">
                  سيتم حفظ جلسات السرب القادمة تلقائياً في حسابك على Firestore.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex justify-end pt-2 border-t border-slate-800">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
          >
            إغلاق
          </button>
        </div>
      </div>
    </div>
  );
};
