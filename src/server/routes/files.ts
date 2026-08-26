/**
 * 文件浏览与下载路由:
 * - GET /api/files:列出指定目录(文件夹在前、文件在后,均按名称排序);
 * - GET /api/download/*:下载单个文件;
 * - POST /api/download-batch:将多个文件/目录打包为 zip 下载。
 */
import { readdirSync, statSync, createReadStream, existsSync } from 'node:fs';
import { join, resolve, relative, basename, isAbsolute } from 'node:path';
import { ZipArchive } from 'archiver';
import type { FastifyInstance } from 'fastify';
import type { FileListResponse, FileItem } from '../types.d.ts';

/**
 * 安全解析路径:确保结果仍位于 root 内,防止目录穿越(如 ../../etc/passwd)。
 * @param root 服务根目录
 * @param target 目标相对路径
 * @returns 安全的绝对路径;若解析结果越出 root 则返回 null
 */
function safeResolve(root: string, target: string): string | null {
  const fullPath = resolve(root, target);
  const rel = relative(root, fullPath);
  const isInside = rel === '' || (!rel.startsWith('..') && !isAbsolute(rel));
  return isInside ? fullPath : null;
}

/**
 * 注册文件浏览 / 下载 / 批量下载路由。
 * @param fastify Fastify 实例
 * @param options 路由选项(服务根目录、是否启用文本文件 gzip)
 */
export async function setupFileRoutes(
  fastify: FastifyInstance,
  options: { root: string; compress: boolean },
) {
  const { root, compress } = options;

  // 文件列表:解析目录 → 过滤隐藏项 → 文件夹与文件分别排序后合并返回
  fastify.get<{ Querystring: { dir?: string } }>('/api/files', async (req, reply) => {
    const dir = req.query.dir || '.';
    const fullPath = safeResolve(root, dir);
    // 路径越界(目录穿越)直接拒绝
    if (!fullPath) return reply.status(400).send({ code: 'file.pathInvalid' });
    try {
      const entries = readdirSync(fullPath, { withFileTypes: true });
      const folders: FileItem[] = [];
      const files: FileItem[] = [];
      for (const entry of entries) {
        // 跳过隐藏项(除上级目录外的 . 开头条目)
        if (entry.name.startsWith('.') && entry.name !== '..') continue;
        const entryPath = join(fullPath, entry.name);
        const stats = statSync(entryPath);
        const item: FileItem = {
          name: entry.name,
          path: relative(root, entryPath),
          isDirectory: entry.isDirectory(),
          size: stats.size,
          mtime: stats.mtime.getTime(),
        };
        // 文件夹与文件分组,便于前端展示时文件夹在前
        if (entry.isDirectory()) folders.push(item);
        else files.push(item);
      }
      // 分组内均按名称排序
      folders.sort((a, b) => a.name.localeCompare(b.name));
      files.sort((a, b) => a.name.localeCompare(b.name));
      const response: FileListResponse = {
        currentPath: dir,
        parentPath: dir === '.' ? null : dir.split('/').slice(0, -1).join('/') || '.',
        items: [...folders, ...files],
      };
      reply.send(response);
    } catch (err: any) {
      reply.status(500).send({ code: 'internalError', detail: err.message });
    }
  });

  // 单个文件下载:以流方式发送,目录不可下载
  fastify.get<{ Params: { '*': string } }>('/api/download/*', async (req, reply) => {
    const filePath = req.params['*'];
    const fullPath = safeResolve(root, filePath);
    if (!fullPath) {
      return reply.status(400).send({ code: 'file.pathInvalid' });
    }
    if (!existsSync(fullPath)) {
      return reply.status(404).send({ code: 'file.notFound' });
    }
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      return reply.status(400).send({ code: 'file.isDirectory' });
    }
    // 文本类文件在开启压缩时按 gzip 下发
    const isText = /\.(txt|json|js|css|html|md|xml|yaml|yml|toml)$/i.test(filePath);
    if (compress && isText) {
      reply.header('Content-Encoding', 'gzip');
    }
    reply.header('Content-Disposition', `attachment; filename="${basename(filePath)}"`);
    reply.header('Content-Type', 'application/octet-stream');
    reply.header('Content-Length', stats.size);
    return reply.send(createReadStream(fullPath));
  });

  // 批量下载:将选中的文件/目录打包为 zip
  fastify.post<{ Body: { files: string[] } }>('/api/download-batch', async (req, reply) => {
    const { files: filePaths } = req.body;
    if (!filePaths || filePaths.length === 0) {
      return reply.status(400).send({ code: 'download.empty' });
    }
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', 'attachment; filename="files.zip"');
    const archive = new ZipArchive({ zlib: { level: 6 } });
    archive.pipe(reply.raw);
    for (const filePath of filePaths) {
      // 逐个校验路径安全性与存在性,非法项跳过
      const fullPath = safeResolve(root, filePath);
      if (!fullPath || !existsSync(fullPath)) continue;
      const stats = statSync(fullPath);
      // 目录整体打包,文件单独入包
      if (stats.isDirectory()) {
        archive.directory(fullPath, basename(filePath));
      } else {
        archive.file(fullPath, { name: basename(filePath) });
      }
    }
    await archive.finalize();
    return reply;
  });
}
