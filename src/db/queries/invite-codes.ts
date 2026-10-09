import { and, eq, desc, sql, gt, isNull, or, count } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { inviteCodes, type InviteCode, type NewInviteCode } from '@/db/schema';
import { Errors } from '@/lib/errors';
import type { InviteValidationResult, InviteCodeView } from '@/types/api';

/**
 * 邀请码查询层。
 *
 * 关键设计：校验与占用分离
 *   - validateInviteCode()  只读校验，用于「batch 外先查一次」，给前端精确错误提示
 *   - consumeInviteCode()   条件 UPDATE，放进 batch 内，承担并发安全的最终裁决
 *
 * 之所以要两步：D1 的 batch 内部 SELECT 看到的是 batch 快照，
 * 无法感知同批次的 UPDATE，所以必须靠 SQL 条件更新 + meta.changes 判定抢跑。
 */

/** SQL 条件：邀请码「可被占用」的全部约束（下推到 SQL，不做应用层过滤） */
function usableCondition(id: string, nowSec: number) {
  return and(
    eq(inviteCodes.id, id),
    eq(inviteCodes.isActive, true),
    or(isNull(inviteCodes.expiresAt), gt(inviteCodes.expiresAt, new Date(nowSec * 1000))),
    or(isNull(inviteCodes.maxUses), sql`${inviteCodes.usedCount} < ${inviteCodes.maxUses}`),
  );
}

/**
 * 只读校验。返回结构化结果，供上层映射成具体错误码。
 * 注意：此方法不做占用，存在并发窗口，必须配合 consumeInviteCode() 使用。
 */
export async function validateInviteCode(
  db: Db,
  code: string,
): Promise<InviteValidationResult> {
  const normalized = code.trim().toUpperCase();
  if (!normalized) {
    return { ok: false, reason: 'required' };
  }

  const rows = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.code, normalized))
    .limit(1);

  const record = rows[0];
  if (!record) return { ok: false, reason: 'not_found' };
  if (!record.isActive) return { ok: false, reason: 'disabled', record };

  const nowSec = Math.floor(Date.now() / 1000);
  if (record.expiresAt && record.expiresAt.getTime() / 1000 <= nowSec) {
    return { ok: false, reason: 'expired', record };
  }
  if (record.maxUses != null && record.usedCount >= record.maxUses) {
    return { ok: false, reason: 'exhausted', record };
  }

  return { ok: true, record };
}

/** 把校验失败原因映射成 AppError（错误提示必须是四类之一，前端直接 toast） */
export function inviteErrorFromReason(reason: string) {
  switch (reason) {
    case 'required':
      return Errors.inviteRequired();
    case 'expired':
      return Errors.inviteExpired();
    case 'exhausted':
      return Errors.inviteExhausted();
    case 'disabled':
      return Errors.inviteDisabled();
    case 'not_found':
    default:
      return Errors.inviteNotFound();
  }
}

/**
 * 占用邀请码 —— 传给 db.batch() 使用。
 *
 * 返回的是「未执行的 Drizzle 语句」，必须在 batch 内与其他语句一起提交。
 * 提交后通过 result.meta.changes 判定是否真的占上了：
 *   0 → 并发抢跑（被别人先占满/被禁用/被过期），调用方必须补偿删除刚创建的用户。
 */
export function consumeInviteCodeStatement(
  db: Db,
  id: string,
  nowSec: number = Math.floor(Date.now() / 1000),
) {
  return db
    .update(inviteCodes)
    .set({
      usedCount: sql`${inviteCodes.usedCount} + 1`,
      updatedAt: new Date(nowSec * 1000),
    })
    .where(usableCondition(id, nowSec));
}

/** 校验通过后读取单条 */
export async function findInviteCodeById(
  db: Db,
  id: string,
): Promise<InviteCode | null> {
  const rows = await db
    .select()
    .from(inviteCodes)
    .where(eq(inviteCodes.id, id))
    .limit(1);
  return rows[0] ?? null;
}

// ============================================================
// 管理端 CRUD
// ============================================================

