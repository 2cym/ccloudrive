'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';

import { api, type ApiResult } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';

import FileItems from './file-items';
import FileOperationDialog, { type OperationMode } from './file-operation-dialog';
import FilesToolbar from './files-toolbar';
import type { Breadcrumb, FileItem, FileParent, FilesResponse, SortKey, ViewMode } from './drive-types';

type FilesBrowserProps = {
  initialFiles: FileItem[];
  initialBreadcrumb: Breadcrumb[];
  initialParent: FileParent;
  initialError: string | null;
};

export default function FilesBrowser({
  initialFiles,
  initialBreadcrumb,
  initialParent,
  initialError,
}: FilesBrowserProps) {
  const [files, setFiles] = useState(initialFiles);
  const [breadcrumb, setBreadcrumb] = useState(initialBreadcrumb);
  const [parent, setParent] = useState(initialParent);
  const [sort, setSort] = useState<SortKey>('created_desc');
  const [search, setSearch] = useState('');
  const [view, setView] = useState<ViewMode>('list');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(initialError);
  const [retry, setRetry] = useState(0);
  const [operation, setOperation] = useState<{ mode: OperationMode; file: FileItem | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const firstRequest = useRef(true);
  const router = useRouter();
  const { toast } = useToast();

  useEffect(() => {
    if (parent?.id || search.trim()) return;
    setFiles(initialFiles);
    setBreadcrumb(initialBreadcrumb);
    setParent(initialParent);
    setError(initialError);
  }, [initialFiles, initialBreadcrumb, initialParent, initialError, parent?.id, search]);

  useEffect(() => {
    const savedView = window.localStorage.getItem('drive-view');
    if (savedView === 'list' || savedView === 'grid') setView(savedView);
  }, []);

  useEffect(() => {
    if (firstRequest.current) {
      firstRequest.current = false;
      return;
    }
    const timer = window.setTimeout(async () => {
      setLoading(true);
      setError(null);
      const params = new URLSearchParams({ sort });
      if (search.trim()) params.set('search', search.trim());
      else if (parent?.id) params.set('parentId', parent.id);
      const result = await api.get<FilesResponse>(`/api/files?${params.toString()}`);
      if (result.ok) {
        setFiles(result.data.files);
        setBreadcrumb(result.data.breadcrumb);
        setParent(result.data.parent);
      } else {
        setError(result.error.message);
      }
      setLoading(false);
    }, search ? 300 : 0);
    return () => window.clearTimeout(timer);
  }, [parent?.id, retry, search, sort]);

  const openFolder = (id: string | null) => {
    if (id === null) {
      setParent(null);
      setBreadcrumb([{ id: null, name: '根目录' }]);
      return;
    }
    const index = breadcrumb.findIndex((item) => item.id === id);
    setParent({ id, name: breadcrumb[index]?.name ?? '' });
    setBreadcrumb(breadcrumb.slice(0, index + 1));
  };

  const changeView = (nextView: ViewMode) => {
    setView(nextView);
    window.localStorage.setItem('drive-view', nextView);
  };

  const refreshAfterMutation = () => {
    // router.refresh() 依赖 page.tsx 的服务端 fetch 使用 cache: 'no-store'。
    router.refresh();
    const params = new URLSearchParams({ sort });
    if (search.trim()) params.set('search', search.trim());
    else if (parent?.id) params.set('parentId', parent.id);
    void api.get<FilesResponse>(`/api/files?${params.toString()}`).then((result) => {
      if (result.ok) {
        setFiles(result.data.files);
        setBreadcrumb(result.data.breadcrumb);
        setParent(result.data.parent);
      } else {
        toast({ title: '刷新列表失败', description: result.error.message, variant: 'destructive' });
      }
    });
  };

  const submitOperation = async (name: string) => {
    if (!operation) return;
    setBusy(true);
    let result: ApiResult<unknown>;
    if (operation.mode === 'create') {
      result = await api.post<unknown>('/api/files/folder', { name, parentId: parent?.id ?? null });
    } else if (operation.mode === 'rename' && operation.file) {
      result = await api.patch<unknown>(`/api/files/${encodeURIComponent(operation.file.id)}`, { name });
    } else if (operation.mode === 'delete' && operation.file) {
      result = await api.delete<unknown>(`/api/files/${encodeURIComponent(operation.file.id)}`);
    } else {
      setBusy(false);
      return;
    }
    setBusy(false);
    if (!result.ok) {
      toast({ title: '操作失败', description: result.error.message, variant: 'destructive' });
      return;
    }
    setOperation(null);
    toast({ title: '操作成功' });
    refreshAfterMutation();
  };

  const toggleStar = async (file: FileItem) => {
    const result = await api.patch<unknown>(`/api/files/${encodeURIComponent(file.id)}`, {
      isStarred: !file.isStarred,
    });
    if (!result.ok) {
      toast({ title: '操作失败', description: result.error.message, variant: 'destructive' });
      return;
    }
    toast({ title: file.isStarred ? '已取消收藏' : '已收藏' });
    refreshAfterMutation();
  };

  return (
    <section className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">我的云盘</h1>
        <nav aria-label="面包屑" className="mt-3 flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
          {breadcrumb.map((item, index) => (
            <span key={item.id ?? 'root'} className="flex items-center gap-2">
              {index > 0 && <span>/</span>}
              <button className="hover:text-foreground" onClick={() => openFolder(item.id)}>{item.name}</button>
            </span>
          ))}
        </nav>
      </div>
      <FilesToolbar search={search} onSearch={setSearch} sort={sort} onSortChange={setSort} view={view} onViewChange={changeView} onCreateFolder={() => setOperation({ mode: 'create', file: null })} />
      {error ? (
        <div role="alert" className="rounded-lg border p-8 text-center">
          <p>{error}</p>
          <Button className="mt-4" variant="outline" onClick={() => setRetry((value) => value + 1)}>重试</Button>
        </div>
      ) : loading ? (
        <div className="space-y-3" aria-label="正在加载">
          {Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-14 w-full" />)}
        </div>
      ) : files.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center text-muted-foreground">这里还没有文件</div>
      ) : (
        <FileItems
          files={files}
          view={view}
          onOpenFolder={openFolder}
          onOpenFile={() => toast({ title: '暂不支持预览' })}
          onRename={(file) => setOperation({ mode: 'rename', file })}
          onToggleStar={toggleStar}
          onDelete={(file) => setOperation({ mode: 'delete', file })}
        />
      )}
      {operation && (
        <FileOperationDialog
          mode={operation.mode}
          file={operation.file}
          busy={busy}
          onClose={() => setOperation(null)}
          onSubmit={(name) => void submitOperation(name)}
        />
      )}
    </section>
  );
}