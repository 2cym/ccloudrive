import { and, asc, desc, eq, isNull, like } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { files, type FileRecord } from '@/db/schema';

/**
 * 文件列表查询（GET /api/files 的数据层）。
 * 与 files.ts 分开只是为了控制单文件行数，职责上同属查询层。
 */

export type SortKey =
  | 'name_asc'
  | 'name_desc'
  | 'created_desc'
  | 'created_asc'
  | 'size_desc';

/** view 是**类型筛选**，不是前端的 list/grid 切换（那是纯 UI state，不进 API）。 */
export type ViewKey = 'all' | 'file' | 'folder';

export type ListOptions = {
  /** null = 根目录。当 search 有值时本字段被忽略。 */
  parentId: string | null;
  search?: string;
  sort: SortKey;
  view: ViewKey;
};

export const DEFAULT_SORT: SortKey = 'created_desc';

/**
 * 排序表达式。
 * type 只有 'folder' | 'file' 两种取值，字典序 'folder' > 'file'，
 * 所以 desc(type) 就是「文件夹永远排在文件前面」，不必写 CASE WHEN 原生 SQL。
 */
function orderBy(sort: SortKey) {
  const folderFirst = desc(files.type);
  switch (sort) {
    case 'name_asc':
      return [folderFirst, asc(files.name)];
    case 'name_desc':
      return [folderFirst, desc(files.name)];
    case 'created_asc':
      return [folderFirst, asc(files.createdAt)];
    case 'size_desc':
      return [folderFirst, desc(files.size)];
    case 'created_desc':
    default:
      return [folderFirst, desc(files.createdAt)];
  }
}

/**
 * 列表。
 * 提供 search 时**忽略 parentId** 做全局搜索 —— 网盘的核心诉求是「快速找到文件」，
 * 进目录后再搜是次要场景。否则按 parentId 过滤，null 即根目录。
 */
export async function listFiles(
  db: Db,
  ownerId: string,
  opts: ListOptions,
): Promise<FileRecord[]> {
  const conds = [eq(files.ownerId, ownerId), eq(files.isTrashed, false)];

  if (opts.search) {
    // LIKE 的 % 与 _ 未转义：用户传 '%' 会命中更多结果。
    // 作用域已被 ownerId 限定在本人，无法构造跨用户查询，故可接受。
    conds.push(like(files.name, `%${opts.search}%`));
  } else if (opts.parentId) {
    conds.push(eq(files.parentId, opts.parentId));
  } else {
    conds.push(isNull(files.parentId));
  }

  if (opts.view === 'file') conds.push(eq(files.type, 'file'));
  if (opts.view === 'folder') conds.push(eq(files.type, 'folder'));

  return db.select().from(files).where(and(...conds)).orderBy(...orderBy(opts.sort));
}
