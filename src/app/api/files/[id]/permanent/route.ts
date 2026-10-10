import {
  countChildren,
  findFileById,
  hardDeleteOne,
} from '@/db/queries/files';
import { requireAuth } from '@/lib/guard';
import { AppError, ErrorCode, Errors } from '@/lib/errors';
import { handler, ok } from '@/lib/api-response';

/**
 * DELETE /api/files/:id/permanent —— 彻底删除。
 *
 * 有子项（**含已软删的**）时拒绝：硬删父目录会让子项的 parent_id 悬空，
 * 前端渲染 folder/:id 时会找不到父目录。必须先由调用方清空。
 */

export const DELETE = handler(
  async (_req: Request, ctx: { params: { id: string } }) => {
    const { db, user } = await requireAuth();

    const file = await findFileById(db, user.id, ctx.params.id);
    if (!file) throw Errors.notFound('文件不存在');

    const children = await countChildren(db, user.id, file.id);
    if (children > 0) {
      throw new AppError(
        ErrorCode.INTERNAL_ERROR,
        '文件夹非空，请先清空',
        { status: 409 },
      );
    }

    await hardDeleteOne(db, user.id, file.id);
    return ok({ id: file.id, deleted: true });
  },
);
