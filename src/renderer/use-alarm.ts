import { useEffect, useRef } from 'react';
import type { Snapshot } from '../shared/types';
import { api } from './api';
import { playAlarmAudio, stopAlarmAudio } from './alarm-audio';
export function useAlarm(state: Snapshot) {
  const notifications = state.settings.notifications;
  const volume = useRef(notifications.volume);
  volume.current = notifications.volume;
  useEffect(() => {
    if (!state.health.alerting || state.health.acknowledged || !notifications.sound) return;
    const play = () => {
      void playAlarmAudio(notifications.volume).catch(() => api?.command({ type: 'sound-failed' }));
    };
    play();
    const timer = setInterval(play, notifications.repeatSeconds * 1000);
    return () => {
      clearInterval(timer);
      stopAlarmAudio();
    };
  }, [
    state.health.alerting,
    state.health.acknowledged,
    state.health.alertId,
    notifications.sound,
    notifications.volume,
    notifications.repeatSeconds,
  ]);
  useEffect(() => {
    if (!state.soundTestId) return;
    void playAlarmAudio(volume.current)
      .then(() => api?.command({ type: 'sound-ready' }))
      .catch(() => api?.command({ type: 'sound-failed' }));
    // A settings change should not re-play a test.
  }, [state.soundTestId]);
}
