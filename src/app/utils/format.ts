/**
 * 文件信息格式化:文件大小与修改时间的展示文本。
 */

/**
 * 将字节数格式化为可读大小(如 1.5 MB)。
 * @param bytes 字节数
 * @returns 格式化后的大小文本
 */
export function formatSize(bytes: number): string {
  if (!bytes || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB', 'TB', 'PB'];
  let v = bytes;
  let i = -1;
  // 逐级除以 1024,找到合适单位并保留一位小数
  do {
    v /= 1024;
    i += 1;
  } while (v >= 1024 && i < units.length - 1);
  return `${v.toFixed(1)} ${units[i]}`;
}

/**
 * 将时间戳格式化为 'YYYY-MM-DD HH:mm' 文本。
 * @param ts 毫秒时间戳
 * @returns 格式化后的时间文本
 */
export function formatTime(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
