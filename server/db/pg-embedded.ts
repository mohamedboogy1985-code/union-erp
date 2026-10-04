import fs from 'fs';
import path from 'path';
import { isIP } from 'node:net';
import { resolvePgDataDir } from '../utils/data-paths.js';

/**
 * ===== PostgreSQL المضمّن (Embedded PostgreSQL) =====
 * يشغّل خادم PostgreSQL حقيقي محلياً (ثنائيات عبر حزمة npm embedded-postgres)
 * تلقائياً عند إقلاع التطبيق عندما لا تكون قاعدة خارجية مضبوطة.
 *
 * - البيانات تبقى في مجلد pgdata (persistent) وتصمد بين إعادة التشغيل
 * - أول تشغيل: يهيئ المجلد وينشئ قاعدة union_app والجداول
 * - مقاوم للازدواج: إن كان خادم سابق لا يزال حياً يتصل به بدل الإخفاق
 * - يزيل ملف القفل القديم تلقائياً إذا انهار الخادم السابق دون تنظيف
 * - يستمع على 127.0.0.1 افتراضياً؛ لا يحتاج المتصفح إلى منفذ SQL مباشر.
 *   للوصول الشبكي الصريح: SQL_LISTEN_ADDRESSES + SQL_ALLOWED_CIDRS وكلمة سر غير افتراضية.
 * - لتعطيله: DISABLE_EMBEDDED_PG=true — ولقاعدة خارجية: اضبط SQL_HOST أو DATABASE_URL
 */

interface EmbeddedPgHandle {
  initialise(): Promise<void>;
  start(): Promise<void>;
  createDatabase(name: string): Promise<void>;
}

/** فحص حياة خادم PostgreSQL على المنفذ المطلوب */
async function isPostgresAlive(port: number, user: string, password: string): Promise<boolean> {
  try {
    const { Client } = await import('pg');
    const client = new Client({
      host: 'localhost',
      port,
      user,
      password,
      database: 'postgres',
      connectionTimeoutMillis: 2500,
    });
    await client.connect();
    await client.end();
    return true;
  } catch {
    return false;
  }
}

/** إنشاء قاعدة البيانات إن لم تكن موجودة (عبر اتصال مباشر) */
async function ensureDatabase(port: number, user: string, password: string, dbName: string): Promise<void> {
  const { Client } = await import('pg');
  const client = new Client({ host: 'localhost', port, user, password, database: 'postgres', connectionTimeoutMillis: 3000 });
  await client.connect();
  const exists = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [dbName]);
  if (exists.rowCount === 0) {
    await client.query(`CREATE DATABASE ${client.escapeIdentifier(dbName)}`);
    console.log(`🆕 تم إنشاء قاعدة البيانات [${dbName}]`);
  }
  await client.end();
}

/** إزالة ملف قفل postmaster قديم لعملية ميتة (بعد انهيار دون تنظيف) */
function cleanStaleLock(dataDir: string): boolean {
  const pidFile = path.join(dataDir, 'postmaster.pid');
  if (!fs.existsSync(pidFile)) return false;
  try {
    const pid = Number(fs.readFileSync(pidFile, 'utf-8').split('\n')[0]);
    process.kill(pid, 0); // يرمي خطأ إذا كانت العملية ميتة
    return false; // الخادم حي فعلاً — لا تلمس القفل
  } catch {
    try {
      fs.unlinkSync(pidFile);
      console.log('🧹 تمت إزالة ملف قفل PostgreSQL قديم لعملية منتهية.');
      return true;
    } catch {
      return false;
    }
  }
}

const OLD_AUTO_HBA_MARKER = '# تعريض الشبكة (يُضاف تلقائياً): اتصال من أي عنوان بكلمة سرية';
const MANAGED_HBA_START = '# BEGIN UNION ERP MANAGED REMOTE ACCESS';
const MANAGED_HBA_END = '# END UNION ERP MANAGED REMOTE ACCESS';

