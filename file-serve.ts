#!/usr/bin/env node

import { cac } from 'cac'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { startServer } from './server/index.ts'

const __dirname = dirname(fileURLToPath(import.meta.url))
const pkg = JSON.parse(readFileSync(resolve(__dirname, '../package.json'), 'utf-8'))

const cli = cac('file-serve')

cli
  .option('-p, --port <port>', '端口号', { default: 3000 })
  .option('-l, --listen <listen>', '监听地址', { default: '0.0.0.0' })
  .option('-o, --open', '自动打开浏览器', { default: false })
  .option('-d, --debug', '调试模式', { default: false })
  .option('-C, --cors', '启用 CORS', { default: true })
  .option('-c, --compress', '启用 gzip 压缩', { default: false })
  .help()
  .version(pkg.version)

cli.parse()

const { options } = cli
const root = cli.args[0] || process.cwd()

startServer({
  port: options.port,
  listen: options.listen,
  open: options.open,
  debug: options.debug,
  cors: options.cors,
  compress: options.compress,
  root
})