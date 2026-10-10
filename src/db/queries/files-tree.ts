import { and, eq, inArray } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { files } from '@/db/schema';

/**
 * 文件树操作：子孙收集、批量软删/恢复、面包屑。
 * 与 files.ts / files-list.ts 拆开只为控制单文件行数，职责上同属查询层。
 */

/** 单批 UPDATE 的 id 上限：避免 IN 子句过长触发 D1 的参数上限。 */
const BATCH_SIZE = 500;

/** 面包屑向上遍历的层数上限：parentId 若成环（数据损坏）会死循环，必须有硬上限。 */
const MAX_BREADCRUMB_DEPTH = 10;

/**
 * BFS 收集某节点的全部子孙 id（**不含自身**）。
 *
 * 性能假设：目录嵌套 ≤ 20 层、单层条目数不大 —— 每层一次查询，
 * 即 20 层约 20 次查询。**若将来出现超深目录，这里会退化为多次查询**，
 * 届时应改用递归 CTE 或给 files 加 materialized path 列。当前不做此优化。
 *
 * ⚠️ 调用方必须保证树中无环（见 [id]/route.ts 的移动校验），
 * 否则本函数会无限循环。
 */
export async function collectDescendantIds(
  db: Db,
  ownerId: string,
  rootId: string,
): Promise<string[]> {
  const all: string[] = [];
  let frontier = [rootId];

  while (frontier.length > 0) {
    const rows = await db
      .select({ id: files.id })
      .from(files)
      .where(
        and(eq(files.ownerId, ownerId), inArray(files.parentId, frontier)),
      );

    const next = rows.map((row) => row.id);
    if (next.length === 0) break;

    all.push(...next);
    frontier = next;
  }

  return all;
}

/**
 * 批量置/清回收站标记（软删与恢复共用）。
 *
 * 分批处理：每批最多 BATCH_SIZE 个 id。
 * 单条 UPDATE 本身就是原子的，因此不需要事务 —— 正好绕开 D1 无事务的限制。
 */
export async function setTrashed(
  db: Db,
  ownerId: string,
  ids: string[],
  trashed: boolean,
): Promise<void> {
  if (ids.length === 0) return;

  const now = new Date();
  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const chunk = ids.slice(i, i + BATCH_SIZE);
    await db
      .update(files)
      .set({
        isTrashed: trashed,
        trashedAt: trashed ? now : null,
        updatedAt: now,
      })
      .where(and(eq(files.ownerId, ownerId), inArray(files.id, chunk)));
  }
}

export type Crumb = { id: string | null; name: string };

/**
 * 从 parentId 向上走到根，返回 [最近的父目录, ..., 最外层目录]（**不含「根目录」**）。
 * parentId 为 null 时返回空数组。
 *
 * 带 MAX_BREADCRUMB_DEPTH 上限：parentId 一旦成环，没有上限就是死循环。
 */
export async function breadcrumb(
  db: Db,
  ownerId: string,
  parentId: string | null,
): Promise<Crumb[]> {
  const chain: Crumb[] = [];
  let cursor = parentId;
  let depth = 0;

  while (cursor && depth < MAX_BREADCRUMB_DEPTH) {
    const rows = await db
      .select({ id: files.id, name: files.name, parentId: files.parentId })
      .from(files)
      .where(and(eq(files.id, cursor), eq(files.ownerId, ownerId)))
      .limit(1);

    const row = rows[0];
    if (!row) break;

    chain.unshift({ id: row.id, name: row.name });
    cursor = row.parentId;
    depth += 1;
  }

  return chain;
}
