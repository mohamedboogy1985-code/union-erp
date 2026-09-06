/**
 * سكريبت تقييم جودة AI — يقيس دقة المساعد المحلي و Gemini
 * الاستخدام:
 *   npx tsx scripts/evaluate-ai.ts
 *   npx tsx scripts/evaluate-ai.ts --json
 *   GEMINI_API_KEY=... npx tsx scripts/evaluate-ai.ts --with-gemini
 */

import { smartAgentEnhancer } from '../server/services/smart-agent.service.js';
import { aiGateway } from '../server/services/ai-gateway.service.js';
import { regulationService } from '../server/services/regulation.service.js';
import { erpStore } from '../server/db/store.js';

// تحميل بيانات CSV الحقيقية كما يفعل الخادم
import { csvImportService } from '../server/services/csv-import.service.js';
import { employeeAffairsService } from '../server/services/employee-affairs.service.js';
csvImportService.loadRealDataFromCsvFiles();
employeeAffairsService.loadEmployeesFromInsuranceCsv();

interface EvalQuestion {
  id: number;
  category: 'BALANCE' | 'REGULATION' | 'ENTRY' | 'SUPPORT';
  question: string;
  expectedKeywords: string[]; // كلمات يجب أن تظهر في الإجابة
  shouldHaveSource?: boolean;
  shouldHaveAction?: boolean;
}

const QUESTIONS: EvalQuestion[] = [
  // أرصدة
  { id: 1, category: 'BALANCE', question: 'ما هو رصيد حساب 1301 مدينون متنوعون الآن؟', expectedKeywords: ['1301', 'مدينون'] },
  { id: 2, category: 'BALANCE', question: 'كم عدد حسابات الأستاذ المساعد في 1301؟', expectedKeywords: ['1301', 'حساب'] },
  { id: 3, category: 'BALANCE', question: 'من أكبر 3 مدينين في حساب 1301؟', expectedKeywords: ['1301'] },
  { id: 4, category: 'BALANCE', question: 'ما هو رصيد الخزينة 1101؟', expectedKeywords: ['1101', 'خزينة'] },
  { id: 5, category: 'BALANCE', question: 'كم إجمالي المصروفات حتى الآن؟', expectedKeywords: ['مصروفات'] },
  { id: 6, category: 'BALANCE', question: 'ما هو صافي الفائض أو العجز؟', expectedKeywords: ['فائض', 'عجز'] },
  { id: 7, category: 'BALANCE', question: 'اعرض ميزان المراجعة', expectedKeywords: ['ميزان', 'مراجعة'] },
  { id: 8, category: 'BALANCE', question: 'ما هي الحسابات التي تتطلب أستاذ مساعد؟', expectedKeywords: ['أستاذ مساعد', '1301'] },
  { id: 9, category: 'BALANCE', question: 'ما هو رصيد حساب الإيرادات المتنوعة؟', expectedKeywords: ['إيراد'] },
  { id: 10, category: 'BALANCE', question: 'هل يوجد قيود معلقة بانتظار الاعتماد؟', expectedKeywords: ['معلق', 'اعتماد'] },

  // لائحة
  { id: 11, category: 'REGULATION', question: 'ما هو حد الصرف النقدي المسموح حسب المادة 9؟', expectedKeywords: ['20,000', 'نقدي'] },
  { id: 12, category: 'REGULATION', question: 'كم الحد الأقصى لقيمة الهدية للفرد حسب المادتين 50 و 51؟', expectedKeywords: ['هدية', '200'] },
  { id: 13, category: 'REGULATION', question: 'متى يجب إرفاق مستند مؤيد للمشتريات حسب المادة 61؟', expectedKeywords: ['مستند', '20,000'] },
  { id: 14, category: 'REGULATION', question: 'ما هي ضوابط بدل السفر والانتقال؟', expectedKeywords: ['سفر', 'انتقال'] },
  { id: 15, category: 'REGULATION', question: 'كم عدد مواد اللائحة المالية النافذة؟', expectedKeywords: ['مادة'] },
  { id: 16, category: 'REGULATION', question: 'هل يجوز صرف مبلغ 25,000 نقداً من الخزينة؟', expectedKeywords: ['لا يجوز', 'نقدي'] },
  { id: 17, category: 'REGULATION', question: 'موظف طلب سلفة 15,000 وراتبه 10,000 — هل يجوز؟', expectedKeywords: ['سلفة'] },
  { id: 18, category: 'REGULATION', question: 'ما هي نسبة توزيع إيراد الاشتراكات؟', expectedKeywords: ['توزيع', 'اشتراك'] },
  { id: 19, category: 'REGULATION', question: 'ما هي المستندات المطلوبة لاعتماد قيد مصروفات فوق 20,000؟', expectedKeywords: ['مستند', '20,000'] },
  { id: 20, category: 'REGULATION', question: 'هل يجوز للمدير المالي اعتماد قيد أنشأه بنفسه؟', expectedKeywords: ['فصل المهام', 'لا يجوز'] },

  // إنشاء قيود
  { id: 21, category: 'ENTRY', question: 'أنشئ قيد صرف إيجار 4000 جنيه من الخزينة', expectedKeywords: ['إيجار', '4000'], shouldHaveAction: true },
  { id: 22, category: 'ENTRY', question: 'سجل قيد مشتريات قرطاسية 2500 جنيه نقداً', expectedKeywords: ['قرطاسية', '2500'], shouldHaveAction: true },
  { id: 23, category: 'ENTRY', question: 'تحصيل اشتراك عضو 500 جنيه نقداً', expectedKeywords: ['اشتراك', '500'], shouldHaveAction: true },
  { id: 24, category: 'ENTRY', question: 'صرف بدل انتقال 1200 جنيه لأحمد محمد', expectedKeywords: ['انتقال', '1200'], shouldHaveAction: true },
  { id: 25, category: 'ENTRY', question: 'قيد استحقاق فاتورة صيانة 7500 لشركة الأمل', expectedKeywords: ['صيانة', '7500', 'الأمل'], shouldHaveAction: true },

  // دعم فني
  { id: 26, category: 'SUPPORT', question: 'القيد غير متوازن — ماذا أفعل؟', expectedKeywords: ['متوازن', 'مدين', 'دائن'] },
  { id: 27, category: 'SUPPORT', question: 'الحساب 1301 يطلب طرف مساعد ولا يقبل الحفظ', expectedKeywords: ['1301', 'طرف'] },
  { id: 28, category: 'SUPPORT', question: 'الفترة المالية مغلقة وأريد تسجيل قيد في يناير', expectedKeywords: ['فترة', 'مغلقة'] },
  { id: 29, category: 'SUPPORT', question: 'كيف أدمج حسابين مكررين في الأستاذ المساعد؟', expectedKeywords: ['دمج', 'أستاذ مساعد'] },
  { id: 30, category: 'SUPPORT', question: 'الإيصال لا يظهر له QR تحقق', expectedKeywords: ['إيصال', 'QR'] },
];

