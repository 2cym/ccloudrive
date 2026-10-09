import Link from 'next/link';
import { Cloud, HardDrive, ShieldCheck } from 'lucide-react';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

/**
 * Landing page for the cloud drive application.
 * Rendered as a Server Component; navigation uses next/link only.
 */
export default function HomePage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-10 px-6 py-16">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground">
          <Cloud className="h-8 w-8" aria-hidden="true" />
        </div>
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">云盘</h1>
        <p className="max-w-md text-muted-foreground">
          在边缘节点上安全地存储、管理与分享你的文件。
        </p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link href="/login">登录</Link>
        </Button>
        <Button asChild size="lg" variant="outline">
          <Link href="/register">注册</Link>
        </Button>
      </div>

      <div className="grid w-full max-w-3xl gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <HardDrive className="mb-2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <CardTitle>随时随地访问</CardTitle>
            <CardDescription>
              文件存储于全球边缘网络，就近响应，无需等待。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            上传、下载与预览均在全球节点完成。
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <ShieldCheck className="mb-2 h-5 w-5 text-muted-foreground" aria-hidden="true" />
            <CardTitle>安全可控</CardTitle>
            <CardDescription>
              账号鉴权与访问隔离，只有你能看到自己的文件。
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            基于会话的权限校验贯穿每一次请求。
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
