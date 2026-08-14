import net from 'node:net'
import os from 'node:os'

export function isPortAvailable(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.once('error', () => resolve(false))
    server.once('listening', () => {
      server.close()
      resolve(true)
    })
    server.listen(port, '0.0.0.0')
  })
}

export async function findAvailablePort(startPort: number, maxAttempts = 10): Promise<number> {
  let port = startPort
  for (let i = 0; i < maxAttempts; i++) {
    if (await isPortAvailable(port)) return port
    port += 1
  }
  throw new Error(`无法找到可用端口（已尝试 ${maxAttempts} 次）`)
}

export function getLocalIP(): string {
  const interfaces = os.networkInterfaces()
  for (const name of Object.keys(interfaces)) {
    for (const info of interfaces[name]!) {
      if (info.family === 'IPv4' && !info.internal && !info.address.startsWith('169.254')) {
        return info.address
      }
    }
  }
  return '127.0.0.1'
}