import { inArray, sql } from 'drizzle-orm';

import type { Db } from '@/db/client';
import { systemSettings } from '@/db/schema';
import {
  DEFAULT_STORAGE_QUOTA,
  DEFAULT_MONTHLY_UPLOAD_QUOTA,
} from '@/lib/quota';
import type { SystemSettingsView } from '@/types/api';

/**
 * 系统设置 key-value 层。
 * value 统一以 TEXT 存储；数字和布尔在此处做解析与默认值兜底。
 */

export const SettingKey = {
  DEFAULT_STORAGE_QUOTA: 'defaultStorageQuota',
  DEFAULT_MONTHLY_UPLOAD_QUOTA: 'defaultMonthlyUploadQuota',
  REQUIRE_INVITE_CODE: 'requireInviteCode',
  MAX_UPLOAD_SIZE: 'maxUploadSize',
  ALLOWED_FILE_TYPES: 'allowedFileTypes',
} as const;

const ALL_KEYS = Object.values(SettingKey);

const DEFAULTS: SystemSettingsView = {
  defaultStorageQuota: DEFAULT_STORAGE_QUOTA,
  defaultMonthlyUploadQuota: DEFAULT_MONTHLY_UPLOAD_QUOTA,
  requireInviteCode: true,
  maxUploadSize: 5 * 1073741824, // 5GB
  allowedFileTypes: [],
};

/** 解析单个值 */
function parseNumber(v: string | undefined, fallback: number): number {
  if (v == null) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

function parseBoolean(v: string | undefined, fallback: boolean): boolean {
  if (v == null) return fallback;
  return v === 'true' || v === '1';
}

function parseJsonArray(v: string | undefined, fallback: string[]): string[] {
  if (!v) return fallback;
  try {
    const parsed = JSON.parse(v);
    return Array.isArray(parsed) ? parsed.map(String) : fallback;
  } catch {
    return fallback;
  }
}

/** 一次性读取全部设置，缺失项用默认值补齐 */
export async function getAllSettings(db: Db): Promise<SystemSettingsView> {
  const rows = await db
    .select()
    .from(systemSettings)
    .where(inArray(systemSettings.key, ALL_KEYS));

  const map = new Map(rows.map((r) => [r.key, r.value]));

  return {
    defaultStorageQuota: parseNumber(
      map.get(SettingKey.DEFAULT_STORAGE_QUOTA),
      DEFAULTS.defaultStorageQuota,
    ),
    defaultMonthlyUploadQuota: parseNumber(
      map.get(SettingKey.DEFAULT_MONTHLY_UPLOAD_QUOTA),
      DEFAULTS.defaultMonthlyUploadQuota,
    ),
    requireInviteCode: parseBoolean(
      map.get(SettingKey.REQUIRE_INVITE_CODE),
      DEFAULTS.requireInviteCode,
    ),
    maxUploadSize: parseNumber(
      map.get(SettingKey.MAX_UPLOAD_SIZE),
      DEFAULTS.maxUploadSize,
    ),
    allowedFileTypes: parseJsonArray(
      map.get(SettingKey.ALLOWED_FILE_TYPES),
      DEFAULTS.allowedFileTypes,
    ),
  };
}

/** 批量 upsert。用 ON CONFLICT 保证单条语句即幂等。 */
export async function upsertSettings(
  db: Db,
  patch: Partial<SystemSettingsView>,
): Promise<void> {
  const entries: Array<{ key: string; value: string }> = [];

  if (patch.defaultStorageQuota !== undefined) {
    entries.push({
      key: SettingKey.DEFAULT_STORAGE_QUOTA,
      value: String(patch.defaultStorageQuota),
    });
  }
  if (patch.defaultMonthlyUploadQuota !== undefined) {
    entries.push({
      key: SettingKey.DEFAULT_MONTHLY_UPLOAD_QUOTA,
      value: String(patch.defaultMonthlyUploadQuota),
    });
  }
  if (patch.requireInviteCode !== undefined) {
    entries.push({
      key: SettingKey.REQUIRE_INVITE_CODE,
      value: patch.requireInviteCode ? 'true' : 'false',
    });
  }
  if (patch.maxUploadSize !== undefined) {
    entries.push({
      key: SettingKey.MAX_UPLOAD_SIZE,
      value: String(patch.maxUploadSize),
    });
  }
  if (patch.allowedFileTypes !== undefined) {
    entries.push({
      key: SettingKey.ALLOWED_FILE_TYPES,
      value: JSON.stringify(patch.allowedFileTypes),
    });
  }

  if (!entries.length) return;

  const now = new Date();
  await db
    .insert(systemSettings)
    .values(entries.map((e) => ({ ...e, updatedAt: now })))
    .onConflictDoUpdate({
      target: systemSettings.key,
      set: { value: sqlExcluded('value'), updatedAt: now },
    });
}

// Drizzle onConflictDoUpdate 需要引用 excluded.value
function sqlExcluded(column: string) {
  return sql.raw(`excluded.${column}`);
}

/** 初始化默认设置（幂等，seed 或首次部署调用） */
export async function ensureDefaultSettings(db: Db): Promise<void> {
  await upsertSettings(db, DEFAULTS);
}
