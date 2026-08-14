import fastify from 'fastify'
import fastifyCors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import open from 'open'
import { findAvailablePort, getLocalIP } from './utils/port.ts'
import { setupFileRoutes } from './routes/files.ts'
import { setupUploadRoutes } from './routes/upload.ts'
import type { ServerOptions } from './types.d.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const PROJECT_ROOT = resolve(__dirname, '../..')

export async function startServer(options: ServerOptions) {
  const {
    port = 3000,
    listen = '0.0.0.0',
    open: shouldOpen = false,
    debug = false,
    cors = true,
    compress = false,
    root = process.cwd()
  } = options

  const uploadDir = resolve(root, '.uploads')
  if (!existsSync(uploadDir)) mkdirSync(uploadDir, { recursive: true })

  const availablePort = await findAvailablePort(port)
  const host = listen === '0.0.0.0' ? '0.0.0.0' : listen
  const localUrl = `http://localhost:${availablePort}`
  const networkUrl = `http://${getLocalIP()}:${availablePort}`

  const server = fastify({ logger: debug, ignoreTrailingSlash: true })

  if (cors) {
    await server.register(fastifyCors, {
      origin: true,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization', 'Upload-*', 'Tus-*']
    })
  }

  const distPath = resolve(PROJECT_ROOT, 'dist/web')
  if (existsSync(distPath)) {
    await server.register(fastifyStatic, { root: distPath, prefix: '/', decorateReply: false })
  }

  await setupFileRoutes(server, { root, compress })
  await setupUploadRoutes(server, { uploadDir, root })

  await server.listen({ host, port: availablePort })

  console.log(`\n📁 file-serve 已启动`)
  console.log(`📍 根目录: ${root}`)
  console.log(`🌐 本地: ${localUrl}`)
  console.log(`📱 局域网: ${networkUrl}`)
  if (debug) console.log(`🐛 调试模式已开启`)

  if (shouldOpen) await open(localUrl)

  return server
}