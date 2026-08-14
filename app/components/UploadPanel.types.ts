import type { Upload } from 'tus-js-client'

/** 上传任务状态 */
export type UploadTaskStatus = 'waiting' | 'uploading' | 'paused' | 'completed' | 'error'

/** 上传任务 */
export interface UploadTask {
  id: number
  file: File
  upload: Upload | null
  status: UploadTaskStatus
  progress: number
  error: string
}