function scoreAnswer(answer: string, expectedKeywords: string[]): number {
  const norm = answer.toLowerCase();
  let matched = 0;
  for (const kw of expectedKeywords) {
    if (norm.includes(kw.toLowerCase())) matched++;
  }
  return expectedKeywords.length ? matched / expectedKeywords.length : 1;
}

async function runEval(withGemini = false) {
  console.log('🧪 تقييم جودة الذكاء الاصطناعي — 30 سؤال\n');
  console.log(`الوضع: ${withGemini ? 'مع Gemini' : 'محلي فقط (smart-agent)'}`);
  console.log(`التاريخ: ${new Date().toISOString()}\n`);

  const results: any[] = [];
  let totalScore = 0;
  let totalLatency = 0;
  let correctCount = 0;

  for (const q of QUESTIONS) {
    const start = Date.now();
    let answer: string;
    let confidence = 0;
    let sources: any[] = [];
    let action: any = null;

    try {
      if (withGemini) {
        const res = await aiGateway.chat({ message: q.question, mode: 'accountant' });
        answer = res.answer;
        confidence = res.confidence;
        sources = res.sources;
        action = res.actionIntent;
      } else {
        const res = smartAgentEnhancer.handleComplexQueries(q.question);
        answer = res.answer;
        confidence = res.confidence;
        sources = res.sources;
        action = res.suggestedActions?.[0];
      }
    } catch (err: any) {
      answer = `خطأ: ${err.message}`;
      confidence = 0;
    }

    const latency = Date.now() - start;
    const keywordScore = scoreAnswer(answer, q.expectedKeywords);
    const isCorrect = keywordScore >= 0.5;
    if (isCorrect) correctCount++;
    totalScore += keywordScore;
    totalLatency += latency;

    const result = {
      id: q.id,
      category: q.category,
      question: q.question,
      keywordScore: Math.round(keywordScore * 100) / 100,
      isCorrect,
      confidence: Math.round(confidence * 100) / 100,
      latencyMs: latency,
      hasSource: sources.length > 0,
      hasAction: !!action,
      answerPreview: answer.slice(0, 200),
    };
    results.push(result);

    const status = isCorrect ? '✅' : '❌';
    console.log(`${status} [${q.id}] (${q.category}) ${q.question.slice(0, 60)} — score:${result.keywordScore} conf:${result.confidence} ${latency}ms`);
  }

  const avgScore = totalScore / QUESTIONS.length;
  const avgLatency = totalLatency / QUESTIONS.length;
  const accuracy = correctCount / QUESTIONS.length;

  console.log('\n--- الملخص ---');
  console.log(`الدقة: ${correctCount}/${QUESTIONS.length} = ${Math.round(accuracy * 100)}%`);
  console.log(`متوسط درجة الكلمات المفتاحية: ${Math.round(avgScore * 100)}%`);
  console.log(`متوسط الزمن: ${Math.round(avgLatency)}ms`);
  console.log(`إجمالي الزمن: ${totalLatency}ms`);

  // تفصيل حسب الفئة
  const byCat = new Map<string, { total: number; correct: number }>();
  for (const r of results) {
    const c = byCat.get(r.category) || { total: 0, correct: 0 };
    c.total++;
    if (r.isCorrect) c.correct++;
    byCat.set(r.category, c);
  }
  console.log('\nحسب الفئة:');
  byCat.forEach((v, k) => {
    console.log(`- ${k}: ${v.correct}/${v.total} = ${Math.round((v.correct / v.total) * 100)}%`);
  });

  const isJson = process.argv.includes('--json');
  if (isJson) {
    const fs = await import('fs');
    const out = {
      date: new Date().toISOString(),
      mode: withGemini ? 'gemini' : 'local',
      accuracy,
      avgScore,
      avgLatency,
      results,
    };
    fs.writeFileSync('docs/ai-eval-results.json', JSON.stringify(out, null, 2), 'utf-8');
    console.log('\n💾 تم حفظ النتائج إلى docs/ai-eval-results.json');
  }

  if (accuracy < 0.7) {
    console.log('\n⚠️ الدقة أقل من 70% — يُنصح بتحسين RAG أو قاعدة المعرفة');
    process.exitCode = 1;
  } else {
    console.log('\n🎉 التقييم مكتمل — الدقة مقبولة');
  }
}

const withGemini = process.argv.includes('--with-gemini');
runEval(withGemini);
