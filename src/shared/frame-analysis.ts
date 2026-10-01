import { pixelChange } from './policy';
import type { VideoRegion } from './health-settings';

export function regionBitmap(
  bitmap: Uint8Array,
  width: number,
  height: number,
  region: VideoRegion,
) {
  const x = Math.floor((width * region.x) / 100);
  const y = Math.floor((height * region.y) / 100);
  const right = Math.min(width, Math.ceil((width * (region.x + region.width)) / 100));
  const bottom = Math.min(height, Math.ceil((height * (region.y + region.height)) / 100));
  const result = new Uint8Array((right - x) * (bottom - y) * 4);
  for (let row = y; row < bottom; row++)
    result.set(
      bitmap.subarray((row * width + x) * 4, (row * width + right) * 4),
      (row - y) * (right - x) * 4,
    );
  return result;
}
export function analyzeFrame(
  previous: Uint8Array | null,
  bitmap: Uint8Array,
  blackThreshold: number,
) {
  let black = 0;
  // Electron toBitmap is BGRA; max RGB is independent of channel ordering.
  for (let i = 0; i < bitmap.length; i += 4)
    if (Math.max(bitmap[i], bitmap[i + 1], bitmap[i + 2]) <= blackThreshold) black++;
  return {
    change: pixelChange(previous, bitmap),
    blackPercent: bitmap.length ? (black / (bitmap.length / 4)) * 100 : null,
  };
}
