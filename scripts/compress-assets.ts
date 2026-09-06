/**
 * ضغط الأصول الكبيرة — P2
 * يحول PNG/JFIF الكبيرة (>100KB) إلى WebP مضغوطة مع الاحتفاظ بالأصل كـ fallback
 * يستخدم sharp إن توفر، وإلا يتخطى مع تحذير
 */

import fs from 'fs';
import path from 'path';

const ROOT = process.cwd();
const TARGETS = [
  'assets/icon.png',
  'mohasbak-ai-app-icon.png',
  'assets/شعارات.png',
  'assets/اذن-صرف.png',
  'mohasbak-ai-logo.png',
  'union-logo.png',
  'هشام.jfif',
];

async function compress() {
  let sharp: any = null;
  try {
    const mod = await import('sharp');
    sharp = mod.default || mod;
  } catch {
    console.warn('⚠️ sharp غير متاح — تخطي ضغط الأصول (ثبت sharp اختيارياً: npm i -D sharp)');
    return;
  }

  for (const rel of TARGETS) {
    const srcPath = path.join(ROOT, rel);
    if (!fs.existsSync(srcPath)) {
      console.log(`⏭️ غير موجود: ${rel}`);
      continue;
    }
    const stat = fs.statSync(srcPath);
    if (stat.size < 50 * 1024) {
      console.log(`✅ صغير بالفعل (${(stat.size / 1024).toFixed(1)}KB): ${rel}`);
      continue;
    }

    const ext = path.extname(rel).toLowerCase();
    const dir = path.dirname(srcPath);
    const base = path.basename(rel, ext);
    const webpPath = path.join(dir, `${base}.webp`);
    const optimizedPngPath = path.join(dir, `${base}.optimized.png`);

    try {
      // WebP بجودة 80
      await sharp(srcPath)
        .resize({ width: 1024, withoutEnlargement: true })
        .webp({ quality: 80 })
        .toFile(webpPath);

      const webpStat = fs.statSync(webpPath);
      console.log(`🗜️ ${rel}: ${(stat.size / 1024).toFixed(1)}KB → ${(webpStat.size / 1024).toFixed(1)}KB webp (${((1 - webpStat.size / stat.size) * 100).toFixed(1)}% توفير)`);

      // أيضاً نسخة PNG محسنة (resize + compression)
      if (stat.size > 500 * 1024) {
        await sharp(srcPath)
          .resize({ width: 1024, withoutEnlargement: true })
          .png({ compressionLevel: 9, palette: true })
          .toFile(optimizedPngPath);
        const optStat = fs.statSync(optimizedPngPath);
        console.log(`   PNG محسن: ${(optStat.size / 1024).toFixed(1)}KB`);
      }
    } catch (e: any) {
      console.warn(`⚠️ فشل ضغط ${rel}: ${e.message}`);
    }
  }

  console.log('✅ اكتمل ضغط الأصول');
}

compress().catch((e) => {
  console.error(e);
  process.exit(1);
});
