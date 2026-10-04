import { toSpokenArabic } from "../utils/speechText.js";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Bot,
  CheckCircle2,
  Loader2,
  Mic,
  Minus,
  Play,
  Send,
  Sparkles,
  Square,
  X,
  Download,
  PencilLine,
  Globe,
  Volume2,
  VolumeX,
} from "lucide-react";
import { api, ApiError } from "../services/api.js";
import {
  createVoiceCapture,
  type VoiceCaptureHandle,
} from "../utils/voiceCapture.js";
import { setGeneralPanelOpen } from "../utils/assistantPanelBus.js";
import type { User } from "../types/erp.js";
import type {
  AssistantRunResult,
  AssistantScreen,
} from "../types/operator-assistant.js";

interface GeneralAssistantWidgetProps {
  currentTab: string;
  selectedOrgId: string;
  currentUser: User | null;
  onNavigateTab: (tabId: string) => void;
  onShowToast?: (
    type: "success" | "error" | "warning" | "info",
    msg: string,
  ) => void;
}

interface Turn {
  id: string;
  role: "user" | "assistant";
  textAr: string;
  result?: AssistantRunResult;
  busy?: boolean;
}

/**
 * المساعد العام العائم — متاح في كل الشاشات.
 * ينفّذ الطلب على بيانات البرنامج مباشرة، ويسأل «نفّذ؟» قبل أي تسجيل أو اعتماد أو ترحيل.
 */
