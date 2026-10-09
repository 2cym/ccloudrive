import type { Config } from 'drizzle-kit';

// D1 使用 dialect: 'sqlite'，迁移产物是标准 SQL，由 wrangler d1 migrations apply 执行
export default {
  schema: './src/db/schema.ts',
  out: './drizzle/migrations',
  dialect: 'sqlite',
  driver: 'd1-http',
} satisfies Config;
