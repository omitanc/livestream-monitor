import type { Bounds, Command } from './types';

export function youtubeUrl(input: string): string {
  const url = new URL(input);
  if (url.protocol !== 'https:' || url.username || url.password || url.port)
    throw new Error('HTTPSのYouTube動画URLを入力してください。');
  let id: string | null = null;
  if (url.hostname === 'youtu.be') id = url.pathname.slice(1);
  if (['youtube.com', 'www.youtube.com', 'm.youtube.com'].includes(url.hostname)) {
    id =
      url.pathname === '/watch'
        ? url.searchParams.get('v')
        : (url.pathname.match(/^\/(?:live|embed)\/([^/]+)\/?$/)?.[1] ?? null);
  }
  if (!id || !/^[\w-]{11}$/.test(id))
    throw new Error('watch?v=… または /live/… 形式のYouTube動画URLを入力してください。');
  return `https://www.youtube.com/watch?v=${id}`;
}

export function allowedNavigation(input: string): boolean {
  try {
    const url = new URL(input);
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      !url.port &&
      [
        'www.youtube.com',
        'youtube.com',
        'm.youtube.com',
        'accounts.google.com',
        'consent.youtube.com',
        'consent.google.com',
      ].includes(url.hostname)
    );
  } catch {
    return false;
  }
}

export function validBounds(value: unknown): value is Bounds {
  if (!value || typeof value !== 'object') return false;
  const b = value as Bounds;
  return (
    [b.x, b.y, b.width, b.height].every(Number.isFinite) &&
    b.x >= 0 &&
    b.y >= 0 &&
    b.width >= 1 &&
    b.height >= 1 &&
    b.x <= 10000 &&
    b.y <= 10000 &&
    b.width <= 10000 &&
    b.height <= 10000
  );
}

export function parseCommand(value: unknown): Command {
  if (!value || typeof value !== 'object') throw new Error('不正な操作です。');
  const cmd = value as Command;
  if (cmd.type === 'open' && typeof cmd.url === 'string' && cmd.url.length <= 2048)
    return { type: 'open', url: youtubeUrl(cmd.url) };
  if (cmd.type === 'mute' && typeof cmd.muted === 'boolean') return cmd;
  if (cmd.type === 'bounds' && (cmd.bounds === null || validBounds(cmd.bounds))) return cmd;
  if (
    cmd.type === 'reload-interval' &&
    Number.isInteger(cmd.minutes) &&
    (cmd.minutes === 0 || (cmd.minutes >= 1 && cmd.minutes <= 180))
  )
    return cmd;
  if (
    [
      'fixture',
      'start',
      'stop',
      'reload',
      'live',
      'clear-cache',
      'update-check',
      'update-download',
      'update-install',
    ].includes(cmd.type)
  )
    return cmd;
  throw new Error('操作の値が範囲外です。');
}

export function pixelChange(previous: Uint8Array | null, current: Uint8Array): number | null {
  if (!previous || previous.length !== current.length || !current.length) return null;
  let changed = 0;
  for (let i = 0; i < current.length; i += 4) {
    if (
      Math.max(
        Math.abs(current[i] - previous[i]),
        Math.abs(current[i + 1] - previous[i + 1]),
        Math.abs(current[i + 2] - previous[i + 2]),
      ) > 16
    )
      changed++;
  }
  return Math.round((changed / (current.length / 4)) * 1000) / 10;
}
