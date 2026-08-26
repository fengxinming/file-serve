/**
 * 上传路由:基于 tus 协议的分片上传。
 * - PATCH /api/upload*:分片数据(原始流,不经 Fastify body 解析);
 * - DELETE /api/upload/:fileId:删除上传任务(移除临时目录中的元数据);
 * - GET /api/upload/:fileId:查询上传任务信息。
 *
 * 上传完成后文件从临时目录(.uploads)移动到服务根目录,供文件列表浏览。
 */
import { Server } from '@tus/server';
import { FileStore } from '@tus/file-store';
import { existsSync, rename as renameFile } from 'node:fs';
import { join, basename, extname } from 'node:path';
import type { FastifyInstance } from 'fastify';

/** tus 服务单例(路由初始化时创建,后续请求复用) */
let tusServer: Server | null = null;

/**
 * 注册 tus 上传相关路由。
 * @param fastify Fastify 实例
 * @param options 上传选项(临时目录 uploadDir、最终存放目录 root)
 */
export async function setupUploadRoutes(
  fastify: FastifyInstance,
  options: { uploadDir: string; root: string },
) {
  const { uploadDir, root } = options;

  // tus PATCH 请求使用原始流,不经过 Fastify body 解析
  fastify.addContentTypeParser('application/offset+octet-stream', (_request, _payload, done) =>
    done(null),
  );

  tusServer = new Server({
    path: '/api/upload',
    datastore: new FileStore({ directory: uploadDir }),
    respectForwardedHeaders: true,
    // 上传完成后将文件从临时目录移动到根目录,供文件列表浏览。
    // onUploadFinish 会在响应返回前被 await(与 POST_FINISH 的 fire-and-forget 不同),
    // 保证客户端收到 204 时文件已落盘,避免竞态
    onUploadFinish: async (_req, upload) => {
      const src = join(uploadDir, upload.id);
      const rawName = upload.metadata?.filename || upload.id;
      const filename = basename(rawName); // 防止路径穿越
      let dest = join(root, filename);
      // 目标同名时追加序号,如 "file (1).txt"
      if (existsSync(dest)) {
        const ext = extname(filename);
        const stem = filename.slice(0, filename.length - ext.length) || filename;
        let i = 1;
        while (existsSync(dest)) {
          dest = join(root, `${stem} (${i})${ext}`);
          i += 1;
        }
      }
      await new Promise<void>((resolve, reject) => {
        renameFile(src, dest, (err) => (err ? reject(err) : resolve()));
      });
      return {};
    },
  });

  // tus 直接操作 raw 请求/响应(不走 Fastify 的 body 解析与序列化),
  // 必须 hijack 告知 Fastify 响应已由外部接管,否则会二次写头报 ERR_HTTP_HEADERS_SENT
  fastify.all('/api/upload*', (req, reply) => {
    reply.hijack();
    return tusServer!.handle(req.raw, reply.raw);
  });

  // 删除上传任务:上传完成后数据文件已移入 root,临时目录只剩元数据,删除元数据即为删除任务
  fastify.delete<{ Params: { fileId: string } }>('/api/upload/:fileId', async (req, reply) => {
    const { fileId } = req.params;
    try {
      const store = tusServer!.datastore as FileStore;
      await store.configstore.delete(fileId);
      reply.send({ success: true });
    } catch (err: any) {
      reply.status(500).send({ code: 'internalError', detail: err.message });
    }
  });

  // 查询上传任务:上传完成后数据文件已不在临时目录,但元数据仍保留,从 configstore 读取即可
  fastify.get<{ Params: { fileId: string } }>('/api/upload/:fileId', async (req, reply) => {
    const { fileId } = req.params;
    try {
      const store = tusServer!.datastore as FileStore;
      const info = await store.configstore.get(fileId);
      if (!info) {
        reply.status(404).send({ code: 'upload.notFound' });
      } else {
        reply.send(info);
      }
    } catch {
      reply.status(404).send({ code: 'upload.notFound' });
    }
  });
}
