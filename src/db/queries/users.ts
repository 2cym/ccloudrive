import { eq, sql, and, count } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { users, type User, type NewUser } from '@/db/schema';
import { nextResetAt, DEFAULT_STORAGE_QUOTA, DEFAULT_MONTHLY_UPLOAD_QUOTA } from '@/lib/quota';

/** 按邮箱查（小写归一）。参数化查询，防注入。 */
export async function findUserByEmail(
  db: Db,
  email: string,
): Promise<User | null> {
  const rows = await db
    .select()
    .from(users)
    .where(eq(users.email, email.toLowerCase().trim()))
    .limit(1);
  return rows[0] ?? null;
}

export async function findUserById(
  db: Db,
  id: string,
): Promise<User | null> {
  const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return rows[0] ?? null;
}

/**
 * 构造新用户插入语句（未执行），供 db.batch() 使用。
 * 默认配额从系统设置读取，调用方传入。
 */
export function buildInsertUserStatement(
  db: Db,
  data: {
    id: string;
    email: string;
    passwordHash: string;
    name: string;
    role?: string;
    storageQuota?: number;
    monthlyUploadQuota?: number;
    invitedByCodeId?: string | null;
    registeredFrom?: string;
  },
) {
  const nowDate = new Date();
  const values: NewUser = {
    id: data.id,
    email: data.email.toLowerCase().trim(),
    passwordHash: data.passwordHash,
    name: data.name,
    role: data.role ?? 'user',
    storageQuota: data.storageQuota ?? DEFAULT_STORAGE_QUOTA,
    storageUsed: 0,
    monthlyUploadQuota:
      data.monthlyUploadQuota ?? DEFAULT_MONTHLY_UPLOAD_QUOTA,
    monthlyUploadUsed: 0,
    uploadQuotaResetAt: nextResetAt(nowDate),
    invitedByCodeId: data.invitedByCodeId ?? null,
    registeredFrom: data.registeredFrom ?? null,
    isDisabled: false,
    createdAt: nowDate,
    updatedAt: nowDate,
  };

  return db.insert(users).values(values);
}

/** 补偿删除：并发抢跑后回滚刚插入的用户 */
export async function deleteUserById(db: Db, id: string): Promise<void> {
  await db.delete(users).where(eq(users.id, id));
}

/**
 * 惰性重置月度配额 —— 条件 UPDATE，只有真的跨月才写。
 * 返回是否发生重置。用于读接口前置调用（低频、幂等）。
 */
export async function resetMonthlyQuotaIfNeeded(
  db: Db,
  userId: string,
): Promise<boolean> {
  const nowSec = Math.floor(Date.now() / 1000);
  const rows = (await db
    .update(users)
    .set({
      monthlyUploadUsed: 0,
      uploadQuotaResetAt: nextResetAt(),
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(users.id, userId),
        sql`(${users.uploadQuotaResetAt} IS NULL OR ${users.uploadQuotaResetAt} <= ${nowSec})`,
      ),
    )
    .returning({ id: users.id })) as Array<{ id: string }>;
  return rows.length > 0;
}

/** 统计（管理端） */
export async function countUsers(
  db: Db,
  filter?: { role?: string; isDisabled?: boolean },
): Promise<number> {
  const conds = [];
  if (filter?.role) conds.push(eq(users.role, filter.role));
  if (filter?.isDisabled !== undefined)
    conds.push(eq(users.isDisabled, filter.isDisabled));

  const rows = await db
    .select({ value: count() })
    .from(users)
    .where(conds.length ? and(...conds) : undefined);
  return rows[0]?.value ?? 0;
}

/** 列表（管理端，分页） */
export async function listUsers(
  db: Db,
  options?: { limit?: number; offset?: number },
): Promise<User[]> {
  return db
    .select()
    .from(users)
    .orderBy(sql`${users.createdAt} DESC`)
    .limit(options?.limit ?? 50)
    .offset(options?.offset ?? 0);
}
