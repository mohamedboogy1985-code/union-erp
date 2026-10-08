const BASE = process.env.BASE_URL ?? 'http://127.0.0.1:4300';
const results = [];
const requireSql = /^(1|true|yes)$/i.test(process.env.REQUIRE_SQL || '');
const check = (label, ok, detail = '') => results.push({ label, ok, detail });

const json = async (p, init = {}) => {
  const headers = new Headers(init.headers);
  if (p.startsWith('/api/')) {
    if (process.env.TEST_AUTH_TOKEN && !headers.has('authorization')) {
      headers.set('Authorization', `Bearer ${process.env.TEST_AUTH_TOKEN}`);
    } else if (!headers.has('authorization') && !headers.has('x-user-id')) {
      headers.set('x-user-id', process.env.TEST_USER_ID || 'usr-mohamed-abdallah');
    }
  }
  const r = await fetch(`${BASE}${p}`, { ...init, headers });
  const ct = r.headers.get('content-type') ?? '';
  const body = ct.includes('json') ? await r.json() : await r.text();
  return { status: r.status, body, ct, url: r.url };
};

const authHeaders = () => process.env.TEST_AUTH_TOKEN
  ? { Authorization: `Bearer ${process.env.TEST_AUTH_TOKEN}` }
  : { 'x-user-id': process.env.TEST_USER_ID || 'usr-mohamed-abdallah' };

const root = await json('/');
check('صفحة البرنامج الأصلي على /', root.status === 200 && String(root.body).includes('<div id="root"'), `status=${root.status}`);

const statutory = await json('/statutory');
check(
  'مسار /statutory يفتح لوحة الوحدة المدمجة داخل SPA مع تسجيل الدخول نفسه',
  statutory.status === 200 &&
    String(statutory.body).includes('<div id="root"') &&
    new URL(statutory.url).searchParams.get('tab') === 'statutory',
  `status=${statutory.status} url=${statutory.url}`,
);

for (const [path, tab, label] of [
  ['/taxes', 'taxes', 'الضرائب وكسب العمل'],
  ['/payroll-tax', 'payroll-tax', 'كسب العمل'],
  ['/hr', 'hrs', 'الموارد البشرية'],
  ['/hr/biometric', 'biometric', 'البصمة البيومترية'],
]) {
  const link = await json(path);
  check(
    `المسار ${path} يفتح ${label} داخل SPA`,
    link.status === 200 && String(link.body).includes('<div id="root"') && new URL(link.url).searchParams.get('tab') === tab,
    `status=${link.status} url=${link.url}`,
  );
}

const payrollTaxUnauthenticated = await fetch(`${BASE}/api/tax/payroll/calculate`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ monthlyGross: 20_000, monthlyInsurance: 2_200 }),
});
check('حاسبة كسب العمل ترفض الطلب غير المصادق (401)', payrollTaxUnauthenticated.status === 401);
const payrollTax = await json('/api/tax/payroll/calculate', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ monthlyGross: 20_000, monthlyInsurance: 2_200 }),
});
check(
  'حاسبة كسب العمل تعمل عبر /api/tax وتعيد الشرائح والوعاء والإصدار القانوني',
  payrollTax.status === 200 && payrollTax.body?.taxableBase > 0 && payrollTax.body?.annualTax > 0 &&
    Array.isArray(payrollTax.body?.brackets) && String(payrollTax.body?.parametersVersion).startsWith('EG-TAX-'),
  `status=${payrollTax.status} version=${payrollTax.body?.parametersVersion}`,
);

const accounts = await json('/api/accounts');
check('دليل حسابات مخزنك محمّل من CSV الرسمي', Array.isArray(accounts.body) && accounts.body.length >= 117, `${Array.isArray(accounts.body) ? accounts.body.length : 0} حساباً`);

const entries = await json('/api/journal-entries');
const list = Array.isArray(entries.body) ? entries.body : entries.body?.entries ?? [];
check('قيود اليومية التاريخية محمّلة', list.length > 3000, `${list.length} قيداً`);

