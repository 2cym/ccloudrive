'use client';

import { useEffect, useState, type FormEvent } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { FileItem } from './drive-types';

export type OperationMode = 'create' | 'rename' | 'delete';

type FileOperationDialogProps = {
  mode: OperationMode;
  file: FileItem | null;
  busy: boolean;
  onClose: () => void;
  onSubmit: (name: string) => void;
};

const titles: Record<OperationMode, string> = {
  create: '新建文件夹',
  rename: '重命名',
  delete: '移到回收站',
};

export default function FileOperationDialog({
  mode,
  file,
  busy,
  onClose,
  onSubmit,
}: FileOperationDialogProps) {
  const [name, setName] = useState(file?.name ?? '');

  useEffect(() => {
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busy) onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [busy, onClose]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmit(name.trim());
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onClose();
      }}
    >
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="file-operation-title"
        className="w-full max-w-md space-y-4 rounded-lg border bg-background p-6 shadow-lg"
        onSubmit={submit}
      >
        <h2 id="file-operation-title" className="text-lg font-semibold">{titles[mode]}</h2>
        {mode === 'delete' ? (
          <p className="text-sm text-muted-foreground">确定将“{file?.name}”移到回收站吗？</p>
        ) : (
          <Input
            autoFocus
            aria-label="文件夹名称"
            placeholder="输入名称"
            value={name}
            onChange={(event) => setName(event.target.value)}
            maxLength={255}
            required
          />
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={onClose}>取消</Button>
          <Button type="submit" variant={mode === 'delete' ? 'destructive' : 'default'} disabled={busy || (mode !== 'delete' && !name.trim())}>
            {busy ? '处理中…' : mode === 'delete' ? '移到回收站' : '确定'}
          </Button>
        </div>
      </form>
    </div>
  );
}