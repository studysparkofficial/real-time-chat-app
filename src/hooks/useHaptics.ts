import { useCallback } from 'react';

/**
 * Mobile Native Haptics Hook
 * Provides tactile micro-vibrations for message sending, reaction taps, and alerts
 */
export function useHaptics(enabled: boolean = true) {
  const triggerHaptic = useCallback(
    (durationMs: number = 15) => {
      if (!enabled) return;
      if (typeof window !== 'undefined' && 'vibrate' in navigator) {
        try {
          navigator.vibrate(durationMs);
        } catch {
          // Ignore if vibration fails or is unsupported by browser policy
        }
      }
    },
    [enabled]
  );

  const lightTap = useCallback(() => triggerHaptic(12), [triggerHaptic]);
  const mediumTap = useCallback(() => triggerHaptic(25), [triggerHaptic]);
  const errorFeedback = useCallback(() => {
    if (!enabled) return;
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([30, 40, 30]);
      } catch {
        // ignore
      }
    }
  }, [enabled]);

  return { triggerHaptic, lightTap, mediumTap, errorFeedback };
}