function isValidCidr(value: string): boolean {
  const slash = value.lastIndexOf('/');
  if (slash <= 0) return false;
  const address = value.slice(0, slash).trim();
  const prefix = Number(value.slice(slash + 1));
  const version = isIP(address);
  return version === 4
    ? Number.isInteger(prefix) && prefix >= 0 && prefix <= 32
    : version === 6 && Number.isInteger(prefix) && prefix >= 0 && prefix <= 128;
}

function isLoopbackOnly(listenAddresses: string): boolean {
  const addresses = listenAddresses.split(',').map((address) => address.trim().toLowerCase()).filter(Boolean);
  return addresses.length > 0 && addresses.every((address) =>
    address === 'localhost' || address === '127.0.0.1' || address === '::1',
  );
}

/**
 * PostgreSQL is local-only by default. If a deployment explicitly requests a
 * non-loopback listener, only the validated SQL_ALLOWED_CIDRS are added to
 * pg_hba.conf; no wildcard network rule is generated implicitly.
 */
function ensureNetworkExposure(dataDir: string, listenAddresses: string, allowedCidrs: string[]): void {
  const confPath = path.join(dataDir, 'postgresql.conf');
  const hbaPath = path.join(dataDir, 'pg_hba.conf');

  try {
    if (fs.existsSync(confPath)) {
      const conf = fs.readFileSync(confPath, 'utf-8');
      const line = `listen_addresses = '${listenAddresses}'`;
      const pattern = /^[ \t]*#?[ \t]*listen_addresses[ \t]*=.*$/m;
      const next = pattern.test(conf) ? conf.replace(pattern, line) : `${conf}\n${line}\n`;
      if (next !== conf) fs.writeFileSync(confPath, next, 'utf-8');
    }
  } catch (err: any) {
    console.warn(`⚠️ تعذّر ضبط listen_addresses في postgresql.conf: ${err?.message || err}`);
  }

  try {
    if (!fs.existsSync(hbaPath)) return;
    const original = fs.readFileSync(hbaPath, 'utf-8');
    const lines = original.split(/\r?\n/);
    const cleaned: string[] = [];
    let inManagedBlock = false;
    let afterOldMarker = false;

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed === MANAGED_HBA_START) {
        inManagedBlock = true;
        continue;
      }
      if (inManagedBlock) {
        if (trimmed === MANAGED_HBA_END) inManagedBlock = false;
        continue;
      }
      if (trimmed === OLD_AUTO_HBA_MARKER) {
        afterOldMarker = true;
        continue;
      }
      if (afterOldMarker && /^host\s+all\s+all\s+(?:0\.0\.0\.0\/0|::\/0)\s+password$/i.test(trimmed)) {
        continue;
      }
      afterOldMarker = false;
      cleaned.push(line);
    }

    if (allowedCidrs.length > 0) {
      const existing = new Set(cleaned.map((line) => line.trim()));
      const rules = allowedCidrs
        .map((cidr) => `host all all ${cidr} scram-sha-256`)
        .filter((rule) => !existing.has(rule));
      if (rules.length > 0) {
        cleaned.push('', MANAGED_HBA_START, ...rules, MANAGED_HBA_END);
      }
    }

    const next = `${cleaned.join('\n').trimEnd()}\n`;
    if (next !== original) fs.writeFileSync(hbaPath, next, 'utf-8');
  } catch (err: any) {
    console.warn(`⚠️ تعذّر ضبط pg_hba.conf لاتصالات PostgreSQL: ${err?.message || err}`);
  }
}

