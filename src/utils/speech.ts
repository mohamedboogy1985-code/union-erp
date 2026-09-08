/**
 * نطق النصوص العربية عبر Web Speech API (SpeechSynthesis).
 * - اختيار صوت عربي إن وُجد.
 * - تنظيف مخرجات النص ليُقرأ بلغة طبيعية (إزالة Markdown، روابط، أكواد، رموز تعبيرية).
 * - معالجة أخطاء المتصفح (شبكة، إذن، محرك غير متاح...) برسائل مترجمة سهلة.
 */

export interface SpeakOptions {
  /** درجة الصوت 0..1 (الافتراضي 1) */
  rate?: number;
  /** مستوى الصوت 0..1 (الافتراضي 1) */
  volume?: number;
  /** إلغاء أي نطق جارٍ قبل البدء (الافتراضي true) */
  cancelPrevious?: boolean;
  /** استدعاء عند إتمام النطق */
  onEnd?: () => void;
  /** استدعاء عند بدء النطق */
  onStart?: () => void;
  /** استدعاء عند خطأ في النطق — يمرر رسالة مترجمة جاهزة للعرض */
  onError?: (message: string) => void;
}

const ARABIC_LANG_FALLBACKS = ['ar', 'ar-SA', 'ar-EG', 'ar-DZ', 'ar-AE'];

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

/**
 * يبحث عن صوت عربي مناسب — العربة هي أفضل مطابقة.
 * في المتصفحات (Chrome) تُحمَّل الأصوات بشكل متأخر؛ استدعِ preloadVoices عند الإقلاع.
 */
export function pickArabicVoice(): SpeechSynthesisVoice | null {
  if (!isSpeechSupported()) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const langOf = (v: SpeechSynthesisVoice) => (v.lang || '').toLowerCase();
  const lowered = ARABIC_LANG_FALLBACKS.map((l) => l.toLowerCase());

  for (const fb of lowered) {
    const exact = voices.find((v) => langOf(v) === fb);
    if (exact) return exact;
  }
  // أي صوت يبدأ بـ "ar"
  return voices.find((v) => langOf(v).startsWith('ar')) || null;
}

/** يدفع المتصفح لتحميل قائمة الأصوات (voices changed) حال توفرها عبر حدث asynchronous. */
export function preloadVoices(): void {
  if (!isSpeechSupported()) return;
  const synth = window.speechSynthesis;
  // Chrome: getVoices() فارغة حتى حدث voiceschanged
  if (typeof synth.onvoiceschanged !== 'undefined') {
    synth.onvoiceschanged = () => {
      // إعادة قراءة فارغة فقط لتحفيز التحميل
      synth.getVoices();
    };
  }
  synth.getVoices();
}

/** تطبيع أحرف عربية للقراءة الطبيعية مع الحفاظ على الأعجمي/الأسماء. */
function normalizeArabicChars(input: string): string {
  return input
    .replace(/[\u064B-\u065F]/g, '') // التشكيل والحركات
    .replace(/[\u0610-\u061A\u0640]/g, '') // علامات قرآنية + تطويل
    .replace(/إ/g, 'ا')
    .replace(/ى/g, 'ي');
}

/** يزيل محارف التحكم ويترك النص الناطق سليماً (بدون Regex لتجنب lint). */
function stripControlChars(input: string): string {
  let out = '';
  for (const ch of input) {
    const c = ch.codePointAt(0) ?? 0;
    if (
      c <= 0x08 ||
      c === 0x0b ||
      c === 0x0c ||
      (c >= 0x0e && c <= 0x1f) ||
      c === 0x7f ||
      c === 0x200b ||
      c === 0x200d ||
      c === 0x200e ||
      c === 0x200f ||
      c === 0x20e3 ||
      c === 0x2764 ||
      (c >= 0x202a && c <= 0x202e)
    ) {
      continue;
    }
    out += ch;
  }
  return out;
}

/**
 * ينظف نصاً خرج من نموذج لغوي ليُقرأ صوتياً بنطق طبيعي:
 * يزيل أكواد Markdown، الروابط، وسوم HTML، الرموز التعبيرية، محارف التحكم،
 * ويفصل أرقام المجموعات (1,000 → 1000) ويطوّي المسافات.
 */
