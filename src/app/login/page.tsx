import type { Metadata } from 'next';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: '登录 · 云盘',
};

/**
 * 登录页外壳（Server Component）。
 * 顶部不放导航栏，纯居中卡片布局，深色模式由全局 CSS 变量自动适配。
 * 支持从 URL 读取预填邮箱与「刚注册」提示（注册成功后跳转回来时使用）。
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: { email?: string; registered?: string };
}) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <LoginForm
        initialEmail={typeof searchParams.email === 'string' ? searchParams.email : ''}
        registered={searchParams.registered === '1'}
      />
    </main>
  );
}
