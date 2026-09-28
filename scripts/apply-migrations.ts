/**
 * ===== فحص هجرات قاعدة البيانات (P3) =====
 * لا ينفّذ أي DDL: يقرأ ملفات `server/db/migrations` بالترتيب ويفحص ما هو مطبَّق فعلاً
 * على قاعدة البيانات (الجداول، الأعمدة المالية، القوائم المادية، الامتدادات)، ويطبع
 * تقريراً بما ينقص. الهدف: أن يكون «هل الهجرة مطبَّقة؟» سؤالاً قابلاً للقياس لا تخميناً.
 *
 *   npm run db:migrations:check             # فحص فقط (افتراضي)
 *   npm run db:migrations:check -- --files  # عرض الملفات وترتيبها بلا اتصال بالقاعدة
 */
import fs from 'node:fs';
import path from 'node:path';
import { postgresManager } from '../server/db/postgresSync.js';
import { getPool } from '../src/db/index.js';

const MIGRATIONS_DIR = path.resolve(process.cwd(), 'server', 'db', 'migrations');

/** الأعمدة التي تخصّها هجرة 001: يجب أن تكون numeric(18,2) */
const FINANCIAL_COLUMNS: [string, string][] = [
  ['accounts', 'current_balance'],
  ['subledger_parties', 'balance'],
  ['journal_entries', 'total_debit'],
  ['journal_entries', 'total_credit'],
  ['journal_lines', 'debit'],
  ['journal_lines', 'credit'],
  ['receipts', 'amount'],
];

/** ما تثبته بقية الهجرات */
const EXPECTED_INDEXES = [
  'accounts_name_trgm_idx',
  'journal_entries_org_status_date_idx',
  'journal_lines_account_entry_idx',
  'audit_logs_org_timestamp_idx',
];
const EXPECTED_MATERIALIZED_VIEWS = ['mv_trial_balance', 'mv_monthly_income_expense'];
const EXPECTED_TABLES = ['kb_embeddings', 'rag_search_logs'];
const EXPECTED_EXTENSIONS = ['pg_trgm'];

function listMigrationFiles(): string[] {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((file) => file.endsWith('.sql'))
    .sort();
}

async function check(): Promise<void> {
  const files = listMigrationFiles();
  console.log(`📁 ملفات الهجرات (${files.length}):`);
  for (const file of files) console.log(`   - ${file}`);

  if (process.argv.includes('--files')) return;

  if (!postgresManager.isDbAvailable()) {
    console.log('\nℹ️ قاعدة البيانات غير متاحة — لا شيء للفحص. التطبيق يعمل كاملاً في وضع الذاكرة،');
    console.log('   وخدمة RAG تستخدم البحث المحلي TF-IDF بلا pgvector. لن يُنفَّذ أي DDL.');
    return;
  }

  const pool = getPool();
  const missing: string[] = [];

  const numeric = await pool.query(
    `SELECT table_name, column_name, data_type, numeric_precision, numeric_scale
     FROM information_schema.columns
     WHERE (table_name, column_name) IN (${FINANCIAL_COLUMNS.map((_, i) => `($${i * 2 + 1}, $${i * 2 + 2})`).join(', ')})`,
    FINANCIAL_COLUMNS.flat()
  );
  console.log('\n💰 أنواع الأعمدة المالية:');
  for (const [table, column] of FINANCIAL_COLUMNS) {
    const row = numeric.rows.find((r: any) => r.table_name === table && r.column_name === column);
    if (!row) {
      console.log(`   ⚠️ ${table}.${column}: غير موجود`);
      missing.push(`${table}.${column}`);
    } else if (row.data_type === 'numeric' && Number(row.numeric_scale) === 2) {
      console.log(`   ✅ ${table}.${column}: numeric(${row.numeric_precision},2)`);
    } else {
      console.log(`   ❌ ${table}.${column}: ${row.data_type} — هجرة 001 لم تُطبَّق`);
      missing.push(`${table}.${column}`);
    }
  }

  const indexes = await pool.query(`SELECT indexname FROM pg_indexes WHERE schemaname = 'public'`);
  const indexNames = new Set(indexes.rows.map((r: any) => r.indexname));
  console.log('\n⚡ فهارس الأداء (هجرة 002):');
  for (const index of EXPECTED_INDEXES) {
    if (indexNames.has(index)) console.log(`   ✅ ${index}`);
    else {
      console.log(`   ❌ ${index} مفقود`);
      missing.push(index);
    }
  }

  const matviews = await pool.query(`SELECT matviewname FROM pg_matviews`);
  const matviewNames = new Set(matviews.rows.map((r: any) => r.matviewname));
  console.log('\n📊 القوائم المادية (هجرة 003):');
  for (const view of EXPECTED_MATERIALIZED_VIEWS) {
    if (matviewNames.has(view)) console.log(`   ✅ ${view}`);
    else {
      console.log(`   ❌ ${view} مفقود`);
      missing.push(view);
    }
  }

  const rls = await pool.query(`SELECT relname, relrowsecurity FROM pg_class WHERE relname IN ('journal_entries','journal_lines','receipts','audit_logs')`);
  const rlsOn = rls.rows.filter((r: any) => r.relrowsecurity).map((r: any) => r.relname);
  console.log(`\n🔐 RLS: ${rlsOn.length ? rlsOn.join(', ') : 'غير مُفعّل (اختياري — يحتاج app.enable_rls=on)'}`);

  const tables = await pool.query(`SELECT tablename FROM pg_tables WHERE schemaname = 'public'`);
  const tableNames = new Set(tables.rows.map((r: any) => r.tablename));
  console.log('\n🧠 جداول RAG (هجرة 004):');
  for (const table of EXPECTED_TABLES) {
    if (tableNames.has(table)) console.log(`   ✅ ${table}`);
    else {
      console.log(`   ❌ ${table} مفقود (البحث المحلي يعمل بدونه)`);
      missing.push(table);
    }
  }

  const extensions = await pool.query(`SELECT extname FROM pg_extension`);
  const extNames = new Set(extensions.rows.map((r: any) => r.extname));
  for (const extension of EXPECTED_EXTENSIONS) {
    if (extNames.has(extension)) console.log(`   ✅ امتداد ${extension}`);
    else console.log(`   ❌ امتداد ${extension} مفقود (هجرة 002)`);
  }
  if (extNames.has('vector')) console.log('   ✅ امتداد vector');
  else console.log('   ℹ️ امتداد vector غير مثبَّت — هجرة 004 تحتاجه');

  console.log(`\n${missing.length === 0 ? '✅ كل ما تفحصه الهجرات مطبَّق.' : `⚠️ ينقص ${missing.length} عنصراً: ${missing.join(', ')}`}`);
}

check().catch((error) => {
  console.error(`⚠️ تعذّر إكمال الفحص: ${error?.message || error}`);
  process.exitCode = 1;
});
