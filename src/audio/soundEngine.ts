// Tone.js procedural arcade SFX + dynamic level & Boss Danger music crossfade.
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
  | 'electric_zap'
  | 'rez_in'
  | 'otto_alarm';

export const SOUND_NAMES: readonly SoundName[] = [
  'shoot', 'dodge', 'hit', 'explosion', 'shield_break',
  'door_hum', 'blade_whirr', 'slam_impact', 'electric_zap', 'rez_in',
  'otto_alarm',
];

export const isSoundName = (s: string): s is SoundName => (SOUND_NAMES as readonly string[]).includes(s);

export type MusicMode = 'silent' | 'level' | 'boss';

type ToneModule = typeof import('tone');

const BASS_PATTERN = ['A1', 'A1', 'C2', 'A1', 'E2', 'A1', 'G1', 'A1'];
const LEVEL_ARP_PATTERN = ['A3', null, 'C4', 'E4', null, 'G4', 'E4', null];

// High-BPM pulse-pounding Boss Danger track patterns
const BOSS_BASS_PATTERN = [
  'A1', 'A2', 'A1', 'A2', 'C2', 'C3', 'A1', 'A2',
  'F1', 'F2', 'G1', 'G2', 'E1', 'E2', 'G1', 'E2',
];
const BOSS_ARP_PATTERN = [
  'A4', 'E4', 'C5', 'A4', 'D5', 'A4', 'C5', 'E5',
  'F4', 'C5', 'G4', 'D5', 'E4', 'B4', 'G#4', 'E5',
];
const BOSS_PERC_PATTERN = [
  'K', 'H', 'H', 'K', 'S', 'H', 'K', 'H',
  'K', 'H', 'K', 'H', 'S', 'H', 'K', 'S',
];

const LEVEL_GAIN_TARGET = 0.28;
const BOSS_GAIN_TARGET = 0.34;
export const LEVEL_BASE_BPM = 118;
export const BOSS_BASE_BPM = 148;
export const BOSS_MAX_BPM = 210;

interface MusicRig {
  masterGain: { gain: { rampTo(v: number, t: number): unknown; value: number } };
  levelGain: { gain: { rampTo(v: number, t: number): unknown; value: number } };
  bossGain: { gain: { rampTo(v: number, t: number): unknown; value: number } };
  levelSeqs: Array<{ start(t?: number): unknown; stop(): unknown; dispose(): unknown }>;
  bossSeqs: Array<{ start(t?: number): unknown; stop(): unknown; dispose(): unknown }>;
  started: boolean;
}

export class SoundEngine {
  private Tone: ToneModule | null = null;
  private players: Record<SoundName, (time: number) => void> | null = null;
  private musicRig: MusicRig | null = null;
  private lastPlayed = new Map<SoundName, number>();
  private nextTime = 0;
  private _musicMode: MusicMode = 'silent';
  private _paused = false;
  private _lastFadeSec = 0;
  private _bossHpRatio = 1;
  private _lastAppliedBpm = LEVEL_BASE_BPM;
  private _lastBpmRampEndAt = -Infinity;
  muted = false;
  bassEnabled = false;

  get ready(): boolean {
    return this.players !== null;
  }

  getMusicMode(): MusicMode {
    return this._musicMode;
  }

  isPaused(): boolean {
    return this._paused;
  }

  getLastFadeSec(): number {
    return this._lastFadeSec;
  }

  /**
   * Milestone 4.16: Scales Boss Danger music tempo proportionally as active boss HP
   * drops from 1.0 -> 0.0 (148 BPM -> ~210 BPM / ~1.42x). Clamped to [0, 1].
   * Throttled & deduplicated so Tone.js Transport.bpm (TickParam Timeline) never
   * accumulates overlapping 60 Hz ramps that can hang TickSource.forEachTickBetween.
   */
  setBossHpRatio(ratio: number): void {
    const clamped = Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : 1;
    this._bossHpRatio = clamped;
    if (this._musicMode === 'boss' && this.Tone && this.musicRig) {
      const targetBpm = this.getBossTempoBpm();
      const now = this.Tone.now();
      if (
        Math.abs(targetBpm - this._lastAppliedBpm) >= 1.0 &&
        now >= this._lastBpmRampEndAt
      ) {
        const rampSec = 0.2;
        this.Tone.getTransport().bpm.rampTo(targetBpm, rampSec);
        this._lastAppliedBpm = targetBpm;
        this._lastBpmRampEndAt = now + rampSec + 0.05;
      }
    }
  }

