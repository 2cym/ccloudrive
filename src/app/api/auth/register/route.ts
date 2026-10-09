import { z } from 'zod';

import { getDb } from '@/db/client';
import { activityLogs } from '@/db/schema';
import {
  buildInsertUserStatement,
  deleteUserById,
  findUserByEmail,
} from '@/db/queries/users';
import {
  consumeInviteCodeStatement,
  inviteErrorFromReason,
  validateInviteCode,
} from '@/db/queries/invite-codes';
import { getAllSettings } from '@/db/queries/settings';
import { hashPassword, uuid } from '@/lib/password';
import { created, handler, readJson, toFailure } from '@/lib/api-response';
import { AppError, ErrorCode, Errors } from '@/lib/errors';
import { rateLimit, RateLimits, getClientIp } from '@/lib/rate-limit';
import { nextResetAt } from '@/lib/quota';

/**
 * POST /api/auth/register
 *
 * 原子性设计（D1 无交互式事务，只能靠 batch + 条件更新）：
 *
 *   ① batch 外：validateInviteCode() 只读校验 → 给用户精确的错误提示
 *   ② batch 内：insert(users) + consumeInviteCodeStatement() 一次原子提交
 *   ③ batch 后：检查 UPDATE 的 meta.changes
 *        changes === 0 → 并发抢跑（名额被占满/被禁用/被过期）
 *                      → 补偿删除刚插入的用户，返回 409 邀请码已用完
 *
 * 为什么不能把校验放进 batch：D1 的 batch 内部 SELECT 读的是批次快照，
 * 看不到同批次前面语句的写入结果，放在里面等于没校验。
 */

const registerSchema = z.object({
  email: z
    .string()
    .min(1, '请输入邮箱')
    .email('邮箱格式不正确')
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z
    .string()
    .min(8, '密码至少 8 位')
    .max(128, '密码过长'),
  name: z
    .string()
    .trim()
    .min(1, '请输入昵称')
    .max(50, '昵称过长')
    .optional(),
  inviteCode: z
    .string()
    .trim()
    .min(1, '请输入邀请码')
    .transform((v) => v.toUpperCase()),
});

export const POST = handler(async (req: Request) => {
  // ---- 所有绑定获取都在请求处理函数体内，绝不在模块顶层 ----
  const db = getDb();
  const ip = getClientIp(req);

  // 限流：防批量刷注册
  const rl = await rateLimit(
    `register:${ip}`,
    RateLimits.register.limit,
    RateLimits.register.window,
  );
  if (!rl.allowed) throw Errors.rateLimited('注册过于频繁，请稍后再试');

  const body = await readJson(req);
  const parsed = registerSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    throw Errors.validation(first.message, first.path.join('.') || undefined);
  }
  const { email, password, name, inviteCode } = parsed.data;

  // 系统设置：注册是否必须邀请码
  const settings = await getAllSettings(db);

  // ---- 校验 1：邮箱唯一 ----
  const existing = await findUserByEmail(db, email);
  if (existing) throw Errors.emailExists();

  // ---- 校验 2：邀请码（batch 外，只读，用于精确报错） ----
  let consumedCodeId: string | null = null;

  if (settings.requireInviteCode || inviteCode) {
    const result = await validateInviteCode(db, inviteCode);
    if (!result.ok) {
      throw inviteErrorFromReason(result.reason);
    }
    consumedCodeId = result.record.id;
  } else if (settings.requireInviteCode === false && !inviteCode) {
    // 允许无邀请码注册
    consumedCodeId = null;
  }

  // ---- 构造写入 ----
  const userId = uuid();
  const passwordHash = await hashPassword(password);
  const nowDate = new Date();
  const nowSec = Math.floor(nowDate.getTime() / 1000);

  const insertStmt = buildInsertUserStatement(db, {
    id: userId,
    email,
    passwordHash,
    name: name ?? email.split('@')[0],
    role: 'user',
    storageQuota: settings.defaultStorageQuota,
    monthlyUploadQuota: settings.defaultMonthlyUploadQuota,
    invitedByCodeId: consumedCodeId,
    registeredFrom: consumedCodeId ? 'invite' : 'direct',
  });

  // ---- 原子提交 ----
  if (consumedCodeId) {
    const [insertResult, consumeResult] = await db.batch([
      insertStmt,
      consumeInviteCodeStatement(db, consumedCodeId, nowSec),
    ]);

    // meta.changes === 0 → 并发抢跑，名额已失效
    const changed = (consumeResult as { meta?: { changes?: number } }).meta
      ?.changes;
    if (!changed) {
      // 补偿删除。即便补偿失败也必须让用户看到明确错误，不能抛 500。
      try {
        await deleteUserById(db, userId);
      } catch (cleanupErr) {
        // 补偿失败：用户已插入但邀请码未计数。
        // 不阻断响应 —— 管理员可在后台看到这个孤儿账号并处理。
        console.error(
          '[register] 补偿删除失败，存在孤儿用户:',
          userId,
          cleanupErr,
        );
      }
      throw new AppError(
        ErrorCode.INVITE_EXHAUSTED,
        '邀请码刚刚被用完，请更换邀请码',
        { field: 'inviteCode', status: 409 },
      );
    }
  } else {
    // 无需邀请码：只插入用户
    await insertStmt;
  }

  // ---- 写日志（非关键路径，失败不影响注册结果） ----
  try {
    await db.insert(activityLogs).values({
      id: uuid(),
      userId,
      action: 'register',
      targetId: consumedCodeId,
      ip,
      createdAt: nowDate,
    });
  } catch (logErr) {
    console.error('[register] 写日志失败:', logErr);
  }

  return created({
    user: {
      id: userId,
      email,
      name: name ?? email.split('@')[0],
      role: 'user',
    },
    quota: {
      storageQuota: settings.defaultStorageQuota,
      storageUsed: 0,
      storageRemaining: settings.defaultStorageQuota,
      monthlyUploadQuota: settings.defaultMonthlyUploadQuota,
      monthlyUploadUsed: 0,
      monthlyUploadRemaining: settings.defaultMonthlyUploadQuota,
      quotaResetAt: nextResetAt(nowDate).toISOString(),
    },
  });
});
