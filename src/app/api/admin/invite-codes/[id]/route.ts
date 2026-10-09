import { z } from 'zod';

import {
  deleteInviteCode,
  findInviteCodeById,
  toInviteCodeView,
  updateInviteCode,
} from '@/db/queries/invite-codes';
import { ok, handler, readJson } from '@/lib/api-response';
import { Errors } from '@/lib/errors';
import { requireAdmin } from '@/lib/guard';

/**
 * PATCH  /api/admin/invite-codes/:id   编辑（含禁用/启用）
 * DELETE /api/admin/invite-codes/:id   删除
 */

const patchSchema = z
  .object({
    maxUses: z.number().int().positive().max(1_000_000).nullable().optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional(),
    note: z.string().trim().max(200).nullable().optional(),
  })
  .strict();

type Ctx = { params: { id: string } };

export const PATCH = handler(async (req: Request, ctx: Ctx) => {
  const { db } = await requireAdmin();
  const { id } = ctx.params;

  const existing = await findInviteCodeById(db, id);
  if (!existing) throw Errors.notFound('邀请码不存在');

  const body = await readJson(req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    throw Errors.validation(first.message, first.path.join('.') || undefined);
  }

  const patch: Record<string, unknown> = {};
  if (parsed.data.maxUses !== undefined) patch.maxUses = parsed.data.maxUses;
  if (parsed.data.expiresAt !== undefined) {
    patch.expiresAt = parsed.data.expiresAt
      ? new Date(parsed.data.expiresAt)
      : null;
  }
  if (parsed.data.isActive !== undefined) patch.isActive = parsed.data.isActive;
  if (parsed.data.note !== undefined) patch.note = parsed.data.note;

  if (!Object.keys(patch).length) {
    throw Errors.validation('没有需要更新的字段');
  }

  const updated = await updateInviteCode(db, id, patch);
  if (!updated) throw Errors.notFound('邀请码不存在');

  return ok(toInviteCodeView(updated));
});

export const DELETE = handler(async (_req: Request, ctx: Ctx) => {
  const { db } = await requireAdmin();
  const { id } = ctx.params;

  const existing = await findInviteCodeById(db, id);
  if (!existing) throw Errors.notFound('邀请码不存在');

  const removed = await deleteInviteCode(db, id);
  if (!removed) throw Errors.notFound('邀请码不存在');

  return ok({ deleted: true, id });
});
