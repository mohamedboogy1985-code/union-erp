/**
 * ===== إصلاح انحراف المخطط (Schema Drift Repair) — البند P0-4 =====
 * المرجع: docs/AI_AGENT_AUDIT.md
 *
 * المشكلة: `server/db/pg-schema.sql` يُنفَّذ مرة واحدة فقط عند غياب الجداول
 * (`ensureTables`)، أي أن أي تصحيح لاحق في المخطط — مثل تحويل أعمدة الأموال من
 * `double precision` إلى `numeric(18,2)` في PR #38 — **لا يصل أبداً** إلى قاعدة
 * قائمة بالفعل. النتيجة المقيسة حيّاً: `accounts.current_balance -> double precision`
 * رغم أن `src/db/schema.ts` يعلنها `numeric(18,2)`.
 *
 * الحل: مصالحة المخطط عند كل إقلاع — الملف المرجعي (DDL) هو المصدر الوحيد للحقيقة:
 *   1) أعمدة ناقصة في القاعدة → `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`.
 *   2) أعمدة معلنة `numeric(p,s)` في DDL لكنها `double precision/real/text` في
 *      القاعدة → `ALTER TABLE ... ALTER COLUMN ... TYPE numeric(p,s) USING round(...)`.
 *   3) فهارس فريدة معلنة في DDL → `CREATE UNIQUE INDEX IF NOT EXISTS`.
 *
 * كل جملة تُنفَّذ منفردة وداخل try/catch: فشل عمود واحد لا يمنع الإقلاع ولا يمنع
 * بقية الإصلاحات، ويُسجَّل في التقرير المُعاد (وتكتبه postgresSync في السجل).
 */
import fs from 'fs';
import path from 'path';
import { getPool } from '../../src/db/index.ts';
import { moduleDir, resolveFirst } from '../utils/runtime-paths.js';

const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]*$/;

export interface ColumnSpec {
  name: string;
  /** النوع كما هو معلن في DDL، مثل: numeric(18,2) أو double precision أو text */
  type: string;
  notNull: boolean;
  defaultExpr?: string;
  primaryKey?: boolean;
}

export type DriftAction = 'ADD_COLUMN' | 'ALTER_TYPE' | 'ADD_UNIQUE_INDEX' | 'SKIP_UNSAFE';

export interface DriftFix {
  table: string;
  column: string;
  action: DriftAction;
  detail: string;
}

export interface DriftReport {
  applied: DriftFix[];
  errors: string[];
  tablesChecked: number;
  columnsChecked: number;
  dbAvailable: boolean;
}

/** أنواع الأموال التي يجب أن تكون numeric — أي نوع آخر يُعدّ انحرافاً قابلاً للإصلاح */
const MONEY_LIKE_DB_TYPES = new Set(['double precision', 'real', 'text', 'character varying', 'integer', 'bigint', 'smallint']);

/**
 * محلّل DDL بسيط ومقصود: يقرأ ملف `pg-schema.sql` المولَّد من drizzle ويعيد
 * لجداوله وأعمدتها وأنواعها. لا يعتمد على أي مكتبة خارجية حتى يعمل داخل الحزمة.
 */
export function parseSchemaDdl(ddl: string): Map<string, ColumnSpec[]> {
  const tables = new Map<string, ColumnSpec[]>();

  // Statement-breakpoint comments may be separated by blank lines. Stop at the
  // table's own closing `);` rather than consuming the next table as this one.
  for (const tableMatch of ddl.matchAll(/CREATE TABLE "([^"]+)" \(([\s\S]*?)\);/g)) {
    const table = tableMatch[1];
    const body = tableMatch[2];
    const columns: ColumnSpec[] = [];

    for (const rawLine of body.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('CONSTRAINT')) continue;
      const colMatch = line.match(/^"([^"]+)"\s+(.+?)(?:,)?$/);
      if (!colMatch) continue;

      const name = colMatch[1];
      let rest = colMatch[2].trim().replace(/,$/, '');

      // النوع: قد يكون كلمتين (double precision) أو دالة بوسائط (numeric(18,2))
      const typeMatch = rest.match(/^(double precision|character varying|[A-Za-z]+(?:\([^)]*\))?)/);
      if (!typeMatch) continue;
      const type = typeMatch[1].toLowerCase();
      rest = rest.slice(typeMatch[1].length).trim();

      const notNull = /NOT NULL/i.test(rest);
      const defaultMatch = rest.match(/DEFAULT\s+(.+?)(?:\s+NOT NULL|$)/i);

      columns.push({
        name,
        type,
        notNull,
        defaultExpr: defaultMatch ? defaultMatch[1].trim() : undefined,
        primaryKey: /PRIMARY KEY/i.test(rest),
      });
    }

    if (columns.length > 0) tables.set(table, columns);
  }

  return tables;
}