/** 分页 + 总数（管理端列表，避免全表捞出） */
export async function listInviteCodesPaged(
  db: Db,
  options?: { limit?: number; offset?: number; keyword?: string },
): Promise<{ items: InviteCode[]; total: number }> {
  const limit = Math.min(Math.max(options?.limit ?? 20, 1), 100);
  const offset = Math.max(options?.offset ?? 0, 0);
  const keyword = options?.keyword?.trim().toUpperCase();

  // 关键词过滤下推到 SQL（LIKE + 参数绑定，防注入）
  const where = keyword ? sql`${inviteCodes.code} LIKE ${`%${keyword}%`}` : undefined;

  const [items, totalRows] = await Promise.all([
    db
      .select()
      .from(inviteCodes)
      .where(where)
      .orderBy(desc(inviteCodes.createdAt))
      .limit(limit)
      .offset(offset),
    db.select({ value: count() }).from(inviteCodes).where(where),
  ]);

  return { items, total: totalRows[0]?.value ?? 0 };
}

/** 聚合统计（用 COUNT，不 SELECT *） */
export async function countInviteCodes(
  db: Db,
  filter?: { isActive?: boolean },
): Promise<number> {
  const where =
    filter?.isActive !== undefined
      ? eq(inviteCodes.isActive, filter.isActive)
      : undefined;
  const rows = await db.select({ value: count() }).from(inviteCodes).where(where);
  return rows[0]?.value ?? 0;
}

/** 邀请码记录 → 视图对象（含计算状态，供前端表格直接渲染） */
export function toInviteCodeView(
  record: InviteCode,
  nowSec: number = Math.floor(Date.now() / 1000),
): InviteCodeView {
  let status: InviteCodeView['status'] = 'active';
  if (!record.isActive) status = 'disabled';
  else if (record.expiresAt && record.expiresAt.getTime() / 1000 <= nowSec)
    status = 'expired';
  else if (record.maxUses != null && record.usedCount >= record.maxUses)
    status = 'exhausted';

  return {
    id: record.id,
    code: record.code,
    status,
    usedCount: record.usedCount,
    maxUses: record.maxUses,
    expiresAt: record.expiresAt ? record.expiresAt.toISOString() : null,
    isActive: record.isActive,
    note: record.note,
    createdById: record.createdById,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
  };
}

/** 检查 code 是否已存在（生成随机码时防重） */
export async function codeExists(db: Db, code: string): Promise<boolean> {
  const rows = await db
    .select({ id: inviteCodes.id })
    .from(inviteCodes)
    .where(eq(inviteCodes.code, code.toUpperCase()))
    .limit(1);
  return rows.length > 0;
}

/**
 * 生成全局唯一的邀请码。
 * 使用 crypto.getRandomValues（CSPRNG），绝不用 Math.random。
 * 冲突概率极低，但仍做最多 5 次重试。
 */
export async function generateUniqueInviteCode(
  db: Db,
  length = 12,
): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateInviteCode(length);
    if (!(await codeExists(db, code))) return code;
  }
  // 兜底：加时间戳后缀，保证不无限循环
  return `${generateInviteCode(8)}${Date.now().toString(36).toUpperCase().slice(-4)}`;
}

export async function createInviteCode(
  db: Db,
  data: NewInviteCode,
): Promise<InviteCode> {
  const rows = (await db
    .insert(inviteCodes)
    .values(data)
    .returning()) as InviteCode[];
  return rows[0];
}

export type InviteCodePatch = {
  maxUses?: number | null;
  expiresAt?: Date | null;
  isActive?: boolean;
  note?: string | null;
};

export async function updateInviteCode(
  db: Db,
  id: string,
  patch: InviteCodePatch,
): Promise<InviteCode | null> {
  const rows = (await db
    .update(inviteCodes)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(inviteCodes.id, id))
    .returning()) as InviteCode[];
  return rows[0] ?? null;
}

export async function deleteInviteCode(db: Db, id: string): Promise<boolean> {
  const rows = (await db
    .delete(inviteCodes)
    .where(eq(inviteCodes.id, id))
    .returning({ id: inviteCodes.id })) as Array<{ id: string }>;
  return rows.length > 0;
}

/** 生成不易混淆的邀请码（去掉 0/O/1/I/L），使用 CSPRNG */
export function generateInviteCode(length = 12): string {
  const alphabet = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join('');
}
