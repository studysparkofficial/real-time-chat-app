import { useEffect, useCallback } from 'react';
import { soundSynth } from '../services/soundSynth';

export function useAudio(soundEnabled: boolean = true) {
  useEffect(() => {
    soundSynth.setEnabled(soundEnabled);
  }, [soundEnabled]);

  const playSent = useCallback(() => soundSynth.playMessageSent(), []);
  const playReceived = useCallback(() => soundSynth.playMessageReceived(), []);
  const playReaction = useCallback(() => soundSynth.playReactionTap(), []);
  const playError = useCallback(() => soundSynth.playError(), []);

  return { playSent, playReceived, playReaction, playError };
}
