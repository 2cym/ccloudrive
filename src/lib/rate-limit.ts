import { getCloudflareEnv } from '@/db/client';

/**
 * 基于 Workers KV 的滑动窗口限流。
 *
 * 为什么不用固定窗口：固定窗口在边界处可通过双倍请求。
 * 这里用「计数 + TTL」的简化滑动窗口，对注册/登录/邀请码校验足够。
 *
 * KV 最终一致（最长 60s 传播延迟），因此它是「防滥用」而非「强一致」方案。
 * 对于超卖这类强一致需求，已由 D1 的条件更新兜底，二者互补。
 */

export type RateLimitResult = {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix 秒
};

type CounterValue = { count: number; resetAt: number };

export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds: number,
): Promise<RateLimitResult> {
  const env = getCloudflareEnv();
  const kv = env.KV;

  // 无 KV 绑定（例如未配置本地环境）时降级放行，避免开发受阻
  if (!kv) {
    return { allowed: true, remaining: limit, resetAt: 0 };
  }

  const nowSec = Math.floor(Date.now() / 1000);
  const kvKey = `rl:${key}`;

  let current: CounterValue | null = null;
  try {
    current = await kv.get<CounterValue>(kvKey, 'json');
  } catch {
    return { allowed: true, remaining: limit, resetAt: 0 };
  }

  // 窗口已过期或不存在 → 新窗口
  if (!current || current.resetAt <= nowSec) {
    const next: CounterValue = { count: 1, resetAt: nowSec + windowSeconds };
    await kv.put(kvKey, JSON.stringify(next), {
      expirationTtl: windowSeconds + 5,
    });
    return { allowed: true, remaining: limit - 1, resetAt: next.resetAt };
  }

  if (current.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt };
  }

  current.count += 1;
  const ttl = Math.max(1, current.resetAt - nowSec + 5);
  await kv.put(kvKey, JSON.stringify(current), { expirationTtl: ttl });

  return {
    allowed: true,
    remaining: limit - current.count,
    resetAt: current.resetAt,
  };
}

/** 从请求头提取客户端 IP（Cloudflare 会设置 CF-Connecting-IP） */
export function getClientIp(req: Request): string {
  return (
    req.headers.get('cf-connecting-ip') ??
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  );
}

/** 预置限流策略 */
export const RateLimits = {
  register: { limit: 5, window: 3600 }, // 每 IP 每小时 5 次注册
  login: { limit: 10, window: 900 }, // 每 IP 每 15 分钟 10 次登录
  inviteCheck: { limit: 20, window: 600 }, // 防邀请码枚举
} as const;
