let context: AudioContext | undefined;
let revision = 0;
const active = new Set<OscillatorNode>();
export async function prepareAlarmAudio() {
  if (!context || context.state === 'closed') context = new AudioContext();
  if (context.state !== 'running') {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      await Promise.race([
        context.resume(),
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error('Audio resume timeout')), 2000);
        }),
      ]);
    } finally {
      clearTimeout(timer);
    }
  }
  if (context.state !== 'running') throw new Error('Audio context is not running');
}
export async function playAlarmAudio(volume: number) {
  const expected = revision;
  await prepareAlarmAudio();
  if (expected !== revision) return;
  const audio = context!;
  for (let i = 0; i < 3; i++) {
    const oscillator = audio.createOscillator();
    const gain = audio.createGain();
    oscillator.connect(gain);
    gain.connect(audio.destination);
    oscillator.frequency.value = i === 1 ? 660 : 880;
    const start = audio.currentTime + i * 0.35;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime((volume / 100) * 0.2, start + 0.015);
    gain.gain.linearRampToValueAtTime(0, start + 0.2);
    oscillator.onended = () => {
      oscillator.disconnect();
      gain.disconnect();
      active.delete(oscillator);
    };
    active.add(oscillator);
    oscillator.start(start);
    oscillator.stop(start + 0.22);
  }
}
export function stopAlarmAudio() {
  revision++;
  for (const oscillator of active) {
    try {
      oscillator.stop();
    } catch {
      /* Already ended. */
    }
  }
  active.clear();
}
