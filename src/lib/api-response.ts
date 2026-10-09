import { NextResponse } from 'next/server';
import { ZodError } from 'zod';

import { AppError, ErrorCode } from './errors';

/**
 * 统一响应包装。
 *   成功: { ok: true, data }
 *   失败: { ok: false, error: { code, message, field? } }
 */

export type ApiSuccess<T> = { ok: true; data: T };
export type ApiFailure = {
  ok: false;
  error: { code: string; message: string; field?: string };
};
export type ApiResult<T> = ApiSuccess<T> | ApiFailure;

export function ok<T>(data: T, init?: ResponseInit): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data } as ApiSuccess<T>, {
    status: 200,
    ...init,
  });
}

export function created<T>(data: T): NextResponse<ApiSuccess<T>> {
  return NextResponse.json({ ok: true, data } as ApiSuccess<T>, {
    status: 201,
  });
}

export function fail(error: AppError): NextResponse<ApiFailure> {
  return NextResponse.json(
    { ok: false, error: error.toJSON() } as ApiFailure,
    { status: error.status },
  );
}

/** 把任意异常转成统一失败响应。用于 route.ts 的 catch 分支。 */
export function toFailure(err: unknown): NextResponse<ApiFailure> {
  // Next.js 的控制流信号不是错误，必须原样抛出，否则会破坏
  // 动态路由判定 / redirect / notFound 的语义，并产生误导性日志。
  const digest = (err as { digest?: unknown } | null)?.digest;
  if (typeof digest === 'string') {
    if (
      digest.startsWith('NEXT_REDIRECT') ||
      digest.startsWith('NEXT_NOT_FOUND') ||
      digest === 'DYNAMIC_SERVER_USAGE'
    ) {
      throw err; // 直接 rethrow：不要 console.error，不要转 JSON 响应
    }
  }

  if (err instanceof AppError) return fail(err);

  // Zod 校验错误 → 字段级提示
  if (err instanceof ZodError) {
    const first = err.errors[0];
    const appErr = new AppError(
      ErrorCode.VALIDATION_ERROR,
      first?.message ?? '参数校验失败',
      { field: first?.path?.join('.') || undefined },
    );
    return fail(appErr);
  }

  // 只向客户端暴露通用信息，细节写日志
  console.error('[api] unhandled error:', err);
  return fail(new AppError(ErrorCode.INTERNAL_ERROR, '服务器内部错误'));
}

/**
 * 包裹 route handler，自动捕获异常并输出结构化错误。
 *
 * 用法：
 *   export const POST = handler(async (req) => { ... return ok(data); });
 */
export function handler<TCtx = unknown>(
  fn: (req: Request, ctx: TCtx) => Promise<NextResponse>,
) {
  return async (req: Request, ctx: TCtx): Promise<NextResponse> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return toFailure(err);
    }
  };
}

/** 解析 JSON body，非法 JSON 直接抛 VALIDATION_ERROR */
export async function readJson<T = unknown>(req: Request): Promise<T> {
  try {
    return (await req.json()) as T;
  } catch {
    throw new AppError(ErrorCode.VALIDATION_ERROR, '请求体不是合法 JSON');
  }
}
