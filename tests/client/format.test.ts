import { describe, expect, it } from 'vitest';
import { formatSize, formatTime } from '../../src/app/utils/format.ts';

describe('formatSize', () => {
  it('0 与负数显示为 0 B', () => {
    expect(formatSize(0)).toBe('0 B');
    expect(formatSize(-100)).toBe('0 B');
  });

  it('小于 1KB 显示整数字节', () => {
    expect(formatSize(1)).toBe('1 B');
    expect(formatSize(1023)).toBe('1023 B');
  });

  it('KB 保留一位小数', () => {
    expect(formatSize(1024)).toBe('1.0 KB');
    expect(formatSize(1536)).toBe('1.5 KB');
  });

  it('MB / GB / TB 边界', () => {
    expect(formatSize(1024 ** 2)).toBe('1.0 MB');
    expect(formatSize(1024 ** 3)).toBe('1.0 GB');
    expect(formatSize(1024 ** 4)).toBe('1.0 TB');
  });

  it('非法输入（NaN）显示为 0 B', () => {
    expect(formatSize(NaN)).toBe('0 B');
  });
});

describe('formatTime', () => {
  it('格式化为 本地 YYYY-MM-DD HH:mm', () => {
    const d = new Date(2024, 0, 2, 3, 4); // 本地时区 2024-01-02 03:04
    expect(formatTime(d.getTime())).toBe('2024-01-02 03:04');
  });

  it('月日时分补零', () => {
    const d = new Date(2024, 10, 5, 9, 7); // 本地时区 2024-11-05 09:07
    expect(formatTime(d.getTime())).toBe('2024-11-05 09:07');
  });
});
