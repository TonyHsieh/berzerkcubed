// Variable-pitch robotic speech taunts. Uses the Web Speech API when present,
// otherwise a Tone.js blip-speech fallback. Tone is imported lazily.
import type { GameEvent } from '../engine/types';

export type Speaker = 'enforcer' | 'maximilian' | 'recogniser' | 'evil_otto';

export interface VoicePreset {
  pitchMul: number;
  rateMul: number;
  wave: 'square' | 'sawtooth' | 'triangle';
  detuneCents: number;
  distortion: number; // 0..1, fallback synth only
  baseHz: number; // fallback blip base frequency
  /** Milestone 4.16: optional ring-modulator / metallic bitcrush frequency (Hz) for Dalek-style voices. */
  ringModHz?: number;
}

export const VOICE_PRESETS: Record<Speaker, VoicePreset> = {
  enforcer: { pitchMul: 1.0, rateMul: 1.15, wave: 'square', detuneCents: 0, distortion: 0.1, baseHz: 220 },
  maximilian: { pitchMul: 0.55, rateMul: 0.8, wave: 'sawtooth', detuneCents: -30, distortion: 0.5, baseHz: 90 },
  recogniser: { pitchMul: 0.8, rateMul: 0.95, wave: 'triangle', detuneCents: 12, distortion: 0.25, baseHz: 140 },
  // Milestone 4.16: Screechy clipped metallic Dalek-style Evil Otto voice (pitch 1.7-1.9, rate 1.15-1.25)
  evil_otto: {
    pitchMul: 1.8,
    rateMul: 1.2,
    wave: 'sawtooth',
    detuneCents: 45,
    distortion: 0.9,
    baseHz: 340,
    ringModHz: 55,
  },
};

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function normalizeSpeaker(s: string): Speaker {
  const k = s.toLowerCase().replace(/[\s-]+/g, '_');
  return k in VOICE_PRESETS ? (k as Speaker) : 'enforcer';
}

/** Pure: combine caller pitch/rate with the speaker preset, within Web Speech limits. */
export function resolveTauntParams(speaker: string, pitch: number, rate: number) {
  const sp = normalizeSpeaker(speaker);
  const preset = VOICE_PRESETS[sp];
  return {
    speaker: sp,
    preset,
    pitch: clamp(pitch * preset.pitchMul, 0, 2),
    rate: clamp(rate * preset.rateMul, 0.1, 4),
  };
}

type SpeechSynthLike = {
  speak(u: unknown): void;
  cancel(): void;
};

export class VoiceTauntEngine {
  muted = false;
  private Tone: typeof import('tone') | null = null;
  private lastSpeakAt = 0;

  async init(): Promise<void> {
    if (this.Tone) return;
    this.Tone = await import('tone');
  }

  private speechSynth(): SpeechSynthLike | null {
    const g = globalThis as { speechSynthesis?: SpeechSynthLike; SpeechSynthesisUtterance?: unknown };
    return g.speechSynthesis && g.SpeechSynthesisUtterance ? g.speechSynthesis : null;
  }

  speak(text: string, pitch: number, rate: number, speaker: string): void {
    if (this.muted || !text) return;
    const p = resolveTauntParams(speaker, pitch, rate);
    const synth = this.speechSynth();
    if (synth) {
      const Utter = (globalThis as unknown as { SpeechSynthesisUtterance: new (t: string) => { pitch: number; rate: number; volume: number } }).SpeechSynthesisUtterance;
      const u = new Utter(text);
      u.pitch = p.pitch;
      u.rate = p.rate;
      u.volume = 0.9;
      if (p.speaker === 'evil_otto' || p.speaker === 'maximilian') synth.cancel(); // villains interrupt chatter
      synth.speak(u);
      // Milestone 4.16: Layer metallic Dalek ring-mod/bitcrush accompaniment when Tone is initialized
      if (p.speaker === 'evil_otto' && p.preset.ringModHz) {
        this.playDalekRingModBed(text, p.rate, p.preset);
      }
      return;
    }
    this.speakFallback(text, p.pitch, p.rate, p.preset);
  }

  /** Headless-safe Tone.js metallic ring-modulator / bitcrush accompaniment for Dalek-style Otto. */
  private playDalekRingModBed(text: string, rate: number, preset: VoicePreset): void {
    const Tone = this.Tone;
    if (!Tone) return;
    try {
      const now = Math.max(Tone.now(), this.lastSpeakAt) + 0.01;
      const fm = new Tone.FMSynth({
        harmonicity: 5.5,
        modulationIndex: 28,
        oscillator: { type: 'sawtooth' },
        modulation: { type: 'square' },
        envelope: { attack: 0.004, decay: 0.06, sustain: 0.25, release: 0.03 },
      });
      const crusher = new Tone.BitCrusher(4);
      const dist = new Tone.Distortion(preset.distortion);
      const gain = new Tone.Gain(0.18);
      fm.chain(crusher, dist, gain, Tone.getDestination());
      const step = 0.075 / Math.max(0.5, rate);
      const syllables = Math.min(10, Math.max(3, text.replace(/[^a-zA-Z]/g, '').length));
      let t = now;
      for (let i = 0; i < syllables; i++) {
        const hz = (preset.baseHz + (i % 3) * (preset.ringModHz ?? 55)) * 1.15;
        fm.triggerAttackRelease(hz, step * 0.65, t);
        t += step;
      }
      this.lastSpeakAt = Math.max(this.lastSpeakAt, t);
      setTimeout(() => {
        fm.dispose();
        crusher.dispose();
        dist.dispose();
        gain.dispose();
      }, Math.ceil((t - Tone.now() + 0.4) * 1000));
    } catch {
      // Headless / unavailable audio context: safely ignore
    }
  }

  private speakFallback(text: string, pitch: number, rate: number, preset: VoicePreset): void {
    const Tone = this.Tone;
    if (!Tone) return; // init() not called yet
    const now = Math.max(Tone.now(), this.lastSpeakAt) + 0.02;
    const synth = new Tone.Synth({
      oscillator: { type: preset.wave },
      envelope: { attack: 0.005, decay: 0.05, sustain: 0.4, release: 0.03 },
      detune: preset.detuneCents,
    });
    const dist = new Tone.Distortion(preset.distortion);
    synth.chain(dist, Tone.getDestination());
    const step = 0.09 / rate;
    let t = now;
    for (const ch of text.toLowerCase()) {
      if (/[a-z]/.test(ch)) {
        const idx = ch.charCodeAt(0) - 97;
        // vowels sit higher; consonants lower: a crude formant-like contour
        const vowel = 'aeiou'.includes(ch);
        const hz = preset.baseHz * pitch * (1 + (idx % 7) * 0.09) * (vowel ? 1.35 : 1);
        synth.triggerAttackRelease(hz, step * 0.8, t);
        t += step;
      } else if (ch === ' ') {
        t += step * 0.8;
      }
    }
    this.lastSpeakAt = t;
    setTimeout(() => { synth.dispose(); dist.dispose(); }, Math.ceil((t - Tone.now() + 0.5) * 1000));
  }

  handleEvent(event: GameEvent): void {
    if (event.type === 'voice_taunt') this.speak(event.text, event.pitch, event.rate, event.speaker);
  }
}
