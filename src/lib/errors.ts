/**
 * 结构化错误。
 * 所有 API 失败一律返回 { ok: false, error: { code, message, field? } }
 * 前端 toast 直接读 error.message，表单字段定位用 error.field。
 */

export const ErrorCode = {
  // 认证 / 授权
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',

  // 邀请码
  INVITE_REQUIRED: 'INVITE_REQUIRED',
  INVITE_NOT_FOUND: 'INVITE_NOT_FOUND',
  INVITE_EXPIRED: 'INVITE_EXPIRED',
  INVITE_EXHAUSTED: 'INVITE_EXHAUSTED',
  INVITE_DISABLED: 'INVITE_DISABLED',

  // 用户
  EMAIL_EXISTS: 'EMAIL_EXISTS',
  USER_DISABLED: 'USER_DISABLED',
  USER_NOT_FOUND: 'USER_NOT_FOUND',

  // 配额
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  MONTHLY_QUOTA_EXCEEDED: 'MONTHLY_QUOTA_EXCEEDED',

  // 文件 / 上传
  FILE_NOT_FOUND: 'FILE_NOT_FOUND',
  UPLOAD_INIT_FAILED: 'UPLOAD_INIT_FAILED',
  UPLOAD_CHUNK_FAILED: 'UPLOAD_CHUNK_FAILED',
  UPLOAD_COMPLETE_FAILED: 'UPLOAD_COMPLETE_FAILED',

  // 通用
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RATE_LIMITED: 'RATE_LIMITED',
  REGISTRATION_DISABLED: 'REGISTRATION_DISABLED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCodeType = (typeof ErrorCode)[keyof typeof ErrorCode];

/** 默认 HTTP 状态码映射 */
const STATUS_MAP: Record<string, number> = {
  [ErrorCode.UNAUTHORIZED]: 401,
  [ErrorCode.INVALID_CREDENTIALS]: 401,
  [ErrorCode.FORBIDDEN]: 403,
  [ErrorCode.USER_DISABLED]: 403,
  [ErrorCode.INVITE_REQUIRED]: 400,
  [ErrorCode.INVITE_NOT_FOUND]: 400,
  [ErrorCode.INVITE_EXPIRED]: 400,
  [ErrorCode.INVITE_EXHAUSTED]: 400,
  [ErrorCode.INVITE_DISABLED]: 400,
  [ErrorCode.EMAIL_EXISTS]: 409,
  [ErrorCode.USER_NOT_FOUND]: 404,
  [ErrorCode.FILE_NOT_FOUND]: 404,
  [ErrorCode.QUOTA_EXCEEDED]: 413,
  [ErrorCode.MONTHLY_QUOTA_EXCEEDED]: 413,
  [ErrorCode.VALIDATION_ERROR]: 422,
  [ErrorCode.RATE_LIMITED]: 429,
  [ErrorCode.REGISTRATION_DISABLED]: 403,
  [ErrorCode.UPLOAD_INIT_FAILED]: 502,
  [ErrorCode.UPLOAD_CHUNK_FAILED]: 502,
  [ErrorCode.UPLOAD_COMPLETE_FAILED]: 502,
  [ErrorCode.INTERNAL_ERROR]: 500,
};

export class AppError extends Error {
  readonly code: ErrorCodeType;
  readonly status: number;
  readonly field?: string;

  constructor(
    code: ErrorCodeType,
    message: string,
    options?: { field?: string; status?: number },
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.status = options?.status ?? STATUS_MAP[code] ?? 500;
    this.field = options?.field;
  }

  toJSON() {
    return {
      code: this.code,
      message: this.message,
      ...(this.field ? { field: this.field } : {}),
    };
  }
}

/** 常用快捷构造 */
export const Errors = {
  inviteRequired: () =>
    new AppError(ErrorCode.INVITE_REQUIRED, '请输入邀请码', {
      field: 'inviteCode',
    }),
  inviteNotFound: () =>
    new AppError(ErrorCode.INVITE_NOT_FOUND, '邀请码无效', {
      field: 'inviteCode',
    }),
  inviteExpired: () =>
    new AppError(ErrorCode.INVITE_EXPIRED, '邀请码已过期', {
      field: 'inviteCode',
    }),
  inviteExhausted: () =>
    new AppError(ErrorCode.INVITE_EXHAUSTED, '邀请码已用完', {
      field: 'inviteCode',
    }),
  inviteDisabled: () =>
    new AppError(ErrorCode.INVITE_DISABLED, '邀请码已被禁用', {
      field: 'inviteCode',
    }),
  emailExists: () =>
    new AppError(ErrorCode.EMAIL_EXISTS, '该邮箱已注册', { field: 'email' }),
  invalidCredentials: () =>
    new AppError(ErrorCode.INVALID_CREDENTIALS, '邮箱或密码错误'),
  unauthorized: () => new AppError(ErrorCode.UNAUTHORIZED, '请先登录'),
  forbidden: (msg = '没有权限执行此操作') =>
    new AppError(ErrorCode.FORBIDDEN, msg),
  userDisabled: () =>
    new AppError(ErrorCode.USER_DISABLED, '账号已被禁用，请联系管理员'),
  validation: (msg = '参数校验失败', field?: string) =>
    new AppError(ErrorCode.VALIDATION_ERROR, msg, { field }),
  quotaExceeded: (msg = '存储空间不足') =>
    new AppError(ErrorCode.QUOTA_EXCEEDED, msg),
  monthlyQuotaExceeded: (msg = '本月上传配额已用完') =>
    new AppError(ErrorCode.MONTHLY_QUOTA_EXCEEDED, msg),
  rateLimited: (msg = '操作过于频繁，请稍后再试') =>
    new AppError(ErrorCode.RATE_LIMITED, msg),
  notFound: (msg = '资源不存在') => new AppError(ErrorCode.FILE_NOT_FOUND, msg),
  internal: (msg = '服务器内部错误') =>
    new AppError(ErrorCode.INTERNAL_ERROR, msg),
};