const chart = await json('/api/accounting/chart');
check('النواة الموحّدة: 118 حساباً و118 كوداً فريداً على 9 أقسام', chart.body?.stats?.accounts === 118 && chart.body?.stats?.uniqueCodes === 118 && chart.body?.stats?.sections === 9);
check('الدليل النشط معلن مع معيّن معتمد وحسابي نقد', chart.body?.mapping?.activeGuide?.id === 'PROGRAM' && chart.body?.mapping?.counts?.confirmed === 2 && (chart.body?.treasury?.codes ?? []).join(',') === '1101,1211');
check('البنود المحسومة والقائم معلنة على الخادم', Array.isArray(chart.body?.openItems) && chart.body.openItems.some((item) => item.id === 'COA-OPEN-003') && chart.body.openItems.some((item) => item.id === 'COA-ANOM-DUP-1111' || item.id === 'COA-OPEN-001'));

const tb = await json('/api/accounting/trial-balance');
check('ميزان النواة متوازن', tb.body?.balanced === true);

const statute = await json('/api/statute');
check('النظام الأساسي: 69 مادة / 113 قاعدة', statute.body?.stats?.articles === 69 && statute.body?.stats?.rules === 113);

const financial = await json('/api/financial');
check(
  'اللائحة المالية: 90 قاعدة / 53 عتبة',
  financial.body?.stats?.rules === 90 && financial.body?.stats?.thresholds === 53,
  JSON.stringify(financial.body?.stats),
);

const enforcement = await json('/api/statute/enforcement');
const currentStage = enforcement.body?.current;
check('مرحلة الإنفاذ محددة ضمن SHADOW/AUDIT/WARN/ENFORCE', ['SHADOW', 'AUDIT', 'WARN', 'ENFORCE'].includes(currentStage));

const regulation = await json('/api/regulation');
check('محرك اللائحة الأصلي يعمل بعد تصحيح القيم', regulation.status === 200 && Boolean(regulation.body?.articles));

const uiState = await json('/api/statutory/state');
check('حالة اللوحة الموحّدة تجمع الوحدات الثلاث', uiState.body?.stats?.articles === 69 && uiState.body?.financial?.stats?.rules === 90 && uiState.body?.accounting?.stats?.accounts === 118);

const legalDistribution = await json('/api/financial/check', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    action: 'REVENUE_DISTRIBUTION',
    hasFederation: true,
    federationSharePercent: 10,
    committeeSharePercent: 60,
    generalSharePercent: 30,
  }),
});
check('المادة 2 الرسمية 10/60/30 تمرّ بلا مخالفة', (legalDistribution.body?.blocked ?? []).length === 0);

const csvDistribution = await json('/api/financial/check?stage=ENFORCE', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    action: 'REVENUE_DISTRIBUTION',
    hasFederation: true,
    generalSharePercent: 30,
    printingSharePercent: 10,
    federationSharePercent: 10,
    committeeSharePercent: 50,
  }),
});
const csvStage = csvDistribution.body?.enforcement?.stage ?? currentStage;
const csvBlocked = (csvDistribution.body?.blocked ?? []).some((item) => item.ruleId === 'FR-GATE-052');
check(
  'CSV المرجعي لا يغيّر المادة 2؛ وquery.stage لا يتجاوز إعداد الخادم',
  (currentStage === 'ENFORCE' ? csvBlocked : !csvBlocked) && csvStage === currentStage,
  `stage=${currentStage}`,
);

const intentSchemaUnauthenticated = await fetch(`${BASE}/api/assistant/intents/schema`);
check('مخطط النوايا يرفض طلباً بلا هوية (401)', intentSchemaUnauthenticated.status === 401);
const intentSchema = await json('/api/assistant/intents/schema');
check('نقطة /api/assistant/intents/schema قائمة ومحمية', intentSchema.status === 200 && intentSchema.body?.schemaVersion === 'intent-v1');
const intentLog = await json('/api/assistant/intents');
check('نقطة /api/assistant/intents قائمة ومحمية', intentLog.status === 200 && Array.isArray(intentLog.body?.rows));