  /** Returns the current Boss Danger BPM (148..210 while in boss mode; 148 base otherwise). */
  getBossTempoBpm(): number {
    if (this._musicMode !== 'boss') return BOSS_BASE_BPM;
    return BOSS_BASE_BPM + (1 - this._bossHpRatio) * (BOSS_MAX_BPM - BOSS_BASE_BPM);
  }

  /** Returns the current boss tempo multiplier relative to base boss BPM (1.0..~1.42). */
  getTempoMultiplier(): number {
    return this.getBossTempoBpm() / BOSS_BASE_BPM;
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
    const alarm = new Tone.Synth({ oscillator: { type: 'sawtooth' }, envelope: { attack: 0.01, decay: 0.28, sustain: 0.25, release: 0.12 } }).connect(master);

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
      rez_in: (t) => { hum.triggerAttackRelease('C4', '8n', t); hum.frequency.setValueAtTime(260, t); hum.frequency.exponentialRampToValueAtTime(1040, t + 0.24); },
      otto_alarm: (t) => {
        alarm.triggerAttackRelease('A4', '8n', t);
        alarm.frequency.setValueAtTime(660, t);
        alarm.frequency.linearRampToValueAtTime(990, t + 0.12);
        alarm.frequency.linearRampToValueAtTime(520, t + 0.26);
      },
    };

    // Dual-bus music rig: levelGain + bossGain -> masterMusicGain -> Destination
    const masterGain = new Tone.Gain(this._paused || this.muted ? 0 : 1).toDestination();
    const levelGain = new Tone.Gain(0).connect(masterGain);
    const bossGain = new Tone.Gain(0).connect(masterGain);

