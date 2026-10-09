'use client';

/**
 * 登录表单。
 *
 * 登录方式（刻意设计，勿简化）：登录由两步串联完成，而不是单独一次调用。
 *   1) POST /api/auth/login —— 承担 KV 限流、统一凭证错误（防账号枚举）、
 *      写 activity_logs；成功返回 { user:{id,email,name,avatar,role}, quota }，
 *      用户的 role 从这里取。
 *   2) signIn('credentials', { redirect:false, email, password })（next-auth/react）——
 *      这一步才真正建立会话（写 JWT cookie）。
 *
 * 为什么两步都要：NextAuth 的 authorize()（src/lib/auth.ts）既不做限流、也不写日志。
 * 只用 signIn 会丢掉限流与审计；只用 /api/auth/login 则不会建立会话。
 * 代价是多一次 PBKDF2 哈希（约几十~百毫秒），可接受。
 *
 * 调用约束：只用 next-auth/react 的 signIn（客户端组件专用）；
 * 禁止使用 @/lib/auth 的 signIn（Server Action），混用会导致行为不可预期。
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { signIn } from 'next-auth/react';
import { useState } from 'react';
import { Eye, EyeOff, Loader2 } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api-client';
import { loginSchema } from '@/lib/validators';
import type { MeResponse } from '@/types/api';

type FieldErrors = { email?: string; password?: string };

export function LoginForm({
  initialEmail = '',
  registered = false,
}: {
  initialEmail?: string;
  registered?: boolean;
}) {
  const router = useRouter();
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    setFieldErrors({});

    // 前端校验：复用与后端一致的 loginSchema，不手写 email 正则。
    const parsed = loginSchema.safeParse({ email, password });
    if (!parsed.success) {
      const nextErrors: FieldErrors = {};
      for (const issue of parsed.error.errors) {
        const key = issue.path[0];
        if (key === 'email' && !nextErrors.email) nextErrors.email = issue.message;
        if (key === 'password' && !nextErrors.password) nextErrors.password = issue.message;
      }
      setFieldErrors(nextErrors);
      return;
    }

    setSubmitting(true);
    try {
      // 第 1 步：预检（限流 + 统一凭证错误 + 审计日志），并取回 role。
      const result = await api.post<MeResponse>('/api/auth/login', parsed.data);
      if (!result.ok) {
        // 字段级错误定位到具体输入框；否则作为表单级错误展示。
        // 限流（RATE_LIMITED）等错误直接原样展示后端 message。
        if (result.error.field === 'email') {
          setFieldErrors({ email: result.error.message });
        } else if (result.error.field === 'password') {
          setFieldErrors({ password: result.error.message });
        } else {
          setFormError(result.error.message);
        }
        return;
      }

      // 第 2 步：建立会话。next-auth v5 的 signIn 对内置 provider
      // （credentials 不属于 RedirectableProviderType）的返回类型为 undefined，
      // 故这里不基于其返回值分支——凭证合法性已由第 1 步校验。
      await signIn('credentials', {
        redirect: false,
        email: parsed.data.email,
        password: parsed.data.password,
      });

      const destination = result.data.user.role === 'admin' ? '/admin' : '/drive';
      router.push(destination);
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '登录失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">登录</CardTitle>
        <CardDescription>登录你的云盘账号以继续。</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {registered ? (
            <Alert>
              <AlertTitle>注册成功</AlertTitle>
              <AlertDescription>注册成功，请使用该账号登录。注册邮箱已为你填好。</AlertDescription>
            </Alert>
          ) : null}

          {formError ? (
            <Alert variant="destructive">
              <AlertTitle>登录失败</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={submitting}
              aria-invalid={fieldErrors.email ? true : undefined}
            />
            {fieldErrors.email ? <p className="text-sm text-destructive">{fieldErrors.email}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <div className="relative">
              <Input
                id="password"
                name="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={submitting}
                className="pr-10"
                aria-invalid={fieldErrors.password ? true : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
            {fieldErrors.password ? <p className="text-sm text-destructive">{fieldErrors.password}</p> : null}
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                登录中…
              </>
            ) : (
              '登录'
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex justify-center text-sm text-muted-foreground">
        还没有账号？
        <Link href="/register" className="ml-1 font-medium text-primary underline-offset-4 hover:underline">
          立即注册
        </Link>
      </CardFooter>
    </Card>
  );
}
