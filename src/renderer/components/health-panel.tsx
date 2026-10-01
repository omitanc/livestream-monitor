import { Activity, VolumeX, SlidersHorizontal } from 'lucide-react';
import { describeReasons } from '../../shared/health-detector';
import type { Command, Snapshot } from '../../shared/types';
const labels = {
  off: '監視は無効',
  waiting: '監視の準備中',
  ok: '設定条件の異常なし',
  pending: '異常の継続を確認中',
  alert: '監視アラート',
  unavailable: '観測不能',
};
export function HealthPanel({
  state,
  run,
  settings,
}: {
  state: Snapshot;
  run: (command: Command) => void;
  settings: () => void;
}) {
  const health = state.health;
  const label = !state.observing && state.settings.enabled ? '監視は未開始' : labels[health.phase];
  return (
    <section className={`panel health-panel ${health.alerting ? 'is-alert' : ''}`}>
      <div className="panel-heading">
        <h2>
          <Activity size={16} />
          死活監視
        </h2>
        <button className="icon-button" aria-label="監視・通知設定" onClick={settings}>
          <SlidersHorizontal size={17} />
        </button>
      </div>
      <strong className="health-label" role="status">
        {label}
        {health.alerting && health.phase === 'unavailable' ? ' · アラート' : ''}
      </strong>
      {health.reasons.length > 0 && (
        <p className="health-reasons">
          {describeReasons(health.reasons)}
          {health.elapsedSeconds > 0 ? ` · ${health.elapsedSeconds}秒継続` : ''}
        </p>
      )}
      <dl className="readings">
        <div>
          <dt>判定範囲の映像変化</dt>
          <dd>{health.regionChange === null ? '—' : `${health.regionChange.toFixed(1)}%`}</dd>
        </div>
        <div>
          <dt>判定範囲の黒い画素</dt>
          <dd>{health.blackPercent === null ? '—' : `${health.blackPercent.toFixed(1)}%`}</dd>
        </div>
      </dl>
      {health.alerting && (
        <button
          className="danger"
          disabled={health.acknowledged}
          onClick={() => run({ type: 'alert-acknowledge' })}
        >
          <VolumeX size={16} />
          {health.acknowledged ? '確認済み · 消音中' : '確認して消音'}
        </button>
      )}
      {state.soundError && <p className="config-error">{state.soundError}</p>}
      <p className="hint">判定は「取得を開始」から有効です。観測不能は正常とは判定しません。</p>
    </section>
  );
}
