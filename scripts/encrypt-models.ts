/**
 * ===== تشفير مجلد «نماذج» بالكامل بكلمة مرور (لتُرفع الملفات على GitHub بشكل غير مقروء) =====
 * الاستخدام:
 *   npx tsx scripts/encrypt-models.ts --password "كلمة-المرور"
 * الخيارات:
 *   --dir <path>      مجلد النماذج (افتراضي: جذر المشروع/نماذج)
 *   --backup <path>   النسخ الاحتياطي الأصلي (افتراضي: خارج المجلد بجواره)
 *   --decrypt         فك التشفير (استرجاع النسخ الأصلية)
 *
 * ملاحظة أمنية: لا تشارك كلمة المرور في أي ملف داخل المستودع.
 */
import fs from 'fs';
import path from 'path';

const args = process.argv.slice(2);
const get = (flag: string) => {
  const i = args.findIndex((a) => a === flag);
  return i === -1 ? undefined : args[i + 1];
};

const password = get('--password');
const mode = args.includes('--decrypt') ? 'decrypt' : 'encrypt';
const modelsDir = get('--dir') || path.join(process.cwd(), 'نماذج');
const backupDir = get('--backup') || path.join(path.dirname(modelsDir), path.basename(modelsDir) + '-original-backup');

if (!password) {
  console.error('يلزم تمرير كلمة المرور: --password "..."');
  process.exit(1);
}

import * as modelsCrypto from '../server/services/models-crypto.service.js';

if (!fs.existsSync(modelsDir)) {
  console.error(`مجلد النماذج غير موجود: ${modelsDir}`);
  process.exit(1);
}

const entries = fs.readdirSync(modelsDir).filter((f) => fs.statSync(path.join(modelsDir, f)).isFile());

let converted = 0;
let skipped = 0;

for (const f of entries) {
  const full = path.join(modelsDir, f);
  const raw = fs.readFileSync(full);

  if (mode === 'encrypt') {
    if (modelsCrypto.isEncryptedBuffer(raw)) {
      skipped++;
      continue;
    }
    // نسخة احتياطية من الأصل (خارج المستودع) قبل الكتابة المشفّرة
    fs.mkdirSync(backupDir, { recursive: true });
    fs.copyFileSync(full, path.join(backupDir, f));
    fs.writeFileSync(full, modelsCrypto.encryptBuffer(raw, password));
    converted++;
  } else {
    if (!modelsCrypto.isEncryptedBuffer(raw)) {
      skipped++;
      continue;
    }
    const plain = modelsCrypto.decryptBuffer(raw, password);
    fs.writeFileSync(full, plain);
    converted++;
  }
}

console.log(
  `تم ${mode === 'encrypt' ? 'تشفير' : 'فك تشفير'} ${converted} ملفاً` +
    (skipped ? `، استُثني ${skipped} ملفاً` : '') +
    ` في: ${modelsDir}`
);
if (mode === 'encrypt' && converted > 0) {
  console.log(
    `النسخة الاحتياطية الأصلية موجودة في (خارج المستودع): ${backupDir}\n` +
      `⚠️ احتفظ بكلمة المرور في مكان آمن — بدونها لا يمكن فك التشفير.`
  );
}