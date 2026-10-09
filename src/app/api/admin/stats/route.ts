import { sql, count, sum } from 'drizzle-orm';

import { files, shares, inviteCodes, users } from '@/db/schema';
import { ok, handler } from '@/lib/api-response';
import { requireAdmin } from '@/lib/guard';
import { startOfShanghaiMonth, shanghaiMonthKey } from '@/lib/quota';

/**
 * GET /api/admin/stats
 *
 * 管理后台统计概览。
 * - 所有聚合使用 COUNT / SUM，禁止 SELECT *（保护 D1 每日读取配额）
 * - 涉及 files 表的聚合只统计 is_trashed = 0 的活跃记录
 * - D1 聚合可能返回字符串或 null，全部用 Number(x) || 0 转换
 */

export const runtime = 'edge';

export const GET = handler(async () => {
  const { db } = await requireAdmin();

  const nowSec = Math.floor(Date.now() / 1000);
  const todaySec = nowSec - (nowSec % 86400); // UTC 当日 00:00
  const monthStartSec = startOfShanghaiMonth(new Date());
  const monthKey = shanghaiMonthKey(new Date());

  // ---- 用户统计 ----
  const [userCountRow, adminCountRow, disabledCountRow, todayNewUsersRow] =
    await Promise.all([
      db.select({ value: count() }).from(users),
      db
        .select({ value: count() })
        .from(users)
        .where(sql`role = 'admin'`),
      db
        .select({ value: count() })
        .from(users)
        .where(sql`is_disabled = 1`),
      db
        .select({ value: count() })
        .from(users)
        .where(sql`created_at >= ${todaySec}`),
    ]);

  const userCount = Number(userCountRow[0]?.value) || 0;
  const adminCount = Number(adminCountRow[0]?.value) || 0;
  const disabledCount = Number(disabledCountRow[0]?.value) || 0;
  const todayNewUsers = Number(todayNewUsersRow[0]?.value) || 0;

  // ---- 文件统计（只统计活跃，不含回收站） ----
  const [fileCountRow, folderCountRow, totalStorageRow, todayUploadRow, monthUploadRow] =
    await Promise.all([
      db
        .select({ value: count() })
        .from(files)
        .where(sql`type = 'file' AND is_trashed = 0`),
      db
        .select({ value: count() })
        .from(files)
        .where(sql`type = 'folder' AND is_trashed = 0`),
      db
        .select({ value: sum(files.size) })
        .from(files)
        .where(sql`type = 'file' AND is_trashed = 0`),
      db
        .select({ value: sum(files.size) })
        .from(files)
        .where(
          sql`type = 'file' AND is_trashed = 0 AND created_at >= ${todaySec}`,
        ),
      db
        .select({ value: sum(files.size) })
        .from(files)
        .where(
          sql`type = 'file' AND is_trashed = 0 AND created_at >= ${monthStartSec}`,
        ),
    ]);

  const fileCount = Number(fileCountRow[0]?.value) || 0;
  const folderCount = Number(folderCountRow[0]?.value) || 0;
  const totalStorage = Number(totalStorageRow[0]?.value) || 0;
  const todayUpload = Number(todayUploadRow[0]?.value) || 0;
  const monthUpload = Number(monthUploadRow[0]?.value) || 0;

  // ---- 邀请码统计 ----
  const [
    inviteCodeCountRow,
    activeInviteCodeCountRow,
    usedInvitesRow,
    totalInviteCapacityRow,
  ] = await Promise.all([
    db.select({ value: count() }).from(inviteCodes),
    db
      .select({ value: count() })
      .from(inviteCodes)
      .where(sql`is_active = 1`),
    db.select({ value: sum(inviteCodes.usedCount) }).from(inviteCodes),
    db
      .select({ value: sum(inviteCodes.maxUses) })
      .from(inviteCodes)
      .where(sql`max_uses IS NOT NULL`),
  ]);

  const inviteCodeCount = Number(inviteCodeCountRow[0]?.value) || 0;
  const activeInviteCodeCount = Number(activeInviteCodeCountRow[0]?.value) || 0;
  const usedInvites = Number(usedInvitesRow[0]?.value) || 0;
  const totalInviteCapacity = Number(totalInviteCapacityRow[0]?.value) || 0;
  const remainingInvites = Math.max(0, totalInviteCapacity - usedInvites);

  // ---- 分享统计 ----
  const [shareCountRow] = await Promise.all([
    db.select({ value: count() }).from(shares),
  ]);

  const shareCount = Number(shareCountRow[0]?.value) || 0;

  return ok({
    users: {
      total: userCount,
      admin: adminCount,
      disabled: disabledCount,
      todayNew: todayNewUsers,
    },
    files: {
      totalFiles: fileCount,
      totalFolders: folderCount,
      totalStorage,
      todayUpload,
      monthUpload,
      monthKey,
    },
    inviteCodes: {
      total: inviteCodeCount,
      active: activeInviteCodeCount,
      used: usedInvites,
      remaining: remainingInvites,
    },
    shares: {
      total: shareCount,
    },
  });
});
