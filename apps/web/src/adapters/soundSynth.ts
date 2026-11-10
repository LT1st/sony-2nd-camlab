/**
 * Camera Lab · Zero-Asset Web Audio API Mechanical Sound Synthesizer
 *
 * Per specification §3.2 & §9.2:
 *   - Sound effects (dial click, shutter clack, film advance, chemical agitation) are optional
 *     and muted by default (`soundEnabled === false`).
 *   - Synthesizes mechanical acoustic transients purely via Web Audio API oscillators and
 *     filtered noise bursts — zero external audio files or proprietary camera samples used.
 */

export type CameraSoundEffect =
  | 'DIAL_CLICK'
  | 'AF_CONFIRM'
  | 'SHUTTER_RELEASE'
  | 'FILM_ADVANCE'
  | 'DEVELOP_AGITATE'
  | 'ERROR_BEEP';

class CameraSoundSynth {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    const AudioCtx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AudioCtx) return null;
    if (!this.ctx) {
      try {
        this.ctx = new AudioCtx();
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  play(effect: CameraSoundEffect, enabled: boolean): void {
    if (!enabled) return;
    const ctx = this.getContext();
    if (!ctx) return;

    const now = ctx.currentTime;

    switch (effect) {
      case 'DIAL_CLICK': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1450, now);
        osc.frequency.exponentialRampToValueAtTime(320, now + 0.018);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.018);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.02);
        break;
      }

      case 'AF_CONFIRM': {
        // Sony dual-tone AF lock beep
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(2600, now);
        osc.frequency.setValueAtTime(3100, now + 0.045);
        gain.gain.setValueAtTime(0.06, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.1);
        break;
      }

      case 'SHUTTER_RELEASE': {
        // Two-curtain focal-plane shutter transient + mechanical mirror/advance tail
        const osc1 = ctx.createOscillator();
        const gain1 = ctx.createGain();
        osc1.type = 'sawtooth';
        osc1.frequency.setValueAtTime(880, now);
        osc1.frequency.exponentialRampToValueAtTime(140, now + 0.032);
        gain1.gain.setValueAtTime(0.14, now);
        gain1.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
        osc1.connect(gain1);
        gain1.connect(ctx.destination);
        osc1.start(now);
        osc1.stop(now + 0.036);

        const osc2 = ctx.createOscillator();
        const gain2 = ctx.createGain();
        osc2.type = 'square';
        osc2.frequency.setValueAtTime(640, now + 0.042);
        osc2.frequency.exponentialRampToValueAtTime(110, now + 0.085);
        gain2.gain.setValueAtTime(0.12, now + 0.042);
        gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.088);
        osc2.connect(gain2);
        gain2.connect(ctx.destination);
        osc2.start(now + 0.042);
        osc2.stop(now + 0.09);
        break;
      }

      case 'FILM_ADVANCE': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(420, now + 0.12);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.14);
        break;
      }

      case 'DEVELOP_AGITATE': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(340, now);
        osc.frequency.exponentialRampToValueAtTime(520, now + 0.11);
        gain.gain.setValueAtTime(0.05, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.125);
        break;
      }

      case 'ERROR_BEEP': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(280, now);
        osc.frequency.setValueAtTime(210, now + 0.07);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(now);
        osc.stop(now + 0.16);
        break;
      }
    }
  }
}

export const soundSynth = new CameraSoundSynth();
