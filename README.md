# file-serve

局域网文件上传下载服务。在任意目录执行 `file-serve`，即以当前目录为根目录提供文件浏览、下载、上传服务，支持断点续传（tus 协议）。

## 安装

```bash
npm install -g file-serve
```

要求 Node.js >= 20.19.0。

## 使用

```bash
# 以当前目录为根目录启动
file-serve

# 指定端口并自动打开浏览器
file-serve -p 8080 -o

# 局域网分享（监听全部网卡，显示局域网地址）
file-serve -l 0.0.0.0

# 指定服务根目录
file-serve /path/to/dir
```

启动后在浏览器访问 `http://localhost:3000` 即可使用。

## 命令行参数

| 参数 | 说明 | 默认值 |
| --- | --- | --- |
| `-p, --port <port>` | 端口号，被占用时自动向上寻找空闲端口（最多 10 次） | `3000` |
| `-l, --listen <listen>` | 监听地址，支持 `tcp://0.0.0.0:8080` 格式 | `0.0.0.0` |
| `-o, --open` | 启动后自动打开浏览器 | `false` |
| `-d, --debug` | 调试模式（输出详细日志） | `false` |
| `-C, --cors` | 启用 CORS | `true` |
| `-c, --compress` | 启用 gzip 压缩（仅对文本文件生效） | `false` |
| `[path]` | 指定服务根目录（不指定则用当前目录） | `.` |

## 功能

- **文件浏览**：显示当前目录下的文件和文件夹，第一项为 `..` 返回上一层，点击文件夹进入，点击文件直接下载。
- **批量下载**：勾选文件/文件夹后打包为 ZIP 下载（文件夹递归包含内部所有文件）。
- **上传**：支持多文件选择、断点续传（tus 协议）、暂停/继续/取消、并发上传（默认 5 并发）、独立进度条、上传完成自动刷新文件列表。

## 开发

```bash
pnpm install
pnpm dev          # 前端开发服务器（Vite）
pnpm build        # 构建前端 + 后端到 dist/
pnpm build:server # 仅构建后端
node dist/file-serve.js -p 3000   # 运行构建产物
```

## 技术栈

Fastify · Vite · Vue 3 · Vant · tus 协议（@tus/server + tus-js-client）· archiver · cac

## License

MIT
