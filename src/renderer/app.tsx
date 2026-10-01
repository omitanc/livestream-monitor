import { useEffect, useState } from 'react';
import { Activity, ArrowUpRight, Settings2, X } from 'lucide-react';
import type { Command } from '../shared/types';
import { api, formatTime, initialState, megabytes } from './api';
import { useAlarm } from './use-alarm';
import { prepareAlarmAudio } from './alarm-audio';
import { Viewer } from './components/viewer';
import { Inspector } from './components/inspector';
import { Settings } from './components/settings';

export function App() {
  const [state, setState] = useState(initialState);
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [settings, setSettings] = useState(false);
  const [opening, setOpening] = useState(false);
  useAlarm(state);
  useEffect(() => {
    if (!api) return;
    const remove = api.subscribe(setState);
    void api.snapshot().then(setState);
    return remove;
  }, []);
  async function run(command: Command) {
    if (!api) {
      setError('ブラウザ表示はGUIプレビューです。映像取得はElectronアプリで利用できます。');
      return false;
    }
    if (
      command.type === 'test-sound' ||
      (command.type === 'start' && state.settings.notifications.sound) ||
      (command.type === 'monitor-settings' && command.settings.notifications.sound)
    ) {
      try {
        await prepareAlarmAudio();
      } catch {
        void api.command({ type: 'sound-failed' });
      }
    }
    const openingSource = command.type === 'open' || command.type === 'fixture';
    if (openingSource) setOpening(true);
    setError('');
    try {
      const result = await api.command(command);
      if (!result.ok) setError(result.error ?? '操作できませんでした。');
      return result.ok;
    } catch {
      setError('アプリとの通信に失敗しました。');
      return false;
    } finally {
      if (openingSource) setOpening(false);
    }
  }
  return (
    <div className="app-shell">
      <header className="brand-bar">
        <div className="brand">
          <Activity size={27} strokeWidth={2} />
          <span>LiveStream Monitor</span>
        </div>
        <span className="build-label">{api ? '開発プレビュー' : 'ブラウザプレビュー'}</span>
      </header>
      <main className="workspace">
        <form
          className="url-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run({ type: 'open', url });
          }}
        >
          <label htmlFor="stream-url">YouTube Live URL</label>
          <input
            id="stream-url"
            type="url"
            required
            placeholder="https://www.youtube.com/watch?v=…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            autoComplete="off"
            spellCheck={false}
          />
          <button className="primary" disabled={opening}>
            {opening ? '読み込み中…' : '配信を開く'}
            <ArrowUpRight size={17} />
          </button>
        </form>
        {error && (
          <div className="error-message" role="alert">
            {error}
            <button
              className="icon-button"
              aria-label="メッセージを閉じる"
              onClick={() => setError('')}
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="monitor-layout">
          <div className="main-column">
            <Viewer state={state} hidden={settings} run={run} />
            <section className="events">
              <div className="section-heading">
                <h2>イベント</h2>
                <span>直近100件 · メモリ内のみ</span>
              </div>
              <ol>
                {state.events.length ? (
                  state.events.slice(0, 20).map((event) => (
                    <li key={event.id} className={event.level}>
                      <time>{formatTime(event.at)}</time>
                      <span>{event.message}</span>
                    </li>
                  ))
                ) : (
                  <li>
                    <time>—</time>
                    <span>起動しました。</span>
                  </li>
                )}
              </ol>
            </section>
          </div>
          <Inspector state={state} run={run} settings={() => setSettings(true)} />
        </div>
      </main>
      <footer className="status-bar">
        <span>開発プレビュー · 監視PCの外部死活確認は未対応</span>
        <div>
          <span>
            キャッシュ <b>{megabytes(state.cacheBytes)} MB</b>
          </span>
          <button onClick={() => setSettings(true)}>
            <Settings2 size={15} />
            管理
          </button>
        </div>
      </footer>
      {settings && (
        <Settings state={state} opening={opening} run={run} close={() => setSettings(false)} />
      )}
    </div>
  );
}
