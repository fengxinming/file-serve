import { readdirSync, statSync, createReadStream, existsSync } from 'node:fs'
import { join, resolve, relative, basename } from 'node:path'
import { ZipArchive } from 'archiver'
import type { FastifyInstance } from 'fastify'
import type { FileListResponse, FileItem } from '../types.d.ts'

export async function setupFileRoutes(fastify: FastifyInstance, options: { root: string; compress: boolean }) {
  const { root, compress } = options

  fastify.get<{ Querystring: { dir?: string } }>('/api/files', async (req, reply) => {
    const dir = req.query.dir || '.'
    const fullPath = resolve(root, dir)
    try {
      const entries = readdirSync(fullPath, { withFileTypes: true })
      const folders: FileItem[] = []
      const files: FileItem[] = []
      for (const entry of entries) {
        if (entry.name.startsWith('.') && entry.name !== '..') continue
        const entryPath = join(fullPath, entry.name)
        const stats = statSync(entryPath)
        const item: FileItem = {
          name: entry.name,
          path: relative(root, entryPath),
          isDirectory: entry.isDirectory(),
          size: stats.size,
          mtime: stats.mtime.getTime()
        }
        if (entry.isDirectory()) folders.push(item)
        else files.push(item)
      }
      folders.sort((a, b) => a.name.localeCompare(b.name))
      files.sort((a, b) => a.name.localeCompare(b.name))
      const response: FileListResponse = {
        currentPath: dir,
        parentPath: dir === '.' ? null : dir.split('/').slice(0, -1).join('/') || '.',
        items: [...folders, ...files]
      }
      reply.send(response)
    } catch (err: any) {
      reply.status(500).send({ error: err.message })
    }
  })

  fastify.get<{ Params: { '*': string } }>('/api/download/*', async (req, reply) => {
    const filePath = req.params['*']
    const fullPath = resolve(root, filePath)
    if (!existsSync(fullPath)) return reply.status(404).send({ error: '文件不存在' })
    const stats = statSync(fullPath)
    if (stats.isDirectory()) return reply.status(400).send({ error: '不能下载目录' })
    const isText = /\.(txt|json|js|css|html|md|xml|yaml|yml|toml)$/i.test(filePath)
    if (compress && isText) reply.header('Content-Encoding', 'gzip')
    reply.header('Content-Disposition', `attachment; filename="${basename(filePath)}"`)
    reply.header('Content-Type', 'application/octet-stream')
    reply.header('Content-Length', stats.size)
    return reply.send(createReadStream(fullPath))
  })

  fastify.post<{ Body: { files: string[] } }>('/api/download-batch', async (req, reply) => {
    const { files: filePaths } = req.body
    if (!filePaths || filePaths.length === 0) {
      return reply.status(400).send({ error: '请至少选择一个文件或文件夹' })
    }
    reply.header('Content-Type', 'application/zip')
    reply.header('Content-Disposition', 'attachment; filename="files.zip"')
    const archive = new ZipArchive({ zlib: { level: 6 } })
    archive.pipe(reply.raw)
    for (const filePath of filePaths) {
      const fullPath = resolve(root, filePath)
      if (!existsSync(fullPath)) continue
      const stats = statSync(fullPath)
      if (stats.isDirectory()) archive.directory(fullPath, basename(filePath))
      else archive.file(fullPath, { name: basename(filePath) })
    }
    await archive.finalize()
    return reply
  })
}