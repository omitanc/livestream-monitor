import { useState, type FormEvent } from 'react';
import { Volume2, Bell } from 'lucide-react';
import {
  parseSettings,
  reasonLabels,
  type HealthReason,
  type MonitorSettings as Configuration,
} from '../../shared/health-settings';
import type { Command } from '../../shared/types';
import { api } from '../api';

export function MonitorSettings({
  settings,
  run,
  notificationStatus,
  soundError,
  thumbnail,
}: {
  settings: Configuration;
  run: (command: Command) => Promise<boolean>;
  notificationStatus: string;
  soundError: string | null;
  thumbnail: string | null;
}) {
  const [draft, setDraft] = useState(() => structuredClone(settings));
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  function change(update: (copy: Configuration) => void) {
    setDraft((current) => {
      const copy = structuredClone(current);
      update(copy);
      return copy;
    });
    setDirty(true);
    setMessage('');
  }
  const field = (
    label: string,
    value: number,
    min: number,
    max: number,
    update: (copy: Configuration, value: number) => void,
    step = 1,
  ) => (
    <label className="config-number">
      {label}
      <input
        type="number"
        required
        min={min}
        max={max}
        step={step}
        value={Number.isNaN(value) ? '' : value}
        onChange={(e) => change((copy) => update(copy, e.target.valueAsNumber))}
      />
    </label>
  );
  async function save(e: FormEvent) {
    e.preventDefault();
    try {
      const valid = parseSettings(draft);
      setSaving(true);
      if (await run({ type: 'monitor-settings', settings: valid })) {
        setDirty(false);
        setMessage('保存しました。次の起動でもこの設定を使用します。');
      } else setMessage('保存できませんでした。入力値と保存先を確認してください。');
    } catch {
      setMessage('設定値を確認してください。判定範囲は映像の中に収めてください。');
    } finally {
      setSaving(false);
    }
  }
  return (
    <section className="settings-section monitor-config">
      <h3>死活監視・通知の設定</h3>
      <form onSubmit={(e) => void save(e)}>
        <label className="config-check">
          <input
            type="checkbox"
            checked={draft.enabled}
            onChange={(e) =>
              change((s) => {
                s.enabled = e.target.checked;
              })
            }
          />
          死活監視を有効にする
        </label>
        <p className="hint">
          「取得を開始」で監視を開始します。選択したいずれかの条件が継続すると警報を出します。
        </p>
        <fieldset>
          <legend>監視する条件</legend>
          {(Object.keys(reasonLabels) as HealthReason[]).map((key) => (
            <div className="config-rule" key={key}>
              <label className="config-check">
                <input
                  type="checkbox"
                  checked={draft.rules[key].enabled}
                  onChange={(e) =>
                    change((s) => {
                      s.rules[key].enabled = e.target.checked;
                    })
                  }
                />
                {reasonLabels[key]}
              </label>
              {field(
                `${reasonLabels[key]}の継続時間（秒）`,
                draft.rules[key].seconds,
                1,
                3600,
                (s, value) => {
                  s.rules[key].seconds = value;
                },
              )}
            </div>
          ))}
          {field('監視開始時の待機（秒）', draft.startupSeconds, 0, 120, (s, value) => {
            s.startupSeconds = value;
          })}
          {field('復旧を確認する時間（秒）', draft.recoverySeconds, 1, 60, (s, value) => {
            s.recoverySeconds = value;
          })}
          {field(
            '映像変化のしきい値（%以下）',
            draft.motionThreshold,
            0,
            100,
            (s, value) => {
              s.motionThreshold = value;
            },
            0.1,
          )}
          {field('黒とみなす明るさ（0〜64）', draft.blackThreshold, 0, 64, (s, value) => {
            s.blackThreshold = value;
          })}
          {field(
            '黒い画素の割合（%以上）',
            draft.blackRatio,
            1,
            100,
            (s, value) => {
              s.blackRatio = value;
            },
            0.1,
          )}
          <p className="hint">
            静止画の配信では映像の変化が少なくても正常な場合があります。映像停止・黒画面の設定を配信内容に合わせて調整してください。
          </p>
        </fieldset>
        <fieldset>
          <legend>映像停止・黒画面の判定範囲（%）</legend>
          {thumbnail && (
            <div className="region-preview" aria-label="判定範囲のプレビュー">
              <img src={thumbnail} alt="最新の映像と判定範囲" />
              <div
                style={{
                  left: `${draft.region.x}%`,
                  top: `${draft.region.y}%`,
                  width: `${draft.region.width}%`,
                  height: `${draft.region.height}%`,
                }}
              />
            </div>
          )}
          <div className="region-fields">
            {field(
              '左から（%）',
              draft.region.x,
              0,
              99,
              (s, value) => {
                s.region.x = value;
              },
              0.1,
            )}
            {field(
              '上から（%）',
              draft.region.y,
              0,
              99,
              (s, value) => {
                s.region.y = value;
              },
              0.1,
            )}
            {field(
              '幅（%）',
              draft.region.width,
              1,
              100,
              (s, value) => {
                s.region.width = value;
              },
              0.1,
            )}
            {field(
              '高さ（%）',
              draft.region.height,
              1,
              100,
              (s, value) => {
                s.region.height = value;
              },
              0.1,
            )}
          </div>
          <p className="hint">
            全体は左0・上0・幅100・高さ100。時計やテロップを避け、本編が映る範囲を指定できます。時計OCR・時刻による遅延判定は未対応です。
          </p>
        </fieldset>
        <fieldset>
          <legend>通知・警報</legend>
          <label className="config-check">
            <input
              type="checkbox"
              checked={draft.notifications.sound}
              onChange={(e) =>
                change((s) => {
                  s.notifications.sound = e.target.checked;
                })
              }
            />
            PCで警報音を鳴らす
          </label>
          {field('警報音量（%）', draft.notifications.volume, 1, 100, (s, value) => {
            s.notifications.volume = value;
          })}
          {field(
            '警報音の繰り返し間隔（秒）',
            draft.notifications.repeatSeconds,
            2,
            300,
            (s, value) => {
              s.notifications.repeatSeconds = value;
            },
          )}
          <label className="config-check">
            <input
              type="checkbox"
              checked={draft.notifications.desktop}
              onChange={(e) =>
                change((s) => {
                  s.notifications.desktop = e.target.checked;
                })
              }
            />
            OS通知を表示する
          </label>
          <label className="config-check">
            <input
              type="checkbox"
              checked={draft.notifications.recovery}
              onChange={(e) =>
                change((s) => {
                  s.notifications.recovery = e.target.checked;
                })
              }
            />
            復旧時もOS通知を表示する
          </label>
          <p className="hint">
            警報音は復旧・取得停止・「確認して消音」まで繰り返します。OS通知は条件ごとに1回。映像のミュート操作は警報音に影響しません。
          </p>
        </fieldset>
        <div className="config-actions">
          <button className="primary" disabled={!api || saving || !dirty}>
            {saving ? '保存中…' : '監視設定を保存'}
          </button>
          <span role="status">{message || (dirty ? '変更は未保存です。' : '')}</span>
        </div>
      </form>
      <div className="config-actions">
        <button type="button" disabled={!api} onClick={() => void run({ type: 'test-sound' })}>
          <Volume2 size={16} />
          警報音を試す
        </button>
        <button
          type="button"
          disabled={!api}
          onClick={() => void run({ type: 'test-notification' })}
        >
          <Bell size={16} />
          OS通知を試す
        </button>
      </div>
      <p className="hint">
        テストは保存済みの設定を使用します。OSの通知許可・集中モードを確認してください。macOSのOS通知には署名済みアプリが必要です。
      </p>
      <p className="hint" role="status">
        OS通知: {notificationStatus}
      </p>
      {soundError && (
        <p className="config-error" role="alert">
          {soundError}
        </p>
      )}
    </section>
  );
}
