import { readFileSync, writeFileSync, renameSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { defaultSettings, parseSettings, type MonitorSettings } from '../shared/health-settings';

export class SettingsStore {
  private path: string;
  constructor(private directory: string) {
    this.path = join(directory, 'monitor-settings.json');
  }
  load(): { settings: MonitorSettings; warning?: string } {
    try {
      return { settings: parseSettings(JSON.parse(readFileSync(this.path, 'utf8'))) };
    } catch (error) {
      return {
        settings: defaultSettings(),
        warning:
          (error as NodeJS.ErrnoException).code === 'ENOENT'
            ? undefined
            : '保存済みの監視設定を読めませんでした。初期設定を使用します。',
      };
    }
  }
  save(settings: MonitorSettings) {
    const valid = parseSettings(settings);
    mkdirSync(this.directory, { recursive: true });
    writeFileSync(`${this.path}.tmp`, JSON.stringify(valid, null, 2), { mode: 0o600 });
    renameSync(`${this.path}.tmp`, this.path);
  }
}