    // Level synthwave track
    const bassSynth = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { Q: 2, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 0.01, decay: 0.2, sustain: 0.3, release: 0.1 },
    }).connect(levelGain);
    const levelArp = new Tone.Synth({
      oscillator: { type: 'triangle' },
      envelope: { attack: 0.005, decay: 0.12, sustain: 0.1, release: 0.08 },
    }).connect(levelGain);
    const levelBassSeq = new Tone.Sequence((time, note) => bassSynth.triggerAttackRelease(note, '8n', time), BASS_PATTERN, '8n');
    const levelArpSeq = new Tone.Sequence((time, note) => {
      if (note) levelArp.triggerAttackRelease(note, '16n', time);
    }, LEVEL_ARP_PATTERN, '8n');

    // Boss Danger track: driving octave bass, aggressive stab arpeggio, urgent percussion
    const bossBass = new Tone.MonoSynth({
      oscillator: { type: 'sawtooth' },
      filter: { Q: 4, type: 'lowpass', rolloff: -24 },
      envelope: { attack: 0.005, decay: 0.14, sustain: 0.25, release: 0.06 },
    }).connect(bossGain);
    const bossStab = new Tone.Synth({
      oscillator: { type: 'square' },
      envelope: { attack: 0.004, decay: 0.09, sustain: 0.05, release: 0.05 },
    }).connect(bossGain);
    const bossKick = new Tone.MembraneSynth({ pitchDecay: 0.04, octaves: 5 }).connect(bossGain);
    const bossHat = new Tone.NoiseSynth({
      noise: { type: 'white' },
      envelope: { attack: 0.001, decay: 0.04, sustain: 0 },
    }).connect(new Tone.Filter(5200, 'highpass').connect(bossGain));

    const bossBassSeq = new Tone.Sequence((time, note) => bossBass.triggerAttackRelease(note, '16n', time), BOSS_BASS_PATTERN, '16n');
    const bossArpSeq = new Tone.Sequence((time, note) => bossStab.triggerAttackRelease(note, '16n', time), BOSS_ARP_PATTERN, '16n');
    const bossPercSeq = new Tone.Sequence((time, hit) => {
      if (hit === 'K') bossKick.triggerAttackRelease('C1', '16n', time);
      else if (hit === 'S') {
        bossKick.triggerAttackRelease('G1', '32n', time);
        bossHat.triggerAttackRelease('32n', time);
      } else if (hit === 'H') {
        bossHat.triggerAttackRelease('64n', time);
      }
    }, BOSS_PERC_PATTERN, '16n');

    this.musicRig = {
      masterGain,
      levelGain,
      bossGain,
      levelSeqs: [levelBassSeq, levelArpSeq],
      bossSeqs: [bossBassSeq, bossArpSeq, bossPercSeq],
      started: false,
    };

    Tone.getTransport().bpm.value = 118;
    if (this.bassEnabled && this._musicMode === 'silent') {
      this._musicMode = 'level';
    }
    this.applyMusicModeToTone(this._musicMode, this._lastFadeSec > 0 ? this._lastFadeSec : 1.0);
  }

  private ensureTransportStarted(): void {
    if (!this.Tone || !this.musicRig || this.musicRig.started) return;
    for (const seq of this.musicRig.levelSeqs) seq.start(0);
    for (const seq of this.musicRig.bossSeqs) seq.start(0);
    this.Tone.getTransport().start();
    this.musicRig.started = true;
  }

  private applyMusicModeToTone(mode: MusicMode, fadeSec: number): void {
    if (!this.Tone || !this.musicRig) return;
    const safeFade = Math.max(0.05, fadeSec);
    if (mode !== 'silent') {
      this.ensureTransportStarted();
    }
    const targetBpm = mode === 'boss' ? this.getBossTempoBpm() : LEVEL_BASE_BPM;
    if (Math.abs(targetBpm - this._lastAppliedBpm) >= 0.1) {
      this.Tone.getTransport().bpm.rampTo(targetBpm, safeFade);
      this._lastAppliedBpm = targetBpm;
      this._lastBpmRampEndAt = this.Tone.now() + safeFade + 0.05;
    }

    const levelTarget = mode === 'level' ? LEVEL_GAIN_TARGET : 0;
    const bossTarget = mode === 'boss' ? BOSS_GAIN_TARGET : 0;
    this.musicRig.levelGain.gain.rampTo(levelTarget, safeFade);
    this.musicRig.bossGain.gain.rampTo(bossTarget, safeFade);
    this.updateMasterMusicGain(0.15);
  }

  private updateMasterMusicGain(rampSec = 0.15): void {
    if (!this.musicRig) return;
    const target = this.muted ? 0 : this._paused ? 0.12 : 1;
    this.musicRig.masterGain.gain.rampTo(target, Math.max(0.02, rampSec));
  }

  /**
   * Transitions music mode with smooth Tone.js gain ramps / crossfades.
   * Safe to call headlessly before `init()` (tracks mode state for tests).
   */
  setMusicMode(mode: MusicMode, fadeSec?: number): void {
    const defaultFade = mode === 'level' ? 1.2 : mode === 'boss' ? 1.0 : 0.6;
    const resolvedFade = fadeSec ?? defaultFade;
    if (mode !== 'boss' || this._musicMode !== 'boss') {
      // Reset boss tempo ramp when leaving boss music or starting a fresh boss encounter
      this._bossHpRatio = 1;
    }
    this._musicMode = mode;
    this._lastFadeSec = resolvedFade;
    this.bassEnabled = mode !== 'silent';
    this.applyMusicModeToTone(mode, resolvedFade);
  }

  fadeInLevelMusic(fadeSec = 1.2): void {
    this.setMusicMode('level', fadeSec);
  }

  fadeOutMusic(fadeSec = 0.6): void {
    this.setMusicMode('silent', fadeSec);
  }

  crossfadeToBossMusic(fadeSec = 1.0): void {
    this.setMusicMode('boss', fadeSec);
  }

  fadeOutBossMusic(fadeSec = 1.0): void {
    this.setMusicMode('silent', fadeSec);
  }

  setPaused(paused: boolean): void {
    this._paused = paused;
    this.updateMasterMusicGain(0.15);
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    this.updateMasterMusicGain(0.1);
  }

  play(name: SoundName): void {
    if (this.muted || this._paused || !this.Tone || !this.players) return;
    // Throttle identical sounds so 200-enemy swarms don't flood the audio graph.
    const now = this.Tone.now();
    const last = this.lastPlayed.get(name) ?? -1;
    if (now - last < 0.04) return;
    this.lastPlayed.set(name, now);
    // Tone requires strictly increasing start times per voice.
    this.nextTime = Math.max(now + 0.01, this.nextTime + 0.001);
    this.players[name](this.nextTime);
  }

  setBassEnabled(on: boolean): void {
    this.bassEnabled = on;
    if (on) {
      if (this._musicMode === 'silent') {
        this.setMusicMode('level', 1.2);
      } else {
        this.applyMusicModeToTone(this._musicMode, 0.8);
      }
    } else {
      this.setMusicMode('silent', 0.6);
    }
  }

  toggleBass(): boolean {
    this.setBassEnabled(!this.bassEnabled);
    return this.bassEnabled;
  }

  handleEvent(event: GameEvent): void {
    if (event.type === 'sfx' && isSoundName(event.sound)) {
      this.play(event.sound);
    } else if (event.type === 'music_mode') {
      this.setMusicMode(event.mode, event.fadeSec);
    }
  }
}
