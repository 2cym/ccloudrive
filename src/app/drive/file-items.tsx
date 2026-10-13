'use client';

import { useState } from 'react';
import { File, Folder } from 'lucide-react';

import FileContextMenu from './file-context-menu';
import type { FileItem, ViewMode } from './drive-types';

type FileItemsProps = {
  files: FileItem[];
  view: ViewMode;
  onOpenFolder: (id: string) => void;
  onOpenFile: (file: FileItem) => void;
  onRename: (file: FileItem) => void;
  onToggleStar: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
};

function formatSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  if (size < 1024 * 1024 * 1024) return `${(size / (1024 * 1024)).toFixed(1)} MB`;
  return `${(size / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export default function FileItems({
  files,
  view,
  onOpenFolder,
  onOpenFile,
  onRename,
  onToggleStar,
  onDelete,
}: FileItemsProps) {
  const [context, setContext] = useState<{ file: FileItem; x: number; y: number } | null>(null);
  const openItem = (file: FileItem) => {
    if (file.type === 'folder') onOpenFolder(file.id);
    else onOpenFile(file);
  };

  return (
    <ul className={view === 'grid' ? 'grid gap-3 sm:grid-cols-2 lg:grid-cols-4' : 'divide-y rounded-lg border'}>
      {files.map((item) => {
        const Icon = item.type === 'folder' ? Folder : File;
        const handleContextMenu = (event: React.MouseEvent) => {
          event.preventDefault();
          setContext({ file: item, x: event.clientX, y: event.clientY });
        };
        const content = (
          <>
            <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate text-left font-medium">{item.name}</span>
            {view === 'list' && <span className="text-sm text-muted-foreground">{item.type === 'file' ? formatSize(item.size) : '文件夹'}</span>}
          </>
        );
        return (
          <li key={item.id} onContextMenu={handleContextMenu} className={view === 'grid' ? 'rounded-lg border p-3' : ''}>
            <div
              role="button"
              tabIndex={0}
              aria-label={`${item.name}${item.type === 'folder' ? '，双击打开' : ''}`}
              className={`flex items-center gap-3 rounded-md p-3 hover:bg-accent ${view === 'grid' ? 'min-w-0' : ''}`}
              onDoubleClick={() => openItem(item)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' || event.key === ' ') {
                  event.preventDefault();
                  openItem(item);
                }
              }}
            >
              {content}
            </div>
            {context?.file.id === item.id && (
              <FileContextMenu
                file={item}
                x={context.x}
                y={context.y}
                onClose={() => setContext(null)}
                onOpen={openItem}
                onRename={onRename}
                onToggleStar={onToggleStar}
                onDelete={onDelete}
              />
            )}
          </li>
        );
      })}
    </ul>
  );
}