const chatFinancial = await json('/api/regulations/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ question: 'إيه نص المادة 2 من اللائحة المالية؟' }),
});
check(
  'شات بوت اللوائح: تسمية «اللائحة المالية» تُجاب من المصدر الرسمي (60% للجنة)',
  chatFinancial.body?.origin === 'ARTICLE_EXACT' &&
    chatFinancial.body?.citations?.[0]?.sourceCode === 'FINANCIAL' &&
    String(chatFinancial.body?.answerAr).includes('60% للجنة النقابية'),
  `${chatFinancial.body?.citations?.[0]?.sourceCode}/${chatFinancial.body?.citations?.[0]?.refCode}`,
);
const chatStatute = await json('/api/regulations/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ question: 'إيه نص المادة 2 من لائحة النظام الأساسي؟' }),
});
check(
  'شات بوت اللوائح: تسمية «النظام الأساسي» تُجاب من مصدرها',
  chatStatute.body?.citations?.[0]?.sourceCode === 'STATUTE',
  `${chatStatute.body?.citations?.[0]?.sourceCode}/${chatStatute.body?.citations?.[0]?.refCode}`,
);

const regOverview = await json('/api/regulations/overview');
check(
  'قاعدة اللوائح على الخادم: 3 مصادر و115 بنداً (69 مادة + 17 مادة + 29 مقطعاً) ومنها 24 بنداً من OCR',
  regOverview.body?.stats?.sources === 3 &&
    regOverview.body?.stats?.documents === 115 &&
    regOverview.body?.stats?.ocrDocuments === 24 &&
    regOverview.body?.stats?.law35Chunks === 29,
  JSON.stringify(regOverview.body?.stats),
);
check(
  'المرفق 35/2018 مُدرج بصوره: 17 صفحة ورابط الملف الأصلي ورابط صفحة واحدة',
  regOverview.body?.law35Pages?.length === 17 &&
    (await fetch(`${BASE}/api/regulations/law35/pages/4`, { headers: authHeaders() })).headers.get('content-type') === 'image/jpeg' &&
    (await fetch(`${BASE}/api/regulations/law35/file`, { headers: authHeaders() })).status === 200,
  `${regOverview.body?.law35Pages?.length} صفحة`,
);
const chat = await json('/api/regulations/chat', {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ question: 'إيه نص المادة (2) الخاصة بتوزيع حصيلة الاشتراكات؟' }),
});
check(
  'شات بوت اللوائح يجيب من قاعدة اللوائح بسندها',
  chat.body?.origin === 'ARTICLE_EXACT' && String(chat.body?.answerAr ?? '').includes('60% للجنة النقابية'),
  String(chat.body?.origin),
);

const distFinal = await json('/api/revenue-distribution/final');
check(
  'عرض CSV المرجعي محمي: 26 لجنة + 52 مكتباً + إجمالي 40,000.00',
  distFinal.status === 200 && distFinal.body?.committees?.length === 26 && distFinal.body?.offices?.length === 52 && distFinal.body?.committeeTotals?.totalCollected === 40000 && distFinal.body?.openItems?.[0]?.status === 'PENDING',
  `لجان=${distFinal.body?.committees?.length} مكاتب=${distFinal.body?.offices?.length}`,
);
const distRules = await json('/api/revenue-distribution-rules');
const operatingRuleCodes = (distRules.body ?? []).map((rule) => rule.ruleCode).sort();
const memberRule = (distRules.body ?? []).find((rule) => rule.ruleCode === 'DIST-MEMB-V1');
const certificateRule = (distRules.body ?? []).find((rule) => rule.ruleCode === 'DIST-CERT-V1');
check(
  'CSV المرجعي لا يستبدل قواعد الإيصالات التشغيلية 50/30/20 و70/30',
  Array.isArray(distRules.body) &&
    operatingRuleCodes.join(',') === 'DIST-CERT-V1,DIST-MEMB-V1' &&
    memberRule?.lines.map((line) => line.percentage).join('/') === '50/30/20' &&
    certificateRule?.lines.map((line) => line.percentage).join('/') === '70/30',
  JSON.stringify({ ruleCodes: operatingRuleCodes, member: memberRule?.lines.map((line) => line.percentage), certificate: certificateRule?.lines.map((line) => line.percentage) }),
);

