import { describe, expect, it } from 'vitest';
import { analyzeFrame, regionBitmap } from '../../src/shared/frame-analysis';
describe('video region signals', () => {
  it('excludes a moving clock outside the selected main-content region', () => {
    const first = new Uint8Array(4 * 4 * 4).fill(80);
    const second = first.slice();
    second[0] = 255;
    const region = { x: 0, y: 50, width: 100, height: 50 };
    expect(analyzeFrame(first, second, 16).change).toBeGreaterThan(0);
    expect(
      analyzeFrame(regionBitmap(first, 4, 4, region), regionBitmap(second, 4, 4, region), 16)
        .change,
    ).toBe(0);
  });
  it('counts near-black pixels independently of alpha and channel order', () => {
    const pixels = new Uint8Array([0, 0, 0, 255, 16, 16, 16, 255, 17, 0, 0, 0, 0, 0, 17, 0]);
    expect(analyzeFrame(null, pixels, 16)).toEqual({ change: null, blackPercent: 50 });
  });
});
