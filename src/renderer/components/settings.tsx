import { useEffect, useRef, useState } from 'react';
import { X, FlaskConical, Download, RefreshCw, Trash2 } from 'lucide-react';
import type { Command, Snapshot, UpdateState } from '../../shared/types';
import { MonitorSettings } from './monitor-settings';
import { api, megabytes } from '../api';

export function Settings({
  state,
  run,
  close,
  opening,
}: {
  state: Snapshot;
  opening: boolean;
  run: (cmd: Command) => Promise<boolean>;
  close: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [update, setUpdate] = useState<UpdateState>({
    phase: 'idle',
    message: '更新は操作したときだけ確認します。',
  });
  useEffect(() => {
    dialog.current?.showModal();
    return api?.subscribeUpdate(setUpdate);
  }, []);
  return (
    <dialog
      ref={dialog}
      onCancel={close}
      onClick={(e) => {
        if (e.target === dialog.current) close();
      }}
    >
      <div className="dialog-header">
        <div>
          <h2>アプリの管理</h2>
          <p>LiveStream Monitor · 0.1.0 開発プレビュー</p>
        </div>
        <button aria-label="閉じる" className="icon-button" onClick={close}>
          <X size={20} />
        </button>
      </div>
      <MonitorSettings
        settings={state.settings}
        run={run}
        notificationStatus={state.notificationStatus}
        soundError={state.soundError}
        thumbnail={state.thumbnail}
      />
      <section className="settings-section">
        <h3>動作の検証</h3>
        <button
          disabled={opening}
          onClick={() => {
            run({ type: 'fixture' });
            close();
          }}
        >
          <FlaskConical size={17} />
          ローカル検証
        </button>
        <p className="hint">時計と動く図形で映像取得を確認します。</p>
      </section>
      <section className="settings-section">
        <h3>リソース</h3>
        <dl className="readings">
          <div>
            <dt>CPU（関連プロセス合計）</dt>
            <dd>{state.cpuPercent ?? '—'}%</dd>
          </div>
          <div>
            <dt>メモリ（関連プロセス合計）</dt>
            <dd>{state.memoryMb ?? '—'} MB</dd>
          </div>
          <div>
            <dt>HTTPキャッシュ</dt>
            <dd>{megabytes(state.cacheBytes)} MB</dd>
          </div>
        </dl>
        <p className="hint">
          約10秒ごとに更新。キャッシュ目安は256 MBです。Cookieなどの保存領域は含みません。
        </p>
        <button disabled={state.observing} onClick={() => run({ type: 'clear-cache' })}>
          <Trash2 size={16} />
          キャッシュを削除
        </button>
        <p className="hint">取得を停止してから操作してください。ログイン情報は保持します。</p>
      </section>
      <section className="settings-section">
        <h3>アプリの更新</h3>
        <p className="hint">
          GitHub Releasesの最新安定版を確認します。再起動は操作したときだけ行います。
        </p>
        <p className="update-message" role="status">
          {update.message}
        </p>
        {update.percent !== undefined && <progress value={update.percent} max={100} />}
        {update.phase === 'available' ? (
          <button className="primary" onClick={() => run({ type: 'update-download' })}>
            <Download size={16} />
            更新をダウンロード
          </button>
        ) : update.phase === 'ready' ? (
          <button
            className="primary"
            disabled={state.observing}
            onClick={() => run({ type: 'update-install' })}
          >
            更新して再起動
          </button>
        ) : (
          <button
            disabled={['checking', 'downloading'].includes(update.phase)}
            onClick={() => run({ type: 'update-check' })}
          >
            <RefreshCw size={16} />
            更新を確認
          </button>
        )}
      </section>
      <p className="hint">スマホ通知・監視PC自体の外部死活確認は未対応です。</p>
    </dialog>
  );
}
