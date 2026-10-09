import { z } from 'zod';

import { inviteCodes } from '@/db/schema';
import {
  codeExists,
  createInviteCode,
  generateUniqueInviteCode,
  listInviteCodesPaged,
  toInviteCodeView,
} from '@/db/queries/invite-codes';
import { uuid } from '@/lib/password';
import { ok, created, handler, readJson } from '@/lib/api-response';
import { Errors } from '@/lib/errors';
import { requireAdmin } from '@/lib/guard';

/**
 * GET  /api/admin/invite-codes   分页列表（含计算状态）
 * POST /api/admin/invite-codes   新建邀请码
 *
 * 两个 handler 都必须过 requireAdmin()。
 */

const createSchema = z
  .object({
    // 不传则自动生成
    code: z
      .string()
      .trim()
      .min(4, '邀请码至少 4 位')
      .max(32, '邀请码最多 32 位')
      .regex(/^[A-Za-z0-9]+$/, '邀请码只能包含字母和数字')
      .transform((v) => v.toUpperCase())
      .optional(),
    maxUses: z
      .number()
      .int('必须为整数')
      .positive('必须大于 0')
      .max(1_000_000, '数值过大')
      .nullable()
      .optional(),
    // ISO 字符串或 null（永久）
    expiresAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional(),
    note: z.string().trim().max(200, '备注最多 200 字').nullable().optional(),
  })
  .strict();

export const GET = handler(async (req: Request) => {
  const { db } = await requireAdmin();

  const url = new URL(req.url);
  const limitParam = url.searchParams.get('limit');
  const offsetParam = url.searchParams.get('offset');
  const keyword = url.searchParams.get('keyword') ?? undefined;

  const { items, total } = await listInviteCodesPaged(db, {
    limit: limitParam ? Number.parseInt(limitParam, 10) : 20,
    offset: offsetParam ? Number.parseInt(offsetParam, 10) : 0,
    keyword,
  });

  const nowSec = Math.floor(Date.now() / 1000);

  return ok({
    items: items.map((r) => toInviteCodeView(r, nowSec)),
    total,
  });
});

export const POST = handler(async (req: Request) => {
  const { db, user } = await requireAdmin();

  const body = await readJson(req);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    throw Errors.validation(first.message, first.path.join('.') || undefined);
  }
  const { code, maxUses, expiresAt, isActive, note } = parsed.data;

  // 自定义 code 需查重；未提供则生成唯一码
  let finalCode: string;
  if (code) {
    const exists = await codeExists(db, code);
    if (exists) {
      throw Errors.validation('该邀请码已存在，请更换', 'code');
    }
    finalCode = code;
  } else {
    finalCode = await generateUniqueInviteCode(db);
  }

  const record = await createInviteCode(db, {
    id: uuid(),
    code: finalCode,
    createdById: user.id,
    maxUses: maxUses ?? null,
    usedCount: 0,
    expiresAt: expiresAt ? new Date(expiresAt) : null,
    isActive: isActive ?? true,
    note: note ?? null,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return created(toInviteCodeView(record));
});

// 保证 schema 表被引用（避免打包时被判定未使用）
void inviteCodes;
