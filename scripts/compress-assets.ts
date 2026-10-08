/**
 * ===== ضغط أصول الواجهة — P2 =====
 * استُعيد من PR #24: يحوّل الصور الكبيرة (>50KB) إلى WebP بجودة 80 مع نسخة PNG محسّنة
 * للصور الأكبر من 500KB، ويحتفظ بالأصل كما هو (fallback) — لا يحذف شيئاً.
 *
 * لا يُشغَّل تلقائياً في البناء ولا في CI: قرار تحويل الأصول إلى WebP يحتاج مراجعة بصرية،
 * لذلك هو أمر يدوي: `npm run assets:compress`.
 *
 * sharp موجود كتبعية اختيارية في هذا المشروع — عند غيابه يتخطى السكربت مع تحذير.
 */
import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();

/** الأصول الموجودة فعلاً في المستودع (السكربت يتخطى أي ملف غير موجود بلا فشل) */
const TARGETS = [
  'assets/icon.png',
  'assets/union-logo.png',
  'assets/mohasbak-ai-logo.png',
  'assets/شعارات.png',
  'assets/اذن-صرف.png',
  'union-logo.png',
  'mohasbak-ai-app-icon.png',
];

const MIN_SIZE_BYTES = 50 * 1024;

async function loadSharp(): Promise<any | null> {
  try {
    const mod = await import('sharp');
    return mod.default || mod;
  } catch {
    console.warn('⚠️ sharp غير متاح — تخطي ضغط الأصول (ثبته اختيارياً: npm i -D sharp)');
    return null;
  }
}

async function compress(): Promise<void> {
  const sharp = await loadSharp();
  if (!sharp) return;

  let converted = 0;
  let skipped = 0;

  for (const rel of TARGETS) {
    const srcPath = path.join(ROOT, rel);
    if (!fs.existsSync(srcPath)) {
      console.log(`⏭️ غير موجود: ${rel}`);
      skipped += 1;
      continue;
    }

    const stat = fs.statSync(srcPath);
    if (stat.size < MIN_SIZE_BYTES) {
      console.log(`✅ صغير بالفعل (${(stat.size / 1024).toFixed(1)}KB): ${rel}`);
      skipped += 1;
      continue;
    }

    const ext = path.extname(rel).toLowerCase();
    const dir = path.dirname(srcPath);
    const base = path.basename(rel, ext);
    const webpPath = path.join(dir, `${base}.webp`);
    const optimizedPngPath = path.join(dir, `${base}.optimized.png`);

    try {
      await sharp(srcPath).resize({ width: 1024, withoutEnlargement: true }).webp({ quality: 80 }).toFile(webpPath);
      const webpStat = fs.statSync(webpPath);
      console.log(
        `🗜️ ${rel}: ${(stat.size / 1024).toFixed(1)}KB → ${(webpStat.size / 1024).toFixed(1)}KB webp ` +
          `(${((1 - webpStat.size / stat.size) * 100).toFixed(1)}% توفير)`
      );
      converted += 1;

      if (stat.size > 500 * 1024) {
        await sharp(srcPath)
          .resize({ width: 1024, withoutEnlargement: true })
          .png({ compressionLevel: 9, palette: true })
          .toFile(optimizedPngPath);
        console.log(`   PNG محسّن: ${(fs.statSync(optimizedPngPath).size / 1024).toFixed(1)}KB`);
      }
    } catch (error: any) {
      console.warn(`⚠️ فشل ضغط ${rel}: ${error.message}`);
    }
  }

  console.log(`✅ اكتمل ضغط الأصول — حُوِّل ${converted}، تُخطّي ${skipped}. الأصل محفوظ دائماً.`);
}

compress().catch((error) => {
  console.error(error);
  process.exit(1);
});
