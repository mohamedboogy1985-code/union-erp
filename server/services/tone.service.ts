/**
 * ===== نبرة الردود (Tone) =====
 * كل رد يولّده البرنامج بنفسه (المساعد العام، مساعد اللوائح، اقتراحات الإملاء) يمرّ من هنا،
 * فيخرج: بشري • بسيط • مباشر • جمل قصيرة تصلح للنطق.
 *
 * لا تُطبَّق هذه الطبقة على النصوص المنقولة (مواد اللائحة المقتبسة، صفوف الجداول، ملفات CSV)
 * لأنها أمانة نصية تُعرض كما هي.
 */

export interface ToneRule {
  id: string;
  descriptionAr: string;
}

/** قواعد النبرة — تُعرض في /api/assistant/status وتُختبر في test/tone.test.ts. */
export const TONE_RULES: ToneRule[] = [
  {
    id: "TONE-01",
    descriptionAr:
      "بلا مقدمات آلية («أهلاً بك، كيف يمكنني مساعدتك») ولا تعريف روبوتي («بصفتي نموذجاً»، «كمساعد ذكي»).",
  },
  {
    id: "TONE-02",
    descriptionAr:
      "بلا حشو مجاملة («بكل سرور»، «لا تتردد»، «يسعدني مساعدتك»، «بناءً على طلبك»).",
  },
  {
    id: "TONE-03",
    descriptionAr:
      "دخول مباشر في الموضوع: أول جملة تقول المعلومة أو الناتج، مش تمهيد.",
  },
  {
    id: "TONE-04",
    descriptionAr:
      "جمل قصيرة (≤ 110 حرفاً) بفواصل واضحة — تصلح للقراءة الصوتية.",
  },
  {
    id: "TONE-05",
    descriptionAr: "أسلوب زميل شغل: عامية بيضاء بلا رسميات ولا مصطلحات جافة.",
  },
  {
    id: "TONE-06",
    descriptionAr:
      "بلا وعود أو اعتذارات آلية («أرجو أن أكون قد أفدت»، «هل هناك أي شيء آخر»).",
  },
];

/** عبارات ممنوعة في أي رد يولّده البرنامج. */
export const BANNED_TONE_PATTERNS: Array<{ pattern: RegExp; whyAr: string }> = [
  { pattern: /بصفتي\s+(نموذج|ذكاء|مساعد|مساعداً)/u, whyAr: "تعريف روبوتي" },
  {
    pattern: /(ك?مساعد|ك?ذكاء)\s*(ذكي|اصطناعي|لغوي|آلي)/u,
    whyAr: "تعريف روبوتي",
  },
  {
    pattern:
      /(أهلاً بك|اهلا بك)[^\n]{0,45}(كيف يمكنني|كيف اقدر اساعدك|كيف أساعدك|أساعدك اليوم)/u,
    whyAr: "مقدمة آلية",
  },
  {
    pattern:
      /بكل سرور|بكل تأكيد|لا تتردد|يسعدني مساعدتك|يسعدني أن أساعدك|بناءً? على طلبك/u,
    whyAr: "حشو مجاملة",
  },
  {
    pattern: /أرجو أن أكون قد|هل هناك أي شيء آخر|أتمنى أن يكون هذا مفيداً/u,
    whyAr: "خاتمة آلية",
  },
];

/** يحذف العبارات الآلية ويصلح المسافات ويقصّر الجمل الطويلة. */
export function humanizeReply(text: string, maxSentenceLength = 110): string {
  const raw = String(text ?? "");
  if (!raw.trim()) return raw;
  const lines = raw.replace(/\r/g, "").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const trimmed = line.replace(/[ \t]+/g, " ").trimEnd();
    if (!trimmed.trim()) {
      if (out.length && out[out.length - 1] !== "") out.push("");
      continue;
    }
    out.push(softenLine(trimmed, maxSentenceLength));
  }
  while (out.length && out[out.length - 1] === "") out.pop();
  return out.join("\n");
}

/** سطر واحد: تنظيف العبارات الآلية ثم تقسيم الجمل الطويلة عند الفواصل. */
function softenLine(line: string, maxSentenceLength: number): string {
  const keepPrefix = /^(\d+[).]|[-•*]|المادة|مادة|البند)\s/u.test(line.trim());
  let cleaned = line;
  cleaned = cleaned
    .replace(/أهلاً بك[،,]?\s*👋?\s*/gu, "")
    .replace(/اهلا بك[،,]?\s*/gu, "")
    .replace(
      /\s*(بكل سرور|بكل تأكيد|بلا تردد|لا تتردد|يسعدني مساعدتك|بناءً? على طلبك)[،,]?\s*/gu,
      " ",
    )
    .replace(
      /\s*(أرجو أن أكون قد[^.،\n]*|هل هناك أي شيء آخر[؟?]?|أتمنى أن يكون هذا مفيداً)[^.،\n]*/gu,
      " ",
    )
    .replace(/^\s*[،,]\s*/u, "")
    .replace(/\s{2,}/g, " ")
    .trim();
  if (!cleaned) return "";
  if (keepPrefix) return cleaned;
  return splitLongSentences(cleaned, maxSentenceLength).join(" ");
}

/**
 * تقسيم الجمل الطويلة عند آخر فاصل («،» أو «—» أو «•») قبل الحد الأقصى،
 * لأن النص الطويل الواحد يتعب الأذن ويتلخبط في النطق.
 */
/** كلمات لا يصح أن تبدأ بها الجملة بعد القطع، فنبحث عن فاصل أسبق. */
const BAD_SENTENCE_STARTERS = /^(أو|و|ثم|لكن|كما|مع|حتى|أيضا|أيضاً|بل)\b/u;

export function splitLongSentences(
  line: string,
  maxSentenceLength = 110,
): string[] {
  const pieces: string[] = [];
  let rest = line.trim();
  while (rest.length > maxSentenceLength) {
    const window = rest.slice(0, maxSentenceLength);
    const boundaries = ["، ", " — ", " • ", "؛ "]
      .flatMap((marker) => {
        const found: number[] = [];
        let at = window.lastIndexOf(marker);
        while (at > 0) {
          found.push(at);
          at = window.lastIndexOf(marker, at - 1);
        }
        return found;
      })
      .sort((a, b) => b - a);
    const cut = boundaries.find(
      (at) =>
        at > 20 &&
        !BAD_SENTENCE_STARTERS.test(rest.slice(at).replace(/^[،؛\s—•]+/u, "")),
    );
    if (cut === undefined) break;
    pieces.push(rest.slice(0, cut).trimEnd().replace(/[،؛]$/u, "") + ".");
    rest = rest
      .slice(cut)
      .replace(/^[،؛\s—•]+/u, "")
      .trim();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/** هل الرد فيه أي عبارة آلية؟ تُستخدم في الفحوص. */
export function findToneViolations(text: string): string[] {
  return BANNED_TONE_PATTERNS.filter((item) =>
    item.pattern.test(String(text ?? "")),
  ).map((item) => item.whyAr);
}

/** الجمل التي تجاوزت الحد والمفروض تُقصَّر (بلا لمس النصوص الشرعية/المقتبسة). */
export function findLongSentences(
  text: string,
  maxSentenceLength = 110,
): string[] {
  return String(text ?? "")
    .split("\n")
    .flatMap((line) => line.split(/(?<=[.؟!])\s+/))
    .map((part) => part.trim())
    .filter(
      (part) =>
        part.length > maxSentenceLength && !/^["«]|المادة|مادة \d/.test(part),
    );
}
