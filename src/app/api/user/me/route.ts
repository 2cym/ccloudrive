import { getDb } from '@/db/client';
import { findUserById, resetMonthlyQuotaIfNeeded } from '@/db/queries/users';
import { ok, handler } from '@/lib/api-response';
import { Errors } from '@/lib/errors';
import { computeQuota } from '@/lib/quota';
import { auth } from '@/lib/auth';
import type { MeResponse } from '@/types/api';

/**
 * GET /api/user/me
 *
 * 返回用户信息 + 完整配额快照（总存储 / 本月上传 / 剩余 / 重置时间）。
 *
 * 惰性重置：先尝试 resetMonthlyQuotaIfNeeded()，跨月时把 monthlyUploadUsed
 * 归零并推进 uploadQuotaResetAt；未跨月则是空操作（条件 UPDATE 命中 0 行）。
 * 这样读接口在绝大多数请求下不产生写，保护 D1 每日写入额度。
 */
export const GET = handler(async () => {
  const session = await auth();
  if (!session?.user?.id) throw Errors.unauthorized();

  const db = getDb();

  // 跨月则重置（幂等、低频）
  await resetMonthlyQuotaIfNeeded(db, session.user.id);

  const user = await findUserById(db, session.user.id);
  if (!user) throw Errors.unauthorized();
  if (user.isDisabled) throw Errors.userDisabled();

  const quota = computeQuota(user);

  const payload: MeResponse = {
    user: {
      id: user.id,
      email: user.email,
      name: user.name ?? '',
      avatar: user.avatar ?? null,
      role: user.role,
    },
    quota,
  };

  return ok(payload);
});
