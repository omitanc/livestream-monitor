import { runInNewContext } from 'node:vm';
import { describe, expect, it, vi } from 'vitest';
import { frameScript, probeScript } from '../../src/main/player-scripts';

function probe(errorVisible: boolean, muted = false, volume = 1) {
  const video = {
    getBoundingClientRect: () => ({ x: 0, y: 0, width: 640, height: 360 }),
    muted,
    volume,
    videoWidth: 1080,
    videoHeight: 1920,
    paused: true,
    ended: false,
    readyState: 0,
    error: null,
    duration: NaN,
    seekable: { length: 0 },
    currentTime: 12,
  };
  const error = {
    getClientRects: () => (errorVisible ? [{}] : []),
    innerText: '', // Video-only CSS hides the error text visually.
    textContent: '再生エラー',
  };
  return runInNewContext(probeScript, {
    document: {
      querySelector: (selector: string) =>
        selector === 'video' ? video : selector === '.ytp-error-content-wrap' ? error : null,
    },
    innerWidth: 640,
    innerHeight: 360,
  });
}

describe('YouTube player probe', () => {
  it('reflects both player mute and zero volume', () => {
    expect(probe(false, true).audioMuted).toBe(true);
    expect(probe(false, false, 0).audioMuted).toBe(true);
    expect(probe(false).audioMuted).toBe(false);
  });
  it('reports intrinsic portrait aspect ratio instead of the page rectangle', () => {
    expect(probe(false).aspectRatio).toBe(9 / 16);
  });
  it('reports a visible player error even when the video element has no MediaError', () => {
    expect(probe(true)).toMatchObject({ playerError: true, errorCode: null, paused: true });
  });

  it('ignores a hidden error panel', () => {
    expect(probe(false)).toMatchObject({ playerError: false, errorCode: null });
  });
});

describe('video frame capture', () => {
  it('draws only video pixels with the original aspect ratio, never page overlays', () => {
    const video = { readyState: 4, videoWidth: 1080, videoHeight: 1920 };
    const drawImage = vi.fn();
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => ({ drawImage }),
      toDataURL: () => 'frame',
    };
    const querySelector = vi.fn().mockReturnValue(video);
    expect(
      runInNewContext(frameScript, { document: { querySelector, createElement: () => canvas } }),
    ).toBe('frame');
    expect(querySelector).toHaveBeenCalledExactlyOnceWith('video');
    expect(drawImage).toHaveBeenCalledExactlyOnceWith(video, 0, 0, 270, 480);
  });
  it('fails closed when decoded frames are unavailable or canvas export is blocked', () => {
    const video = { readyState: 1, videoWidth: 640, videoHeight: 360 };
    const createElement = vi.fn().mockReturnValue({
      getContext: () => ({ drawImage() {} }),
      toDataURL() {
        throw new Error('SecurityError');
      },
    });
    const document = { querySelector: () => video, createElement };
    expect(runInNewContext(frameScript, { document })).toBeNull();
    expect(createElement).not.toHaveBeenCalled();
    video.readyState = 4;
    expect(runInNewContext(frameScript, { document })).toBeNull();
  });
});
