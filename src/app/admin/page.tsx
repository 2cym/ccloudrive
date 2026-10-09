import type { Metadata } from 'next';
import Link from 'next/link';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

// TODO(batch-7): 替换为真正的管理后台

export const metadata: Metadata = {
  title: '管理后台 · 云盘',
};

/**
 * 占位页：管理员登录成功后 router.push('/admin') 的目标路由。
 */
export default function AdminPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>管理后台</CardTitle>
          <CardDescription>开发中（阶段 6）</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link href="/">返回首页</Link>
          </Button>
        </CardContent>
      </Card>
    </main>
  );
}