export const GeneralAssistantWidget: React.FC<GeneralAssistantWidgetProps> = ({
  currentTab,
  selectedOrgId,
  currentUser,
  onNavigateTab,
  onShowToast,
}) => {
  const [open, setOpen] = useState(false);
  const [minimized, setMinimized] = useState(false);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [listening, setListening] = useState(false);
  const [voiceNote, setVoiceNote] = useState<string | null>(null);
  const [voiceEngine, setVoiceEngine] = useState<
    "device" | "browser" | "server" | "none"
  >("none");
  const [voiceDemoMode, setVoiceDemoMode] = useState(false);
  const [speakReplies, setSpeakReplies] = useState(true);
  const [speaking, setSpeaking] = useState(false);
  const [ttsNote, setTtsNote] = useState<string | null>(null);
  const [showIntentJson, setShowIntentJson] = useState(false);
  const [micBlocked, setMicBlocked] = useState<
    "" | "iframe" | "denied" | "unsupported"
  >("");
  const [typedMode, setTypedMode] = useState(false);
  const [typedText, setTypedText] = useState("");
  const captureRef = useRef<VoiceCaptureHandle | null>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const toast = useCallback(
    (type: "success" | "error" | "warning" | "info", message: string) =>
      onShowToast?.(type, message),
    [onShowToast],
  );

  /** يختار أفضل صوت عربي متاح على الجهاز (يعمل بلا إنترنت ولا مفتاح). */
  const pickArabicVoice = useCallback((): SpeechSynthesisVoice | null => {
    if (typeof window === "undefined" || !window.speechSynthesis) return null;
    const voices = window.speechSynthesis.getVoices() || [];
    const arabic = voices.filter((voice) => /^ar/i.test(voice.lang || ""));
    if (!arabic.length) return null;
    return (
      arabic.find((voice) => /ar-EG/i.test(voice.lang)) ||
      arabic.find((voice) => /egypt|مصر/i.test(voice.name)) ||
      arabic[0]
    );
  }, []);

  /** ينطق نص المساعد بصوت الجهاز — رد صوتي كامل مع إمكانية الإيقاف. */
  const speak = useCallback(
    (text: string) => {
      if (
        typeof window === "undefined" ||
        !window.speechSynthesis ||
        !text?.trim()
      ) {
        setTtsNote("نطق الردود غير مدعوم في هذا المتصفح — الرد مكتوب أمامك.");
        return;
      }
      try {
        window.speechSynthesis.cancel();
        const clean = toSpokenArabic(text).slice(0, 900);
        const utterance = new SpeechSynthesisUtterance(clean);
        utterance.lang = "ar-EG";
        utterance.rate = 0.98;
        utterance.pitch = 1;
        const voice = pickArabicVoice();
        if (voice) {
          try {
            utterance.voice = voice;
          } catch {
            /* الجهاز لا يقبل تعيين الصوت صراحةً — نكمل بالافتراضي */
          }
        }
        utterance.onstart = () => {
          setSpeaking(true);
          setTtsNote(null);
        };
        utterance.onend = () => setSpeaking(false);
        utterance.onerror = () => {
          setSpeaking(false);
          setTtsNote(
            "تعذّر نطق الرد على الجهاز (مفيش صوت عربي مثبَّت؟) — ثبّت صوت عربي من إعدادات ويندوز: الوقت واللغة ← الكلام.",
          );
        };
        window.speechSynthesis.speak(utterance);
      } catch {
        setTtsNote("تعذّر تشغيل النطق — جرّب متصفح Chrome/Edge حديث.");
      }
    },
    [pickArabicVoice],
  );

  const stopSpeaking = useCallback(() => {
    try {
      window.speechSynthesis?.cancel();
    } catch {
      /* تجاهل */
    }
    setSpeaking(false);
  }, []);

  /** يفحص إمكانية الميكروفون قبل أي طلب: داخل إطار مضمّن؟ إذن مرفوض؟ غير مدعوم؟ */
  const micAvailability = useCallback(async (): Promise<
    "ready" | "iframe" | "denied" | "unsupported"
  > => {
    if (typeof window === "undefined") return "unsupported";
    if (window.self !== window.top) return "iframe";
    if (!navigator.mediaDevices?.getUserMedia) return "unsupported";
    try {
      const status = await (navigator.permissions as any)?.query?.({
        name: "microphone",
      });
      if (status?.state === "denied") return "denied";
    } catch {
      /* المتصفح لا يدعم الاستعلام — نكمل بالمحاولة العادية */
    }
    return "ready";
  }, []);

  const openStandalone = useCallback(() => {
    if (typeof window === "undefined") return;
    window.open(window.location.href, "_blank", "noopener,noreferrer");
    toast(
      "info",
      "فتحت البرنامج في نافذة مستقلة — اسمح بالميكروفون من أيقونة القفل وسجّل بصوتك.",
    );
  }, [toast]);

  /** إملاء نصي بنفس مسار الصوت: نص ⇒ تحليل ⇒ مسودة قيد محفوظة ⇒ اعتماد وترحيل بإذنك. */
  const parseTypedDictation = useCallback(async () => {
    const transcript = typedText.trim();
    if (!transcript) return;
    const stamp = Date.now();
    const userTurn: Turn = {
      id: `u-${stamp}`,
      role: "user",
      textAr: `إملاء نصي: ${transcript}`,
    };
    const pendingTurn: Turn = {
      id: `a-${stamp}`,
      role: "assistant",
      textAr: "",
      busy: true,
    };
    setTurns((prev) => [...prev, userTurn, pendingTurn]);
    setBusy(true);
    try {
      const parsed = await api.parseVoiceDraft({
        transcript,
        organizationId: selectedOrgId,
      });
      // /parse تحليل فقط — نحفظه مسودة قيد فعلية قبل الاعتماد
      const draft = await api.saveVoiceDraft({ ...parsed, transcript });
      const debit = draft.lines.find((line) => Number(line.debit) > 0);
      const credit = draft.lines.find((line) => Number(line.credit) > 0);
      const total = draft.lines.reduce(
        (sum, line) => sum + Number(line.debit || 0),
        0,
      );
      const percent = Math.round(
        (draft.confidence ?? 0) * (draft.confidence <= 1 ? 100 : 1),
      );
      const replyAr = `فهمت من إملائك: ${draft.description} بمبلغ ${total.toLocaleString(
        "en-US",
        { minimumFractionDigits: 2, maximumFractionDigits: 2 },
      )} ج — جهّزت مسودة قيد${debit ? ` مدين ${debit.accountCode} ${debit.accountName}` : ""}${
        credit ? ` / دائن ${credit.accountCode} ${credit.accountName}` : ""
      } (دقة ${percent}%). راجعها واضغط «اعتماد وترحيل» وأنا أرتّبها في الدفاتر.`;
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === pendingTurn.id
            ? {
                ...turn,
                busy: false,
                textAr: replyAr,
                result: {
                  id: `r-${stamp}`,
                  heardAr: transcript,
                  replyAr,
                  steps: [
                    {
                      labelAr: "تحليل الإملاء (نفس مسار الصوت)",
                      status: "done",
                      detailAr: `دقة ${percent}%`,
                    },
                    {
                      labelAr: "حفظ مسودة القيد",
                      status: "done",
                      detailAr: `${draft.lines.length} طرف`,
                    },
                    {
                      labelAr: "الاعتماد والترحيل",
                      status: "pending",
                      detailAr: "بانتظار اعتمادك",
                    },
                  ],
                  payload: {
                    kind: "metrics",
                    metrics: [
                      {
                        labelAr: "البيان",
                        valueAr: draft.description.slice(0, 40),
                      },
                      {
                        labelAr: "المبلغ",
                        valueAr: `${total.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })} ج`,
                        tone: "emerald",
                      },
                      {
                        labelAr: "الحالة",
                        valueAr: "مسودة للمراجعة",
                        tone: "amber",
                      },
                    ],
                    voiceDraftId: draft.id,
                  },
                  needsConfirm: false,
                },
              }
            : turn,
        ),
      );
      setTypedText("");
      toast(
        "success",
        "جهّزت مسودة الق  د من إملائك — راجعها واضغط «اعتماد وترحيل».",
      );
    } catch (err: any) {
      const message = err?.message || "خطأ غير معروف";
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === pendingTurn.id
            ? {
                ...turn,
                busy: false,
                textAr: `مقدرتش أحلّل الإملاء: ${message}. جرّب صيغة أوضح (مثال: «صرفت 1200 كهرباء من الخزينة»).`,
              }
            : turn,
        ),
      );
      toast("error", message);
    } finally {
      setBusy(false);
    }
  }, [typedText, selectedOrgId, toast]);

  /** اعتماد مسودة الإملاء وترحيلها (لا ترحيل بلا اعتماد). */
  const approveTypedDraft = useCallback(
    async (draftId: string, turnId: string) => {
      setBusy(true);
      try {
        const res = await api.approveVoiceDraft(draftId, selectedOrgId);
        const entryId = res?.entry?.id ?? "—";
        const replyAr = `اعتمدت المسودة ${draftId} و${
          res?.posted ? "رحّلتها في الدفاتر" : "سجّلتها"
        } — رقم القيد ${entryId}.`;
        setTurns((prev) =>
          prev.map((turn) =>
            turn.id === turnId
              ? {
                  ...turn,
                  busy: false,
                  textAr: replyAr,
                  result: turn.result
                    ? {
                        ...turn.result,
                        replyAr,
                        steps: [
                          { labelAr: "تحليل الإملاء", status: "done" },
                          { labelAr: "حفظ مسودة القيد", status: "done" },
                          {
                            labelAr: "الاعتماد والترحيل",
                            status: res?.posted ? "done" : "pending",
                            detailAr: res?.posted
                              ? `القيد ${entryId}`
                              : "تم الاعتماد",
                          },
                        ],
                        payload: {
                          ...(turn.result.payload ?? { kind: "metrics" }),
                          voiceDraftId: undefined,
                        },
                      }
                    : turn.result,
                }
              : turn,
          ),
        );
        if (speakReplies) speak(replyAr);
        toast("success", `تم — القيد ${entryId} جاهز في الدفاتر.`);
      } catch (err: any) {
        toast("error", err?.message ?? "تعذّر اعتماد المسودة.");
      } finally {
        setBusy(false);
      }
    },
    [selectedOrgId, toast],
  );

  useEffect(() => {
    if (!open) return;
    let alive = true;
    if (typeof window !== "undefined" && window.self !== window.top) {
      setMicBlocked("iframe");
    }
    api
      .getVoiceStatus()
      .then((status) => {
        if (alive) setVoiceDemoMode(Boolean(status?.demoMode));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [open]);

  useEffect(() => {
    if (!captureRef.current) {
      captureRef.current = createVoiceCapture({
        onListeningChange: (value: boolean) => {
          setListening(value);
          if (!value) return;
          setVoiceNote("بسمعك… اتكلم عادي واضغط الميكروفون تاني لما تخلّص.");
        },
        onText: (text: string) => {
          setVoiceNote(null);
          setVoiceEngine(captureRef.current?.engine() ?? "none");
          const spoken = text.trim();
          setInput((prev) => `${prev} ${spoken}`.trim());
          // محادثة صوتية كاملة: يُنفَّذ الأمر فوراً ثم يُسمعك الرد
          if (spoken) void send(spoken);
        },
        onStatus: (message: string | null) => setVoiceNote(message),
        onError: (message: string) => {
          setListening(false);
          setVoiceNote(message);
          toast(
            "warning",
            `${message} — اكتب الطلب نصاً وهيُنفَّذ بنفس الشكل.`,
          );
        },
      });
    }
    return () => {
      captureRef.current?.cleanup();
      captureRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (
        event.ctrlKey &&
        event.shiftKey &&
        (event.key === "a" || event.key === "A")
      ) {
        event.preventDefault();
        setOpen((value) => !value);
        setMinimized(false);
      }
      if (event.key === "Escape" && open) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  useEffect(() => {
    setGeneralPanelOpen(open);
    return () => setGeneralPanelOpen(false);
  }, [open]);

  useEffect(() => {
    listRef.current?.scrollTo({
      top: listRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, [turns]);

  const greeting: Turn = useMemo(
    () => ({
      id: "welcome",
      role: "assistant",
      textAr: `أنا المساعد العام — قول لي اللي عايزه وأنفذه على بيانات البرنامج على طول. مثال: «اعمل فاتورة إلكترونية لشركة المقاولون بـ 50000»، «رحّل مسير مرتبات سبتمبر»، «استخرج بيانات العاملين»، «ابحث عن شيك 123456»، «وريني حالة ربط البصمة بالمراتب». اكتب «مساعدة» تشوف كل الأوامر.`,
    }),
    [],
  );

  const visibleTurns = turns.length ? turns : [greeting];

  const send = async (text: string) => {
    const clean = text.trim();
    if (!clean || busy) return;
    const userTurn: Turn = {
      id: `u-${Date.now()}`,
      role: "user",
      textAr: clean,
    };
    const pendingTurn: Turn = {
      id: `a-${Date.now()}`,
      role: "assistant",
      textAr: "",
      busy: true,
    };
    setTurns((prev) => [...prev, userTurn, pendingTurn]);
    setInput("");
    setBusy(true);
    try {
      const result = await api.runGeneralAssistant({
        text: clean,
        organizationId: selectedOrgId,
        screenId: currentTab,
      });
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === pendingTurn.id
            ? { ...turn, busy: false, textAr: result.replyAr, result }
            : turn,
        ),
      );
      if (speakReplies) speak(result.replyAr);
      if (result.navigateTo) {
        onNavigateTab(result.navigateTo);
      }
    } catch (err: any) {
      const message =
        err instanceof ApiError
          ? err.message
          : err?.message || "تعذّر تنفيذ الطلب.";
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === pendingTurn.id
            ? { ...turn, busy: false, textAr: `معلش، حصلت مشكلة: ${message}` }
            : turn,
        ),
      );
      toast("error", message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async (turnId: string, actionId: string) => {
    setBusy(true);
    try {
      const result = await api.confirmGeneralAssistant(actionId);
      setTurns((prev) => [
        ...prev,
        {
          id: `c-${Date.now()}`,
          role: "assistant",
          textAr: result.replyAr,
          result,
        },
      ]);
      if (speakReplies) speak(result.replyAr);
      toast(
        result.steps.some((step) => step.status === "failed")
          ? "warning"
          : "success",
        result.replyAr,
      );
    } catch (err: any) {
      const message =
        err instanceof ApiError
          ? err.message
          : err?.message || "تعذّر تنفيذ الإجراء.";
      setTurns((prev) => [
        ...prev,
        { id: `e-${Date.now()}`, role: "assistant", textAr: message },
      ]);
      toast("error", message);
    } finally {
      setBusy(false);
    }
  };

  if (!open) {
    return (
      <button
        type="button"
        data-assistant-widget="closed"
        onClick={() => {
          setOpen(true);
          setMinimized(false);
        }}
        title="المساعد العام — متاح في كل الشاشات (Ctrl+Shift+A)"
        className="fixed bottom-5 right-5 z-[70] flex items-center gap-2 rounded-full border border-cyan-400/40 bg-gradient-to-r from-cyan-700 to-indigo-700 px-4 py-3 text-white shadow-xl shadow-cyan-950/40 hover:from-cyan-600 hover:to-indigo-600"
      >
        <Bot className="h-4 w-4" />
        <span className="text-xs font-bold">المساعد العام</span>
      </button>
    );
  }

  return (
    <div
      dir="rtl"
      data-assistant-widget="open"
      data-assistant-screen={currentTab}
      className={`fixed z-[75] right-3 bottom-3 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-2xl border border-cyan-900 bg-slate-950 text-slate-100 shadow-2xl shadow-black/60 ${minimized ? "w-80" : "w-[500px]"}`}
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-800 bg-slate-900 px-3 py-2">
        <div className="flex items-center gap-2">
          <div className="rounded-lg bg-gradient-to-br from-cyan-600 to-indigo-700 p-1.5">
            <Sparkles className="h-3.5 w-3.5" />
          </div>
          <div>
            <p className="text-[11px] font-bold">المساعد العام</p>
            <p className="text-[9px] text-slate-500">
              ينفّذ الأوامر على بيانات البرنامج • Ctrl+Shift+A
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            data-action="widget-speak-toggle"
            onClick={() => {
              setSpeakReplies((prev) => {
                const next = !prev;
                if (!next) stopSpeaking();
                toast(
                  next ? "success" : "info",
                  next
                    ? "الرد الصوتي مُفعّل — المساعد هيقرأ لك ردوده."
                    : "الرد الصوتي متوقف.",
                );
                return next;
              });
            }}
            title={
              speakReplies
                ? "الرد الصوتي مُفعّل — اضغط للإيقاف"
                : "تشغيل الرد الصوتي"
            }
            className={`rounded-lg border p-1 ${speakReplies ? "border-emerald-600 bg-emerald-700/20 text-emerald-300" : "border-slate-700 text-slate-400 hover:bg-slate-800"}`}
          >
            {speakReplies ? (
              <Volume2 className="h-3.5 w-3.5" />
            ) : (
              <VolumeX className="h-3.5 w-3.5" />
            )}
          </button>
          {speaking && (
            <button
              type="button"
              data-action="widget-speak-stop"
              onClick={stopSpeaking}
              title="إيقاف القراءة"
              className="rounded-lg border border-amber-600/60 bg-amber-700/20 p-1 text-amber-300"
            >
              <Square className="h-3.5 w-3.5" />
            </button>
          )}
          <button
            type="button"
            data-action="widget-json-toggle"
            onClick={() => setShowIntentJson((value) => !value)}
            title={
              showIntentJson
                ? "إخفاء JSON الأمر المنفَّذ"
                : "إظهار JSON الأمر المنفَّذ (action + parameters)"
            }
            className={`rounded-lg border px-2 py-1 text-[10px] font-bold ${
              showIntentJson
                ? "border-cyan-500/60 bg-cyan-900/40 text-cyan-200"
                : "border-slate-700 text-slate-300 hover:bg-slate-800"
            }`}
          >
            JSON
          </button>
          <button
            type="button"
            data-action="widget-minimize"
            onClick={() => setMinimized((value) => !value)}
            className="rounded-lg border border-slate-700 p-1 text-slate-300 hover:bg-slate-800"
            title={minimized ? "تكبير" : "تصغير"}
          >
            <Minus className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            data-action="widget-clear"
            onClick={() => setTurns([])}
            className="rounded-lg border border-slate-700 px-2 py-1 text-[10px] text-slate-300 hover:bg-slate-800"
            title="محادثة جديدة"
          >
            جديدة
          </button>
          <button
            type="button"
            data-action="widget-close"
            onClick={() => setOpen(false)}
            className="rounded-lg border border-slate-700 p-1 text-slate-300 hover:bg-slate-800"
            title="إغلاق"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!minimized && (
        <>
          <div
            ref={listRef}
            className="max-h-[52vh] space-y-2 overflow-y-auto p-3"
          >
            {visibleTurns.map((turn) => (
              <div
                key={turn.id}
                data-turn-role={turn.role}
                data-turn-key={turn.id}
                className={
                  turn.role === "user"
                    ? "flex justify-start"
                    : "flex justify-end"
                }
              >
                <div
                  className={`max-w-[92%] rounded-xl border px-3 py-2 text-[11px] leading-6 ${turn.role === "user" ? "border-slate-700 bg-slate-900 text-slate-200" : "border-cyan-900/60 bg-cyan-950/30 text-slate-100"}`}
                >
                  {turn.busy ? (
                    <span className="flex items-center gap-2 text-slate-400">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> جاري
                      التنفيذ…
                    </span>
                  ) : (
                    <>
                      <p className="whitespace-pre-wrap">{turn.textAr}</p>

                      {!!turn.result?.steps?.length && (
                        <ul className="mt-2 space-y-1 border-t border-slate-800/70 pt-2">
                          {turn.result.steps.map((step, index) => (
                            <li
                              key={`${turn.id}-step-${index}`}
                              className="flex items-start gap-1.5 text-[10px]"
                            >
                              <span
                                className={
                                  step.status === "done"
                                    ? "text-emerald-400"
                                    : step.status === "pending"
                                      ? "text-amber-400"
                                      : "text-rose-400"
                                }
                              >
                                {step.status === "done"
                                  ? "✔"
                                  : step.status === "pending"
                                    ? "⏳"
                                    : "✗"}
                              </span>
                              <span className="text-slate-300">
                                {step.labelAr}
                                {step.detailAr && (
                                  <span className="block text-slate-500">
                                    {step.detailAr}
                                  </span>
                                )}
                              </span>
                            </li>
                          ))}
                        </ul>
                      )}

                      {!!turn.result?.payload?.metrics?.length && (
                        <div className="mt-2 grid grid-cols-2 gap-1.5 border-t border-slate-800/70 pt-2">
                          {turn.result.payload.metrics.map((metric) => (
                            <div
                              key={`${turn.id}-${metric.labelAr}`}
                              className="rounded-lg border border-slate-800 bg-slate-950/70 px-2 py-1"
                            >
                              <p className="text-[9px] text-slate-500">
                                {metric.labelAr}
                              </p>
                              <p
                                className={`text-[11px] font-bold ${metric.tone === "emerald" ? "text-emerald-300" : metric.tone === "amber" ? "text-amber-300" : metric.tone === "sky" ? "text-sky-300" : "text-slate-100"}`}
                              >
                                {metric.valueAr}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}

                      {!!turn.result?.payload?.rows?.length && (
                        <div
                          className="mt-2 overflow-auto rounded-lg border border-slate-800"
                          style={{ maxHeight: "13rem" }}
                        >
                          <table className="w-full text-[10px]">
                            <thead className="bg-slate-900 text-slate-400">
                              <tr>
                                {(turn.result.payload.columns ?? []).map(
                                  (column) => (
                                    <th
                                      key={`${turn.id}-${column}`}
                                      className="px-2 py-1 text-right font-medium"
                                    >
                                      {column}
                                    </th>
                                  ),
                                )}
                              </tr>
                            </thead>
                            <tbody>
                              {turn.result.payload.rows.map((row, rowIndex) => (
                                <tr
                                  key={`${turn.id}-row-${rowIndex}`}
                                  className="border-t border-slate-800/60"
                                >
                                  {row.cells.map((cell, cellIndex) => (
                                    <td
                                      key={`${turn.id}-${rowIndex}-${cellIndex}`}
                                      className="px-2 py-1 text-slate-300"
                                    >
                                      {cell}
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {turn.role === "assistant" &&
                        (turn.result?.replyAr ?? turn.textAr) && (
                          <button
                            type="button"
                            data-action="widget-speak-message"
                            onClick={() =>
                              speak(turn.result?.replyAr ?? turn.textAr)
                            }
                            title="اسمع الرد بصوت المساعد"
                            className="mt-1.5 inline-flex items-center gap-1 rounded-lg border border-slate-700 px-2 py-1 text-[9px] text-slate-300 hover:bg-slate-800"
                          >
                            <Volume2 className="h-3 w-3" /> اسمع الرد
                          </button>
                        )}

                      {showIntentJson && turn.result?.intentJson && (
                        <div className="mt-2">
                          <pre
                            dir="ltr"
                            data-intent-json={turn.result.intent?.action ?? ""}
                            className="max-h-40 overflow-auto rounded-lg border border-cyan-900/60 bg-slate-900/70 p-2 text-left text-[9px] leading-4 text-cyan-200"
                          >
                            {turn.result.intentJson}
                          </pre>
                          <p
                            data-intent-execution={
                              turn.result.intent?.execution ?? ""
                            }
                            className="mt-1 text-[9px] text-cyan-400/80"
                          >
                            {turn.result.intent?.function} •{" "}
                            {turn.result.intent?.execution === "draft"
                              ? "معلّق على اعتمادك"
                              : "تنفيذ مباشر"}
                          </p>
                        </div>
                      )}

                      {turn.result?.payload?.csvAr && (
                        <button
                          type="button"
                          data-action="widget-download-csv"
                          onClick={() => {
                            const csv = turn.result?.payload?.csvAr;
                            if (!csv) return;
                            const blob = new Blob([`\uFEFF${csv.content}`], {
                              type: "text/csv;charset=utf-8",
                            });
                            const url = URL.createObjectURL(blob);
                            const link = document.createElement("a");
                            link.href = url;
                            link.download = csv.fileNameAr;
                            link.click();
                            URL.revokeObjectURL(url);
                            toast(
                              "success",
                              `نزّلت ${csv.fileNameAr} (${csv.rowsCount} سجل).`,
                            );
                          }}
                          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-emerald-700/50 bg-slate-950 px-3 py-1.5 text-[10px] font-bold text-emerald-300 hover:bg-slate-800"
                        >
                          <Download className="h-3 w-3" />
                          تنزيل {turn.result.payload.csvAr.fileNameAr} (
                          {turn.result.payload.csvAr.rowsCount} سجل)
                        </button>
                      )}

                      {turn.result?.payload?.voiceDraftId && (
                        <button
                          type="button"
                          data-action="widget-approve-typed-draft"
                          onClick={() =>
                            void approveTypedDraft(
                              turn.result?.payload?.voiceDraftId as string,
                              turn.id,
                            )
                          }
                          disabled={busy}
                          className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
                        >
                          <CheckCircle2 className="h-3.5 w-3.5" /> اعتماد وترحيل
                          مسودة الإملاء
                        </button>
                      )}

                      {turn.result?.needsConfirm &&
                        turn.result.pendingActionId && (
                          <button
                            type="button"
                            data-action="widget-confirm"
                            onClick={() =>
                              turn.result?.pendingActionId &&
                              confirm(turn.id, turn.result.pendingActionId)
                            }
                            disabled={busy}
                            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-700 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-emerald-600 disabled:opacity-50"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            نفّذ واعتمد ورحّل
                          </button>
                        )}

                      {turn.result?.navigateTo && (
                        <button
                          type="button"
                          onClick={() =>
                            onNavigateTab(turn.result!.navigateTo!)
                          }
                          className="mt-2 text-[10px] text-cyan-300 underline decoration-dotted hover:text-cyan-200"
                        >
                          فتح{" "}
                          {turn.result.navigateLabelAr ??
                            turn.result.navigateTo}{" "}
                          ↗
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div className="border-t border-slate-800 p-2">
            <div className="flex items-end gap-2">
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey) {
                    event.preventDefault();
                    void send(input);
                  }
                }}
                rows={2}
                data-assistant-input="general"
                placeholder="اكتب اللي عايزه… أو اضغط الميكروفون واتكلم عادي (مثال: رحّل مسير مرتبات سبتمبر)"
                className="flex-1 resize-none rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-100 outline-hidden focus:border-cyan-600"
              />
              <button
                type="button"
                data-action="widget-voice"
                onClick={async () => {
                  const state = await micAvailability();
                  if (state !== "ready") {
                    setMicBlocked(state);
                    setVoiceNote(
                      state === "iframe"
                        ? "الميكروفون محجوب داخل نافذة المعاينة — المتصفح يرفض الإذن لأي إطار مضمّن. افتح البرنامج في نافذة مستقلة واسمح بالميكروفون، أو استخدم الإملاء النصي (نفس المسار بالظبط)."
                        : state === "denied"
                          ? "المتصفح رفض إذن الميكروفون سابقاً — اضغط أيقونة القفل جنب العنوان، اختر «الميكروفون: سماح»، ثم أعد التحميل. أو استخدم الإملاء النصي دلوقتي."
                          : "المتصفح ده مش بيدعم الإملاء الصوتي — استخدم الإملاء النصي وسيتحلَّل بنفس الطريقة.",
                    );
                    return;
                  }
                  setMicBlocked("");
                  captureRef.current?.toggle();
                }}
                title={
                  voiceEngine === "device"
                    ? "إملاء صوتي — تعرف على الجهاز (يعمل بلا إنترنت)"
                    : voiceEngine === "browser"
                      ? "إملاء صوتي — تعرف مدمج بالمتصفح (بلا مفتاح)"
                      : voiceEngine === "server"
                        ? "إملاء صوتي — تسجيل وتحويل على الخادم"
                        : "إملاء صوتي — اضغط واتكلم، واضغط تاني لما تخلّص"
                }
                className={`rounded-lg border p-2 ${listening ? "border-rose-500 bg-rose-600 text-white" : "border-slate-700 text-slate-200 hover:bg-slate-800"}`}
              >
                {listening ? (
                  <Square className="h-3.5 w-3.5" />
                ) : (
                  <Mic className="h-3.5 w-3.5" />
                )}
              </button>
              <button
                type="button"
                data-action="widget-typed-toggle"
                onClick={() => {
                  setTypedMode((prev) => !prev);
                  setVoiceNote(
                    "إملاء نصي بنفس مسار الصوت: نص ⇒ تحليل ⇒ مسودة قيد ⇒ اعتماد وترحيل بإذنك.",
                  );
                }}
                title="إملاء نصي — نفس مسار الصوت بلا ميكروفون"
                className={`rounded-lg border p-2 ${typedMode ? "border-indigo-500 bg-indigo-600 text-white" : "border-slate-700 text-slate-200 hover:bg-slate-800"}`}
              >
                <PencilLine className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                data-action="widget-send"
                onClick={() => void send(input)}
                disabled={busy || !input.trim()}
                className="rounded-lg bg-cyan-700 p-2 text-white hover:bg-cyan-600 disabled:opacity-50"
                title="تنفيذ"
              >
                {busy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
              </button>
            </div>
            {micBlocked && (
              <div
                data-assistant-mic-help
                className="mt-2 space-y-2 rounded-xl border border-cyan-700/40 bg-slate-950 p-2.5"
              >
                <p className="text-[10px] leading-5 text-slate-300">
                  {micBlocked === "iframe"
                    ? "المتصفح يمنع الميكروفون داخل نوافذ المعاينة المضمّنة — الحل دقيقتين: افتح البرنامج في نافذة مستقلة واسمح بالميكروفون."
                    : micBlocked === "denied"
                      ? "الإذن مرفوض من المتصفح — افتح قفل العنوان واختر «الميكروفون: سماح» ثم أعد التحميل."
                      : "الجهاز/المتصفح لا يدعم الإملاء الصوتي — استخدم الإملاء النصي، ويُحلَّل بنفس الطريقة تماماً."}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-action="widget-open-standalone"
                    onClick={openStandalone}
                    className="flex items-center gap-1 rounded-lg bg-cyan-700 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-cyan-600"
                  >
                    <Globe className="h-3 w-3" /> افتح في نافذة مستقلة
                    (الميكروفون يعمل)
                  </button>
                  <button
                    type="button"
                    data-action="widget-typed-mode"
                    onClick={() => {
                      setTypedMode(true);
                      setVoiceNote(
                        "اكتب الإملاء بنفس صيغة كلامك — ويتحلَّل بنفس مسار الصوت (مسودة قيد للمراجعة).",
                      );
                    }}
                    className="flex items-center gap-1 rounded-lg border border-slate-600 px-2.5 py-1.5 text-[10px] font-bold text-slate-200 hover:bg-slate-800"
                  >
                    <PencilLine className="h-3 w-3" /> إملاء نصي (نفس المسار)
                  </button>
                </div>
              </div>
            )}

            {typedMode && (
              <div className="mt-2 space-y-2 rounded-xl border border-indigo-700/40 bg-slate-950 p-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[10px] font-bold text-indigo-300">
                    إملاء نصي — اكتب زي ما بتتكلم
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setTypedMode(false);
                      setTypedText("");
                    }}
                    className="text-[9px] text-slate-400 hover:text-slate-200"
                  >
                    إغلاق
                  </button>
                </div>
                <textarea
                  data-assistant-typed
                  value={typedText}
                  onChange={(e) => setTypedText(e.target.value)}
                  rows={2}
                  placeholder="مثال: صرفت 1200 كهرباء من الخزينة"
                  className="w-full resize-none rounded-lg border border-slate-700 bg-slate-900 px-2 py-1.5 text-[11px] text-slate-100 outline-hidden focus:border-indigo-600"
                />
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    data-action="widget-typed-parse"
                    disabled={busy || !typedText.trim()}
                    onClick={() => void parseTypedDictation()}
                    className="rounded-lg bg-indigo-700 px-2.5 py-1.5 text-[10px] font-bold text-white hover:bg-indigo-600 disabled:opacity-50"
                  >
                    حلّل الإملاء وجهّز مسودة القيد
                  </button>
                  {[
                    "صرفت 1200 كهرباء من الخزينة",
                    "قبضت 5000 رسوم عضوية",
                    "دفعت 800 صيانة أجهزة",
                  ].map((sample) => (
                    <button
                      key={sample}
                      type="button"
                      onClick={() => setTypedText(sample)}
                      className="rounded-full border border-slate-700 px-2 py-0.5 text-[9px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                    >
                      {sample}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {ttsNote && (
              <div
                data-assistant-tts-note
                className="mt-2 rounded-lg border border-amber-700/40 bg-amber-950/30 px-2 py-1 text-[10px] leading-5 text-amber-200"
              >
                {ttsNote}
              </div>
            )}
            {voiceNote && (
              <div
                data-assistant-voice-note
                className="mt-2 rounded-lg border border-amber-700/40 bg-amber-950/30 px-2 py-1 text-[10px] leading-5 text-amber-200"
              >
                {voiceNote}
              </div>
            )}
            {voiceDemoMode && (
              <button
                type="button"
                data-action="widget-voice-demo"
                onClick={() => {
                  const sample = "صرفت 1200 كهرباء من الخزينة";
                  setInput(sample);
                  setVoiceNote(
                    "إملاء تجريبي — النص ده جه من مسار الصوت نفسه (تحويل ← مراجعة ← اعتماد).",
                  );
                  void send(sample);
                }}
                className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-cyan-700/40 bg-slate-950 px-3 py-1.5 text-[10px] font-bold text-cyan-300 hover:bg-slate-800"
              >
                <Mic className="h-3 w-3" />
                إملاء صوتي تجريبي (بدون ميكروفون) — يجهّز القيد للمراجعة
              </button>
            )}
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              {[
                "مساعدة",
                "اعمل فاتورة إلكترونية لشركة المقاولون بـ 50000",
                "رحّل مسير مرتبات سبتمبر",
                "استخرج بيانات العاملين",
                "ابحث عن شيك 123456",
                "وريني حالة ربط البصمة بالمراتب",
              ].map((sample) => (
                <button
                  key={sample}
                  type="button"
                  onClick={() => void send(sample)}
                  className="rounded-full border border-slate-700 px-2 py-0.5 text-[9px] text-slate-400 hover:bg-slate-800 hover:text-slate-200"
                >
                  {sample}
                </button>
              ))}
              <span className="ms-auto flex items-center gap-1 text-[9px] text-slate-600">
                <Play className="h-2.5 w-2.5" /> ينفّذ فوراً • أي تسجيل أو ترحيل
                يحتاج تأكيدك
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default GeneralAssistantWidget;
