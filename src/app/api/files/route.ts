import { z } from 'zod';

import { findFileById } from '@/db/queries/files';
import { DEFAULT_SORT, listFiles } from '@/db/queries/files-list';
import { breadcrumb, type Crumb } from '@/db/queries/files-tree';
import { requireAuth } from '@/lib/guard';
import { Errors } from '@/lib/errors';
import { handler, ok } from '@/lib/api-response';

/**
 * GET /api/files —— 文件/文件夹列表。
 *
 *   parentId  目录 id；缺省或 null = 根目录。**提供 search 时本参数被忽略**
 *   search    全局搜索：只搜本人未删除的文件（网盘的核心诉求是快速找到文件）
 *   sort      name_asc | name_desc | created_desc(默认) | created_asc | size_desc
 *   view      all(默认) | file | folder —— 类型筛选，**不是** list/grid 切换
 */

// 校验内联（本批不修改 validators.ts）。
// sort / view 用 .catch() 兜底：非法值退化成默认值，不打断列表请求。
const querySchema = z.object({
  parentId: z.string().min(1).optional(),
  search: z.string().trim().min(1).max(100).optional(),
  sort: z
    .enum(['name_asc', 'name_desc', 'created_desc', 'created_asc', 'size_desc'])
    .catch(DEFAULT_SORT),
  view: z.enum(['all', 'file', 'folder']).catch('all'),
});

export const GET = handler(async (req: Request) => {
  const { db, user } = await requireAuth();

  const sp = new URL(req.url).searchParams;
  const parsed = querySchema.parse({
    parentId: sp.get('parentId') ?? undefined,
    search: sp.get('search') ?? undefined,
    sort: sp.get('sort') ?? undefined,
    view: sp.get('view') ?? undefined,
  });

  const parentId = parsed.parentId ?? null;

  // parent / breadcrumb 只在「指定了目录 && 不是全局搜索」时才有意义
  let parent: { id: string; name: string } | null = null;
  let crumbs: Crumb[] = [];

  if (parentId && !parsed.search) {
    const folder = await findFileById(db, user.id, parentId);
    if (!folder) throw Errors.notFound('目录不存在');

    parent = { id: folder.id, name: folder.name };
    crumbs = [
      { id: null, name: '根目录' },
      ...(await breadcrumb(db, user.id, parentId)),
    ];
  }

  const files = await listFiles(db, user.id, {
    parentId,
    search: parsed.search,
    sort: parsed.sort,
    view: parsed.view,
  });

  return ok({ files, parent, breadcrumb: crumbs });
});
