import type { DefaultSession } from 'next-auth';

/**
 * Workers 绑定类型。
 * wrangler.toml 中的三个 binding 在这里声明，供 getCloudflareContext().env 使用。
 */
declare global {
  interface CloudflareEnv {
    DB: D1Database;
    BUCKET: R2Bucket;
    KV: KVNamespace;
    ASSETS: Fetcher;

    AUTH_SECRET: string;
    AUTH_URL: string;
    NEXT_PUBLIC_APP_NAME: string;

    // 种子管理员（仅本地/初始化用）
    SEED_ADMIN_EMAIL?: string;
    SEED_ADMIN_PASSWORD?: string;
  }
}

declare module 'next-auth' {
  interface Session {
    user: {
      id: string;
      role: string;
    } & DefaultSession['user'];
  }

  interface User {
    role?: string;
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    id?: string;
    role?: string;
    isDisabled?: boolean;
  }
}

export {};
