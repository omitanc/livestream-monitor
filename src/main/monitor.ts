import { app, BrowserWindow, WebContentsView, session, nativeImage } from 'electron';
import { join } from 'node:path';
import { allowedNavigation, pixelChange, validBounds } from '../shared/policy';
import { defaultSettings, parseSettings, type MonitorSettings } from '../shared/health-settings';
import {
  HealthDetector,
  describeReasons,
  idleHealth,
  type Observation,
} from '../shared/health-detector';
import { analyzeFrame, regionBitmap } from '../shared/frame-analysis';
import { Sampler } from '../shared/sampler';
import type { Bounds, PlayerProbe, Snapshot } from '../shared/types';
import { frameScript, liveScript, probeScript, unmuteScript, videoOnlyCss } from './player-scripts';

export class Monitor {
  state: Snapshot = {
    settings: defaultSettings(),
    health: idleHealth(),
    notificationStatus: '未テスト',
    soundError: null,
    soundTestId: 0,
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
  private view?: WebContentsView;
  private presentationReady = false;
  private navigationRevision = 0;
  private probing = false;
  private bounds: Bounds | null = null;
  private detector: HealthDetector;
  private previousRegion: Uint8Array | null = null;
  private previousAspect: number | null = null;
  private previous: Uint8Array | null = null;
  private generation = 0;
  private eventId = 0;
  private deadline = 0;
  private loadingSince = 0;
  private metrics: ReturnType<typeof setInterval>;
  private scheduler: ReturnType<typeof setInterval>;
  private sampler: Sampler;
  readonly session = session.fromPartition('persist:youtube-viewer');

  constructor(
    private window: BrowserWindow,
    settings = defaultSettings(),
    private persistSettings: (settings: MonitorSettings) => void = () => {},
    private notify: (title: string, body: string) => void = () => {},
  ) {
    this.state.settings = settings;
    this.detector = new HealthDetector(settings);
    this.session.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    this.session.setPermissionCheckHandler(() => false);
    this.session.on('will-download', (event) => event.preventDefault());
    this.sampler = new Sampler(
      () => this.capture(),
      () => this.unavailable(),
    );
    this.metrics = setInterval(() => void this.measure(), 10000);
    this.scheduler = setInterval(() => {
      if (this.state.observing) this.updateHealth();
      if (!this.state.observing) void this.refreshPlayer();
      if (this.deadline && performance.now() >= this.deadline) this.reload();
    }, 1000);
    window.on('minimize', () => {
      this.state.minimized = true;
      this.emit();
    });
    window.on('restore', () => {
      this.state.minimized = false;
      this.emit();
    });
    window.on('resize', () => this.setBounds(this.bounds));
    this.log('起動しました。');
    void this.measure();
  }

  emit() {
    if (!this.window.isDestroyed()) this.window.webContents.send('monitor:state', this.state);
  }
  log(message: string, level: 'info' | 'warning' = 'info') {
    this.state.events = [
      { id: ++this.eventId, at: Date.now(), message, level },
      ...this.state.events,
    ].slice(0, 100);
    this.emit();
  }
  setBounds(bounds: Bounds | null) {
    this.bounds = bounds;
    if (!this.view) return;
    this.view.setVisible(Boolean(bounds) && this.presentationReady);
    if (!bounds) return;
    const [width, height] = this.window.getContentSize();
    const x = Math.min(Math.round(bounds.x), width - 1);
    const y = Math.min(Math.round(bounds.y), height - 1);
    this.view.setBounds({
      x,
      y,
      width: Math.max(1, Math.min(Math.round(bounds.width), width - x)),
      height: Math.max(1, Math.min(Math.round(bounds.height), height - y)),
    });
  }

  async open(url?: string) {
    this.stop(false);
    const generation = ++this.generation;
    this.destroyView();
    this.state.source = url ? 'youtube' : 'fixture';
    this.state.pageReady = false;
    this.presentationReady = false;
    this.loadingSince = performance.now();
    this.state.status = 'waiting';
    this.state.lastCaptureAt = null;
    this.state.thumbnail = null;
    this.state.count = 0;
    this.state.player = null;
    this.state.change = null;
    this.previous = null;
    this.previousRegion = null;
    this.previousAspect = null;
    const view = (this.view = new WebContentsView({
      webPreferences: {
        session: this.session,
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: false,
        webSecurity: true,
      },
    }));
    view.setBackgroundColor('#080c10');
    this.window.contentView.addChildView(view);
    this.setBounds(this.bounds);
    const wc = view.webContents;
    wc.setAudioMuted(this.state.muted);
    wc.setWindowOpenHandler(() => ({ action: 'deny' }));
    const block = (event: Electron.Event, destination: string) => {
      if (!url || !allowedNavigation(destination)) event.preventDefault();
    };
    wc.on('will-navigate', block);
    wc.on('will-redirect', (details, destination) => {
      if (details.isMainFrame) block(details, destination);
    });
    wc.on('did-start-navigation', (details) => {
      if (!details.isMainFrame || details.isSameDocument) return;
      this.generation++;
      this.navigationRevision++;
      this.presentationReady = false;
      view.setVisible(false);
      this.state.pageReady = false;
      this.loadingSince = performance.now();
      this.state.status = 'waiting';
      this.state.lastCaptureAt = null;
      this.state.thumbnail = null;
      this.state.change = null;
      this.state.player = null;
      this.previous = null;
      this.previousRegion = null;
      this.previousAspect = null;
      this.emit();
    });
    wc.on('did-finish-load', () => {
      void this.prepareView(view).catch(() => {
        if (this.view === view) this.unavailable();
      });
    });
    wc.on('did-fail-load', (_e, code, _description, _url, main) => {
      if (main && code !== -3) {
        this.state.pageReady = false;
        this.unavailable();
      }
    });
    wc.on('render-process-gone', () => {
      this.state.pageReady = false;
      this.unavailable();
    });
    this.log(url ? 'YouTubeを開いています。' : '時計入りのローカル検証画面を開いています。');
    try {
      if (url) await wc.loadURL(url);
      else await wc.loadFile(join(__dirname, '../renderer/fixture.html'));
    } catch {
      if (this.view === view && generation <= this.generation) this.unavailable();
    }
  }

  private async prepareView(view: WebContentsView) {
    const revision = this.navigationRevision;
    if (this.state.source === 'youtube')
      await view.webContents.insertCSS(videoOnlyCss, { cssOrigin: 'user' });
    if (this.view !== view || revision !== this.navigationRevision) return;
    this.presentationReady = true;
    this.state.pageReady = true;
    this.setBounds(this.bounds);
    this.state.status = this.state.observing ? 'waiting' : 'idle';
    this.log('映像を読み込みました。プレーヤーの再生状態を確認してください。');
    await this.refreshPlayer();
  }
  private async refreshPlayer() {
    const view = this.view;
    if (!view || !this.state.pageReady || this.probing) return;
    const generation = this.generation;
    this.probing = true;
    try {
      const probe: PlayerProbe = await view.webContents.executeJavaScript(probeScript);
      if (this.view !== view || generation !== this.generation) return;
      this.state.player = probe;
      if (this.state.source === 'youtube')
        this.state.muted = view.webContents.isAudioMuted() || probe.audioMuted;
      if (probe.playerError) this.unavailable(true);
      else this.emit();
    } catch {
      if (this.view === view && generation === this.generation) this.unavailable();
    } finally {
      this.probing = false;
    }
  }
  async setMuted(muted: boolean) {
    const view = this.view;
    if (!view || this.state.source !== 'youtube') return;
    view.webContents.setAudioMuted(muted);
    this.state.muted = muted;
    this.emit();
    if (!muted) await view.webContents.executeJavaScript(unmuteScript, true);
  }

  start() {
    if (!this.view) throw new Error('先に配信またはローカル検証を開いてください。');
    if (this.state.observing) return;
    this.state.observing = true;
    this.state.status = 'waiting';
    this.armReload();
    this.detector.start(performance.now());
    this.state.health = this.detector.state;
    this.sampler.start();
    this.log('映像取得を開始しました（約1秒間隔）。');
  }
  stop(log = true) {
    this.state.observing = false;
    this.generation++;
    this.sampler.stop();
    this.detector.reset();
    this.state.health = this.detector.state;
    this.deadline = 0;
    this.state.nextReloadAt = null;
    this.state.status = 'stopped';
    if (log) this.log('映像取得を停止しました。再生は継続します。');
  }
  setSettings(input: MonitorSettings) {
    const settings = parseSettings(input);
    this.persistSettings(settings);
    this.state.settings = settings;
    this.previousRegion = null;
    this.previousAspect = null;
    this.detector.configure(settings, performance.now());
    this.state.health = this.detector.state;
    this.log('監視・通知設定を保存しました。取得中の判定を新しい設定で開始します。');
  }
  acknowledge() {
    this.detector.acknowledge();
    this.log('警報を確認し、この異常の警報音を停止しました。監視は継続します。');
  }
  testSound() {
    this.state.soundTestId++;
    this.emit();
  }
  soundResult(failed: boolean) {
    const previouslyFailed = !!this.state.soundError;
    this.state.soundError = failed
      ? '警報音を再生できません。「警報音を試す」で再確認してください。'
      : null;
    if (failed && !previouslyFailed) this.log(this.state.soundError!, 'warning');
    else this.emit();
  }
  testNotification() {
    this.notify('LiveStream Monitor · 通知テスト', 'PCのOS通知をテストしています。');
  }
  notificationResult(message: string, failed: boolean) {
    this.state.notificationStatus = message;
    this.log(message, failed ? 'warning' : 'info');
  }
  private updateHealth(observation?: Observation) {
    if (!this.state.observing) return;
    const now = performance.now();
    const transitions = observation
      ? this.detector.sample(observation, now)
      : this.detector.tick(now);
    this.state.health = this.detector.state;
    for (const transition of transitions) {
      const reasons = describeReasons(transition.reasons);
      const body =
        transition.type === 'alert'
          ? `異常を検出しました: ${reasons}。`
          : `設定した監視条件の復旧を確認しました: ${reasons}。`;
      this.log(body, transition.type === 'alert' ? 'warning' : 'info');
      if (
        this.state.settings.notifications.desktop &&
        (transition.type === 'alert' || this.state.settings.notifications.recovery)
      )
        this.notify(
          transition.type === 'alert' ? '配信の監視アラート' : '配信の監視条件が復旧',
          body,
        );
    }
    this.emit();
  }

  setReload(minutes: number) {
    this.state.reloadMinutes = minutes;
    this.armReload();
    this.log(
      minutes ? `取得中は${minutes}分ごとに再読み込みします。` : '自動リロードを無効にしました。',
    );
  }
  private armReload() {
    const delay = this.state.observing ? this.state.reloadMinutes * 60000 : 0;
    this.deadline = delay ? performance.now() + delay : 0;
    this.state.nextReloadAt = delay ? Date.now() + delay : null;
  }
  reload() {
    if (!this.view || this.view.webContents.isDestroyed()) return;
    this.armReload();
    this.log('ページを再読み込みしています。');
    this.view.webContents.reload();
  }
  async live() {
    if (!this.view || this.state.source !== 'youtube')
      throw new Error('YouTube Liveを開いてから操作してください。');
    const result = await this.view.webContents.executeJavaScript(liveScript, true);
    this.log(
      result
        ? 'ライブ位置への移動を要求しました。遅延の復旧確認は未実装です。'
        : 'ライブ位置へ移動できませんでした。プレーヤーを確認してください。',
      result ? 'info' : 'warning',
    );
  }
  private unavailable(playerError = false) {
    this.updateHealth({
      available: false,
      youtube: this.state.source === 'youtube',
      player: this.state.player,
      change: null,
      blackPercent: null,
    });
    this.state.lastCaptureAt = null;
    this.state.thumbnail = null;
    this.state.change = null;
    if (this.state.status !== 'unavailable') {
      this.state.status = 'unavailable';
      this.log(
        playerError
          ? 'YouTubeプレーヤーが再生エラーを表示しました。映像を観測できません。'
          : '映像を観測できません。ページ・再生・ネットワークを確認してください。',
        'warning',
      );
    } else this.emit();
  }
  private async capture() {
    const view = this.view;
    if (!view) return;
    if (!this.state.pageReady) {
      if (performance.now() - this.loadingSince > 15000) this.unavailable();
      return;
    }
    const generation = this.generation;
    const current = () =>
      this.state.observing && this.view === view && generation === this.generation;
    const probe: PlayerProbe = await view.webContents.executeJavaScript(probeScript);
    if (!current()) return;
    this.state.player = probe;
    if (this.state.source === 'youtube')
      this.state.muted = view.webContents.isAudioMuted() || probe.audioMuted;
    if (probe.playerError || !probe.found || !validBounds(probe.rect) || probe.readyState < 2) {
      this.unavailable(probe.playerError);
      return;
    }
    const frame =
      this.state.source === 'youtube'
        ? await view.webContents.executeJavaScript(frameScript)
        : null;
    if (!current()) return;
    if (
      this.state.source === 'youtube' &&
      (typeof frame !== 'string' || !frame.startsWith('data:image/jpeg;base64,'))
    ) {
      this.unavailable();
      return;
    }
    const image =
      this.state.source === 'youtube'
        ? nativeImage.createFromDataURL(frame)
        : await view.webContents.capturePage(probe.rect, { stayHidden: false, stayAwake: false });
    if (!current()) return;
    if (image.isEmpty()) {
      this.unavailable();
      return;
    }
    const bitmap = image.resize({ width: 96, height: 54 }).toBitmap();
    this.state.change = pixelChange(this.previous, bitmap);
    if (this.previousAspect !== probe.aspectRatio) this.previousRegion = null;
    this.previousAspect = probe.aspectRatio;
    const region = regionBitmap(bitmap, 96, 54, this.state.settings.region);
    const analysis = analyzeFrame(this.previousRegion, region, this.state.settings.blackThreshold);
    this.previousRegion = region;
    this.updateHealth({
      available: true,
      youtube: this.state.source === 'youtube',
      player: probe,
      change: analysis.change,
      blackPercent: analysis.blackPercent,
    });
    this.previous = bitmap;
    this.state.thumbnail =
      this.state.source === 'youtube'
        ? frame
        : `data:image/jpeg;base64,${image.resize({ width: 480 }).toJPEG(65).toString('base64')}`;
    this.state.lastCaptureAt = Date.now();
    this.state.count++;
    const recovering = this.state.status !== 'capturing';
    this.state.status = 'capturing';
    if (recovering) this.log('映像の取得を確認しました。設定した条件で監視しています。');
    else this.emit();
  }
  async clearCache() {
    if (this.state.observing)
      throw new Error('映像取得を停止してからキャッシュを削除してください。');
    await this.session.clearCache();
    this.state.cacheBytes = await this.session.getCacheSize();
    this.log('HTTPキャッシュを削除しました。ログイン情報は保持しています。');
  }
  private async measure() {
    try {
      const metrics = app.getAppMetrics();
      this.state.memoryMb = Math.round(
        metrics.reduce((n, p) => n + p.memory.workingSetSize, 0) / 1024,
      );
      this.state.cpuPercent =
        Math.round(metrics.reduce((n, p) => n + p.cpu.percentCPUUsage, 0) * 10) / 10;
      this.state.cacheBytes = await this.session.getCacheSize();
      this.emit();
    } catch {
      /* Window may be closing. */
    }
  }
  private destroyView() {
    if (!this.view) return;
    this.window.contentView.removeChildView(this.view);
    if (!this.view.webContents.isDestroyed()) this.view.webContents.close();
    this.view = undefined;
  }
  dispose() {
    this.stop(false);
    clearInterval(this.metrics);
    clearInterval(this.scheduler);
    this.destroyView();
  }
}