export async function maybeStartEmbeddedPostgres(): Promise<boolean> {
  if (process.env.DISABLE_EMBEDDED_PG === 'true') return false;
  if (process.env.SQL_HOST || process.env.DATABASE_URL) return false; // قاعدة خارجية مضبوطة يدوياً

  try {
    // يُحلّ وقت الإقلاع من نفس دالة مؤشّر «مجلد البيانات» (PG_DATA_DIR ← cwd/pgdata)
    const dataDir = resolvePgDataDir().path;
    const port = Number(process.env.SQL_PORT || 5432);
    const user = process.env.SQL_USER || 'postgres';
    const password = process.env.SQL_PASSWORD || 'postgres';
    const dbName = process.env.SQL_DB_NAME || 'union_app';
    // واجهة SQL لا تحتاج أن تكون مكشوفة للمتصفح؛ اربطها محلياً افتراضياً.
    const listenAddresses = process.env.SQL_LISTEN_ADDRESSES || '127.0.0.1';
    const remoteListener = !isLoopbackOnly(listenAddresses);
    const allowedCidrs = (process.env.SQL_ALLOWED_CIDRS || '')
      .split(',')
      .map((cidr) => cidr.trim())
      .filter(Boolean);

    if (remoteListener) {
      if (password.length < 16 || password === 'postgres') {
        throw new Error('يتطلب تعريض PostgreSQL للشبكة SQL_PASSWORD غير افتراضية بطول 16 محرفاً على الأقل.');
      }
      if (allowedCidrs.length === 0 || allowedCidrs.some((cidr) => !isValidCidr(cidr))) {
        throw new Error('يتطلب تعريض PostgreSQL للشبكة قائمة SQL_ALLOWED_CIDRS صحيحة ومحددة.');
      }
    }

    // 1) خادم حي بالفعل (إقلاع متكرر/نسخة سابقة) — اتصل به مباشرة
    if (await isPostgresAlive(port, user, password)) {
      console.log(`🐘 PostgreSQL يعمل بالفعل على المنفذ ${port} — سيتم استخدام القائمة الحالية.`);
      await ensureDatabase(port, user, password, dbName);
      process.env.SQL_HOST = 'localhost';
      process.env.SQL_USER = user;
      process.env.SQL_PASSWORD = password;
      process.env.SQL_DB_NAME = dbName;
      return true;
    }

    const mod: any = await import('embedded-postgres');
    const EmbeddedPostgres = mod.default || mod;

    const pg: EmbeddedPgHandle = new EmbeddedPostgres({
      databaseDir: dataDir,
      user,
      password,
      port,
      persistent: true,
      // رفع الاستماع عن localhost إلى العنوان المطلوب (0.0.0.0 افتراضياً)
      postgresFlags: ['-c', `listen_addresses=${listenAddresses}`],
    });

    const alreadyInitialized = fs.existsSync(path.join(dataDir, 'PG_VERSION'));
    if (!alreadyInitialized) {
      await pg.initialise();
      console.log('🆕 تم تهيئة مجلد بيانات PostgreSQL المضمّن لأول مرة...');
    } else {
      cleanStaleLock(dataDir); // تنظيف قفل انهيار سابق إن وجد
    }

    // 1.b ثبّت عنوان الاستماع وسياسة CIDR قبل تشغيل قاعدة البيانات.
    ensureNetworkExposure(dataDir, listenAddresses, remoteListener ? allowedCidrs : []);

    // 2) تشغيل الخادم (مع إعادة محاولة واحدة بعد تنظيف قفل مكتشف هنا)
    try {
      await pg.start();
    } catch {
      if (cleanStaleLock(dataDir)) {
        await pg.start();
      } else {
        throw new Error('فشل بدء خادم PostgreSQL المضمّن');
      }
    }
    console.log(
      `🐘 PostgreSQL المضمّن يعمل الآن على المنفذ ${port} — الاستماع على ${listenAddresses} (البيانات: ${dataDir})`
    );

    await ensureDatabase(port, user, password, dbName);

    // 3) توجيه بقية النظام للمتغيرات الصحيحة
    process.env.SQL_HOST = 'localhost';
    process.env.SQL_USER = user;
    process.env.SQL_PASSWORD = password;
    process.env.SQL_DB_NAME = dbName;

    return true;
  } catch (err: any) {
    console.warn('⚠️ تعذر تشغيل PostgreSQL المضمّن — سيُستخدم وضع الذاكرة:', err?.message || err);
    return false;
  }
}
