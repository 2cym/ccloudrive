import { handlers } from '@/lib/auth';

/**
 * Auth.js 路由处理器。
 * 提供 /api/auth/signin、/api/auth/callback/credentials、/api/auth/session、
 * /api/auth/csrf、/api/auth/signout 等端点。
 *
 * 注意：Workers 运行时需要 runtime = 'edge'（OpenNext 会自动处理，
 * 但显式声明可避免本地 next dev 走 Node runtime）。
 */
export const runtime = 'edge';

export const { GET, POST } = handlers;
