import 'dotenv/config';
import { definePrismaConfig } from '@prisma/orm-postgres/config';
import type { PrismaConfig } from '@prisma/orm-postgres/config';

/**
 * Prisma Next Configuration
 * 
 * This configuration file sets up the ORM layer for Union ERP.
 * It uses the new Prisma ORM v2 with PostgreSQL database.
 * 
 * @see https://www.prisma.io/docs/orm/reference/prisma-schema-reference
 */
export default definePrismaConfig({
  orm: {
    contract: './src/prisma/contract.prisma',
    db: {
      connection: process.env.DATABASE_URL || '',
    },
  },
} as PrismaConfig);