/** فهارس فريدة معلنة داخل DDL (تُسمّى بأسماء أعمدة واضحة) */
export function parseUniqueIndexes(ddl: string): { name: string; table: string; column: string }[] {
  const indexes: { name: string; table: string; column: string }[] = [];
  for (const m of ddl.matchAll(/CREATE UNIQUE INDEX "([^"]+)" ON "([^"]+)" \("([^"]+)"\)/g)) {
    indexes.push({ name: m[1], table: m[2], column: m[3] });
  }
  return indexes;
}

/** مسار ملف المخطط المرجعي (نفس مسارات postgresSync ليعمل داخل الحزمة والاختبارات) */
export function resolveSchemaDdlPath(): string | null {
  const MODULE_DIR = moduleDir(typeof import.meta !== 'undefined' ? import.meta.url : undefined);
  return resolveFirst([
    path.join(process.cwd(), 'server', 'db', 'pg-schema.sql'),
    path.join(MODULE_DIR, 'pg-schema.sql'),
    path.join(MODULE_DIR, '..', 'server', 'db', 'pg-schema.sql'),
  ]);
}

function normalizeDbType(udt: string, numericPrecision: number | null, numericScale: number | null): string {
  if (udt === 'numeric') return `numeric(${numericPrecision ?? '?'},${numericScale ?? '?'})`;
  if (udt === 'character varying') return 'character varying';
  return udt;
}

/**
 * مصالحة القاعدة الحالية مع DDL. تُرجع تقريراً بكل ما طُبِّق وبكل خطأ حدث.
 * لا تُطلق استثناءات: أي فشل يُسجَّل في `errors` ويستمر الإقلاع.
 */
