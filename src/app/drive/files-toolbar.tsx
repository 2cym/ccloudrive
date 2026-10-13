'use client';

import { FolderPlus, LayoutGrid, List } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import type { SortKey, ViewMode } from './drive-types';

type FilesToolbarProps = {
  search: string;
  onSearch: (value: string) => void;
  sort: SortKey;
  onSortChange: (value: SortKey) => void;
  view: ViewMode;
  onViewChange: (value: ViewMode) => void;
  onCreateFolder: () => void;
};

const sortOptions: { value: SortKey; label: string }[] = [
  { value: 'created_desc', label: '创建时间（新到旧）' },
  { value: 'created_asc', label: '创建时间（旧到新）' },
  { value: 'name_asc', label: '名称（升序）' },
  { value: 'name_desc', label: '名称（降序）' },
  { value: 'size_desc', label: '大小（从大到小）' },
];

export default function FilesToolbar({
  search,
  onSearch,
  sort,
  onSortChange,
  view,
  onViewChange,
  onCreateFolder,
}: FilesToolbarProps) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row">
      <Input
        aria-label="搜索文件"
        placeholder="搜索文件"
        value={search}
        onChange={(event) => onSearch(event.target.value)}
        className="sm:max-w-sm"
      />
      <div className="flex gap-2 sm:ml-auto">
        <Button variant="outline" onClick={onCreateFolder}>
          <FolderPlus />新建文件夹
        </Button>
        <select
          aria-label="排序方式"
          className="h-10 rounded-md border border-input bg-background px-3 text-sm"
          value={sort}
          onChange={(event) => onSortChange(event.target.value as SortKey)}
        >
          {sortOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
        </select>
        <Button
          aria-label="列表视图"
          aria-pressed={view === 'list'}
          variant={view === 'list' ? 'secondary' : 'outline'}
          size="icon"
          onClick={() => onViewChange('list')}
        >
          <List />
        </Button>
        <Button
          aria-label="网格视图"
          aria-pressed={view === 'grid'}
          variant={view === 'grid' ? 'secondary' : 'outline'}
          size="icon"
          onClick={() => onViewChange('grid')}
        >
          <LayoutGrid />
        </Button>
      </div>
    </div>
  );
}