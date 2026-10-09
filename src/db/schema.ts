import { sql } from 'drizzle-orm';
import {
  sqliteTable,
  text,
  integer,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/sqlite-core';
import type { AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

/**
 * D1 = SQLite。约束：
 * - 不使用 bigint / serial / pgTable
 * - 所有字节数用 integer（SQLite INTEGER 为 64 位，10GB 远未溢出）
 * - 所有时间为 integer(timestamp) 存 Unix 秒
 * - 布尔用 integer({ mode: 'boolean' })
 */

const now = sql`(unixepoch())`;

// ============================================================
// 认证表（@auth/drizzle-adapter 标准 schema，字段名必须一致）
// ============================================================

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),

    // --- Auth.js adapter 必需字段 ---
    name: text('name'),
    email: text('email').notNull(),
    emailVerified: integer('email_verified', { mode: 'timestamp' }),
    // adapter 默认 schema 要求 image 列；业务上复用 avatar
    image: text('image'),

    // --- 业务字段 ---
    passwordHash: text('password_hash'),
    avatar: text('avatar'),
    role: text('role').notNull().default('user'), // 'user' | 'admin'

    // 总存储配额（字节）
    storageQuota: integer('storage_quota').notNull().default(10737418240),
    storageUsed: integer('storage_used').notNull().default(0),

    // 月度上传配额（字节），默认 10GB
    monthlyUploadQuota: integer('monthly_upload_quota')
      .notNull()
      .default(10737418240),
    monthlyUploadUsed: integer('monthly_upload_used').notNull().default(0),
    // 下次重置时间（Asia/Shanghai 下月 1 日 00:00 的 Unix 秒）
    uploadQuotaResetAt: integer('upload_quota_reset_at', { mode: 'timestamp' }),

    // 注册来源（指向 invite_codes，懒引用避免与 inviteCodes.createdById 循环推断）
    invitedByCodeId: text('invited_by_code_id').references(
      (): AnySQLiteColumn => inviteCodes.id,
      { onDelete: 'set null' },
    ),
    registeredFrom: text('registered_from'), // 'invite' | 'direct'

    isDisabled: integer('is_disabled', { mode: 'boolean' })
      .notNull()
      .default(false),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(now),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(now),
  },
  (t) => ({
    emailIdx: uniqueIndex('users_email_unique').on(t.email),
    roleIdx: index('users_role_idx').on(t.role),
  }),
);

export const accounts = sqliteTable(
  'accounts',
  {
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    // 列名必须是 snake_case：@auth/drizzle-adapter 按列名匹配其默认 schema
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.provider, t.providerAccountId] }),
  }),
);

export const sessions = sqliteTable('sessions', {
  sessionToken: text('session_token').primaryKey(),
  userId: text('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: integer('expires', { mode: 'timestamp' }).notNull(),
});

export const verificationTokens = sqliteTable(
  'verification_tokens',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: integer('expires', { mode: 'timestamp' }).notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.identifier, t.token] }),
  }),
);

// ============================================================
// 邀请码
// ============================================================

export const inviteCodes = sqliteTable(
  'invite_codes',
  {
    id: text('id').primaryKey(),
    // 唯一索引，防枚举 + 唯一约束
    code: text('code').notNull(),

    createdById: text('created_by_id').references(
      (): AnySQLiteColumn => users.id,
      { onDelete: 'set null' },
    ),

    maxUses: integer('max_uses'), // null = 不限次数
    usedCount: integer('used_count').notNull().default(0),

    expiresAt: integer('expires_at', { mode: 'timestamp' }), // null = 永不过期
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    note: text('note'),

    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(now),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(now),
  },
  (t) => ({
    codeIdx: uniqueIndex('invite_codes_code_unique').on(t.code),
    activeIdx: index('invite_codes_active_idx').on(t.isActive),
  }),
);

// ============================================================
// 系统设置（key-value）
// ============================================================

export const systemSettings = sqliteTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull().default(now),
});

// ============================================================
// 文件 / 文件夹（第二阶段使用，表结构一期先建好）
// ============================================================

export const files = sqliteTable(
  'files',
  {
    id: text('id').primaryKey(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    parentId: text('parent_id'),
    name: text('name').notNull(),
    type: text('type').notNull(), // 'folder' | 'file'
    mimeType: text('mime_type'),
    size: integer('size').notNull().default(0), // 字节
    storageKey: text('storage_key'),
    hash: text('hash'),
    isStarred: integer('is_starred', { mode: 'boolean' })
      .notNull()
      .default(false),
    isTrashed: integer('is_trashed', { mode: 'boolean' })
      .notNull()
      .default(false),
    trashedAt: integer('trashed_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(now),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(now),
  },
  (t) => ({
    ownerParentIdx: index('files_owner_parent_idx').on(t.ownerId, t.parentId),
    ownerTrashIdx: index('files_owner_trash_idx').on(t.ownerId, t.isTrashed),
  }),
);

// 分片上传会话（断点续传）：记录 uploadId 与已上传分片 ETag
export const uploadSessions = sqliteTable(
  'upload_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    uploadId: text('upload_id').notNull(),
    storageKey: text('storage_key').notNull(),
    fileName: text('file_name').notNull(),
    parentId: text('parent_id'),
    mimeType: text('mime_type'),
    totalSize: integer('total_size').notNull(),
    partSize: integer('part_size').notNull(),
    totalParts: integer('total_parts').notNull(),
    // JSON 数组：[{ partNumber, etag }]
    parts: text('parts').notNull().default('[]'),
    status: text('status').notNull().default('pending'), // pending|completed|aborted
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(now),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
      .notNull()
      .default(now),
  },
  (t) => ({
    uploadIdIdx: uniqueIndex('upload_sessions_upload_id_unique').on(t.uploadId),
    userIdx: index('upload_sessions_user_idx').on(t.userId),
  }),
);

// ============================================================
// 分享
// ============================================================

export const shares = sqliteTable(
  'shares',
  {
    id: text('id').primaryKey(),
    fileId: text('file_id')
      .notNull()
      .references(() => files.id, { onDelete: 'cascade' }),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull(),
    passwordHash: text('password_hash'),
    expiresAt: integer('expires_at', { mode: 'timestamp' }),
    allowDownload: integer('allow_download', { mode: 'boolean' })
      .notNull()
      .default(true),
    viewCount: integer('view_count').notNull().default(0),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(now),
  },
  (t) => ({
    tokenIdx: uniqueIndex('shares_token_unique').on(t.token),
    ownerIdx: index('shares_owner_idx').on(t.ownerId),
  }),
);

// ============================================================
// 操作日志
// ============================================================

export const activityLogs = sqliteTable(
  'activity_logs',
  {
    id: text('id').primaryKey(),
    userId: text('user_id').references(() => users.id, {
      onDelete: 'set null',
    }),
    action: text('action').notNull(),
    targetId: text('target_id'),
    ip: text('ip'),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .default(now),
  },
  (t) => ({
    userIdx: index('activity_logs_user_idx').on(t.userId),
    createdIdx: index('activity_logs_created_idx').on(t.createdAt),
  }),
);

// ============================================================
// 类型导出
// ============================================================

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type InviteCode = typeof inviteCodes.$inferSelect;
export type NewInviteCode = typeof inviteCodes.$inferInsert;
export type SystemSetting = typeof systemSettings.$inferSelect;
export type FileRecord = typeof files.$inferSelect;
export type NewFileRecord = typeof files.$inferInsert;
export type UploadSession = typeof uploadSessions.$inferSelect;
export type Share = typeof shares.$inferSelect;
export type ActivityLog = typeof activityLogs.$inferSelect;
