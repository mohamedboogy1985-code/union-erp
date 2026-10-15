#!/usr/bin/env node
/**
 * يُزيل من تتبّع git (فهرس git فقط، دون حذف الملفات من قرصك) الملفات الخاصة/الضخمة
 * التي لا يشير إليها أي كود تشغيل. الافتراضي: معاينة بلا تعديل.
 *
 *   node scripts/untrack-private-files.mjs           # معاينة
 *   node scripts/untrack-private-files.mjs --apply   # تنفيذ git rm --cached
 *
 * تنبيه: هذا لا يمحو الملفات من تاريخ git. راجع docs/REPO_CLEANUP.md لتنظيف التاريخ.
 */
import { execFileSync } from 'node:child_process';

const SAFE_TO_UNTRACK = [
  "dev_server.log",
  "docs/laiha/union-erp-integration.patch",
  "server_output.log",
  "start_err.log",
  "start_out.log",
  "union-erp-integration-commit.patch",
  "افقي المركز 2024.docx",
  "الاذن الذكى .jpg",
  "المكاتب ايرادات ومصروفات.xlsx",
  "عبد المنعم الجمل .jpg",
  "لائحة النظام الأساسي للنقابة العامة للعاملين بصناعات البناء والأخشاب وصنع مواد البناء.docx",
  "محمد عبد الله.jfif",
  "محمد محمد عبد الرسول.jfif",
  "هشام.jfif",
  "git"
];

// ملفات يقرؤها أو يستشهد بها كود التشغيل: لا تُزال آلياً — تحتاج قرارك (انظر REPO_CLEANUP.md §3)
const NEEDS_DECISION = [
  "Insured List - النقابة العامة للعاملين بصناعات البناء والأخشاب.xlsx",
  "WhatsApp Image 2026-09-14 at 1.47.10 PM (1).jpeg",
  "WhatsApp Image 2026-09-14 at 1.47.10 PM.jpeg",
  "اللائحة المالية.docx",
  "اللجان المهنية نهائى.xlsx",
  "الميزانية العمومية الحسابات الختامية مركز التدريب 2024.docx",
  "الوقائع المصرية 25-12-2025.pdf",
  "بيانات.xlsx",
  "تحديث قواعد البيانات الاتحاد العام وفقا لاخر تحديث.xlsx",
  "قيود اليومية_2024.xlsx",
  "لجان مهنية اخر تحديث.xlsx",
  "مركز التدريب 2024.docx",
  "مركز التدريب برنامج_المحاسبة_2024.xlsx"
];

const apply = process.argv.includes('--apply');
const tracked = new Set(
  execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
    .split('\0')
    .filter(Boolean),
);

const targets = SAFE_TO_UNTRACK.filter((f) => tracked.has(f));
console.log(`${apply ? 'تنفيذ' : 'معاينة'}: ${targets.length} ملفاً سيُزال من التتبّع:`);
for (const f of targets) console.log('  -', f);

if (apply && targets.length) {
  execFileSync('git', ['rm', '--cached', '--quiet', '--', ...targets], { stdio: 'inherit' });
  console.log('\n✅ تمت الإزالة من الفهرس. نفّذ: git commit -m "chore: untrack logs, patches and private files"');
} else if (!apply) {
  console.log('\nلم يُعدَّل شيء. أضف --apply للتنفيذ.');
}

console.log(`\nملفات تحتاج قرارك (مُشار إليها في الكود): ${NEEDS_DECISION.length}`);
for (const f of NEEDS_DECISION) console.log('  ?', f);
