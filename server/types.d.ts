export interface ServerOptions {
  port?: number
  listen?: string
  open?: boolean
  debug?: boolean
  cors?: boolean
  compress?: boolean
  root?: string
}

export interface FileItem {
  name: string
  path: string
  isDirectory: boolean
  size: number
  mtime: number
}

export interface FileListResponse {
  currentPath: string
  parentPath: string | null
  items: FileItem[]
}