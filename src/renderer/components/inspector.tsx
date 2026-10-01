import { useState } from 'react';
import { Volume2 } from 'lucide-react';
import type { Command, Snapshot } from '../../shared/types';
import { HealthPanel } from './health-panel';
import { formatTime } from '../api';

const statusLabels = {
  idle: '未開始',
  waiting: '取得待ち',
  capturing: '取得中',
  unavailable: '観測不能',
  stopped: '停止中',
};
export function Inspector({
  state,
  run,
  settings,
}: {
  state: Snapshot;
  run: (cmd: Command) => void;
  settings: () => void;
}) {
  const [minutes, setMinutes] = useState(15);
  const player = state.player;
  const playerLabel =
    player?.playerError || player?.errorCode
      ? '再生エラー'
      : !player?.found
        ? '—'
        : player.ended
          ? '再生終了'
          : player.paused
            ? '一時停止'
            : player.readyState < 3
              ? '読み込み待ち'
              : state.source === 'fixture'
                ? '検証画面'
                : '再生中';
  return (
    <aside className="inspector">
      <HealthPanel state={state} run={run} settings={settings} />
      <section className="panel">
        <h2>取得状態</h2>
        <div className={`capture-state ${state.status}`}>
          <i />
          {statusLabels[state.status]}
        </div>
        <dl className="readings">
          <div>
            <dt>最新の取得</dt>
            <dd>{formatTime(state.lastCaptureAt)}</dd>
          </div>
          <div>
            <dt>取得回数</dt>
            <dd>{state.count.toLocaleString()}</dd>
          </div>
          <div>
            <dt>映像の変化</dt>
            <dd>{state.change === null ? '—' : `${state.change}%`}</dd>
          </div>
          <div>
            <dt>プレーヤー</dt>
            <dd>{playerLabel}</dd>
          </div>
        </dl>
        <p className="hint">
          変化率は映像全体の参考値です。死活監視は指定した判定範囲と条件を使用します。
        </p>
      </section>
      <section className="panel">
        <h2>最新の取得画像</h2>
        <div className="thumbnail">
          {state.thumbnail ? (
            <img src={state.thumbnail} alt="最後に取得した映像" />
          ) : (
            <span>未取得</span>
          )}
        </div>
      </section>
      <section className="panel reload-panel">
        <div className="panel-heading">
          <h2>自動リロード</h2>
          <button
            className={`switch ${state.reloadMinutes ? 'on' : ''}`}
            role="switch"
            aria-label="自動リロード"
            aria-checked={!!state.reloadMinutes}
            onClick={() =>
              run({ type: 'reload-interval', minutes: state.reloadMinutes ? 0 : minutes })
            }
          >
            <span />
          </button>
        </div>
        <label className="interval">
          間隔（分）
          <span>
            <input
              aria-label="リロード間隔（分）"
              type="number"
              min="1"
              max="180"
              value={minutes}
              onChange={(e) => {
                const n = Number(e.target.value);
                if (Number.isInteger(n) && n >= 1 && n <= 180) {
                  setMinutes(n);
                  if (state.reloadMinutes) run({ type: 'reload-interval', minutes: n });
                }
              }}
            />
            分
          </span>
        </label>
        {state.nextReloadAt && (
          <p className="hint">次回 {formatTime(state.nextReloadAt)} · 取得中のみ</p>
        )}
      </section>
      <button className="alarm-button" onClick={() => run({ type: 'test-sound' })}>
        <Volume2 size={17} />
        警報音を試す
      </button>
    </aside>
  );
}
