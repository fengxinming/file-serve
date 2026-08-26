/**
 * 端口与网络工具:探测可用端口、获取本机局域网地址。
 */
import net from 'node:net';
import os from 'node:os';

/**
 * 探测端口是否可被监听(未被占用)。
 * @param port 待探测端口号
 * @returns 端口可用返回 true,否则 false
 */
export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    // 创建临时 server 尝试监听,监听成功即说明端口可用
    const server = net.createServer();
    server.once('error', () => resolve(false));
    server.once('listening', () => {
      server.close();
      resolve(true);
    });
    server.listen(port, '0.0.0.0');
  });
}

/**
 * 从起始端口向后探测第一个可用端口。
 * @param startPort 起始端口
 * @param maxAttempts 最多尝试次数,默认 10
 * @returns 可用端口号
 * @throws 尝试完仍无可用端口时抛出错误
 */
export async function findAvailablePort(startPort: number, maxAttempts = 10): Promise<number> {
  let port = startPort;
  for (let i = 0; i < maxAttempts; i++) {
    // 必须串行探测:找到第一个可用端口即返回,不可并行占用端口
    // oxlint-disable-next-line unicorn/no-await-in-loop
    if (await isPortAvailable(port)) return port;
    port += 1;
  }
  throw new Error(`无法找到可用端口（已尝试 ${maxAttempts} 次）`);
}

/**
 * 获取本机局域网 IPv4 地址,用于打印局域网访问地址。
 * @returns 第一个非内环的 IPv4 地址,找不到则回退 127.0.0.1
 */
export function getLocalIP(): string {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const info of interfaces[name]!) {
      // 跳过内环地址与 Windows 虚拟网卡链路本地地址
      if (info.family === 'IPv4' && !info.internal && !info.address.startsWith('169.254')) {
        return info.address;
      }
    }
  }
  return '127.0.0.1';
}
