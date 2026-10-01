export type HealthReason = 'freeze' | 'playback' | 'black' | 'unavailable';
export interface HealthRule {
  enabled: boolean;
  seconds: number;
}
export interface VideoRegion {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface MonitorSettings {
  enabled: boolean;
  startupSeconds: number;
  recoverySeconds: number;
  rules: Record<HealthReason, HealthRule>;
  motionThreshold: number;
  blackThreshold: number;
  blackRatio: number;
  region: VideoRegion;
  notifications: {
    sound: boolean;
    desktop: boolean;
    volume: number;
    repeatSeconds: number;
    recovery: boolean;
  };
}
export const reasonLabels: Record<HealthReason, string> = {
  freeze: '映像の変化が少ない',
  playback: '再生停止・終了・読み込み待ち',
  black: '黒画面',
  unavailable: '観測不能',
};
export function defaultSettings(): MonitorSettings {
  return {
    enabled: true,
    startupSeconds: 15,
    recoverySeconds: 5,
    rules: {
      freeze: { enabled: true, seconds: 60 },
      playback: { enabled: true, seconds: 15 },
      black: { enabled: true, seconds: 30 },
      unavailable: { enabled: true, seconds: 15 },
    },
    motionThreshold: 0.5,
    blackThreshold: 16,
    blackRatio: 98,
    region: { x: 0, y: 0, width: 100, height: 100 },
    notifications: { sound: true, desktop: true, volume: 50, repeatSeconds: 10, recovery: true },
  };
}
export function parseSettings(input: unknown): MonitorSettings {
  const fail = () => {
    throw new Error('監視設定の値が範囲外です。');
  };
  if (!input || typeof input !== 'object') return fail();
  const s = input as MonitorSettings;
  const bool = (v: unknown): boolean => (typeof v === 'boolean' ? v : fail());
  const number = (v: unknown, min: number, max: number, integer = false): number =>
    typeof v === 'number' &&
    Number.isFinite(v) &&
    v >= min &&
    v <= max &&
    (!integer || Number.isInteger(v))
      ? v
      : fail();
  if (!s.rules || !s.region || !s.notifications) return fail();
  const rules = {} as MonitorSettings['rules'];
  for (const key of Object.keys(reasonLabels) as HealthReason[]) {
    const rule = s.rules[key];
    if (!rule) return fail();
    rules[key] = { enabled: bool(rule.enabled), seconds: number(rule.seconds, 1, 3600, true) };
  }
  const region = {
    x: number(s.region.x, 0, 99),
    y: number(s.region.y, 0, 99),
    width: number(s.region.width, 1, 100),
    height: number(s.region.height, 1, 100),
  };
  if (region.x + region.width > 100 || region.y + region.height > 100) return fail();
  return {
    enabled: bool(s.enabled),
    startupSeconds: number(s.startupSeconds, 0, 120, true),
    recoverySeconds: number(s.recoverySeconds, 1, 60, true),
    rules,
    motionThreshold: number(s.motionThreshold, 0, 100),
    blackThreshold: number(s.blackThreshold, 0, 64, true),
    blackRatio: number(s.blackRatio, 1, 100),
    region,
    notifications: {
      sound: bool(s.notifications.sound),
      desktop: bool(s.notifications.desktop),
      volume: number(s.notifications.volume, 1, 100, true),
      repeatSeconds: number(s.notifications.repeatSeconds, 2, 300, true),
      recovery: bool(s.notifications.recovery),
    },
  };
}
