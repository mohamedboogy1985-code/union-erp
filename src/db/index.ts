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
    // دعم DATABASE_URL الكامل إن وجد، وإلا تجميع من الأجزاء
    const connectionString = process.env.DATABASE_URL || process.env.SQL_CONNECTION_STRING;
    const baseConfig: any = connectionString
      ? { connectionString }
      : {
          host: process.env.SQL_HOST || process.env.PGHOST || '127.0.0.1',
          port: Number(process.env.SQL_PORT || process.env.PGPORT || 5432),
          user: process.env.SQL_USER || process.env.PGUSER,
          password: process.env.SQL_PASSWORD || process.env.PGPASSWORD,
          database: process.env.SQL_DB_NAME || process.env.PGDATABASE,
        };

    global._postgresPool = new Pool({
      ...baseConfig,
      max: Number(process.env.PG_POOL_MAX || 20),
      min: Number(process.env.PG_POOL_MIN || 2),
      idleTimeoutMillis: Number(process.env.PG_IDLE_TIMEOUT || 30000),
      connectionTimeoutMillis: Number(process.env.PG_CONN_TIMEOUT || 5000),
      statement_timeout: Number(process.env.PG_STATEMENT_TIMEOUT || 30000),
      query_timeout: Number(process.env.PG_QUERY_TIMEOUT || 30000),
      keepAlive: true,
      ssl: process.env.PG_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
    });

    global._postgresPool.on('error', (err) => {
      console.error('Unexpected error on idle SQL pool client:', err);
    });
    global._postgresPool.on('connect', () => {
      // تحسين إعدادات الجلسة للأداء
      // console.debug('PG pool client connected');
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
