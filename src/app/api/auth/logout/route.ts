import { signOut } from '@/lib/auth';
import { ok, handler } from '@/lib/api-response';

/**
 * POST /api/auth/logout
 * 清除 Auth.js 会话 cookie。
 *
 * 注意：signOut() 内部会尝试 redirect，这里传 redirect: false
 * 让它只清 cookie 并返回，由前端决定跳转。
 */
export const POST = handler(async () => {
  await signOut({ redirect: false });
  return ok({ loggedOut: true });
});
