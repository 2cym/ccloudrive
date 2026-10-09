'use client';

/**
 * 注册表单。
 *
 * 注册成功后**不自动登录**，而是跳转 /login?registered=1&email=<邮箱> 把刚注册的邮箱预填。
 * 刻意如此：用户能立刻确认「我注册的就是这个邮箱」；把登录交还给登录页，也让
 * 「邀请制 / 管理员审核」等边界处理更简单。
 *
 * 提交一律使用 parsed.data —— registerSchema 已对 email 做 toLowerCase().trim()、
 * 对 inviteCode 做 toUpperCase()，不要回传原始 state。
 */

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Eye, EyeOff, Loader2, UserPlus } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { api } from '@/lib/api-client';
import { registerSchema } from '@/lib/validators';

type FieldErrors = { name?: string; email?: string; password?: string; inviteCode?: string };

// 注册接口的 quota 不含 monthKey，与 MeResponse 不兼容，这里只取所需字段。
type RegisterResponse = { user: { id: string; email: string; name: string; role: string } };

/** 四条规则打分（0~4）：长度≥8、大小写齐全、含数字、含符号。 */
function scorePassword(v: string): number {
  return (
    (v.length >= 8 ? 1 : 0) +
    (/[a-z]/.test(v) && /[A-Z]/.test(v) ? 1 : 0) +
    (/\d/.test(v) ? 1 : 0) +
    (/[^A-Za-z0-9]/.test(v) ? 1 : 0)
  );
}

const STRENGTH = {
  weak: { label: '弱', text: 'text-destructive', bar: '[&>div]:bg-destructive' },
  medium: { label: '中', text: 'text-amber-500', bar: '[&>div]:bg-amber-500' },
  strong: { label: '强', text: 'text-emerald-600', bar: '[&>div]:bg-emerald-600' },
} as const;

export function RegisterForm() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);

  const strength = scorePassword(password);
  const style = strength <= 1 ? STRENGTH.weak : strength >= 4 ? STRENGTH.strong : STRENGTH.medium;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting) return;

    setFormError(null);
    setFieldErrors({});

    const parsed = registerSchema.safeParse({ email, password, name, inviteCode });
    if (!parsed.success) {
      const next: FieldErrors = {};
      for (const issue of parsed.error.errors) {
        const key = issue.path[0];
        if (key === 'name' && !next.name) next.name = issue.message;
        else if (key === 'email' && !next.email) next.email = issue.message;
        else if (key === 'password' && !next.password) next.password = issue.message;
        else if (key === 'inviteCode' && !next.inviteCode) next.inviteCode = issue.message;
      }
      setFieldErrors(next);
      return;
    }

    setSubmitting(true);
    try {
      const result = await api.post<RegisterResponse>('/api/auth/register', parsed.data);
      if (!result.ok) {
        // 字段级错误定位到具体输入框；无 field 的（限流/校验）直接原样展示后端 message。
        const slot = result.error.field;
        if (slot === 'email' || slot === 'password' || slot === 'name' || slot === 'inviteCode') {
          setFieldErrors({ [slot]: result.error.message });
        } else {
          setFormError(result.error.message);
        }
        return;
      }

      router.push(`/login?registered=1&email=${encodeURIComponent(parsed.data.email)}`);
      router.refresh();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : '注册失败，请稍后重试');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Card className="w-full max-w-md">
      <CardHeader className="space-y-1">
        <CardTitle className="text-2xl">注册</CardTitle>
        <CardDescription>创建你的云盘账号。</CardDescription>
      </CardHeader>

      <CardContent>
        <form onSubmit={handleSubmit} noValidate className="space-y-4">
          {formError ? (
            <Alert variant="destructive">
              <AlertTitle>注册失败</AlertTitle>
              <AlertDescription>{formError}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="name">昵称</Label>
            <Input id="name" name="name" type="text" autoComplete="nickname" placeholder="你的昵称"
              value={name} onChange={(e) => setName(e.target.value)} disabled={submitting}
              aria-invalid={fieldErrors.name ? true : undefined} />
            {fieldErrors.name ? <p className="text-sm text-destructive">{fieldErrors.name}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">邮箱</Label>
            <Input id="email" name="email" type="email" autoComplete="email" placeholder="you@example.com"
              value={email} onChange={(e) => setEmail(e.target.value)} disabled={submitting}
              aria-invalid={fieldErrors.email ? true : undefined} />
            {fieldErrors.email ? <p className="text-sm text-destructive">{fieldErrors.email}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="password">密码</Label>
            <div className="relative">
              <Input id="password" name="password" type={showPassword ? 'text' : 'password'}
                autoComplete="new-password" value={password} className="pr-10" disabled={submitting}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={fieldErrors.password ? true : undefined} />
              <button type="button" onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? '隐藏密码' : '显示密码'}
                className="absolute inset-y-0 right-0 flex items-center px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {showPassword ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
              </button>
            </div>
            {password ? (
              <div className="flex items-center gap-2">
                <Progress value={(strength / 4) * 100} className={`h-1.5 flex-1 ${style.bar}`} />
                <span className={`text-xs font-medium ${style.text}`}>{style.label}</span>
              </div>
            ) : null}
            {fieldErrors.password ? <p className="text-sm text-destructive">{fieldErrors.password}</p> : null}
          </div>

          <div className="space-y-2">
            <Label htmlFor="inviteCode">邀请码</Label>
            <Input id="inviteCode" name="inviteCode" type="text" autoComplete="off" placeholder="请输入邀请码"
              value={inviteCode} disabled={submitting}
              onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
              aria-invalid={fieldErrors.inviteCode ? true : undefined} />
            {fieldErrors.inviteCode ? <p className="text-sm text-destructive">{fieldErrors.inviteCode}</p> : null}
          </div>

          <Button type="submit" className="w-full" disabled={submitting}>
            {submitting ? (
              <>
                <Loader2 className="animate-spin" aria-hidden="true" />
                注册中…
              </>
            ) : (
              <>
                <UserPlus aria-hidden="true" />
                注册
              </>
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex justify-center text-sm text-muted-foreground">
        已有账号？
        <Link href="/login" className="ml-1 font-medium text-primary underline-offset-4 hover:underline">
          去登录
        </Link>
      </CardFooter>
    </Card>
  );
}
