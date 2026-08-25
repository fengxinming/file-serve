/** 文件列表条目 */
export interface FileItem {
  name: string
  path: string
  isDirectory: boolean
  size: number
  mtime: number
}

/** 文件列表接口响应 */
export interface FileListResponse {
  currentPath: string
  parentPath: string | null
  items: FileItem[]
}
