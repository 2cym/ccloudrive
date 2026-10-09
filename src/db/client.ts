import { getCloudflareContext } from '@opennextjs/cloudflare';
import { drizzle } from 'drizzle-orm/d1';

import * as schema from './schema';

/**
 * D1 客户端。
 *
 * Workers 上没有全局 env，必须通过 getCloudflareContext() 拿绑定。
 * Drizzle 只 import 'drizzle-orm/d1' 子模块，避免打包所有方言（控制包体积）。
 *
 * NextAuth 的初始化时机早于请求上下文，不能在其中直接调用 getCloudflareContext，
 * 因此额外提供 getDbFromEnv(env)，由 auth.ts 在使用时自行传入绑定。
 */

export type Db = ReturnType<typeof drizzle<typeof schema>>;

export function getCloudflareEnv(): CloudflareEnv {
  const { env } = getCloudflareContext();
  return env as unknown as CloudflareEnv;
}

/** 从显式传入的 env 构造 db（供 NextAuth 等特殊时机使用） */
export function getDbFromEnv(env: CloudflareEnv): Db {
  if (!env.DB) {
    throw new Error('D1 binding `DB` is not configured in wrangler.toml');
  }
  return drizzle(env.DB, { schema });
}

/** 常规请求内使用：从当前请求上下文取绑定 */
export function getDb(): Db {
  return getDbFromEnv(getCloudflareEnv());
}

export { schema };
