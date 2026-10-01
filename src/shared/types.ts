import type { MonitorSettings } from './health-settings';
import type { HealthState } from './health-detector';
export type Source = 'none' | 'youtube' | 'fixture';
export type CaptureStatus = 'idle' | 'waiting' | 'capturing' | 'unavailable' | 'stopped';
export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PlayerProbe {
  found: boolean;
  paused: boolean;
  ended: boolean;
  readyState: number;
  errorCode: number | null;
  playerError: boolean;
  currentTime: number;
  liveGap: number | null;
  aspectRatio: number | null;
  audioMuted: boolean;
  rect: Bounds | null;
}
export interface LogEntry {
  id: number;
  at: number;
  message: string;
  level: 'info' | 'warning';
}
export interface Snapshot {
  settings: MonitorSettings;
  health: HealthState;
  notificationStatus: string;
  soundError: string | null;
  soundTestId: number;
  source: Source;
  pageReady: boolean;
  muted: boolean;
  observing: boolean;
  status: CaptureStatus;
  lastCaptureAt: number | null;
  count: number;
  change: number | null;
  thumbnail: string | null;
  player: PlayerProbe | null;
  reloadMinutes: number;
  nextReloadAt: number | null;
  cacheBytes: number;
  memoryMb: number | null;
  cpuPercent: number | null;
  minimized: boolean;
  events: LogEntry[];
}
export interface UpdateState {
  phase:
    | 'idle'
    | 'checking'
    | 'available'
    | 'downloading'
    | 'ready'
    | 'current'
    | 'error'
    | 'development';
  message: string;
  version?: string;
  percent?: number;
}
export type Command =
  | { type: 'open'; url: string }
  | { type: 'fixture' | 'start' | 'stop' | 'reload' | 'live' | 'clear-cache' }
  | { type: 'monitor-settings'; settings: MonitorSettings }
  | {
      type:
        'alert-acknowledge' | 'test-notification' | 'test-sound' | 'sound-failed' | 'sound-ready';
    }
  | { type: 'mute'; muted: boolean }
  | { type: 'reload-interval'; minutes: number }
  | { type: 'bounds'; bounds: Bounds | null }
  | { type: 'update-check' | 'update-download' | 'update-install' };
export interface MonitorApi {
  command: (command: Command) => Promise<{ ok: boolean; error?: string }>;
  snapshot: () => Promise<Snapshot>;
  subscribe: (listener: (state: Snapshot) => void) => () => void;
  subscribeUpdate: (listener: (state: UpdateState) => void) => () => void;
}
