import type { Metadata } from 'next';
import { cookies, headers } from 'next/headers';

import FilesBrowser from './files-browser';
import type { FilesResponse } from './drive-types';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: '我的云盘 · 云盘',
};

export default async function DrivePage() {
  const h = headers();
  const c = cookies();
  const host = h.get('host');
  const proto = h.get('x-forwarded-proto') ?? 'https';
  const cookie = c
    .getAll()
    .map(({ name, value }) => `${name}=${value}`)
    .join('; ');
  let initialData: FilesResponse | null = null;
  let initialError: string | null = null;

  if (!host) {
    initialError = '无法确定服务器地址';
  } else {
    try {
      const response = await fetch(`${proto}://${host}/api/files`, {
        headers: cookie ? { cookie } : undefined,
        cache: 'no-store',
      });
      const result: unknown = await response.json();
      if (
        response.ok &&
        typeof result === 'object' &&
        result !== null &&
        'ok' in result &&
        result.ok === true &&
        'data' in result
      ) {
        initialData = result.data as FilesResponse;
      } else {
        initialError = '获取文件列表失败';
      }
    } catch {
      initialError = '获取文件列表失败';
    }
  }

  return (
    <main className="min-h-screen bg-background px-4 py-8 md:px-8">
      <FilesBrowser
        initialFiles={initialData?.files ?? []}
        initialBreadcrumb={initialData?.breadcrumb ?? [{ id: null, name: '根目录' }]}
        initialParent={initialData?.parent ?? null}
        initialError={initialError}
      />
    </main>
  );
}
