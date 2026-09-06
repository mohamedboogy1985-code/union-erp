import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
dotenv.config();

// P2: دعم DATABASE_URL الكامل + متغيرات منفصلة
const databaseUrl = process.env.DATABASE_URL || process.env.SQL_CONNECTION_STRING;

let dbCredentials: any;
if (databaseUrl) {
  dbCredentials = { url: databaseUrl };
} else {
  const sqlHost = process.env.SQL_HOST || process.env.PGHOST || 'localhost';
  const sqlDbName = process.env.SQL_DB_NAME || process.env.PGDATABASE || 'union_erp';
  const user = process.env.SQL_ADMIN_USER || process.env.SQL_USER || process.env.PGUSER || 'union';
  const password = process.env.SQL_ADMIN_PASSWORD || process.env.SQL_PASSWORD || process.env.PGPASSWORD || 'union';
  console.log(`Using user: ${user} to connect to database at ${sqlHost}/${sqlDbName}.`);
  dbCredentials = {
    host: sqlHost,
    user,
    password,
    database: sqlDbName,
    ssl: false,
  };
}

export default defineConfig({
  schema: './src/db/schema.ts',
  out: './drizzle',
  dialect: 'postgresql',
  schemaFilter: ['public'],
  dbCredentials,
  verbose: true,
});