export async function repairSchemaDrift(options: { ddlPath?: string; dryRun?: boolean } = {}): Promise<DriftReport> {
  const report: DriftReport = { applied: [], errors: [], tablesChecked: 0, columnsChecked: 0, dbAvailable: false };

  let ddlText: string;
  if (options.ddlPath) {
    ddlText = fs.readFileSync(options.ddlPath, 'utf-8');
  } else {
    const resolved = resolveSchemaDdlPath();
    if (!resolved) {
      report.errors.push('ملف المخطط المرجعي pg-schema.sql غير موجود — تخطّي مصالحة المخطط.');
      return report;
    }
    ddlText = fs.readFileSync(resolved, 'utf-8');
  }

  const expected = parseSchemaDdl(ddlText);
  const expectedIndexes = parseUniqueIndexes(ddlText);
  const pool = getPool();

  let liveColumns: { table_name: string; column_name: string; data_type: string; numeric_precision: number | null; numeric_scale: number | null; is_nullable: string }[];
  try {
    const res = await pool.query(
      `SELECT table_name, column_name, data_type, numeric_precision, numeric_scale, is_nullable
         FROM information_schema.columns
        WHERE table_schema = 'public'`
    );
    liveColumns = res.rows;
    report.dbAvailable = true;
  } catch (error: any) {
    report.errors.push(`تعذّر قراءة معلومات المخطط: ${error?.message || error}`);
    return report;
  }

  const liveByTable = new Map<string, Map<string, (typeof liveColumns)[number]>>();
  for (const row of liveColumns) {
    if (!liveByTable.has(row.table_name)) liveByTable.set(row.table_name, new Map());
    liveByTable.get(row.table_name)!.set(row.column_name, row);
  }

  for (const [table, columns] of expected) {
    const liveTable = liveByTable.get(table);
    if (!liveTable) continue; // الجدول غير موجود → ensureTables مسؤولة عنه
    if (!SAFE_IDENT.test(table)) continue;
    report.tablesChecked += 1;

    for (const column of columns) {
      if (!SAFE_IDENT.test(column.name)) continue;
      report.columnsChecked += 1;
      const live = liveTable.get(column.name);

      if (!live) {
        const defaultClause = column.defaultExpr ? ` DEFAULT ${column.defaultExpr}` : '';
        const notNullClause = column.notNull ? ' NOT NULL' : '';
        const statement = `ALTER TABLE "${table}" ADD COLUMN IF NOT EXISTS "${column.name}" ${column.type}${defaultClause}${notNullClause}`;
        try {
          if (!options.dryRun) await pool.query(statement);
          report.applied.push({ table, column: column.name, action: 'ADD_COLUMN', detail: `${column.type}${defaultClause}${notNullClause}` });
        } catch (error: any) {
          report.errors.push(`ADD COLUMN ${table}.${column.name}: ${error?.message || error}`);
        }
        continue;
      }

      const liveType = normalizeDbType(live.data_type, live.numeric_precision, live.numeric_scale);
      const shouldBeNumeric = column.type.startsWith('numeric(');
      const isNumericMoneyDrift = shouldBeNumeric && MONEY_LIKE_DB_TYPES.has(live.data_type);
      const isExactSame = liveType === column.type;

      if (isExactSame || !isNumericMoneyDrift) continue;

      const scaleMatch = column.type.match(/numeric\(\d+,(\d+)\)/);
      const scale = scaleMatch ? Number(scaleMatch[1]) : 2;
      const statement =
        `ALTER TABLE "${table}" ALTER COLUMN "${column.name}" TYPE ${column.type} ` +
        `USING round("${column.name}"::numeric, ${scale})`;
      try {
        if (!options.dryRun) await pool.query(statement);
        report.applied.push({
          table,
          column: column.name,
          action: 'ALTER_TYPE',
          detail: `${liveType} → ${column.type}${options.dryRun ? ' (تجربة)' : ''}`,
        });
      } catch (error: any) {
        report.errors.push(`ALTER TYPE ${table}.${column.name}: ${error?.message || error}`);
      }
    }
  }

  // لقطة الأعمدة تغيّرت بإضافة أعمدة جديدة أعلاه: تُعاد قراءتها قبل إنشاء الفهارس
  if (report.applied.some((fix) => fix.action === 'ADD_COLUMN')) {
    try {
      const refreshed = await pool.query(
        `SELECT table_name, column_name, data_type, numeric_precision, numeric_scale, is_nullable
           FROM information_schema.columns WHERE table_schema = 'public'`
      );
      liveByTable.clear();
      for (const row of refreshed.rows) {
        if (!liveByTable.has(row.table_name)) liveByTable.set(row.table_name, new Map());
        liveByTable.get(row.table_name)!.set(row.column_name, row);
      }
    } catch (error) {
      /* الإصلاحات المُطبَّقة تبقى صالحة — الفهارس تُنشأ في الإقلاع التالي */
    }
  }

  // فهارس فريدة ناقصة (مثل تسلسل سجل التدقيق: يمنع إعادة كتابة/إعادة ترتيب الأحداث)
  for (const index of expectedIndexes) {
    if (!SAFE_IDENT.test(index.name) || !SAFE_IDENT.test(index.table) || !SAFE_IDENT.test(index.column)) {
      report.applied.push({ table: index.table, column: index.column, action: 'SKIP_UNSAFE', detail: `اسم فهرس غير آمن: ${index.name}` });
      continue;
    }
    const liveTable = liveByTable.get(index.table);
    if (!liveTable || !liveTable.has(index.column)) continue; // الجدول/العمود غير موجود → أُضيف أعلاه يُعالج في الإقلاع التالي
    try {
      const exists = await pool.query(
        `SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = $1`,
        [index.name]
      );
      if (exists.rowCount && exists.rowCount > 0) continue;
      // الفهرس الفريد لا يُنشأ إن كانت البيانات الحالية مكررة — الفشل يُسجَّل فقط
      if (!options.dryRun) await pool.query(`CREATE UNIQUE INDEX IF NOT EXISTS "${index.name}" ON "${index.table}" ("${index.column}")`);
      report.applied.push({ table: index.table, column: index.column, action: 'ADD_UNIQUE_INDEX', detail: index.name });
    } catch (error: any) {
      report.errors.push(`CREATE UNIQUE INDEX ${index.name}: ${error?.message || error}`);
    }
  }

  return report;
}
