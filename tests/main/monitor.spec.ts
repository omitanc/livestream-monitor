import { EventEmitter } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ views: [] as any[] }));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  const session = Object.assign(new EventEmitter(), {
    setPermissionRequestHandler: vi.fn(),
    setPermissionCheckHandler: vi.fn(),
    getCacheSize: vi.fn().mockResolvedValue(0),
    clearCache: vi.fn().mockResolvedValue(undefined),
  });
  return {
    app: { getAppMetrics: () => [] },
    session: { fromPartition: () => session },
    WebContentsView: class {
      webContents = Object.assign(new EventEmitter(), {
        setWindowOpenHandler: vi.fn(),
        loadFile: vi.fn().mockResolvedValue(undefined),
        loadURL: vi.fn().mockResolvedValue(undefined),
        isDestroyed: () => false,
        close: vi.fn(),
        reload: vi.fn(),
        capturePage: vi.fn(),
        setAudioMuted: vi.fn(),
        isAudioMuted: vi.fn().mockReturnValue(false),
        insertCSS: vi.fn().mockResolvedValue('style'),
        executeJavaScript: vi.fn().mockResolvedValue({ found: false, audioMuted: false }),
      });
      setBackgroundColor() {}
      setVisible() {}
      setBounds() {}
      constructor() {
        mocks.views.push(this);
      }
    },
  };
});
import { Monitor } from '../../src/main/monitor';
import { frameScript } from '../../src/main/player-scripts';
let monitor: Monitor | undefined;
function setup() {
  const window = Object.assign(new EventEmitter(), {
    isDestroyed: () => false,
    webContents: { send: vi.fn() },
    getContentSize: () => [1200, 900],
    contentView: { addChildView: vi.fn(), removeChildView: vi.fn() },
  });
  return (monitor = new Monitor(window as any));
}
afterEach(() => {
  monitor?.dispose();
  mocks.views.length = 0;
  vi.useRealTimers();
});
describe('page navigation lifecycle', () => {
  it('restricts top-level redirects without blocking YouTube subframe redirects', async () => {
    const m = setup();
    await m.open('https://www.youtube.com/watch?v=abcdefghijk');
    const wc = mocks.views[0].webContents;
    const preventDefault = vi.fn();
    wc.emit('will-redirect', { isMainFrame: false, preventDefault }, 'https://example.test/child');
    expect(preventDefault).not.toHaveBeenCalled();
    wc.emit('will-redirect', { isMainFrame: true, preventDefault }, 'https://example.test/page');
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
  it('reports unavailable rather than waiting forever on a stalled page load', async () => {
    vi.useFakeTimers();
    const m = setup();
    await m.open();
    m.start();
    await vi.advanceTimersByTimeAsync(17000);
    expect(m.state.status).toBe('unavailable');
    expect(m.state.lastCaptureAt).toBeNull();
  });
  it('does not stop observation when a YouTube child frame starts loading', async () => {
    const m = setup();
    await m.open();
    const wc = mocks.views[0].webContents;
    wc.emit('did-finish-load');
    wc.emit('did-start-navigation', { isMainFrame: false, isSameDocument: false });
    wc.emit('did-start-loading');
    expect(m.state.pageReady).toBe(true);
    wc.emit('did-start-navigation', { isMainFrame: true, isSameDocument: true });
    expect(m.state.pageReady).toBe(true);
    wc.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
    expect(m.state.pageReady).toBe(false);
    expect(m.state.status).toBe('waiting');
  });
  it('clears old images on reload but preserves count and observation intent', async () => {
    const m = setup();
    await m.open();
    m.start();
    m.state.count = 20;
    m.state.thumbnail = 'old';
    m.state.lastCaptureAt = 123;
    const wc = mocks.views[0].webContents;
    wc.emit('did-start-navigation', { isMainFrame: true, isSameDocument: false });
    expect(m.state.thumbnail).toBeNull();
    expect(m.state.lastCaptureAt).toBeNull();
    expect(m.state.count).toBe(20);
    expect(m.state.observing).toBe(true);
    wc.emit('did-finish-load');
    expect(m.state.pageReady).toBe(true);
  });
  it('reloads only while observation is enabled and stops its schedule on stop', async () => {
    vi.useFakeTimers();
    const m = setup();
    await m.open();
    m.setReload(1);
    await vi.advanceTimersByTimeAsync(60000);
    const reload = mocks.views[0].webContents.reload;
    expect(reload).not.toHaveBeenCalled();
    m.start();
    await vi.advanceTimersByTimeAsync(60000);
    expect(reload).toHaveBeenCalledTimes(1);
    m.stop();
    await vi.advanceTimersByTimeAsync(60000);
    expect(reload).toHaveBeenCalledTimes(1);
  });
  it('keeps YouTube hidden until isolation CSS is installed and preserves mute on reopen', async () => {
    const m = setup();
    await m.open('https://www.youtube.com/watch?v=abcdefghijk');
    const wc = mocks.views[0].webContents;
    let finish!: (value: string) => void;
    wc.insertCSS.mockImplementation(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    wc.emit('did-finish-load');
    expect(m.state.pageReady).toBe(false);
    m.stop(); // Stopping acquisition during CSS setup must not strand the preview.
    await m.setMuted(true);
    expect(wc.setAudioMuted).toHaveBeenLastCalledWith(true);
    finish('style');
    await Promise.resolve();
    expect(m.state.pageReady).toBe(true);
    expect(wc.insertCSS).toHaveBeenCalledWith(expect.stringContaining('visibility: hidden'), {
      cssOrigin: 'user',
    });
    await m.open('https://www.youtube.com/watch?v=abcdefghijk');
    expect(mocks.views[1].webContents.setAudioMuted).toHaveBeenCalledWith(true);
    await m.setMuted(false);
    expect(m.state.muted).toBe(false);
  });
  it('does not fall back to page screenshots when a YouTube frame is unavailable', async () => {
    vi.useFakeTimers();
    const m = setup();
    await m.open('https://www.youtube.com/watch?v=abcdefghijk');
    const wc = mocks.views[0].webContents;
    m.state.pageReady = true;
    wc.executeJavaScript.mockImplementation(async (script: string) =>
      script === frameScript
        ? null
        : {
            found: true,
            readyState: 4,
            audioMuted: false,
            playerError: false,
            rect: { x: 0, y: 0, width: 640, height: 360 },
          },
    );
    m.start();
    await vi.advanceTimersByTimeAsync(10);
    expect(m.state.status).toBe('unavailable');
    expect(m.state.thumbnail).toBeNull();
    expect(m.state.count).toBe(0);
    expect(wc.capturePage).not.toHaveBeenCalled();
  });
  it('caps event history and destroys previous views', async () => {
    const m = setup();
    await m.open();
    const old = mocks.views[0].webContents;
    await m.open();
    expect(old.close).toHaveBeenCalledTimes(1);
    for (let i = 0; i < 150; i++) m.log('test');
    expect(m.state.events).toHaveLength(100);
  });
});
