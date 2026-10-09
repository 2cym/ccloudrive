import { z } from 'zod';

import { getDb } from '@/db/client';
import { activityLogs } from '@/db/schema';
import {
  findUserByEmail,
  resetMonthlyQuotaIfNeeded,
} from '@/db/queries/users';
import { uuid, verifyPassword } from '@/lib/password';
import { ok, handler, readJson } from '@/lib/api-response';
import { Errors } from '@/lib/errors';
import { rateLimit, RateLimits, getClientIp } from '@/lib/rate-limit';
import { computeQuota } from '@/lib/quota';

/**
 * POST /api/auth/login
 *
 * 说明：这里做「凭证预检」，真正的 session 建立由前端调用
 * Auth.js 的 signIn('credentials') 完成（写 JWT cookie）。
 *
 * 为什么不在这里直接返回 token：
 * Auth.js 的 cookie 必须由它自己的 handler 设置，手写容易踩
 * __Host- 前缀 / CSRF token 的坑。所以拆成两步：
 *   1) POST /api/auth/login   → 校验凭证，返回用户概要（可选，用于前端体验）
 *   2) signIn('credentials')  → 建立真正的会话
 *
 * 若你希望一步到位，可直接在前端调用 signIn()，本接口则作为
 * 「友好错误提示 + 限流」的前置层保留。
 */

const loginSchema = z.object({
  email: z
    .string()
    .min(1, '请输入邮箱')
    .email('邮箱格式不正确')
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, '请输入密码'),
});

export const POST = handler(async (req: Request) => {
  const db = getDb();
  const ip = getClientIp(req);

  const rl = await rateLimit(
    `login:${ip}`,
    RateLimits.login.limit,
    RateLimits.login.window,
  );
  if (!rl.allowed) throw Errors.rateLimited('登录尝试过于频繁，请稍后再试');

  const body = await readJson(req);
  const parsed = loginSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    throw Errors.validation(first.message, first.path.join('.') || undefined);
  }
  const { email, password } = parsed.data;

  const user = await findUserByEmail(db, email);
  // 统一错误信息，不区分「邮箱不存在」与「密码错误」，防账号枚举
  if (!user || !user.passwordHash) throw Errors.invalidCredentials();

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) throw Errors.invalidCredentials();

  if (user.isDisabled) throw Errors.userDisabled();

  // 登录时顺手做一次惰性重置（低频，幂等）
  await resetMonthlyQuotaIfNeeded(db, user.id);

  try {
    await db.insert(activityLogs).values({
      id: uuid(),
      userId: user.id,
      action: 'login',
      targetId: null,
      ip,
      createdAt: new Date(),
    });
  } catch (logErr) {
    console.error('[login] 写日志失败:', logErr);
  }

  return ok({
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? '',
      avatar: user.avatar ?? null,
      role: user.role,
    },
    quota: computeQuota(user),
  });
});
