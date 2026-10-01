import { describe, expect, it } from 'vitest';
import { allowedNavigation, parseCommand, pixelChange, youtubeUrl } from '../../src/shared/policy';

describe('URL trust boundary', () => {
  it('normalizes watch/live/short URLs and drops tracking parameters', () => {
    for (const url of [
      'https://youtu.be/abcdefghijk?t=10',
      'https://www.youtube.com/live/abcdefghijk?si=tracking',
      'https://m.youtube.com/watch?v=abcdefghijk&token=do-not-retain',
    ]) {
      expect(youtubeUrl(url)).toBe('https://www.youtube.com/watch?v=abcdefghijk');
    }
  });
  it.each([
    'https://youtube.com.evil.test/watch?v=abcdefghijk',
    'http://www.youtube.com/watch?v=abcdefghijk',
    'https://user:pass@www.youtube.com/watch?v=abcdefghijk',
    'file:///tmp/index.html',
    'javascript:alert(1)',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com:8443/watch?v=abcdefghijk',
  ])('rejects unsafe or invalid source %s', (url) => expect(() => youtubeUrl(url)).toThrow());
  it('allows only exact HTTPS navigation origins', () => {
    expect(allowedNavigation('https://accounts.google.com/ServiceLogin')).toBe(true);
    expect(allowedNavigation('https://www.youtube.com/watch?v=abcdefghijk')).toBe(true);
    expect(allowedNavigation('https://accounts.google.com.evil.test')).toBe(false);
    expect(allowedNavigation('https://user:secret@www.youtube.com')).toBe(false);
    expect(allowedNavigation('file:///etc/passwd')).toBe(false);
  });
});

describe('IPC validation', () => {
  it('accepts boolean mute state only', () => {
    expect(parseCommand({ type: 'mute', muted: true })).toEqual({ type: 'mute', muted: true });
    for (const muted of ['false', 1, null, undefined])
      expect(() => parseCommand({ type: 'mute', muted })).toThrow();
  });
  it.each([-1, 181, 0.5, NaN, Infinity, '15'])('rejects invalid reload interval %s', (minutes) =>
    expect(() => parseCommand({ type: 'reload-interval', minutes })).toThrow(),
  );
  it('accepts disabled interval and bounded integer minutes', () => {
    for (const minutes of [0, 1, 15, 180])
      expect(parseCommand({ type: 'reload-interval', minutes })).toEqual({
        type: 'reload-interval',
        minutes,
      });
  });
  it('rejects non-finite or negative view coordinates and unknown operations', () => {
    expect(() =>
      parseCommand({ type: 'bounds', bounds: { x: -1, y: 0, width: 1, height: 1 } }),
    ).toThrow();
    expect(() =>
      parseCommand({ type: 'bounds', bounds: { x: 0, y: NaN, width: 1, height: 1 } }),
    ).toThrow();
    expect(() => parseCommand({ type: 'shell', command: 'echo' })).toThrow();
    expect(parseCommand({ type: 'bounds', bounds: null })).toEqual({
      type: 'bounds',
      bounds: null,
    });
  });
});

describe('diagnostic frame difference', () => {
  it('does not turn a first frame or resized frame into a health signal', () => {
    expect(pixelChange(null, new Uint8Array(4))).toBeNull();
    expect(pixelChange(new Uint8Array(8), new Uint8Array(4))).toBeNull();
  });
  it('ignores alpha and small rendering noise; detects changed pixels', () => {
    expect(pixelChange(new Uint8Array([0, 0, 0, 255]), new Uint8Array([10, 10, 10, 0]))).toBe(0);
    expect(pixelChange(new Uint8Array(8), new Uint8Array([50, 0, 0, 255, 0, 0, 0, 255]))).toBe(50);
  });
});
