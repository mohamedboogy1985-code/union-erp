import React, { useEffect, useState } from "react";
import { BookOpen, MessageSquare, Minus, X } from "lucide-react";
import { RegulationChat } from "../pages/RegulationChat.js";
import { useGeneralPanelOpen } from "../utils/assistantPanelBus.js";
import { User } from "../types/erp.js";

interface RegulationAssistantDockProps {
  organizationId: string;
  currentUser: User | null;
  onShowToast: (
    type: "success" | "error" | "warning" | "info",
    msg: string,
  ) => void;
  /** الشاشة الحالية — تُمرَّر للمساعد ليعرف سياق السؤال */
  currentScreen?: string;
  /** يبقى داخل شاشة اللوائح فقط (تُفتح من داخل اللوائح والرقابة المالية) */
  inScreenOnly?: boolean;
}

/**
 * مساعد اللوائح: يبقى داخل شاشة اللوائح والرقابة المالية فقط.
 * يجاوب من نصوص اللوائح المُدرجة في قاعدة البيانات ولا يخرج عن نطاقها.
 */
export const RegulationAssistantDock: React.FC<
  RegulationAssistantDockProps
> = ({
  organizationId,
  currentUser,
  onShowToast,
  currentScreen,
  inScreenOnly,
}) => {
  const [open, setOpen] = useState(Boolean(inScreenOnly));
  const [minimized, setMinimized] = useState(false);
  const [seed, setSeed] = useState<string | null>(null);
  const [seedNonce, setSeedNonce] = useState(0);
  const generalPanelOpen = useGeneralPanelOpen();
  const side = generalPanelOpen ? "right-[33rem]" : "right-6";

  useEffect(() => {
    const openHere = (event: Event) => {
      const detail = (event as CustomEvent<{ question?: string }>).detail;
      if (detail?.question) {
        setSeed(detail.question);
        setSeedNonce((value) => value + 1);
      }
      setOpen(true);
      setMinimized(false);
    };
    window.addEventListener(
      "open-regulation-assistant",
      openHere as EventListener,
    );
    return () =>
      window.removeEventListener(
        "open-regulation-assistant",
        openHere as EventListener,
      );
  }, []);

  if (!open) {
    return (
      <button
        type="button"
        data-assistant-dock="closed"
        onClick={() => setOpen(true)}
        title="مساعد اللوائح — داخل شاشة اللوائح فقط"
        className={`fixed bottom-24 ${side} z-40 flex items-center gap-2 rounded-2xl border border-teal-500/40 bg-teal-700/95 px-4 py-3 text-xs font-bold text-white shadow-xl backdrop-blur hover:bg-teal-600`}
      >
        <BookOpen className="h-4 w-4" />
        مساعد الل  ائح
      </button>
    );
  }

  return (
    <div
      data-assistant-dock="open"
      data-assistant-screen={currentScreen}
      className={`fixed z-50 bottom-24 ${side} ${minimized ? "w-[22rem]" : "w-[26rem] max-w-[95vw]"}`}
      dir="rtl"
    >
      <div className="rounded-2xl border border-teal-800/60 bg-slate-950/98 shadow-2xl backdrop-blur">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 px-3 py-2">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-teal-400" />
            <div>
              <p className="text-[11px] font-bold text-slate-100">
                مساعد اللوائح — داخل شاشة اللوائح
              </p>
              <p className="text-[9px] text-slate-500">
                من نصوص اللوائح المُدرجة فقط • 3 مصادر / 115 بنداً
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              data-action="dock-minimize"
              onClick={() => setMinimized((value) => !value)}
              className="rounded-lg border border-slate-700 p-1 text-slate-300 hover:bg-slate-800"
              title={minimized ? "تكبير" : "تصغير"}
            >
              {minimized ? (
                <MessageSquare className="h-3.5 w-3.5" />
              ) : (
                <Minus className="h-3.5 w-3.5" />
              )}
            </button>
            <button
              type="button"
              data-action="dock-close"
              onClick={() => setOpen(false)}
              className="rounded-lg border border-slate-700 p-1 text-slate-300 hover:bg-slate-800"
              title="إغلاق"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
        {!minimized && (
          <div className="max-h-[60vh] overflow-y-auto p-2">
            <RegulationChat
              organizationId={organizationId}
              currentUser={currentUser}
              onShowToast={onShowToast}
              seedQuestion={seed}
              seedNonce={seedNonce}
            />
          </div>
        )}
      </div>
    </div>
  );
};

export default RegulationAssistantDock;
