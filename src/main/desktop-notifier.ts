import { BrowserWindow, Notification } from 'electron';

export class DesktopNotifier {
  private current?: Notification;
  constructor(
    private window: BrowserWindow,
    private report: (message: string, failed: boolean) => void,
  ) {}
  send(title: string, body: string) {
    if (!Notification.isSupported()) {
      this.report('この環境ではOS通知を利用できません。', true);
      return;
    }
    try {
      this.current?.close();
      const notice = (this.current = new Notification({ title, body, silent: true }));
      notice.on('show', () => this.report('OSへ通知を表示しました。', false));
      notice.on('failed', () =>
        this.report('OS通知を表示できません。通知の許可とアプリの署名を確認してください。', true),
      );
      notice.on('click', () => {
        if (!this.window.isDestroyed()) {
          this.window.restore();
          this.window.show();
          this.window.focus();
        }
      });
      notice.show();
    } catch {
      this.report('OS通知を表示できませんでした。通知の許可を確認してください。', true);
    }
  }
  dispose() {
    this.current?.close();
  }
}
