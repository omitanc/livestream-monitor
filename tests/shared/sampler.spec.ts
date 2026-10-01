import { afterEach, describe, expect, it, vi } from 'vitest';
import { Sampler } from '../../src/shared/sampler';
afterEach(() => vi.useRealTimers());
describe('bounded sampler', () => {
  it('never overlaps even when work is slower than the sample interval', async () => {
    vi.useFakeTimers();
    let release!: () => void;
    const task = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const failure = vi.fn();
    const sampler = new Sampler(task, failure);
    sampler.start();
    sampler.start();
    await vi.advanceTimersByTimeAsync(9000);
    expect(task).toHaveBeenCalledTimes(1);
    expect(failure).toHaveBeenCalledTimes(1);
    release();
    await vi.advanceTimersByTimeAsync(1000);
    expect(task).toHaveBeenCalledTimes(2);
    sampler.stop();
    release();
    await vi.advanceTimersByTimeAsync(20000);
    expect(task).toHaveBeenCalledTimes(2);
  });
  it('recovers from rejection and cancels the next capture on stop', async () => {
    vi.useFakeTimers();
    const task = vi.fn().mockRejectedValueOnce(new Error('capture')).mockResolvedValue(undefined);
    const failure = vi.fn();
    const sampler = new Sampler(task, failure);
    sampler.start();
    await vi.advanceTimersByTimeAsync(1000);
    expect(failure).toHaveBeenCalledTimes(1);
    expect(task).toHaveBeenCalledTimes(2);
    sampler.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(task).toHaveBeenCalledTimes(2);
  });
});
