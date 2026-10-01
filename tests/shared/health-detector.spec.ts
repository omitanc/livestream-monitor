import { describe, expect, it } from 'vitest';
import { HealthDetector, type Observation } from '../../src/shared/health-detector';
import { defaultSettings, type HealthReason } from '../../src/shared/health-settings';
import type { PlayerProbe } from '../../src/shared/types';

function setup(keys: HealthReason[] = ['freeze']) {
  const settings = defaultSettings();
  settings.startupSeconds = 0;
  settings.recoverySeconds = 2;
  for (const [key, rule] of Object.entries(settings.rules)) {
    rule.enabled = keys.includes(key as HealthReason);
    rule.seconds = 3;
  }
  const detector = new HealthDetector(settings);
  detector.start(0);
  return { detector, settings };
}
function frame(change: number | null, blackPercent = 0): Observation {
  return { available: true, youtube: false, player: null, change, blackPercent };
}
const missing: Observation = {
  available: false,
  youtube: false,
  player: null,
  change: null,
  blackPercent: null,
};
function player(time: number, extra: Partial<PlayerProbe> = {}): Observation {
  return {
    ...frame(10),
    youtube: true,
    player: {
      found: true,
      paused: false,
      ended: false,
      readyState: 4,
      errorCode: null,
      playerError: false,
      currentTime: time,
      liveGap: null,
      aspectRatio: 16 / 9,
      audioMuted: false,
      rect: null,
      ...extra,
    },
  };
}
describe('health duration and incident policy', () => {
  it('waits for sustained low motion, ignores the first frame and deduplicates notifications', () => {
    const { detector: d } = setup();
    expect(d.sample(frame(null), 0)).toEqual([]);
    d.sample(frame(0), 1000);
    d.sample(frame(0), 3000);
    expect(d.state.phase).toBe('pending');
    expect(d.sample(frame(0), 4000)).toEqual([{ type: 'alert', reasons: ['freeze'] }]);
    expect(d.sample(frame(0), 5000)).toEqual([]);
    d.acknowledge();
    d.sample(frame(0), 6000);
    expect(d.state.acknowledged).toBe(true);
  });
  it('resets a short suspect duration when real movement returns', () => {
    const { detector: d } = setup();
    d.sample(frame(0), 0);
    d.sample(frame(10), 2000);
    d.sample(frame(0), 3000);
    expect(d.sample(frame(0), 5000)).toEqual([]);
    expect(d.sample(frame(0), 6000)[0]?.type).toBe('alert');
  });
  it('requires sustained recovery and re-arms the next incident', () => {
    const { detector: d } = setup();
    d.sample(frame(0), 0);
    d.sample(frame(0), 3000);
    d.acknowledge();
    d.sample(frame(10), 4000);
    expect(d.state.alerting).toBe(true);
    d.sample(frame(0), 5000);
    d.sample(frame(10), 6000);
    expect(d.sample(frame(10), 8000)).toEqual([{ type: 'recovered', reasons: ['freeze'] }]);
    expect(d.state.alerting).toBe(false);
    d.sample(frame(0), 9000);
    expect(d.sample(frame(0), 12000)[0]?.type).toBe('alert');
    expect(d.state.acknowledged).toBe(false);
  });
  it('preserves evidence across reload gaps and never declares missing frames healthy', () => {
    const { detector: d } = setup(['freeze', 'unavailable']);
    d.sample(frame(0), 0);
    d.sample(missing, 2000);
    expect(d.state.phase).toBe('unavailable');
    expect(d.tick(3000)).toEqual([{ type: 'alert', reasons: ['freeze'] }]);
    expect(d.tick(5000)).toEqual([{ type: 'alert', reasons: ['unavailable'] }]);
    d.sample(frame(null), 6000);
    expect(d.state.alerting).toBe(true);
    expect(d.state.reasons).toContain('freeze');
    d.sample(frame(10), 7000);
    d.sample(frame(10), 9000);
    expect(d.state.alerting).toBe(false);
  });
  it('detects a hung capture even if no promise ever completes', () => {
    const { detector: d } = setup(['unavailable']);
    d.sample(frame(10), 0);
    d.tick(5001);
    expect(d.state.phase).toBe('unavailable');
    expect(d.state.regionChange).toBeNull();
    expect(d.state.blackPercent).toBeNull();
    expect(d.tick(8001)[0]?.reasons).toEqual(['unavailable']);
  });
  it('honors startup grace and disabled rules', () => {
    const { detector: d, settings } = setup(['black']);
    settings.startupSeconds = 10;
    d.configure(settings, 0);
    d.sample(frame(0, 100), 5000);
    expect(d.state.phase).toBe('waiting');
    d.sample(frame(0, 100), 10000);
    expect(d.sample(frame(0, 100), 13000)[0]?.reasons).toEqual(['black']);
    settings.enabled = false;
    d.configure(settings, 14000);
    expect(d.state.phase).toBe('off');
    expect(d.state.alerting).toBe(false);
  });
  it.each([
    { paused: true },
    { ended: true },
    { readyState: 2 },
    { playerError: true },
    { errorCode: 3 },
  ])('detects sustained player failure %j', (extra) => {
    const { detector: d } = setup(['playback']);
    d.sample(player(0, extra), 0);
    expect(d.sample(player(3, extra), 3000)[0]?.reasons).toEqual(['playback']);
  });
  it('detects a non-advancing playback clock while image pixels keep changing', () => {
    const { detector: d } = setup(['playback']);
    d.sample(player(10), 0);
    d.sample(player(10), 2000);
    expect(d.sample(player(10), 5000)[0]?.reasons).toEqual(['playback']);
    d.sample(player(11), 6000);
    d.sample(player(12), 8000);
    expect(d.state.alerting).toBe(false);
  });
  it('does not count a reload time rewind as evidence of playback recovery', () => {
    const { detector: d } = setup(['playback']);
    d.sample(player(10), 0);
    d.sample(player(10), 2000);
    d.sample(player(0), 3000);
    expect(d.sample(player(0), 5000)[0]?.reasons).toEqual(['playback']);
  });
  it('re-arms acknowledged alerts when a different condition is confirmed', () => {
    const { detector: d } = setup(['freeze', 'black']);
    d.sample(frame(0), 0);
    d.sample(frame(0), 3000);
    d.acknowledge();
    d.sample(frame(0, 100), 4000);
    expect(d.sample(frame(0, 100), 7000)).toEqual([{ type: 'alert', reasons: ['black'] }]);
    expect(d.state.acknowledged).toBe(false);
  });
  it('stops an active alarm without reporting recovery when capture is deliberately stopped', () => {
    const { detector: d } = setup();
    d.sample(frame(0), 0);
    d.sample(frame(0), 3000);
    d.reset();
    expect(d.state.alerting).toBe(false);
    expect(d.tick(9000)).toEqual([]);
  });
});
