import { afterAll, expect, test } from 'vitest';
import fastify, { type FastifyInstance } from 'fastify';
import fastifyCompress from '@fastify/compress';
import fastifyStatic from '@fastify/static';
import { setupFileRoutes } from '../../src/server/routes/files.ts';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';

// 模拟生产 createServer 中 --compress 开启:插件 global:true(自动按 Content-Type 压缩),下载路由统一
// reply.download。媒体(mp4)因真实 MIME 被插件跳过,不 gzip;文本/二进制(octet-stream)被 gzip。
async function buildApp(): Promise<FastifyInstance> {
  const app = fastify();
  await app.register(fastifyCompress, { global: true, threshold: 1024, zlibOptions: { level: 6 } });
  // 提供 reply.download 装饰(serve:false 不抢路由),与 createServer 中 dev 场景的注册一致
  await app.register(fastifyStatic, { root, decorateReply: true, serve: false });
  await setupFileRoutes(app, { root });
  return app;
}

const root = mkdtempSync(join(tmpdir(), 'fs-compress-'));
const textBody = 'a'.repeat(5000); // 超过阈值 1024,应被压缩
writeFileSync(join(root, 'note.txt'), textBody);
const binBody = Buffer.alloc(5000, 7); // 二进制:压缩无意义,但 attachment 下载不影响正确性
writeFileSync(join(root, 'data.bin'), binBody);
const mediaBody = Buffer.alloc(8000, 9); // 媒体(模拟 mp4):真实 MIME 应被插件跳过,不 gzip
writeFileSync(join(root, 'clip.mp4'), mediaBody);

test('文本下载开启 gzip 且内容完整可解压', async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/download/note.txt',
    headers: { 'accept-encoding': 'gzip' },
  });
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-encoding']).toBe('gzip');
  // 关键正确性校验:解压后必须与原文逐字节一致(此前 Content-Encoding 假头会导致浏览器解压失败)
  expect(gunzipSync(res.rawPayload).toString()).toBe(textBody);
  await app.close();
});

test('无 Accept-Encoding 时不压缩,明文且 Content-Length 正确', async () => {
  const app = await buildApp();
  const res = await app.inject({ method: 'GET', url: '/api/download/note.txt' });
  expect(res.headers['content-encoding']).toBeUndefined();
  expect(res.body).toBe(textBody);
  expect(Number(res.headers['content-length'])).toBe(textBody.length);
  await app.close();
});

test('二进制下载同样被 gzip,但解压后内容一致(attachment 下载浏览器保存解码后原文件)', async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/download/data.bin',
    headers: { 'accept-encoding': 'gzip' },
  });
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-encoding']).toBe('gzip');
  expect(Buffer.compare(gunzipSync(res.rawPayload), binBody)).toBe(0);
  await app.close();
});

test('媒体文件(mp4)下发真实 MIME,不被 gzip(已压缩格式,插件自动跳过)', async () => {
  const app = await buildApp();
  const res = await app.inject({
    method: 'GET',
    url: '/api/download/clip.mp4',
    headers: { 'accept-encoding': 'gzip' },
  });
  expect(res.statusCode).toBe(200);
  expect(res.headers['content-encoding']).toBeUndefined();
  expect(res.headers['content-type']).toBe('video/mp4');
  expect(Buffer.compare(res.rawPayload, mediaBody)).toBe(0);
  await app.close();
});

afterAll(() => {
  rmSync(root, { recursive: true, force: true });
});
