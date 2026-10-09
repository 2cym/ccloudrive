import type { Session } from 'next-auth';

import { auth } from '@/lib/auth';
import { getDb } from '@/db/client';
import { findUserById } from '@/db/queries/users';
import { Errors } from '@/lib/errors';
import type { Db } from '@/db/client';
import type { User } from '@/db/schema';

/**
 * 认证 / 授权守卫。
 *
 * 设计要点：
 * 1. 会话来自 JWT，但角色以 D1 为准 —— 防止「管理员被降权后旧 token 仍生效」。
 *    JWT 里有 role 是为了少查库，但 admin 这种高权限操作必须回源校验。
 * 2. 一次请求内只查一次库，返回 { db, user } 供 handler 复用。
 * 3. 所有 admin 路由统一调用 requireAdmin()，不重复写 if (role !== 'admin')。
 */

export type AuthContext = {
  db: Db;
  user: User;
  session: Session;
};

/** 要求已登录。返回用户与 db 实例。 */
export async function requireAuth(): Promise<AuthContext> {
  const session = await auth();
  if (!session?.user?.id) throw Errors.unauthorized();

  const db = getDb();
  const user = await findUserById(db, session.user.id);
  if (!user) throw Errors.unauthorized();
  if (user.isDisabled) throw Errors.userDisabled();

  return { db, user, session };
}

/** 要求管理员。非管理员一律 403，不泄露「该资源存在」的信息。 */
export async function requireAdmin(): Promise<AuthContext> {
  const ctx = await requireAuth();
  if (ctx.user.role !== 'admin') throw Errors.forbidden();
  return ctx;
}
