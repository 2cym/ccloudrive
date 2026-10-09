import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { DrizzleAdapter } from '@auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

import { getDbFromEnv, getCloudflareEnv } from '@/db/client';
import type { Db } from '@/db/client';
import { users, accounts, sessions, verificationTokens } from '@/db/schema';
import { verifyPassword } from '@/lib/password';

/**
 * Auth.js v5 在 Cloudflare Workers 上的配置。
 *
 * 关键点：
 * 1. 使用 @auth/drizzle-adapter（不是 PrismaAdapter）—— 完全跑在 D1 上。
 * 2. Credentials Provider 必须使用 JWT session 策略，
 *    因为 Auth.js 的 Credentials 不写数据库 session。
 *    adapter 仍负责 users/accounts 持久化，role 等业务字段通过 jwt 回调注入。
 * 3. 密码用 Web Crypto PBKDF2（见 lib/password.ts），不使用 bcrypt 原生库。
 */

const credentialsSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const { handlers, auth, signIn, signOut } = NextAuth(() => {
  // 延迟到请求时解析绑定：NextAuth 回调函数体内才会真正被调用
  let cached: Db | null = null;
  const db = (): Db => {
    if (!cached) cached = getDbFromEnv(getCloudflareEnv());
    return cached;
  };

  return {
    adapter: DrizzleAdapter(db(), {
      usersTable: users,
      accountsTable: accounts,
      sessionsTable: sessions,
      verificationTokensTable: verificationTokens,
    }),

    session: { strategy: 'jwt' },

    pages: {
      signIn: '/login',
      error: '/login',
    },

    providers: [
      Credentials({
        name: 'credentials',
        credentials: {
          email: { label: '邮箱', type: 'email' },
          password: { label: '密码', type: 'password' },
        },
        async authorize(raw) {
          const parsed = credentialsSchema.safeParse(raw);
          if (!parsed.success) return null;
          const { email, password } = parsed.data;

          const rows = await db()
            .select()
            .from(users)
            .where(eq(users.email, email.toLowerCase().trim()))
            .limit(1);

          const user = rows[0];
          if (!user || !user.passwordHash) return null;
          if (user.isDisabled) return null;

          const ok = await verifyPassword(password, user.passwordHash);
          if (!ok) return null;

          return {
            id: user.id,
            email: user.email,
            name: user.name ?? '',
            role: user.role,
          };
        },
      }),
    ],

    callbacks: {
      async jwt({ token, user }) {
        if (user) {
          // 登录瞬间注入业务字段
          token.id = (user as { id: string }).id;
          token.role = (user as { role?: string }).role ?? 'user';
        }
        // 后续请求刷新角色/禁用状态，保证管理员改权限后立即生效
        if (token.id) {
          const rows = await db()
            .select({
              role: users.role,
              isDisabled: users.isDisabled,
              name: users.name,
              avatar: users.avatar,
            })
            .from(users)
            .where(eq(users.id, token.id as string))
            .limit(1);
          const fresh = rows[0];
          if (fresh) {
            token.role = fresh.role;
            token.isDisabled = fresh.isDisabled;
            token.name = fresh.name ?? token.name;
            token.picture = fresh.avatar ?? token.picture;
          }
        }
        return token;
      },

      async session({ session, token }) {
        if (session.user) {
          session.user.id = token.id as string;
          session.user.role = (token.role as string) ?? 'user';
        }
        return session;
      },
    },

    trustHost: true,
  };
});
