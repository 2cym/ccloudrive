import { z } from 'zod';

import {
  findParentFolder,
  findSameName,
  insertFile,
} from '@/db/queries/files';
import { requireAuth } from '@/lib/guard';
import { AppError, ErrorCode, Errors } from '@/lib/errors';
import { uuid } from '@/lib/password';
import { created, handler, readJson } from '@/lib/api-response';

/**
 * POST /api/files/folder —— 创建文件夹。
 * 只建元数据：R2 未启用，本批不涉及任何存储操作。
 */

// 校验内联（本批不修改 validators.ts）。zod 抛错由 handler → toFailure 转成 422。
const createFolderSchema = z.object({
  name: z.string().trim().min(1, '请输入文件夹名').max(255, '名称过长'),
  parentId: z.string().min(1).nullable().optional(),
});

export const POST = handler(async (req: Request) => {
  const { db, user } = await requireAuth();

  const body = await readJson(req);
  const parsed = createFolderSchema.parse(body);
  const parentId = parsed.parentId ?? null;

  // parent_id 不是外键：父目录的存在性与归属必须由应用层校验，
  // 否则可以构造任意 parentId 把文件夹挂到别人的目录下。
  if (parentId) {
    const parent = await findParentFolder(db, user.id, parentId);
    if (!parent) throw Errors.notFound('父目录不存在');
  }

  // 没有 (owner_id, parent_id, name) 唯一索引，同级重名只能应用层查。
  if (await findSameName(db, user.id, parentId, parsed.name)) {
    throw new AppError(ErrorCode.INTERNAL_ERROR, '同名文件夹/文件已存在', {
      status: 409,
      field: 'name',
    });
  }

  const file = await insertFile(db, {
    id: uuid(),
    ownerId: user.id,
    parentId,
    name: parsed.name,
    type: 'folder',
    size: 0,
    isStarred: false,
    isTrashed: false,
  });

  return created({ file });
});
