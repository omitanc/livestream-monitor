import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { afterEach, describe, expect, it } from 'vitest';
import { SettingsStore } from '../../src/main/settings-store';
import { defaultSettings } from '../../src/shared/health-settings';
let directory: string;
afterEach(() => {
  if (directory) rmSync(directory, { recursive: true, force: true });
});
describe('persisted monitor configuration', () => {
  it('retains settings across restarts without creating a file on first load', () => {
    directory = mkdtempSync(join(tmpdir(), 'lsm-settings-'));
    const store = new SettingsStore(directory);
    expect(store.load()).toEqual({ settings: defaultSettings(), warning: undefined });
    const settings = defaultSettings();
    settings.rules.freeze.seconds = 77;
    settings.region.height = 80;
    store.save(settings);
    expect(new SettingsStore(directory).load().settings).toEqual(settings);
  });
  it('fails safely on corrupted files and refuses invalid writes', () => {
    directory = mkdtempSync(join(tmpdir(), 'lsm-settings-'));
    const store = new SettingsStore(directory);
    writeFileSync(join(directory, 'monitor-settings.json'), '{invalid');
    expect(store.load().warning).toBeTruthy();
    expect(store.load().settings).toEqual(defaultSettings());
    const invalid = defaultSettings();
    invalid.region.height = 101;
    expect(() => store.save(invalid)).toThrow();
  });
});
