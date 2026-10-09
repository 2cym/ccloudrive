import type { Metadata } from 'next';

import { LoginForm } from './login-form';

export const metadata: Metadata = {
  title: '登录 · 云盘',
};

/**
 * 登录页外壳（Server Component）。
 * 顶部不放导航栏，纯居中卡片布局，深色模式由全局 CSS 变量自动适配。
 */
export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <LoginForm />
    </main>
  );
}
