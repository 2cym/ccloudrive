'use client';

import { File, Folder } from 'lucide-react';

import type { FileItem, ViewMode } from './drive-types';

type FileItemsProps = {
  files: FileItem[];
  view: ViewMode;
  onOpenFolder: (id: string) => void;
};

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function FileItems({ files, view, onOpenFolder }: FileItemsProps) {
  return (
    <ul className={view === 'grid' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4' : 'divide-y rounded-lg border'}>
      {files.map((item) => {
        const Icon = item.type === 'folder' ? Folder : File;
        const content = (
          <>
            <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left font-medium">{item.name}</span>
            {view === 'list' && <span className="text-sm text-muted-foreground">{item.type === 'file' ? formatSize(item.size) : '文件夹'}</span>}
          </>
        );
        return (
          <li key={item.id} className={view === 'grid' ? 'rounded-lg border p-3' : ''}>
            {item.type === 'folder' ? (
              <button
                className={`flex w-full items-center gap-3 rounded-md p-3 hover:bg-accent ${view === 'grid' ? 'min-w-0' : ''}`}
                onClick={() => onOpenFolder(item.id)}
              >
                {content}
              </button>
            ) : (
              <div className={`flex items-center gap-3 p-3 ${view === 'grid' ? 'min-w-0' : ''}`}>
                {content}
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}