import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ supported: true, notices: [] as any[] }));
vi.mock('electron', async () => {
  const { EventEmitter } = await import('node:events');
  return {
    Notification: class extends EventEmitter {
      static isSupported() {
        return mocks.supported;
      }
      close = vi.fn();
      show = vi.fn();
      constructor(public options: unknown) {
        super();
        mocks.notices.push(this);
      }
    },
  };
});
import { DesktopNotifier } from '../../src/main/desktop-notifier';
beforeEach(() => {
  mocks.supported = true;
  mocks.notices.length = 0;
});
describe('OS notification delivery', () => {
  it('reports displayed versus failed delivery and focuses the monitor on click', () => {
    const report = vi.fn();
    const window = { isDestroyed: () => false, restore: vi.fn(), show: vi.fn(), focus: vi.fn() };
    const notifier = new DesktopNotifier(window as any, report);
    notifier.send('alert', 'reason');
    const notice = mocks.notices[0];
    expect(notice.options).toEqual({ title: 'alert', body: 'reason', silent: true });
    expect(notice.show).toHaveBeenCalledOnce();
    notice.emit('show');
    expect(report).toHaveBeenLastCalledWith(expect.any(String), false);
    notice.emit('failed', 'do not expose native details');
    expect(report).toHaveBeenLastCalledWith(expect.stringContaining('署名'), true);
    notice.emit('click');
    expect(window.focus).toHaveBeenCalledOnce();
    notifier.dispose();
    expect(notice.close).toHaveBeenCalledOnce();
  });
  it('does not claim delivery on an unsupported system', () => {
    mocks.supported = false;
    const report = vi.fn();
    new DesktopNotifier({} as any, report).send('alert', 'reason');
    expect(mocks.notices).toHaveLength(0);
    expect(report).toHaveBeenCalledWith(expect.any(String), true);
  });
});
