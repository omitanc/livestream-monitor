// Constant scripts only. Remote page data is never executed as application code.
export const probeScript = `(() => {
  const v = document.querySelector('video');
  if (v) v.controls = false;
  const fixture = document.querySelector('[data-monitor-fixture]');
  const element = v || fixture;
  const r = element?.getBoundingClientRect();
  const rect = r && r.width > 1 && r.height > 1 ? {
    x: Math.max(0, Math.round(r.x)), y: Math.max(0, Math.round(r.y)),
    width: Math.min(Math.round(r.width), innerWidth - Math.max(0, Math.round(r.x))),
    height: Math.min(Math.round(r.height), innerHeight - Math.max(0, Math.round(r.y)))
  } : null;
  const liveGap = v && v.duration === Infinity && v.seekable.length ? Math.max(0, v.seekable.end(v.seekable.length - 1) - v.currentTime) : null;
  const playerError = document.querySelector('.ytp-error-content-wrap');
  return { found: !!element, rect, paused: v?.paused ?? false, ended: v?.ended ?? false,
    readyState: v?.readyState ?? (fixture ? 4 : 0), errorCode: v?.error?.code ?? null,
    playerError: !!playerError && playerError.getClientRects().length > 0 && !!(playerError.textContent ?? playerError.innerText).trim(),
    currentTime: v?.currentTime ?? 0, liveGap, audioMuted: !!v && (v.muted || v.volume === 0),
    aspectRatio: v?.videoWidth && v?.videoHeight ? v.videoWidth / v.videoHeight : null };
})()`;

export const liveScript = `(async () => {
  const v = document.querySelector('video');
  if (!v || !v.seekable.length) return false;
  const liveButton = document.querySelector('.ytp-live-badge');
  if (v.duration !== Infinity && !liveButton) return false;
  if (liveButton) liveButton.click();
  v.currentTime = Math.max(v.seekable.start(v.seekable.length - 1), v.seekable.end(v.seekable.length - 1) - 0.5);
  try { await v.play(); return true; } catch { return false; }
})()`;

// User-origin CSS wins over YouTube's inline sizing and hover/fullscreen overlays.
// Keep the video in its original DOM so YouTube retains playback ownership.
export const videoOnlyCss = `
  html, body { margin: 0 !important; overflow: hidden !important; background: #080c10 !important; }
  body, body * { visibility: hidden !important; pointer-events: none !important; }
  body *::before, body *::after { visibility: hidden !important; }
  body *:has(video) {
    transform: none !important; perspective: none !important; filter: none !important;
    contain: none !important; content-visibility: visible !important;
    overflow: visible !important; clip-path: none !important; clip: auto !important;
    opacity: 1 !important; isolation: auto !important;
  }
  video {
    visibility: visible !important; display: block !important;
    position: fixed !important; inset: 0 !important;
    width: 100vw !important; height: 100vh !important;
    min-width: 0 !important; min-height: 0 !important;
    max-width: none !important; max-height: none !important;
    margin: 0 !important; padding: 0 !important; border: 0 !important;
    object-fit: contain !important; transform: none !important;
    opacity: 1 !important; z-index: 2147483647 !important;
  }
  video::-webkit-media-controls, video::cue { display: none !important; }
`;

// Draw decoded pixels, never page pixels: captions, spinners and controls cannot
// become motion signals. A blocked/tainted canvas fails closed (no screenshot fallback).
export const frameScript = `(() => {
  const v = document.querySelector('video');
  if (!v || v.readyState < 2 || !v.videoWidth || !v.videoHeight) return null;
  const canvas = document.createElement('canvas');
  const scale = Math.min(1, 480 / Math.max(v.videoWidth, v.videoHeight));
  canvas.width = Math.max(1, Math.round(v.videoWidth * scale));
  canvas.height = Math.max(1, Math.round(v.videoHeight * scale));
  try {
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(v, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.65);
  } catch { return null; }
})()`;

export const unmuteScript = `(() => {
  const v = document.querySelector('video');
  if (v) { v.muted = false; if (v.volume === 0) v.volume = 1; }
})()`;
