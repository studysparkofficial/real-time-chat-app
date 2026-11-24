/**
 * Web Audio API Call Notification Service
 * Generates realistic incoming ringtone, outgoing ringback tone,
 * and call status chimes without external audio assets.
 * Also handles mobile haptics. Browser notifications are displayed by the service worker.
 */

class CallNotificationService {
  private ctx: AudioContext | null = null;
  private incomingInterval: number | null = null;
  private outgoingInterval: number | null = null;

  private getContext(): AudioContext | null {
    if (!this.ctx && typeof window !== 'undefined') {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioContextClass) {
        this.ctx = new AudioContextClass();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * WhatsApp-style pleasant repeating melodic chime for incoming calls
   */
  public startIncomingRingtone(): void {
    this.stopIncomingRingtone();
    this.stopOutgoingRingback();

    // Play immediately
    this.playIncomingMelodyChunk();

    // Repeat every 2.4 seconds
    this.incomingInterval = window.setInterval(() => {
      this.playIncomingMelodyChunk();
    }, 2400);

    // Mobile vibration pattern: 500ms vibrate, 300ms pause, 500ms vibrate
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([500, 300, 500, 300, 500]);
      } catch {
        // Haptics optional
      }
    }
  }

  public stopIncomingRingtone(): void {
    if (this.incomingInterval !== null) {
      clearInterval(this.incomingInterval);
      this.incomingInterval = null;
    }
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(0);
      } catch {
        // No-op
      }
    }
  }

  private playIncomingMelodyChunk(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      // Notes: E5 (659.25), G#5 (830.61), B5 (987.77), E6 (1318.51)
      const notes = [
        { freq: 659.25, time: 0, dur: 0.18 },
        { freq: 830.61, time: 0.2, dur: 0.18 },
        { freq: 987.77, time: 0.4, dur: 0.22 },
        { freq: 1318.51, time: 0.65, dur: 0.4 }
      ];

      notes.forEach(({ freq, time, dur }) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(freq, now + time);

        gain.gain.setValueAtTime(0, now + time);
        gain.gain.linearRampToValueAtTime(0.18, now + time + 0.02);
        gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + time);
        osc.stop(now + time + dur);
      });
    } catch {
      // Audio playback fails gracefully if muted
    }
  }

  /**
   * Outgoing ringback tone: classic ringing beep (440Hz + 480Hz dual-tone)
   */
  public startOutgoingRingback(): void {
    this.stopOutgoingRingback();
    this.stopIncomingRingtone();

    this.playRingbackBeep();
    this.outgoingInterval = window.setInterval(() => {
      this.playRingbackBeep();
    }, 3000);
  }

  public stopOutgoingRingback(): void {
    if (this.outgoingInterval !== null) {
      clearInterval(this.outgoingInterval);
      this.outgoingInterval = null;
    }
  }

  private playRingbackBeep(): void {
    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(440, now); // A4
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(480, now);

      gain.gain.setValueAtTime(0, now);
      gain.gain.linearRampToValueAtTime(0.08, now + 0.05);
      gain.gain.setValueAtTime(0.08, now + 1.2);
      gain.gain.linearRampToValueAtTime(0.001, now + 1.3);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 1.35);
      osc2.stop(now + 1.35);
    } catch {
      // Audio error suppressed
    }
  }

  /**
   * Upbeat connection chime when call is answered
   */
  public playCallConnected(): void {
    this.stopIncomingRingtone();
    this.stopOutgoingRingback();

    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(523.25, now); // C5
      osc.frequency.setValueAtTime(659.25, now + 0.08); // E5
      osc.frequency.setValueAtTime(1046.5, now + 0.16); // C6

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.42);
    } catch {
      // Audio error suppressed
    }
  }

  /**
   * Gentle descending tone when call ends
   */
  public playCallEnded(): void {
    this.stopIncomingRingtone();
    this.stopOutgoingRingback();

    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, now); // A4
      osc.frequency.exponentialRampToValueAtTime(220, now + 0.25); // A3

      gain.gain.setValueAtTime(0.12, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.32);
    } catch {
      // Audio error suppressed
    }
  }

  /**
   * Rapid three-tone busy signal
   */
  public playCallBusy(): void {
    this.stopIncomingRingtone();
    this.stopOutgoingRingback();

    const ctx = this.getContext();
    if (!ctx) return;

    try {
      const now = ctx.currentTime;
      [0, 0.2, 0.4].forEach((t) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'square';
        osc.frequency.setValueAtTime(480, now + t);

        gain.gain.setValueAtTime(0.06, now + t);
        gain.gain.setValueAtTime(0.001, now + t + 0.12);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(now + t);
        osc.stop(now + t + 0.13);
      });
    } catch {
      // Audio error suppressed
    }
  }
}

export const callNotificationService = new CallNotificationService();
