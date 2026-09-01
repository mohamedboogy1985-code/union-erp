import fs from 'fs';
import path from 'path';

/**
 * ===== PostgreSQL المضمّن (Embedded PostgreSQL) =====
 * يشغّل خادم PostgreSQL حقيقي محلياً (ثنائيات عبر حزمة npm embedded-postgres)
 * تلقائياً عند إقلاع التطبيق عندما لا تكون قاعدة خارجية مضبوطة.
 *
 * - البيانات تبقى في مجلد pgdata (persistent) وتصمد بين إعادة التشغيل
 * - أول تشغيل: يهيئ المجلد وينشئ قاعدة union_app والجداول
 * - مقاوم للازدواج: إن كان خادم سابق لا يزال حياً يتصل به بدل الإخفاق
 * - يزيل ملف القفل القديم تلقائياً إذا انهار الخادم السابق دون تنظيف
 * - لتعطيله: DISABLE_EMBEDDED_PG=true — ولقاعدة خارجية: اضبط SQL_HOST
 */

const DEFAULT_DATA_DIR = path.join(process.cwd(), 'pgdata');

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

export async function maybeStartEmbeddedPostgres(): Promise<boolean> {
  if (process.env.DISABLE_EMBEDDED_PG === 'true') return false;
  if (process.env.SQL_HOST) return false; // قاعدة خارجية مضبوطة يدوياً

  try {
    const dataDir = process.env.PG_DATA_DIR || DEFAULT_DATA_DIR;
    const port = Number(process.env.SQL_PORT || 5432);
    const user = process.env.SQL_USER || 'postgres';
    const password = process.env.SQL_PASSWORD || 'postgres';
    const dbName = process.env.SQL_DB_NAME || 'union_app';

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
    });

    const alreadyInitialized = fs.existsSync(path.join(dataDir, 'PG_VERSION'));
    if (!alreadyInitialized) {
      await pg.initialise();
      console.log('🆕 تم تهيئة مجلد بيانات PostgreSQL المضمّن لأول مرة...');
    } else {
      cleanStaleLock(dataDir); // تنظيف قفل انهيار سابق إن وجد
    }

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
    console.log(`🐘 PostgreSQL المضمّن يعمل الآن على المنفذ ${port} (البيانات: ${dataDir})`);

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
