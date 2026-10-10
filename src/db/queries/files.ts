import { and, count, eq, isNull, ne } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { files, type FileRecord, type NewFileRecord } from '@/db/schema';

/**
 * 文件元数据查询层：单条 CRUD + 校验。
 * 列表与排序在 files-list.ts，树操作（级联/面包屑）在 files-tree.ts。
 *
 * 三条硬约定：
 * 1. **所有查询都必须带 ownerId** —— 越权防护放在数据层，不靠调用方自觉。
 * 2. D1 没有交互式事务（也无法使用事务 API），所以每个导出函数都是**单条语句**；
 *    需要多步的级联更新交给 files-tree.ts 的批量 UPDATE。
 * 3. parent_id **不是外键、没有级联删除**，也没有 (owner_id, parent_id, name)
 *    唯一索引 —— 「父目录是否存在」「同级是否重名」都得在这里查，DB 不会替我们挡。
 */

/** 按 id 取单条（强制带 ownerId，防越权）。 */
export async function findFileById(
  db: Db,
  ownerId: string,
  id: string,
): Promise<FileRecord | null> {
  const rows = await db
    .select()
    .from(files)
    .where(and(eq(files.id, id), eq(files.ownerId, ownerId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function insertFile(
  db: Db,
  data: NewFileRecord,
): Promise<FileRecord> {
  const rows = await db.insert(files).values(data).returning();
  return rows[0];
}

/**
 * 重命名 / 移动 / 收藏。
 * patch 只放行这三个字段 —— size、storageKey、hash 等不允许从接口改。
 */
export async function updateFile(
  db: Db,
  ownerId: string,
  id: string,
  patch: Partial<Pick<FileRecord, 'name' | 'parentId' | 'isStarred'>>,
): Promise<FileRecord | null> {
  const rows = await db
    .update(files)
    .set({ ...patch, updatedAt: new Date() })
    .where(and(eq(files.id, id), eq(files.ownerId, ownerId)))
    .returning();
  return rows[0] ?? null;
}

export async function hardDeleteOne(
  db: Db,
  ownerId: string,
  id: string,
): Promise<boolean> {
  const rows = await db
    .delete(files)
    .where(and(eq(files.id, id), eq(files.ownerId, ownerId)))
    .returning({ id: files.id });
  return rows.length > 0;
}

/**
 * 子项数量（**含已软删的**）。
 * 硬删父目录会让软删子项的 parent_id 悬空，所以不能只数未删除的。
 */
export async function countChildren(
  db: Db,
  ownerId: string,
  parentId: string,
): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(files)
    .where(and(eq(files.ownerId, ownerId), eq(files.parentId, parentId)));
  return rows[0]?.value ?? 0;
}

/** 同级重名检查（不含回收站里的）。excludeId 用于「重命名时排除自身」。 */
export async function findSameName(
  db: Db,
  ownerId: string,
  parentId: string | null,
  name: string,
  excludeId?: string,
): Promise<FileRecord | null> {
  const conds = [
    eq(files.ownerId, ownerId),
    eq(files.name, name),
    eq(files.isTrashed, false),
    parentId ? eq(files.parentId, parentId) : isNull(files.parentId),
  ];
  if (excludeId) conds.push(ne(files.id, excludeId));

  const rows = await db.select().from(files).where(and(...conds)).limit(1);
  return rows[0] ?? null;
}

/**
 * 校验父目录：必须存在、属于本人、是文件夹、且未被软删。
 * parentId 为 null（根目录）时无需校验，返回 null。
 */
export async function findParentFolder(
  db: Db,
  ownerId: string,
  parentId: string | null,
): Promise<FileRecord | null> {
  if (!parentId) return null;
  const rows = await db
    .select()
    .from(files)
    .where(
      and(
        eq(files.id, parentId),
        eq(files.ownerId, ownerId),
        eq(files.type, 'folder'),
        eq(files.isTrashed, false),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
