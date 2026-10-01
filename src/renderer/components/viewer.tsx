import { useEffect, useRef, type CSSProperties } from 'react';
import {
  Monitor as MonitorIcon,
  Play,
  Square,
  RotateCw,
  Radio,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { Command, Snapshot } from '../../shared/types';
import { api } from '../api';

export function Viewer({
  state,
  hidden,
  run,
}: {
  state: Snapshot;
  hidden: boolean;
  run: (cmd: Command) => void;
}) {
  const host = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!hidden && state.source !== 'none') host.current?.scrollIntoView({ block: 'nearest' });
    const sendBounds = () => {
      const rect = host.current?.getBoundingClientRect();
      void api?.command({
        type: 'bounds',
        bounds:
          !hidden && rect && rect.x >= 0 && rect.y >= 0 && rect.bottom <= window.innerHeight
            ? { x: rect.x + 1, y: rect.y + 1, width: rect.width - 2, height: rect.height - 2 }
            : null,
      });
    };
    const observer = new ResizeObserver(sendBounds);
    if (host.current) observer.observe(host.current);
    window.addEventListener('resize', sendBounds);
    window.addEventListener('scroll', sendBounds, true);
    sendBounds();
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', sendBounds);
      window.removeEventListener('scroll', sendBounds, true);
    };
  }, [hidden, state.source]);
  const ratio = state.player?.aspectRatio || 16 / 9;
  return (
    <>
      <div
        className="viewer"
        ref={host}
        aria-label="視聴映像"
        style={{ '--video-ratio': ratio } as CSSProperties}
      >
        <div className="empty-view">
          <MonitorIcon size={56} strokeWidth={1.4} />
          <strong>
            {state.source === 'none' ? '配信を開いて、映像の取得を確認' : '映像を読み込んでいます…'}
          </strong>
          <span>ローカル検証でも試せます。</span>
        </div>
      </div>
      <div className="viewer-toolbar">
        <button
          className={state.observing ? 'danger' : 'primary'}
          disabled={!api || state.source === 'none'}
          onClick={() => run({ type: state.observing ? 'stop' : 'start' })}
        >
          {state.observing ? <Square size={15} /> : <Play size={15} />}
          {state.observing ? '取得を停止' : '取得を開始'}
        </button>
        <button disabled={state.source === 'none'} onClick={() => run({ type: 'reload' })}>
          <RotateCw size={16} />
          再読み込み
        </button>
        <button disabled={state.source !== 'youtube'} onClick={() => run({ type: 'live' })}>
          <Radio size={16} />
          ライブ位置へ
        </button>
        <button
          disabled={state.source !== 'youtube'}
          aria-pressed={state.muted}
          onClick={() => run({ type: 'mute', muted: !state.muted })}
        >
          {state.muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
          {state.muted ? 'ミュート解除' : 'ミュート'}
        </button>
      </div>
    </>
  );
}
