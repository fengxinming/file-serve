import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupUploadRoutes } from '../../src/server/routes/upload.ts';

const TUS_VERSION = '1.0.0';

let root: string;
let uploadDir: string;
let app: ReturnType<typeof Fastify>;
let baseUrl: string;

/**
 * 发起一次 tus 上传，返回上传 id（Location 最后一段）。
 * @param expectedName 期望落盘的文件名；默认与 name 相同，重名场景服务端会追加 (n) 后缀，需显式传入
 */
async function upload(name: string, content: string, dir = root, expectedName = name) {
  const meta = Buffer.from(name).toString('base64');
  const create = await fetch(`${baseUrl}/api/upload`, {
    method: 'POST',
    headers: {
      'Tus-Resumable': TUS_VERSION,
      'Upload-Length': String(Buffer.byteLength(content)),
      'Upload-Metadata': `filename ${meta}`,
      'Content-Type': 'application/offset+octet-stream',
    },
  });
  expect(create.status).toBe(201);
  const location = create.headers.get('location')!;
  const id = location.split('/').pop()!;

  const patch = await fetch(`${baseUrl}/api/upload/${id}`, {
    method: 'PATCH',
    headers: {
      'Tus-Resumable': TUS_VERSION,
      'Upload-Offset': '0',
      'Content-Type': 'application/offset+octet-stream',
    },
    body: content,
  });
  expect(patch.status).toBe(204);
  expect(patch.headers.get('upload-offset')).toBe(String(Buffer.byteLength(content)));

  // 上传完成后文件应被移动到 dir 下
  const finalName = dir === root ? expectedName : expectedName.split('/').pop()!;
  const dest = join(dir, finalName);
  expect(existsSync(dest)).toBe(true);
  expect(readFileSync(dest, 'utf-8')).toBe(content);
  return { id, dest };
}

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'fs-upload-'));
  uploadDir = join(root, '.uploads');
  app = Fastify();
  await setupUploadRoutes(app, { uploadDir, root });
  // tus 直接写 raw 响应(fastify.all + reply.hijack),app.inject 无法捕获这类响应,
  // 必须起真实 HTTP 服务配合 fetch 测试,与生产形态一致
  await app.listen({ port: 0, host: '127.0.0.1' });
  const address = app.server.address() as { port: number };
  baseUrl = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await app.close();
  rmSync(root, { recursive: true, force: true });
});

describe('tus 协议握手', () => {
  it('OPTIONS 返回 tus 版本', async () => {
    const res = await fetch(`${baseUrl}/api/upload`, { method: 'OPTIONS' });
    // tus-node-server 对 OPTIONS 返回 204 No Content
    expect(res.status).toBe(204);
    expect(res.headers.get('tus-resumable')).toBe(TUS_VERSION);
    expect(res.headers.get('tus-version')).toBe(TUS_VERSION);
  });

  it('未带 Tus-Resumable 的创建请求返回 412', async () => {
    const res = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: { 'Upload-Length': '5' },
    });
    expect(res.status).toBe(412);
  });
});

describe('上传 API', () => {
  it('完整上传流程：创建 → 续传 → 文件落盘', async () => {
    const { dest } = await upload('a.txt', 'hello');
    expect(dest).toBe(join(root, 'a.txt'));
  });

  it('多文件上传各自独立落盘', async () => {
    await upload('b.log', 'log content');
    await upload('sub-dir.txt', 'nested');
  });

  it('重名文件自动追加 (n) 后缀，不覆盖原文件', async () => {
    // 使用独立文件名，避免与「完整上传流程」用例中已落盘的 a.txt 相互影响
    await upload('dup.txt', 'first');
    const { dest } = await upload('dup.txt', 'second', root, 'dup (1).txt');
    expect(dest).toBe(join(root, 'dup (1).txt'));
    expect(readFileSync(join(root, 'dup.txt'), 'utf-8')).toBe('first');
    expect(readFileSync(dest, 'utf-8')).toBe('second');
  });

  it('上传文件名做 basename 净化，防目录穿越', async () => {
    const meta = Buffer.from('../../evil.txt').toString('base64');
    const create = await fetch(`${baseUrl}/api/upload`, {
      method: 'POST',
      headers: {
        'Tus-Resumable': TUS_VERSION,
        'Upload-Length': '4',
        'Upload-Metadata': `filename ${meta}`,
      },
    });
    expect(create.status).toBe(201);
    const id = create.headers.get('location')!.split('/').pop()!;
    const patch = await fetch(`${baseUrl}/api/upload/${id}`, {
      method: 'PATCH',
      headers: {
        'Tus-Resumable': TUS_VERSION,
        'Upload-Offset': '0',
        'Content-Type': 'application/offset+octet-stream',
      },
      body: 'evil',
    });
    expect(patch.status).toBe(204);
    // 必须落在 root 下，而不是穿越到根目录外
    expect(existsSync(join(root, 'evil.txt'))).toBe(true);
    expect(existsSync(join(root, '..', 'evil.txt'))).toBe(false);
  });

  it('GET 查询上传信息', async () => {
    const { id } = await upload('query.txt', 'query');
    const res = await fetch(`${baseUrl}/api/upload/${id}`);
    expect(res.status).toBe(200);
    const info = (await res.json()) as { id: string; metadata?: { filename?: string } };
    expect(info.id).toBe(id);
    expect(info.metadata?.filename).toBe('query.txt');
  });

  it('GET 不存在的上传返回 404', async () => {
    const res = await fetch(`${baseUrl}/api/upload/nope`);
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ code: 'upload.notFound' });
  });

  it('DELETE 删除上传任务', async () => {
    const { id } = await upload('delete-me.txt', 'bye');
    const res = await fetch(`${baseUrl}/api/upload/${id}`, { method: 'DELETE' });
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ success: true });
  });
});