export function cleanArabicTextForSpeech(input: string): string {
  if (!input) return '';

  let t = input
    // كتل أكواد كاملة
    .replace(/```[\s\S]*?```/g, ' ')
    // نص أكواد مضمن
    .replace(/`[^`]*`/g, ' ')
    // روابط
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/www\.\S+/gi, ' ')
    .replace(/mailto:\S+/gi, ' ')
    // وسوم HTML
    .replace(/<\/?[a-z][^>]*>/gi, ' ')
    // محارف ترويسة/تنسيق Markdown وتسميات
    .replace(/[#>*_~|]/g, ' ')
    .replace(/\{\{.*?\}\}/g, ' ')
    // فواصل الأرقام (1,234 → 1234) لقراءتها كرقم واحد
    .replace(/(\d)[.,](\d{3})/g, '$1$2')
    // رمز تعبيرية ورسوميات
    .replace(/\p{Extended_Pictographic}/gu, ' ')
    // أسهم ونقاط وقوائم
    .replace(/[→←↑↓↔►▪•·⦁⇒]/g, ' ')
    // علامات ترقيم متكررة → واحدة
    .replace(/([.,:;!؟?،…-])\1+/g, '$1')
    // مسافات بيضاء متعددة
    .replace(/\s+/g, ' ')
    .trim();

  // تطبيع الحروف العربية
  t = normalizeArabicChars(t);
  // إزالة محارف التحكم برمجياً
  t = stripControlChars(t);
  return t;
}

/** يترجم خطأ محرك النطق إلى رسالة عربية سهلة. */
export function speechErrorToMessage(error: string | undefined): string {
  switch (error) {
    case 'network':
      return 'تعذر الوصول إلى خدمة النطق عبر الإنترنت — تحقق من الاتصال ثم أعد المحاولة.';
    case 'not-allowed':
    case 'synthesis-not-allowed':
      return 'لم يُسمح للمتصفح بالنطق — امنح إذن الصوت من إعدادات الموقع.';
    case 'synthesis-failed':
      return 'فشل محرك النطق في قراءة النص — جرّب نصاً أقصر.';
    case 'synthesis-unavailable':
      return 'القراءة الصوتية غير متاحة حالياً في هذا الجهاز.';
    case 'audio-busy':
      return 'جهاز الصوت مشغول بمهام أخرى — حاول بعد ثوانٍ.';
    case 'text-too-long':
      return 'النص طويل جداً للقراءة الصوتية — اقتُصر على المقطع الأول.';
    case 'interrupted':
    case 'canceled':
    case 'aborted':
      return '';
    default:
      return error ? `تعذر النطق: ${error}` : '';
  }
}

/**
 * ينطق نصاً عربياً بعد تنظيفه. يعيد true إن بدأ النطق فعلياً.
 */
export function speakArabic(text: string, options: SpeakOptions = {}): boolean {
  if (!isSpeechSupported() || !text) return false;

  const cleaned = cleanArabicTextForSpeech(text);
  if (!cleaned) return false;

  const { rate = 1, volume = 1, cancelPrevious = true, onEnd, onStart, onError } = options;
  const synth = window.speechSynthesis;

  if (cancelPrevious) {
    synth.cancel();
  }

  const utterance = new SpeechSynthesisUtterance(cleaned);
  const voice = pickArabicVoice();
  if (voice) {
    utterance.voice = voice;
  } else {
    utterance.lang = 'ar-SA';
  }
  utterance.rate = rate;
  utterance.volume = volume;

  utterance.onstart = () => onStart?.();
  utterance.onend = () => onEnd?.();
  utterance.onerror = (e: SpeechSynthesisErrorEvent) => {
    const msg = speechErrorToMessage(e.error);
    // الأخطاء المنسوخة (canceled/interrupted) لا تعرض رسالة للمستخدم
    if (onError && msg) onError(msg);
    else if (onEnd) onEnd();
  };

  synth.speak(utterance);

  return true;
}

/** يعيد رسالة ترحيب ناطقة لبوابة معينة. */
export function welcomeMessageFor(gatewayTitle: string, screenCount: number): string {
  return `مرحباً بك في ${gatewayTitle}. تحتوي هذه البوابة على ${screenCount} شاشة خاصة وبيانات منفصلة.`;
}