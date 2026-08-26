import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setupFileRoutes } from '../../src/server/routes/files.ts';

let root: string;
let app: ReturnType<typeof Fastify>;

beforeAll(async () => {
  root = mkdtempSync(join(tmpdir(), 'fs-test-'));
  writeFileSync(join(root, 'a.txt'), 'hello');
  writeFileSync(join(root, 'b.log'), 'log content');
  mkdirSync(join(root, 'sub'));
  writeFileSync(join(root, 'sub', 'c.txt'), 'world');

  app = Fastify();
  await setupFileRoutes(app, { root, compress: false });
  await app.ready();
});

afterAll(async () => {
  await app.close();
  rmSync(root, { recursive: true, force: true });
});

describe('GET /api/files', () => {
  it('列出根目录', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/files?dir=.' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.currentPath).toBe('.');
    const names = body.items.map((i: { name: string }) => i.name);
    expect(names).toContain('a.txt');
    expect(names).toContain('sub');
  });

  it('目录穿越返回 400 file.pathInvalid', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/files?dir=../../etc/passwd' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ code: 'file.pathInvalid' });
  });

  it('不存在的目录返回 500 internalError', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/files?dir=not-exist' });
    expect(res.statusCode).toBe(500);
    expect(res.json().code).toBe('internalError');
  });
});

describe('GET /api/download/*', () => {
  it('下载存在的文件返回 200', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/download/a.txt' });
    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('hello');
  });

  it('目录穿越（编码 %2F）返回 400 file.pathInvalid', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/download/..%2F..%2Fetc%2Fpasswd' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ code: 'file.pathInvalid' });
  });

  it('字面 ../ 被 URL 规范化后由框架兜底拒绝', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/download/../../etc/passwd' });
    expect(res.statusCode).toBe(404);
  });

  it('不存在的文件返回 404 file.notFound', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/download/nope.txt' });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ code: 'file.notFound' });
  });

  it('下载目录返回 400 file.isDirectory', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/download/sub' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ code: 'file.isDirectory' });
  });
});

describe('POST /api/download-batch', () => {
  it('空列表返回 400 download.empty', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/download-batch',
      payload: { files: [] },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ code: 'download.empty' });
  });

  it('含目录穿越项时自动跳过并打包合法项', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/download-batch',
      payload: { files: ['a.txt', '../../etc/passwd', 'nope.txt'] },
    });
    expect(res.statusCode).toBe(200);
    // zip 流直接 pipe 到 reply.raw，无 content-type 头，校验 zip 魔数 PK
    expect(res.rawPayload.subarray(0, 2).toString('latin1')).toBe('PK');
  });
});
