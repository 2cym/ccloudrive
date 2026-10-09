import { z } from 'zod';

/**
 * 前后端共用的 Zod 校验 schema。
 *
 * 原则：
 * - 每个 schema 都有明确的人类可读错误信息
 * - 注册 schema 与后端 /api/auth/register 的 registerSchema 保持一致
 * - 登录 schema 与后端 /api/auth/login 的 loginSchema 保持一致
 * - 管理端表单 schema 与对应 PATCH 接口保持一致
 */

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, '请输入邮箱')
    .email('邮箱格式不正确')
    .max(254)
    .transform((v) => v.toLowerCase().trim()),
  password: z.string().min(1, '请输入密码'),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registerSchema = z
  .object({
    email: z
      .string()
      .min(1, '请输入邮箱')
      .email('邮箱格式不正确')
      .max(254)
      .transform((v) => v.toLowerCase().trim()),
    password: z
      .string()
      .min(8, '密码至少 8 位')
      .max(128, '密码过长'),
    name: z
      .string()
      .trim()
      .min(1, '请输入昵称')
      .max(50, '昵称过长'),
    inviteCode: z
      .string()
      .trim()
      .min(1, '请输入邀请码')
      .transform((v) => v.toUpperCase()),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;

export const createInviteCodeSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(4, '邀请码至少 4 位')
      .max(32, '邀请码最多 32 位')
      .regex(/^[A-Za-z0-9]+$/, '邀请码只能包含字母和数字')
      .transform((v) => v.toUpperCase())
      .optional(),
    maxUses: z
      .number()
      .int('必须为整数')
      .positive('必须大于 0')
      .max(1_000_000, '数值过大')
      .nullable()
      .optional(),
    expiresAt: z.string().datetime().nullable().optional(),
    isActive: z.boolean().optional(),
    note: z.string().trim().max(200, '备注最多 200 字').nullable().optional(),
  })
  .strict();

export const updateInviteCodeSchema = createInviteCodeSchema.omit({ code: true });

export const systemSettingsSchema = z.object({
  defaultStorageQuota: z
    .number()
    .int('必须为整数')
    .min(0)
    .max(1099511627776, '不能超过 1TB')
    .optional(),
  defaultMonthlyUploadQuota: z
    .number()
    .int('必须为整数')
    .min(0)
    .max(1099511627776, '不能超过 1TB')
    .optional(),
  requireInviteCode: z.boolean().optional(),
  maxUploadSize: z
    .number()
    .int('必须为整数')
    .min(0)
    .max(5497558138880, '不能超过 5TB')
    .optional(),
  allowedFileTypes: z
    .array(z.string().trim().min(1, '不能为空'))
    .max(200, '类型过多')
    .optional(),
});

export type SystemSettingsInput = z.infer<typeof systemSettingsSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, '请输入当前密码'),
    newPassword: z
      .string()
      .min(8, '新密码至少 8 位')
      .max(128, '密码过长'),
    confirmPassword: z.string().min(1, '请确认新密码'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: '两次输入的密码不一致',
    path: ['confirmPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
