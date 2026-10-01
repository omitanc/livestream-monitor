import { app, BrowserWindow, ipcMain, Menu, powerMonitor } from 'electron';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseCommand } from '../shared/policy';
import { Monitor } from './monitor';
import { SettingsStore } from './settings-store';
import { DesktopNotifier } from './desktop-notifier';
import { Updates } from './updates';

// Chromium HTTP disk cache hint, not a quota for cookies/GPU cache/all app data.
app.commandLine.appendSwitch('disk-cache-size', String(256 * 1024 * 1024));
if (process.env.LSM_TEST_DATA_DIR) app.setPath('userData', process.env.LSM_TEST_DATA_DIR);
const rendererPath = join(__dirname, '../renderer/index.html');
let mainWindow: BrowserWindow | null = null;
let monitor: Monitor | undefined;

function createWindow() {
  const window = (mainWindow = new BrowserWindow({
    width: 1380,
    height: 980,
    minWidth: 900,
    minHeight: 700,
    title: 'LiveStream Monitor',
    backgroundColor: '#101419',
    webPreferences: {
      preload: join(__dirname, '../preload/index.cjs'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
      webSecurity: true,
      backgroundThrottling: false,
    },
  }));
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (event) => event.preventDefault());
  const store = new SettingsStore(app.getPath('userData'));
  const saved = store.load();
  const notifier = new DesktopNotifier(window, (message, failed) =>
    instance.notificationResult(message, failed),
  );
  monitor = new Monitor(
    window,
    saved.settings,
    (settings) => store.save(settings),
    (title, body) => notifier.send(title, body),
  );
  const instance = monitor;
  if (saved.warning) instance.log(saved.warning, 'warning');
  const updates = new Updates(window, () => instance.state.observing);
  const trusted = (event: Electron.IpcMainInvokeEvent) => {
    if (
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame.url !== pathToFileURL(rendererPath).href
    )
      throw new Error('操作元が不正です。');
  };
  ipcMain.removeHandler('monitor:snapshot');
  ipcMain.removeHandler('monitor:command');
  ipcMain.handle('monitor:snapshot', (event) => {
    trusted(event);
    return instance.state;
  });
  ipcMain.handle('monitor:command', async (event, input: unknown) => {
    trusted(event);
    try {
      const command = parseCommand(input);
      switch (command.type) {
        case 'open':
          await instance.open(command.url);
          break;
        case 'fixture':
          await instance.open();
          break;
        case 'bounds':
          instance.setBounds(command.bounds);
          break;
        case 'start':
          instance.start();
          break;
        case 'stop':
          instance.stop();
          break;
        case 'reload':
          instance.reload();
          break;
        case 'live':
          await instance.live();
          break;
        case 'mute':
          await instance.setMuted(command.muted);
          break;
        case 'monitor-settings':
          instance.setSettings(command.settings);
          break;
        case 'alert-acknowledge':
          instance.acknowledge();
          break;
        case 'test-notification':
          instance.testNotification();
          break;
        case 'test-sound':
          instance.testSound();
          break;
        case 'sound-failed':
        case 'sound-ready':
          instance.soundResult(command.type === 'sound-failed');
          break;
        case 'reload-interval':
          instance.setReload(command.minutes);
          break;
        case 'clear-cache':
          await instance.clearCache();
          break;
        case 'update-check':
          await updates.check();
          break;
        case 'update-download':
          await updates.download();
          break;
        case 'update-install':
          await updates.install();
          break;
      }
      return { ok: true };
    } catch (error) {
      // Do not include remote URLs, credentials, or raw network errors in UI logs.
      return {
        ok: false,
        error:
          error instanceof Error && !/https?:/.test(error.message)
            ? error.message.slice(0, 200)
            : '操作できませんでした。接続状態を確認してください。',
      };
    }
  });
  window.on('close', () => {
    notifier.dispose();
    instance.dispose();
  });
  window.on('closed', () => {
    mainWindow = null;
    monitor = undefined;
  });
  void window.loadFile(rendererPath);
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('net.omitanc.livestream-monitor');
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      ...(process.platform === 'darwin' ? [{ role: 'appMenu' as const }] : []),
      { role: 'editMenu' },
      { role: 'viewMenu', submenu: [{ role: 'toggleDevTools' }, { role: 'togglefullscreen' }] },
      { role: 'windowMenu' },
    ]),
  );
  createWindow();
  powerMonitor.on('suspend', () => {
    monitor?.stop(false);
    monitor?.log(
      'PCのスリープにより取得を停止しました。復帰後に取得を開始してください。',
      'warning',
    );
  });
  app.on('activate', () => {
    if (!mainWindow) createWindow();
  });
});
app.on('window-all-closed', () => app.quit());
