# file-serve

## [中文文档](README_zh-CN.md)

A local network file upload and download service. Run `file-serve` in any directory to serve that directory as the root for file browsing, downloading, and uploading. Supports resumable uploads (tus protocol).

## Installation

```bash
npm install -g file-serve
```

Requires Node.js >= 20.19.0.

## Usage

```bash
# Start with current directory as root
file-serve

# Specify port and automatically open browser
file-serve -p 8080 -o

# Share on local network (listen on all interfaces, show local network addresses)
file-serve -l 0.0.0.0

# Specify server root directory
file-serve /path/to/dir
```

After starting, visit `http://localhost:3000` in your browser to use.

## Command Line Options

| Option | Description | Default |
| --- | --- | --- |
| `-p, --port <port>` | Port number. Automatically searches for the next available port if occupied (up to 10 attempts) | `3000` |
| `-l, --listen <listen>` | Listen address. Supports `tcp://0.0.0.0:8080` format | `0.0.0.0` |
| `-o, --open` | Automatically open browser after starting | `false` |
| `-d, --debug` | Debug mode (output detailed logs) | `false` |
| `-C, --cors` | Enable CORS | `true` |
| `-c, --compress` | Enable gzip compression (only for text files) | `false` |
| `[path]` | Specify server root directory (defaults to current directory) | `.` |

## Features

- **File Browsing**: Display files and folders in the current directory. The first item is `..` to go up one level. Click folders to enter them, click files to download directly.
- **Batch Download**: Select files/folders and download them as a ZIP archive (folders recursively include all internal files).
- **Upload**: Supports multi-file selection, resumable uploads (tus protocol), pause/resume/cancel, concurrent uploads (default: 5 concurrent), individual progress bars, and automatic refresh of file list after upload completion.

## Development

```bash
npm run deps
npm run dev          # Frontend development server (Vite)
npm run build        # Build frontend + backend to dist/
npm run preview -p 3000   # Run build output
```

## Tech Stack

Fastify · Vite · Vue 3 · Vant · tus protocol (@tus/server + tus-js-client) · archiver · cac

## License

MIT