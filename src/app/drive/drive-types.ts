export type SortKey =
  | 'name_asc'
  | 'name_desc'
  | 'created_desc'
  | 'created_asc'
  | 'size_desc';

export type ViewMode = 'list' | 'grid';
export type FileFilter = 'all' | 'file' | 'folder';

export type FileItem = {
  id: string;
  name: string;
  type: 'file' | 'folder';
  size: number;
  mimeType: string | null;
  isStarred: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Breadcrumb = {
  id: string | null;
  name: string;
};

export type FileParent = {
  id: string;
  name: string;
} | null;

export type FilesResponse = {
  files: FileItem[];
  parent: FileParent;
  breadcrumb: Breadcrumb[];
};