// ===== اتصال SQL الحقيقي (اختياري محلياً، وإلزامي عند REQUIRE_SQL=true) =====
const health = await json('/api/health');
const databaseConnected = health.body?.database?.connected === true;
check(
  requireSql ? 'حالة الخادم تؤكد اتصال PostgreSQL المطلوب' : 'حالة الخادم تعرض وضع قاعدة البيانات بوضوح',
  health.status === 200 && typeof health.body?.database?.connected === 'boolean' && (!requireSql || databaseConnected),
  `connected=${health.body?.database?.connected} mode=${health.body?.database?.mode}`,
);

let dbClient;
try {
  const { default: pg } = await import('pg');
  const connectionConfig = process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.SQL_HOST || '127.0.0.1',
        port: Number(process.env.SQL_PORT || 5432),
        user: process.env.SQL_USER || 'postgres',
        password: process.env.SQL_PASSWORD || 'postgres',
        database: process.env.SQL_DB_NAME || 'union_app',
      };
  dbClient = new pg.Client({ ...connectionConfig, connectionTimeoutMillis: 3000 });
  await dbClient.connect();
  const version = await dbClient.query('select version() as version');
  await dbClient.query('BEGIN');
  await dbClient.query('CREATE TEMP TABLE union_erp_sql_probe (value text) ON COMMIT DROP');
  await dbClient.query('INSERT INTO union_erp_sql_probe(value) VALUES ($1)', ['sql-roundtrip-ok']);
  const roundTrip = await dbClient.query('SELECT value FROM union_erp_sql_probe LIMIT 1');
  await dbClient.query('ROLLBACK');
  check(
    'اتصال PostgreSQL ينفذ قراءة وكتابة SQL داخل معاملة قابلة للتراجع',
    roundTrip.rows[0]?.value === 'sql-roundtrip-ok',
    String(version.rows[0]?.version ?? '').slice(0, 80),
  );

  const sources = await dbClient.query('select count(*)::int as n from regulation_sources');
  const docs = await dbClient.query('select count(*)::int as n from regulation_documents');
  const ocr = await dbClient.query('select count(*)::int as n from regulation_documents where ocr_derived = true');
  const law = await dbClient.query("select count(*)::int as n from regulation_documents where source_id = 'src-law35' and page_number is not null");
  const fin = await dbClient.query("select text_ar from regulation_documents where source_id = 'src-financial' and article_number = '2'");
  const art2 = String(fin.rows[0]?.text_ar ?? '');
  check(
    'مخطط PostgreSQL وسجل اللوائح محمّلان: 3 مصادر و115 بنداً منها 24 OCR',
    sources.rows[0].n === 3 && docs.rows[0].n === 115 && ocr.rows[0].n === 24 && law.rows[0].n === 24,
    `مصادر=${sources.rows[0].n} بنود=${docs.rows[0].n} OCR=${ocr.rows[0].n} صفحات=${law.rows[0].n}`,
  );
  check(
    'نص المادة (2) الرسمي (60% للجنة) هو المخزَّن في PostgreSQL',
    art2.includes('60% للجنة النقابية') || art2.includes('60%'),
    art2.slice(0, 60),
  );
} catch (err) {
  check(
    requireSql ? 'اتصال PostgreSQL واختبار SQL الفعلي مطلوبان' : 'اختبار SQL الفعلي متخطّى: لم يُطلب REQUIRE_SQL',
    !requireSql,
    `${databaseConnected ? 'الاتصال موجود لكن فحص المخطط/الكتابة فشل' : 'الخادم في وضع الذاكرة'} — ${String(err.message).slice(0, 100)}`,
  );
} finally {
  if (dbClient) await dbClient.end().catch(() => undefined);
}

const passed = results.filter((r) => r.ok).length;
for (const r of results) console.log(`${r.ok ? '  PASS  ' : '  FAIL  '}${r.label}${r.detail ? ` — ${r.detail}` : ''}`);
console.log(`\nالنتيجة الحيّة: ${passed} ناجح / ${results.length - passed} فاشل`);
process.exit(passed === results.length ? 0 : 1);
