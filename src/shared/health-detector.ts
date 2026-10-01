import { reasonLabels, type HealthReason, type MonitorSettings } from './health-settings';
import type { PlayerProbe } from './types';

export interface HealthState {
  phase: 'off' | 'waiting' | 'ok' | 'pending' | 'alert' | 'unavailable';
  reasons: HealthReason[];
  elapsedSeconds: number;
  alertId: number;
  alerting: boolean;
  acknowledged: boolean;
  regionChange: number | null;
  blackPercent: number | null;
}
export interface Observation {
  available: boolean;
  youtube: boolean;
  player: PlayerProbe | null;
  change: number | null;
  blackPercent: number | null;
}
export type HealthTransition = { type: 'alert' | 'recovered'; reasons: HealthReason[] };
export function idleHealth(): HealthState {
  return {
    phase: 'off',
    reasons: [],
    elapsedSeconds: 0,
    alertId: 0,
    alerting: false,
    acknowledged: false,
    regionChange: null,
    blackPercent: null,
  };
}

// Duration accounting uses a monotonic clock. Reloads are gaps in observation,
// not recovery: retain evidence until fresh, comparable frames disprove it.
export class HealthDetector {
  state = idleHealth();
  private running = false;
  private startedAt = 0;
  private lastSampleAt: number | null = null;
  private lastAvailableAt: number | null = null;
  private observation: Observation | null = null;
  private previousTime: number | null = null;
  private playbackProgressAt = 0;
  private since = new Map<HealthReason, number>();
  private recoveringAt: number | null = null;
  private incidentReasons = new Set<HealthReason>();
  constructor(private settings: MonitorSettings) {}
  start(now: number) {
    this.reset();
    this.running = true;
    this.startedAt = now;
    this.playbackProgressAt = now;
    this.evaluate(now);
  }
  reset() {
    const alertId = this.state.alertId;
    this.state = { ...idleHealth(), alertId };
    this.running = false;
    this.since.clear();
    this.incidentReasons.clear();
    this.observation = null;
    this.lastSampleAt = null;
    this.lastAvailableAt = null;
    this.previousTime = null;
    this.recoveringAt = null;
  }
  configure(settings: MonitorSettings, now: number) {
    const running = this.running;
    this.settings = settings;
    if (running) this.start(now);
    else this.reset();
  }
  acknowledge() {
    if (this.state.alerting) this.state.acknowledged = true;
  }
  sample(observation: Observation, now: number): HealthTransition[] {
    this.observation = observation;
    this.lastSampleAt = now;
    if (observation.available) {
      this.lastAvailableAt = now;
      this.state.regionChange = observation.change;
      this.state.blackPercent = observation.blackPercent;
    } else {
      this.state.regionChange = null;
      this.state.blackPercent = null;
    }
    if (observation.youtube && observation.player) {
      const time = observation.player.currentTime;
      if (this.previousTime === null || time - this.previousTime > 0.05)
        this.playbackProgressAt = now;
      this.previousTime = time;
    }
    return this.evaluate(now);
  }
  tick(now: number): HealthTransition[] {
    return this.evaluate(now);
  }
  private condition(key: HealthReason, active: boolean, now: number) {
    if (!this.settings.rules[key].enabled || !active) this.since.delete(key);
    else if (!this.since.has(key)) this.since.set(key, now);
  }
  private evaluate(now: number): HealthTransition[] {
    const settings = this.settings;
    if (
      !this.running ||
      !settings.enabled ||
      !Object.values(settings.rules).some((r) => r.enabled)
    ) {
      this.state.phase = 'off';
      return [];
    }
    if (now - this.startedAt < settings.startupSeconds * 1000) {
      this.state.phase = 'waiting';
      return [];
    }
    const o = this.observation;
    const fresh = this.lastSampleAt !== null && now - this.lastSampleAt <= 5000;
    const available =
      !!o?.available &&
      fresh &&
      this.lastAvailableAt !== null &&
      now - this.lastAvailableAt <= 5000;
    this.condition('unavailable', !available, now);
    if (!available) {
      this.state.regionChange = null;
      this.state.blackPercent = null;
    }
    // A lost image cannot disprove a freeze/black screen. Do not erase timers
    // during a reload, but do not create visual evidence from missing pixels.
    if (available) {
      if (o?.change !== null)
        this.condition('freeze', (o?.change ?? Infinity) <= settings.motionThreshold, now);
      this.condition('black', (o?.blackPercent ?? -1) >= settings.blackRatio, now);
    }
    const p = o?.player;
    if (fresh && o?.youtube && p) {
      const stalled =
        p.ended ||
        p.paused ||
        p.readyState < 3 ||
        p.playerError ||
        !!p.errorCode ||
        now - this.playbackProgressAt >= 2000;
      this.condition('playback', stalled, now);
    }
    const reasons = [...this.since.keys()];
    const confirmed = reasons.filter(
      (key) => now - this.since.get(key)! >= settings.rules[key].seconds * 1000,
    );
    const transitions: HealthTransition[] = [];
    for (const key of confirmed) {
      if (this.incidentReasons.has(key)) continue;
      this.incidentReasons.add(key);
      // A new independent condition re-arms an acknowledged incident.
      this.state.acknowledged = false;
      this.state.alertId++;
      transitions.push({ type: 'alert', reasons: [key] });
      this.state.alerting = true;
    }
    if (!reasons.length && available && o?.change !== null) {
      if (this.recoveringAt === null) this.recoveringAt = now;
      if (this.state.alerting && now - this.recoveringAt >= settings.recoverySeconds * 1000) {
        transitions.push({ type: 'recovered', reasons: [...this.incidentReasons] });
        this.state.alerting = false;
        this.state.acknowledged = false;
        this.incidentReasons.clear();
      }
    } else this.recoveringAt = null;
    this.state.reasons = reasons.length
      ? reasons
      : this.state.alerting
        ? [...this.incidentReasons]
        : [];
    this.state.elapsedSeconds = this.since.size
      ? Math.floor((now - Math.min(...this.since.values())) / 1000)
      : 0;
    this.state.phase = !available
      ? 'unavailable'
      : this.state.alerting
        ? 'alert'
        : reasons.length
          ? 'pending'
          : 'ok';
    return transitions;
  }
}
export function describeReasons(reasons: HealthReason[]) {
  return reasons.map((key) => reasonLabels[key]).join('、');
}
