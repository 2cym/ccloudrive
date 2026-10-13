'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { File, Folder, Pencil, Star, Trash2 } from 'lucide-react';

import type { FileItem } from './drive-types';

type FileContextMenuProps = {
  file: FileItem;
  x: number;
  y: number;
  onClose: () => void;
  onOpen: (file: FileItem) => void;
  onRename: (file: FileItem) => void;
  onToggleStar: (file: FileItem) => void;
  onDelete: (file: FileItem) => void;
};

export default function FileContextMenu({
  file,
  x,
  y,
  onClose,
  onOpen,
  onRename,
  onToggleStar,
  onDelete,
}: FileContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y, ready: false });

  useLayoutEffect(() => {
    const menu = menuRef.current;
    if (!menu) return;
    const bounds = menu.getBoundingClientRect();
    const left = Math.max(8, Math.min(x, window.innerWidth - bounds.width - 8));
    const top = y + bounds.height > window.innerHeight - 8
      ? Math.max(8, y - bounds.height)
      : Math.max(8, y);
    setPosition({ left, top, ready: true });
  }, [x, y]);

  useLayoutEffect(() => {
    const handlePointer = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onClose();
    };
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handlePointer);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('mousedown', handlePointer);
      document.removeEventListener('keydown', handleKey);
    };
  }, [onClose]);

  const action = (callback: (item: FileItem) => void) => () => {
    onClose();
    callback(file);
  };
  const Icon = file.type === 'folder' ? Folder : File;
  const itemClass = 'flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-accent';

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={`${file.name} 操作`}
      className="fixed z-50 min-w-48 rounded-md border bg-popover py-1 text-popover-foreground shadow-md"
      style={{ left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden' }}
    >
      <button role="menuitem" className={itemClass} onClick={action(onOpen)}><Icon className="size-4" />打开</button>
      <button role="menuitem" className={itemClass} onClick={action(onRename)}><Pencil className="size-4" />重命名</button>
      <button role="menuitem" className={itemClass} onClick={action(onToggleStar)}><Star className="size-4" />{file.isStarred ? '取消收藏' : '收藏'}</button>
      <button role="menuitem" className={`${itemClass} text-destructive`} onClick={action(onDelete)}><Trash2 className="size-4" />移到回收站</button>
    </div>
  );
}