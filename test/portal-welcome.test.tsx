/**
 * ===== ترحيب البوابة (PortalWelcome) وشاشة المهارات في التوجيه =====
 * استُعيد نظام الترحيب من PR #24/#26 مع تعديل واحد مقصود: النطق يمر عبر
 * `speakArabic` المشتركة (src/utils/speech.ts) لا عبر `speechSynthesis` مباشرةً،
 * ليتشارك اختيار الصوت العربي والتهيئة مع بقية النظام (المساعد الحي، الإملاء الصوتي).
 *
 * ما تثبته هذه الاختبارات:
 *  1) الرسالة تُبنى من بيانات البوابة الحقيقية (العنوان والوصف) ولا تُعرض بلا بوابة.
 *  2) زران فقط: «إعادة الاستماع» و«دخول البوابة» — لا حجب لأي شاشة.
 *  3) التوجيه: شاشة «المهارات الموحدة» متاحة في البوابات الثلاث، ومسار App يحمّلها.
 *  4) مصدر الحقيقة الصوتي: PortalWelcome تعتمد speakArabic/isSpeechSupported ولا تنادي
 *     speechSynthesis.speak مباشرةً، وتُلغي النطق عند الإغلاق.
 *
 * التشغيل: npx tsx --test test/portal-welcome.test.tsx
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { PortalWelcome } from '../src/components/PortalWelcome.js';
import { GATEWAYS, SCREENS, screensForPortal } from '../src/config/portals.js';
import { OPERATOR_NAVIGATION } from '../src/config/operator-assistant-navigation.js';

test('PortalWelcome renders the real gateway copy for each portal and nothing without one', () => {
  for (const gateway of GATEWAYS) {
    const html = renderToStaticMarkup(<PortalWelcome portalId={gateway.id} onClose={() => undefined} />);
    assert.match(html, /المساعد الذكي يرحب بك/);
    assert.ok(html.includes(gateway.title), `missing gateway title ${gateway.id}`);
    assert.ok(html.includes(gateway.subtitle), `missing gateway subtitle ${gateway.id}`);
    assert.ok(html.includes(`portal://${gateway.id}`), 'the portal chip must show the real id');
    assert.ok(html.includes(`org:${gateway.organizationId}`), 'the portal chip must show the real organization');
    assert.match(html, /مرحباً بك في/);
    assert.match(html, /إعادة الاستماع/);
    assert.ok(!html.includes('إلغاء الترحيب'), 'the welcome must not block the app');
  }

  assert.equal(renderToStaticMarkup(<PortalWelcome portalId={null} onClose={() => undefined} />), '');
});

test('PortalWelcome speaks through the shared Arabic speech utility, never raw speechSynthesis.speak', () => {
  const source = fs.readFileSync(path.resolve(process.cwd(), 'src', 'components', 'PortalWelcome.tsx'), 'utf-8');
  assert.match(source, /from '\.\.\/utils\/speech\.js'/, 'must reuse the shared speech utility');
  assert.match(source, /speakArabic\(/);
  assert.match(source, /isSpeechSupported\(/);
  assert.ok(!/speechSynthesis\.speak\(/.test(source), 'must not bypass the shared voice selection');
  assert.match(source, /speechSynthesis\.cancel\(\)/, 'closing the modal must stop the current utterance');

  const speech = fs.readFileSync(path.resolve(process.cwd(), 'src', 'utils', 'speech.ts'), 'utf-8');
  assert.match(speech, /export function speakArabic/);
  assert.match(speech, /export function isSpeechSupported/);
});

test('routing: the unified skills screen is registered for all three portals exactly once', () => {
  const skills = SCREENS.filter((screen) => screen.id === 'skills');
  assert.equal(skills.length, 1, 'skills screen must be declared once');
  assert.deepEqual(skills[0].portals.slice().sort(), ['committees', 'syndicate', 'training']);
  for (const portalId of ['syndicate', 'training', 'committees'] as const)
    assert.ok(screensForPortal(portalId).some((screen) => screen.id === 'skills'), `skills missing in ${portalId}`);
  assert.equal(skills[0].label, 'نظام المهارات الموحد');
});

test('routing: App lazy-loads the skills hub and mounts the welcome modal after the toasts', () => {
  const app = fs.readFileSync(path.resolve(process.cwd(), 'src', 'App.tsx'), 'utf-8');
  assert.match(app, /lazy\(\(\) => import\('\.\/pages\/SkillsHub\.js'\)/);
  assert.match(app, /currentTab === 'skills'/);
  assert.match(app, /m\.SkillsHub/, 'the hub is a named export, so the lazy loader must unwrap it');
  assert.match(app, /<PortalWelcome/);
  assert.match(app, /handleSelectGateway[\s\S]{0,600}setWelcomePortal\(gateway\)/, 'gateway switch must trigger the welcome');
  assert.match(app, /const \[welcomePortal, setWelcomePortal\] = useState<PortalId[^\n]*null>/);
});

test('routing: the duplicate AI/live-assistant screen is removed while AetherSwarm remains available', () => {
  const app = fs.readFileSync(path.resolve(process.cwd(), 'src', 'App.tsx'), 'utf-8');
  assert.equal(SCREENS.some((screen) => screen.id === 'aihub'), false, 'the duplicate AI hub must leave the portal menu');
  assert.ok(SCREENS.some((screen) => screen.id === 'aetherswarm'), 'AetherSwarm remains the single agent screen');
  assert.equal(OPERATOR_NAVIGATION.some((screen) => screen.id === 'ai' || screen.id === 'liveagent'), false);
  assert.ok(OPERATOR_NAVIGATION.some((screen) => screen.id === 'aetherswarm'));
  assert.match(app, /currentTab === 'aetherswarm'[\s\S]*<AetherSwarmApp/);
  assert.doesNotMatch(app, /import \{ AiHub/);
  assert.match(app, /LEGACY_AI_TABS[\s\S]*return 'aetherswarm'/, 'old AI/live links should land on AetherSwarm, not recreate a duplicate screen');
});
