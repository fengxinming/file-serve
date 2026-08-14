import { Server, EVENTS } from '@tus/server'
import { FileStore } from '@tus/file-store'
import { existsSync, rename as renameFile } from 'node:fs'
import { join, basename, extname } from 'node:path'
import type { FastifyInstance } from 'fastify'

let tusServer: Server | null = null

export async function setupUploadRoutes(fastify: FastifyInstance, options: { uploadDir: string; root: string }) {
  const { uploadDir, root } = options

  // tus PATCH 请求使用原始流，不经过 Fastify body 解析
  fastify.addContentTypeParser('application/offset+octet-stream', (_request, _payload, done) => done(null))

  tusServer = new Server({
    path: '/api/upload',
    datastore: new FileStore({ directory: uploadDir }),
    respectForwardedHeaders: true
  })

  // 上传完成后将文件从临时目录移动到根目录，供文件列表浏览
  tusServer.on(EVENTS.POST_FINISH, async (_req, _res, upload) => {
    const src = join(uploadDir, upload.id)
    const rawName = upload.metadata?.filename || upload.id
    const filename = basename(rawName) // 防止路径穿越
    let dest = join(root, filename)
    if (existsSync(dest)) {
      const ext = extname(filename)
      const stem = filename.slice(0, filename.length - ext.length) || filename
      let i = 1
      while (existsSync(dest)) {
        dest = join(root, `${stem} (${i})${ext}`)
        i += 1
      }
    }
    await new Promise<void>((resolve, reject) => {
      renameFile(src, dest, (err) => (err ? reject(err) : resolve()))
    })
  })

  fastify.all('/api/upload*', async (req, reply) => {
    await tusServer!.handle(req.raw, reply.raw)
    return reply
  })

  fastify.delete<{ Params: { fileId: string } }>('/api/upload/:fileId', async (req, reply) => {
    const { fileId } = req.params
    try {
      await tusServer!.datastore.remove(fileId)
      reply.send({ success: true })
    } catch (err: any) {
      reply.status(500).send({ error: err.message })
    }
  })

  fastify.get<{ Params: { fileId: string } }>('/api/upload/:fileId', async (req, reply) => {
    const { fileId } = req.params
    try {
      const info = await tusServer!.datastore.getUpload(fileId)
      reply.send(info)
    } catch (err: any) {
      reply.status(404).send({ error: '未找到上传任务' })
    }
  })
}
