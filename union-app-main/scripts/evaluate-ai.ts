import { smartAgentEnhancer } from '../server/services/smart-agent.service.js';

interface EvalCase {
  question: string;
  mustContain: string[];
}

const CASES: EvalCase[] = [
  { question: 'ما رصيد حساب 1301 الان؟', mustContain: ['رصيد', '1301', 'ج.م'] },
  { question: 'ما سقف الصرف النقدي في اللائحة؟', mustContain: ['20', 'ألف', 'النقابة'] },
  { question: 'ما حد الهدية في اللائحة؟', mustContain: ['5000', 'هدايا'] },
  { question: 'كيف أسجل قيد مصروفات صيانة؟', mustContain: ['قيد', 'صيان'] },
  { question: 'القيد غير متوازن، ما الحل؟', mustContain: ['توازن', 'مدين', 'دائن'] },
  { question: 'من أكبر المدينين في 1301؟', mustContain: ['ج.م', 'مدين'] },
  { question: 'اقترح قيد اشتراكات 15,000 ج.م', mustContain: ['قيد', 'اشتراك', 'إيراد'] },
  { question: 'كم عدد مواد اللائحة المالية؟', mustContain: ['مادة', 'لائحة'] },
  { question: 'ما المقصود بفصل المهام؟', mustContain: ['المدير المالي', 'الاعتماد', 'منشئ'] },
  { question: 'ما قواعد توزيع الإيرادات؟', mustContain: ['50', '30', '20', 'النقابة'] },
];

function runCase(item: EvalCase): { pass: boolean; reason: string } {
  let answer = '';
  try {
    const detailed = smartAgentEnhancer.handleComplexQueries(item.question);
    answer = detailed.answer || '';
  } catch (err: any) {
    return { pass: false, reason: `error: ${err.message}` };
  }
  const missing = item.mustContain.filter((kw) => !answer.includes(kw));
  return { pass: missing.length === 0, reason: missing.length ? `missing: ${missing.join(', ')}` : 'ok' };
}

function main() {
  console.log('🧪 AI Evaluation Suite — Union Financial ERP');
  console.log('=============================================\n');
  let passed = 0;
  CASES.forEach((c, i) => {
    const result = runCase(c);
    if (result.pass) passed++;
    console.log(`${result.pass ? '✅' : '❌'} Q${i + 1}: ${c.question}`);
    console.log(`   → ${result.reason}`);
  });
  const accuracy = Math.round((passed / CASES.length) * 1000) / 10;
  console.log(`\n📊 Accuracy: ${passed}/${CASES.length} (${accuracy}%)`);
  if (accuracy < 80) {
    console.log('🚫 FAIL — accuracy below 80%. Rollback or improve before shipping.');
    process.exit(1);
  }
  console.log('✅ PASS — AI evaluation gate satisfied.');
}

main();
