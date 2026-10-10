import { z } from 'zod';

import {
  findFileById,
  findParentFolder,
  findSameName,
  updateFile,
} from '@/db/queries/files';
import { collectDescendantIds, setTrashed } from '@/db/queries/files-tree';
import { requireAuth } from '@/lib/guard';
import { AppError, ErrorCode, Errors } from '@/lib/errors';
import { handler, ok, readJson } from '@/lib/api-response';

/**
 * PATCH   /api/files/:id —— 重命名 / 移动 / 收藏
 * DELETE  /api/files/:id —— 移入回收站（文件夹会级联子孙）
 */

// 校验内联（本批不修改 validators.ts）。三个字段至少要给一个。
const patchSchema = z
  .object({
    name: z.string().trim().min(1, '请输入名称').max(255, '名称过长').optional(),
    parentId: z.string().min(1).nullable().optional(),
    isStarred: z.boolean().optional(),
  })
  .refine((v) => v.name !== undefined || v.parentId !== undefined || v.isStarred !== undefined, {
    message: '至少需要提供 name / parentId / isStarred 之一',
  });

export const PATCH = handler(
  async (req: Request, ctx: { params: { id: string } }) => {
    const { db, user } = await requireAuth();
    const id = ctx.params.id;

    const file = await findFileById(db, user.id, id);
    if (!file) throw Errors.notFound('文件不存在');

    const parsed = patchSchema.parse(await readJson(req));
    let targetParentId = file.parentId;

    if (parsed.parentId !== undefined) {
      targetParentId = parsed.parentId;

      if (targetParentId === id) {
        throw new AppError(ErrorCode.INTERNAL_ERROR, '不能移动到自己下面', {
          status: 409,
        });
      }

      if (targetParentId) {
        const parent = await findParentFolder(db, user.id, targetParentId);
        if (!parent) throw Errors.notFound('父目录不存在');

        // 不能移动到自己的子孙里：parentId 无外键约束，一旦成环，
        // collectDescendantIds 与 breadcrumb 都会无限循环。
        if (file.type === 'folder') {
          const descendants = await collectDescendantIds(db, user.id, id);
          if (descendants.includes(targetParentId)) {
            throw new AppError(
              ErrorCode.INTERNAL_ERROR,
              '不能移动到自己的子目录中',
              { status: 409 },
            );
          }
        }
      }
    }

    const nextName = parsed.name ?? file.name;
    const nameChanged = parsed.name !== undefined && parsed.name !== file.name;
    const parentChanged =
      parsed.parentId !== undefined && targetParentId !== file.parentId;

    // 重命名或移动都可能撞名，两种情况下都要查（移动时是查目标目录里有没有同名）
    if (nameChanged || parentChanged) {
      if (await findSameName(db, user.id, targetParentId, nextName, id)) {
        throw new AppError(
          ErrorCode.INTERNAL_ERROR,
          '同名文件夹/文件已存在',
          { status: 409, field: 'name' },
        );
      }
    }

    const updated = await updateFile(db, user.id, id, {
      ...(parsed.name !== undefined ? { name: parsed.name } : {}),
      ...(parsed.parentId !== undefined ? { parentId: parsed.parentId } : {}),
      ...(parsed.isStarred !== undefined ? { isStarred: parsed.isStarred } : {}),
    });

    return ok({ file: updated });
  },
);

export const DELETE = handler(
  async (_req: Request, ctx: { params: { id: string } }) => {
    const { db, user } = await requireAuth();
    const id = ctx.params.id;

    const file = await findFileById(db, user.id, id);
    if (!file) throw Errors.notFound('文件不存在');

    // 级联子孙：只标记父目录会把子文件留在 isTrashed=0 状态，
    // 用户在列表里看不到父目录、却能通过搜索搜到子文件 —— 幽灵文件。
    const descendants =
      file.type === 'folder'
        ? await collectDescendantIds(db, user.id, id)
        : [];

    await setTrashed(db, user.id, [id, ...descendants], true);

    return ok({ id, trashedCount: descendants.length + 1 });
  },
);
