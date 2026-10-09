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

// TODO(batch-7): 替换为真正的文件列表页

export const metadata: Metadata = {
  title: '我的云盘 · 云盘',
};

/**
 * 占位页：登录成功后 router.push('/drive') 的目标路由，
 * 目前仅用于让登录流程可端到端验证（否则会 404）。
 */
export default function DrivePage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>我的云盘</CardTitle>
          <CardDescription>文件管理功能开发中（阶段 2）</CardDescription>
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
