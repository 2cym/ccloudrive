import { z } from 'zod';

import { getAllSettings, upsertSettings } from '@/db/queries/settings';
import { ok, handler, readJson } from '@/lib/api-response';
import { Errors } from '@/lib/errors';
import { requireAdmin } from '@/lib/guard';

/**
 * GET   /api/admin/settings   读取系统设置（缺省项用默认值补齐）
 * PATCH /api/admin/settings   更新（部分字段）
 */

const GB = 1073741824;

const patchSchema = z
  .object({
    defaultStorageQuota: z
      .number()
      .int()
      .min(0)
      .max(1024 * GB, '不能超过 1TB')
      .optional(),
    defaultMonthlyUploadQuota: z
      .number()
      .int()
      .min(0)
      .max(1024 * GB, '不能超过 1TB')
      .optional(),
    requireInviteCode: z.boolean().optional(),
    maxUploadSize: z
      .number()
      .int()
      .min(0)
      .max(5 * 1024 * GB, '不能超过 5TB')
      .optional(),
    allowedFileTypes: z
      .array(z.string().trim().min(1))
      .max(200, '类型过多')
      .optional(),
  })
  .strict();

export const GET = handler(async () => {
  const { db } = await requireAdmin();
  const settings = await getAllSettings(db);
  return ok(settings);
});

export const PATCH = handler(async (req: Request) => {
  const { db } = await requireAdmin();

  const body = await readJson(req);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    const first = parsed.error.errors[0];
    throw Errors.validation(first.message, first.path.join('.') || undefined);
  }

  if (!Object.keys(parsed.data).length) {
    throw Errors.validation('没有需要更新的字段');
  }

  await upsertSettings(db, parsed.data);
  const settings = await getAllSettings(db);
  return ok(settings);
});
