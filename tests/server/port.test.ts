import { afterEach, describe, expect, it, vi } from 'vitest';
import net from 'node:net';
import os from 'node:os';
import type { NetworkInterfaceInfoIPv4 } from 'node:os';
import { findAvailablePort, getLocalIP, isPortAvailable } from '../../src/server/utils/port.ts';

function listenOnce(port: number): Promise<net.Server> {
  return new Promise((resolve) => {
    const s = net.createServer();
    // 与 isPortAvailable 的探测地址一致(0.0.0.0),否则 127.0.0.1 的监听挡不住 0.0.0.0 的探测
    s.listen(port, '0.0.0.0', () => resolve(s));
  });
}

function closeServer(s: net.Server): Promise<void> {
  return new Promise((resolve) => s.close(() => resolve()));
}

function getPort(s: net.Server): number {
  return (s.address() as net.AddressInfo).port;
}

function ipv4(
  address: string,
  internal = false,
  extra: Partial<NetworkInterfaceInfoIPv4> = {},
): NetworkInterfaceInfoIPv4 {
  return {
    address,
    netmask: '255.255.255.0',
    family: 'IPv4',
    mac: '00:00:00:00:00:00',
    internal,
    cidr: `${address}/24`,
    ...extra,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('isPortAvailable', () => {
  it('被占用端口返回 false', async () => {
    const s = await listenOnce(0);
    try {
      expect(await isPortAvailable(getPort(s))).toBe(false);
    } finally {
      await closeServer(s);
    }
  });

  it('空闲端口返回 true', async () => {
    const s = await listenOnce(0);
    const port = getPort(s);
    await closeServer(s);
    expect(await isPortAvailable(port)).toBe(true);
  });
});

describe('findAvailablePort', () => {
  it('起始端口可用时直接返回', async () => {
    const s = await listenOnce(0);
    const port = getPort(s);
    await closeServer(s);
    expect(await findAvailablePort(port, 5)).toBe(port);
  });

  it('被占用时向上递增寻找可用端口', async () => {
    const blocker = await listenOnce(0);
    const port = getPort(blocker);
    try {
      expect(await findAvailablePort(port, 5)).toBe(port + 1);
    } finally {
      await closeServer(blocker);
    }
  });

  it('尝试耗尽后抛错', async () => {
    const blocker = await listenOnce(0);
    const port = getPort(blocker);
    try {
      await expect(findAvailablePort(port, 1)).rejects.toThrow('无法找到可用端口');
    } finally {
      await closeServer(blocker);
    }
  });
});

describe('getLocalIP', () => {
  it('优先返回非内网 IPv4 地址', () => {
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({
      lo0: [ipv4('127.0.0.1', true)],
      en0: [ipv4('192.168.1.5')],
    });
    expect(getLocalIP()).toBe('192.168.1.5');
  });

  it('跳过 IPv6 与链路本地地址', () => {
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({
      en0: [
        {
          address: 'fe80::1',
          netmask: 'ffff:ffff:ffff:ffff::',
          family: 'IPv6',
          mac: '00:00:00:00:00:00',
          internal: false,
          scopeid: 5,
          cidr: 'fe80::1/64',
        },
        ipv4('169.254.10.1'),
      ],
    });
    expect(getLocalIP()).toBe('127.0.0.1');
  });

  it('没有任何地址时回退 127.0.0.1', () => {
    vi.spyOn(os, 'networkInterfaces').mockReturnValue({});
    expect(getLocalIP()).toBe('127.0.0.1');
  });
});
