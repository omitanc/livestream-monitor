import { app, dialog, type BrowserWindow } from 'electron';
import { autoUpdater } from 'electron-updater';
import type { UpdateState } from '../shared/types';

export class Updates {
  private state: UpdateState = { phase: 'idle', message: '更新は操作したときだけ確認します。' };
  constructor(
    private window: BrowserWindow,
    private isObserving: () => boolean,
  ) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = false;
    autoUpdater.allowPrerelease = false;
    autoUpdater.logger = null;
    autoUpdater.setFeedURL({ provider: 'github', owner: 'omitanc', repo: 'livestream-monitor' });
    autoUpdater.on('checking-for-update', () =>
      this.send({ phase: 'checking', message: '最新の安定版を確認しています…' }),
    );
    autoUpdater.on('update-available', (info) =>
      this.send({
        phase: 'available',
        version: info.version,
        message: `バージョン ${info.version} を取得できます。`,
      }),
    );
    autoUpdater.on('update-not-available', () =>
      this.send({ phase: 'current', message: '現在のバージョンが最新です。' }),
    );
    autoUpdater.on('download-progress', (progress) =>
      this.send({
        phase: 'downloading',
        percent: Math.round(progress.percent),
        message: '更新ファイルをダウンロードしています…',
      }),
    );
    autoUpdater.on('update-downloaded', (info) =>
      this.send({
        phase: 'ready',
        version: info.version,
        message: '適用するにはアプリを再起動します。',
      }),
    );
    autoUpdater.on('error', () =>
      this.send({
        phase: 'error',
        message: '更新できませんでした。公開済みの更新ファイルと接続状態を確認してください。',
      }),
    );
  }
  private send(state: UpdateState) {
    this.state = state;
    if (!this.window.isDestroyed()) this.window.webContents.send('monitor:update', state);
  }
  async check() {
    if (!app.isPackaged) {
      this.send({
        phase: 'development',
        message: '開発版です。更新は署名・配布設定を済ませたインストール版で検証します。',
      });
      return;
    }
    if (['checking', 'downloading', 'ready'].includes(this.state.phase)) return;
    await autoUpdater.checkForUpdates().catch(() => undefined);
  }
  async download() {
    if (!app.isPackaged || this.state.phase !== 'available') return;
    this.send({ phase: 'downloading', message: '更新を取得しています…', percent: 0 });
    await autoUpdater.downloadUpdate().catch(() => undefined);
  }
  async install() {
    if (!app.isPackaged || this.state.phase !== 'ready') return;
    if (this.isObserving()) throw new Error('映像取得を停止してから更新してください。');
    const { response } = await dialog.showMessageBox(this.window, {
      type: 'question',
      buttons: ['キャンセル', '更新して再起動'],
      defaultId: 0,
      cancelId: 0,
      message: '更新して再起動しますか？',
      detail:
        'このプレビュー版は配信URLを保存しません。再起動後はURLを入力し、映像取得を開始してください。',
    });
    if (response === 1) autoUpdater.quitAndInstall(false, true);
  }
}
