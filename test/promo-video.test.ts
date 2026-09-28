/**
 * ===== بطاقة فيديو البوابات =====
 * PR #26 كان يستبدل `PromoShowcase` ببطاقة فيديو مضمّنة في `Gateways.tsx` (ثم يحذف الملف).
 * القرار عند الاستعادة: نُبقي `PromoShowcase` (فحص HEAD للملف + إعادة محاولة + حالة مفقود
 * + رابط الفيديو الأنيق) لأنه يغلّف نفس مقصد PR #26 بكود أكبر قيمة، ونُضيف إليه ما كان
 * في PR #26 ولا يوجد على main: **رابط تحميل MP4**.
 *
 * ما تثبته هذه الاختبارات:
 *  1) Gateways يعرض PromoShowcase، والملف نفسه ما زال موجوداً (لم يُحذف كما في PR #26).
 *  2) الفيديو المعروض هو نفسه الذي ذكره PR #26 (`union-promo-wide.mp4`) وموجود على القرص.
 *  3) بطاقة الفيديو تعرض رابط تحميل MP4 (مكسب PR #26) + فحص HEAD يمنع عرض HTML الخادم كفيديو.
 *  4) الخادم يقدّم مجلد assets فعلاً (وإلا صار الفيديو 404).
 *
 * التشغيل: npx tsx --test test/promo-video.test.ts
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const read = (...segments: string[]) => fs.readFileSync(path.resolve(process.cwd(), ...segments), 'utf-8');

test('Gateways keeps rendering PromoShowcase (PR #26 deleted the file; we keep the richer one)', () => {
  const gateways = read('src', 'pages', 'Gateways.tsx');
  assert.match(gateways, /import \{ PromoShowcase \} from '\.\/PromoShowcase\.js'/);
  assert.match(gateways, /<PromoShowcase \/>/);
  assert.ok(fs.existsSync(path.resolve(process.cwd(), 'src', 'pages', 'PromoShowcase.tsx')));
});

test('the promo video shown is the same wide MP4 PR #26 used, and it exists on disk', () => {
  const promo = read('src', 'pages', 'PromoShowcase.tsx');
  assert.match(promo, /const VIDEO_URL = '\/assets\/promo\/video\/union-promo-wide\.mp4'/);
  const asset = path.resolve(process.cwd(), 'assets', 'promo', 'video', 'union-promo-wide.mp4');
  assert.ok(fs.existsSync(asset), 'the wide MP4 must exist in assets/');
  assert.ok(fs.statSync(asset).size > 100_000, 'the MP4 must be a real video file');
});

test('the video card offers an MP4 download and guards against the SPA HTML fallback', () => {
  const promo = read('src', 'pages', 'PromoShowcase.tsx');
  assert.match(promo, /download="union-promo-wide\.mp4"/, 'PR #26 download affordance must be preserved');
  assert.match(promo, /method: 'HEAD'/, 'availability must be probed, not assumed');
  assert.match(promo, /text\/html/, 'a 200 that is HTML (SPA fallback) must not be treated as a video');
  assert.match(promo, /إعادة فحص الفيديو/);
});

test('the server actually serves the assets folder', () => {
  const server = read('server.ts');
  assert.match(server, /express\.static\(/);
  assert.match(server, /assetsDir|assets/);
  assert.ok(fs.existsSync(path.resolve(process.cwd(), 'assets', 'promo', 'index.html')));
});
