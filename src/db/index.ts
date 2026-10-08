import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './schema.ts';

declare global {
  // eslint-disable-next-line no-var
  var _postgresPool: Pool | undefined;
}

/**
 * إنشاء مجمّع اتصالات PostgreSQL — يُقرأ من متغيرات البيئة عند أول استخدام فعلي
 * (وليس عند الاستيراد) حتى يعمل PostgreSQL المضمّن الذي يضبط المتغيرات عند الإقلاع.
 */
export const createPool = () => {
  if (!global._postgresPool) {
    global._postgresPool = new Pool({
      host: process.env.SQL_HOST || process.env.PGHOST,
      user: process.env.SQL_USER || process.env.PGUSER,
      password: process.env.SQL_PASSWORD || process.env.PGPASSWORD,
      database: process.env.SQL_DB_NAME || process.env.PGDATABASE,
      max: 10,
      connectionTimeoutMillis: 3000,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
  }
  return global._postgresPool;
};

/** الوصول للمجمّع مباشرة (ينشأه عند أول نداء) */
export function getPool(): Pool {
  return createPool();
}

/** إعادة تهيئة الاتصال (بعد تغيّر متغيرات البيئة مثلاً) */
export function resetPool(): void {
  if (global._postgresPool) {
    global._postgresPool.end().catch(() => undefined);
    global._postgresPool = undefined;
  }
}

let _db: ReturnType<typeof drizzle> | undefined;

/** كائن drizzle كسول: يُنشأ (والمجمّع معه) عند أول استعلام فعلي */
export const db = new Proxy({} as ReturnType<typeof drizzle>, {
  get(_target, prop, receiver) {
    if (!_db) {
      _db = drizzle(getPool(), { schema });
    }
    const value = Reflect.get(_db as any, prop, receiver);
    return typeof value === 'function' ? value.bind(_db) : value;
  },
});
