/** 界面语言，定义见 ./utils/lang.ts（单一数据源） */
export type { Lang } from './utils/lang.ts';

/** createServer 需要的最小参数集 */
export interface CreateServerOptions {
  root?: string;
  debug?: boolean;
  cors?: boolean;
  compress?: boolean;
  lang?: Lang;
}

/** startServer 在基础参数上扩展生产启动专属项 */
export interface ServerOptions extends CreateServerOptions {
  port?: number;
  listen?: string;
  open?: boolean;
}

export interface FileItem {
  name: string;
  path: string;
  isDirectory: boolean;
  size: number;
  mtime: number;
}

export interface FileListResponse {
  currentPath: string;
  parentPath: string | null;
  items: FileItem[];
}
