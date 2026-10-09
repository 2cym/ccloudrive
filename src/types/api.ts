import type { InviteCode } from '@/db/schema';

/** 邀请码只读校验结果 */
export type InviteValidationResult =
  | { ok: true; record: InviteCode }
  | { ok: false; reason: InviteFailReason; record?: InviteCode };

export type InviteFailReason =
  | 'required'
  | 'not_found'
  | 'expired'
  | 'exhausted'
  | 'disabled';

/** /api/user/me 返回结构 */
export type MeResponse = {
  user: {
    id: string;
    email: string;
    name: string;
    avatar: string | null;
    role: string;
  };
  quota: {
    storageQuota: number;
    storageUsed: number;
    storageRemaining: number;
    monthlyUploadQuota: number;
    monthlyUploadUsed: number;
    monthlyUploadRemaining: number;
    quotaResetAt: string;
    monthKey: string;
  };
};

/** 注册请求体 */
export type RegisterRequest = {
  email: string;
  password: string;
  name?: string;
  inviteCode: string;
};

/** 管理端：邀请码视图（含计算状态） */
export type InviteCodeView = {
  id: string;
  code: string;
  status: 'active' | 'disabled' | 'expired' | 'exhausted';
  usedCount: number;
  maxUses: number | null;
  expiresAt: string | null;
  isActive: boolean;
  note: string | null;
  createdById: string | null;
  createdAt: string;
  updatedAt: string;
};

/** 管理端：系统设置视图 */
export type SystemSettingsView = {
  defaultStorageQuota: number;
  defaultMonthlyUploadQuota: number;
  requireInviteCode: boolean;
  maxUploadSize: number;
  allowedFileTypes: string[];
};

/** 管理端：统计概览 */
export type AdminStats = {
  userCount: number;
  adminCount: number;
  disabledCount: number;
  inviteCodeCount: number;
  activeInviteCodeCount: number;
};
