/**
 * 上传配额计算 —— 全部基于 Asia/Shanghai 自然月。
 *
 * 严禁使用 new Date().getMonth() / getFullYear()：那取的是 Workers 运行时的
 * 本地时区（UTC），会导致每月 1 日 00:00–08:00 这段窗口跨月重置错乱。
 *
 * 本文件统一用 Intl.DateTimeFormat 显式指定 timeZone: 'Asia/Shanghai'
 * 解析出「上海当地时间」的年/月，再换算成 UTC 时间戳边界。
 */

export const TZ = 'Asia/Shanghai';

const partsFormatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false,
});

type ShParts = {
  year: number;
  month: number; // 1-12
  day: number;
  hour: number;
  minute: number;
  second: number;
};

/** 取某个 UTC 时刻对应的上海本地时间各分量 */
function shanghaiParts(date: Date): ShParts {
  const parts = partsFormatter.formatToParts(date);
  const get = (type: string) => {
    const p = parts.find((x) => x.type === type);
    return p ? Number.parseInt(p.value, 10) : 0;
  };
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    // en-CA + hour12:false 在 24:00 场景可能给 "24"，归一到 0
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** 上海当前时间与 UTC 的偏移（分钟）。+08:00 → 480；夏令时不存在，恒为 480。 */
function shanghaiOffsetMinutes(date: Date): number {
  const p = shanghaiParts(date);
  // 把上海本地时间分量当作 UTC 解释，与原时刻的差值即为偏移
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  // 抹掉毫秒影响
  const base = Math.floor(date.getTime() / 1000) * 1000;
  return Math.round((asUtc - base) / 60000);
}

/**
 * 把「上海本地时间」的日历分量转换成 UTC 时间戳（秒）。
 * 通过两次迭代消除时区偏移在夜间的微小误差。
 */
function shanghaiLocalToUtcSeconds(
  year: number,
  month: number, // 1-12
  day: number,
): number {
  // 先用「本地时间分量当作 UTC」得到一个近似时刻
  const naive = Date.UTC(year, month - 1, day, 0, 0, 0);
  // 该近似时刻对应的上海偏移
  const offset = shanghaiOffsetMinutes(new Date(naive));
  // 减掉偏移即得真正的 UTC
  const corrected = naive - offset * 60_000;
  // 再校正一次（边界日期可能因偏移导致偏移量读取落在另一天）
  const offset2 = shanghaiOffsetMinutes(new Date(corrected));
  if (offset2 !== offset) {
    return Math.floor((naive - offset2 * 60_000) / 1000);
  }
  return Math.floor(corrected / 1000);
}

/** 上海时区下「当月第一天 00:00:00」的 UTC 秒时间戳 */
export function startOfShanghaiMonth(at: Date = new Date()): number {
  const p = shanghaiParts(at);
  return shanghaiLocalToUtcSeconds(p.year, p.month, 1);
}

/** 上海时区下「下月第一天 00:00:00」的 UTC 秒时间戳（即配额重置时刻） */
export function startOfNextShanghaiMonth(at: Date = new Date()): number {
  const p = shanghaiParts(at);
  const nextMonth = p.month === 12 ? 1 : p.month + 1;
  const nextYear = p.month === 12 ? p.year + 1 : p.year;
  return shanghaiLocalToUtcSeconds(nextYear, nextMonth, 1);
}

/** 当前上海月份标识，如 "2026-10"，用于日志与调试 */
export function shanghaiMonthKey(at: Date = new Date()): string {
  const p = shanghaiParts(at);
  return `${p.year}-${String(p.month).padStart(2, '0')}`;
}

/**
 * 判断配额是否需要重置。
 * 逻辑：若 uploadQuotaResetAt 为空，或当前时间已越过该重置点 → 需要重置。
 */
export function needsReset(
  uploadQuotaResetAt: Date | number | null | undefined,
  at: Date = new Date(),
): boolean {
  if (uploadQuotaResetAt == null) return true;
  const resetAt =
    uploadQuotaResetAt instanceof Date
      ? Math.floor(uploadQuotaResetAt.getTime() / 1000)
      : uploadQuotaResetAt;
  // 若记录的重置点已经过去，且当前上海月份 != 记录所代表的月份，则重置
  if (Math.floor(at.getTime() / 1000) >= resetAt) return true;
  return false;
}

/** 计算新的重置时刻（下月 1 日 00:00 CST） */
export function nextResetAt(at: Date = new Date()): Date {
  return new Date(startOfNextShanghaiMonth(at) * 1000);
}

// ============================================================
// 配额计算
// ============================================================

export const GB = 1073741824;
export const DEFAULT_STORAGE_QUOTA = 10 * GB; // 10GB
export const DEFAULT_MONTHLY_UPLOAD_QUOTA = 10 * GB; // 10GB

export type QuotaSnapshot = {
  storageQuota: number;
  storageUsed: number;
  storageRemaining: number;
  monthlyUploadQuota: number;
  monthlyUploadUsed: number;
  monthlyUploadRemaining: number;
  quotaResetAt: string; // ISO
  monthKey: string;
};

export type QuotaSource = {
  storageQuota: number;
  storageUsed: number;
  monthlyUploadQuota: number;
  monthlyUploadUsed: number;
  uploadQuotaResetAt: Date | number | null;
};

/**
 * 计算配额快照。若已跨月，monthlyUploadUsed 视为 0（惰性重置语义）。
 * 注意：这里的「视为 0」只影响返回给前端展示，真正的落库重置在
 * quotaResetStatements() 里由批量 SQL 完成。
 */
export function computeQuota(
  u: QuotaSource,
  at: Date = new Date(),
): QuotaSnapshot {
  const reset = needsReset(u.uploadQuotaResetAt, at);
  const monthlyUsed = reset ? 0 : u.monthlyUploadUsed;

  return {
    storageQuota: u.storageQuota,
    storageUsed: u.storageUsed,
    storageRemaining: Math.max(0, u.storageQuota - u.storageUsed),
    monthlyUploadQuota: u.monthlyUploadQuota,
    monthlyUploadUsed: monthlyUsed,
    monthlyUploadRemaining: Math.max(0, u.monthlyUploadQuota - monthlyUsed),
    quotaResetAt: nextResetAt(at).toISOString(),
    monthKey: shanghaiMonthKey(at),
  };
}

/** 字节数人类可读格式 */
export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1,
  );
  const val = bytes / Math.pow(1024, i);
  return `${val >= 100 ? val.toFixed(0) : val.toFixed(2)} ${units[i]}`;
}
