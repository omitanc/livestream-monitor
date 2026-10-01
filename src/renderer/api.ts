import type { MonitorApi, Snapshot } from '../shared/types';
declare global {
  interface Window {
    monitor?: MonitorApi;
  }
}
export const initialState: Snapshot = {
  source: 'none',
  pageReady: false,
  muted: false,
  observing: false,
  status: 'idle',
  lastCaptureAt: null,
  count: 0,
  change: null,
  thumbnail: null,
  player: null,
  reloadMinutes: 0,
  nextReloadAt: null,
  cacheBytes: 0,
  memoryMb: null,
  cpuPercent: null,
  minimized: false,
  events: [],
};
export const api = window.monitor;
export function formatTime(time: number | null) {
  return time ? new Date(time).toLocaleTimeString('ja-JP', { hour12: false }) : '—';
}
export function megabytes(bytes: number) {
  return (bytes / 1024 / 1024).toFixed(1);
}
