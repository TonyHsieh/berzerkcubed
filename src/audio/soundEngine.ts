// Tone.js procedural arcade SFX + toggleable synthwave bassline.
// Tone is imported lazily so this module (and its tests) load headlessly.
import type { GameEvent } from '../engine/types';

export type SoundName =
  | 'shoot'
  | 'dodge'
  | 'hit'
  | 'explosion'
  | 'shield_break'
  | 'door_hum'
  | 'blade_whirr'
  | 'slam_impact'
  | 'electric_zap';

export const SOUND_NAMES: readonly SoundName[] = [
  'shoot', 'dodge', 'hit', 'explosion', 'shield_break',
  'door_hum', 'blade_whirr', 'slam_impact', 'electric_zap',
];

export const isSoundName = (s: string): s is SoundName => (SOUND_NAMES as readonly string[]).includes(s);

type ToneModule = typeof import('tone');

const BASS_PATTERN = ['A1', 'A1', 'C2', 'A1', 'E2', 'A1', 'G1', 'A1'];

export class SoundEngine {
  private Tone: ToneModule | null = null;
  private players: Record<SoundName, (time: number) => void> | null = null;
  private bass: { seq: { start(t?: number): unknown; stop(): unknown; dispose(): unknown }; synth: { dispose(): unknown } } | null = null;
  private lastPlayed = new Map<SoundName, number>();
  private nextTime = 0;
  muted = false;
  bassEnabled = false;

  get ready(): boolean {
    return this.players !== null;
  }

  /** Must be called from a user gesture (browser autoplay policy). */
  async init(): Promise<void> {
    if (this.Tone) return;
    const Tone = await import('tone');
    await Tone.start();
    this.Tone = Tone;

    const master = new Tone.Volume(-8).toDestination();
    const lead = new Tone.Synth({ oscillator: { type: 'square' }, envelope: { attack: 0.001, decay: 0.12, sustain: 0, release: 0.05 } }).connect(master);
    const noise = new Tone.NoiseSynth({ noise: { type: 'white' }, envelope: { attack: 0.001, decay: 0.15, sustain: 0 } }).connect(new Tone.Filter(1800, 'bandpass').connect(master));
    const boom = new Tone.NoiseSynth({ noise: { type: 'brown' }, envelope: { attack: 0.005, decay: 0.7, sustain: 0 } }).connect(master);
    const thump = new Tone.MembraneSynth({ pitchDecay: 0.06, octaves: 6 }).connect(master);
    const fm = new Tone.FMSynth({ harmonicity: 3, modulationIndex: 12, envelope: { attack: 0.001, decay: 0.3, sustain: 0 } }).connect(master);
    const hum = new Tone.Synth({ oscillator: { type: 'sine' }, envelope: { attack: 0.05, decay: 0.3, sustain: 0.2, release: 0.2 } }).connect(master);
    const zap = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.001, decay: 0.1, sustain: 0, release: 0.02 } }).connect(master);

    this.players = {
      shoot: (t) => { lead.triggerAttackRelease('A5', '32n', t); lead.frequency.setValueAtTime(1760, t); lead.frequency.exponentialRampToValueAtTime(330, t + 0.1); },
      dodge: (t) => noise.triggerAttackRelease('16n', t),
      hit: (t) => thump.triggerAttackRelease('C3', '16n', t),
      explosion: (t) => { boom.triggerAttackRelease('2n', t); thump.triggerAttackRelease('C1', '8n', t); },
      shield_break: (t) => fm.triggerAttackRelease('E5', '8n', t),
      door_hum: (t) => hum.triggerAttackRelease('A2', '8n', t),
      blade_whirr: (t) => noise.triggerAttackRelease('8n', t),
      slam_impact: (t) => { thump.triggerAttackRelease('A0', '4n', t); boom.triggerAttackRelease('4n', t); },
      electric_zap: (t) => { zap.triggerAttackRelease('C6', '32n', t); zap.frequency.setValueAtTime(2200, t); zap.frequency.exponentialRampToValueAtTime(220, t + 0.09); },
    };

    const bassSynth = new Tone.MonoSynth({ oscillator: { type: 'sawtooth' }, filter: { Q: 2, type: 'lowpass', rolloff: -24 }, envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.1 } }).connect(new Tone.Volume(-14).toDestination());
    const seq = new Tone.Sequence((time, note) => bassSynth.triggerAttackRelease(note, '8n', time), BASS_PATTERN, '8n');
    this.bass = { seq, synth: bassSynth };
    Tone.getTransport().bpm.value = 118;
    if (this.bassEnabled) this.startBass();
  }

  play(name: SoundName): void {
    if (this.muted || !this.Tone || !this.players) return;
    // Throttle identical sounds so 200-enemy swarms don't flood the audio graph.
    const now = this.Tone.now();
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < 0.04) return;
    this.lastPlayed.set(name, now);
    // Tone requires strictly increasing start times per voice.
    this.nextTime = Math.max(now + 0.01, this.nextTime + 0.001);
    this.players[name](this.nextTime);
  }

  private startBass(): void {
    if (!this.Tone || !this.bass) return;
    this.bass.seq.start(0);
    this.Tone.getTransport().start();
  }

  setBassEnabled(on: boolean): void {
    this.bassEnabled = on;
    if (!this.Tone || !this.bass) return;
    if (on) this.startBass();
    else {
      this.bass.seq.stop();
      this.Tone.getTransport().pause();
    }
  }

  toggleBass(): boolean {
    this.setBassEnabled(!this.bassEnabled);
    return this.bassEnabled;
  }

  handleEvent(event: GameEvent): void {
    if (event.type === 'sfx' && isSoundName(event.sound)) this.play(event.sound);
  }
}
