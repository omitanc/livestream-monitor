import { describe, expect, it } from 'vitest';
import { defaultSettings, parseSettings } from '../../src/shared/health-settings';
import { parseCommand } from '../../src/shared/policy';
describe('monitor settings trust boundary', () => {
  it('returns a normalized copy and accepts persisted settings', () => {
    const s = defaultSettings();
    expect(parseSettings(s)).toEqual(s);
    expect(parseSettings(s)).not.toBe(s);
    expect(parseCommand({ type: 'monitor-settings', settings: s }).type).toBe('monitor-settings');
  });
  it.each([NaN, Infinity, -1, 101, '50', undefined])('rejects invalid volume %s', (value) => {
    const s = defaultSettings();
    (s.notifications as any).volume = value;
    expect(() => parseSettings(s)).toThrow();
  });
  it('rejects overflow regions, omitted rules and non-booleans', () => {
    const s = defaultSettings();
    s.region.x = 20;
    expect(() => parseSettings(s)).toThrow();
    s.region.width = 80;
    expect(parseSettings(s).region.width).toBe(80);
    delete (s.rules as any).freeze;
    expect(() => parseSettings(s)).toThrow();
    expect(() => parseSettings({ ...defaultSettings(), enabled: 'yes' })).toThrow();
  });
  it('rejects invalid durations and malformed IPC settings', () => {
    const s = defaultSettings();
    s.rules.freeze.seconds = 0;
    expect(() => parseSettings(s)).toThrow();
    expect(() => parseCommand({ type: 'monitor-settings', settings: null })).toThrow();
  });
});
