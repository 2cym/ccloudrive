import { findFileById } from '@/db/queries/files';
import { collectDescendantIds, setTrashed } from '@/db/queries/files-tree';
import { requireAuth } from '@/lib/guard';
import { Errors } from '@/lib/errors';
import { handler, ok } from '@/lib/api-response';

/**
 * POST /api/files/:id/restore —— 从回收站恢复。
 *
 * 必须级联：软删时把子孙一起标记了，恢复时不一起放回来就会出现
 * 「父目录回来了、里面的文件还躺在回收站」的幽灵状态。
 */

export const POST = handler(
  async (_req: Request, ctx: { params: { id: string } }) => {
    const { db, user } = await requireAuth();

    const file = await findFileById(db, user.id, ctx.params.id);
    if (!file) throw Errors.notFound('文件不存在');

    const descendants =
      file.type === 'folder'
        ? await collectDescendantIds(db, user.id, file.id)
        : [];

    await setTrashed(db, user.id, [file.id, ...descendants], false);

    return ok({ id: file.id, restoredCount: descendants.length + 1 });
  },
);
