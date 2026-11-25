import { describe, expect, it } from 'vitest';
import { SoundEngine, isSoundName } from './soundEngine';
import { VOICE_PRESETS, VoiceTauntEngine, normalizeSpeaker, resolveTauntParams } from './voiceTaunts';

describe('SoundEngine (headless, un-initialized)', () => {
  it('is a safe no-op before init', () => {
    const s = new SoundEngine();
    expect(s.ready).toBe(false);
    expect(() => s.play('shoot')).not.toThrow();
    expect(() => s.handleEvent({ type: 'sfx', sound: 'explosion' })).not.toThrow();
    expect(() => s.handleEvent({ type: 'sfx', sound: 'unknown' })).not.toThrow();
    expect(s.toggleBass()).toBe(true);
  });
  it('recognises the contract sound names', () => {
    for (const n of ['shoot', 'dodge', 'hit', 'explosion', 'shield_break', 'door_hum', 'blade_whirr', 'slam_impact', 'electric_zap']) {
      expect(isSoundName(n)).toBe(true);
    }
    expect(isSoundName('nope')).toBe(false);
  });
});

describe('voice taunts', () => {
  it('has distinct presets and Otto is deepest/slowest', () => {
    expect(new Set(Object.values(VOICE_PRESETS).map((p) => p.pitchMul)).size).toBe(4);
    expect(VOICE_PRESETS.evil_otto.pitchMul).toBeLessThan(VOICE_PRESETS.maximilian.pitchMul);
  });
  it('normalizes speaker names and falls back to enforcer', () => {
    expect(normalizeSpeaker('Evil Otto')).toBe('evil_otto');
    expect(normalizeSpeaker('???')).toBe('enforcer');
  });
  it('clamps resolved pitch/rate to Web Speech limits', () => {
    const r = resolveTauntParams('enforcer', 100, 100);
    expect(r.pitch).toBe(2);
    expect(r.rate).toBe(4);
    expect(resolveTauntParams('evil_otto', 1, 1).pitch).toBeCloseTo(0.35);
  });
  it('uses Web Speech API when available', () => {
    const spoken: Array<{ pitch: number; rate: number }> = [];
    const g = globalThis as Record<string, unknown>;
    g.SpeechSynthesisUtterance = class { pitch = 1; rate = 1; volume = 1; constructor(public text: string) {} };
    g.speechSynthesis = { speak: (u: { pitch: number; rate: number }) => spoken.push(u), cancel() {} };
    try {
      new VoiceTauntEngine().handleEvent({ type: 'voice_taunt', text: 'hi', pitch: 1, rate: 1, speaker: 'maximilian' });
      expect(spoken).toHaveLength(1);
      expect(spoken[0].pitch).toBeCloseTo(0.55);
    } finally {
      delete g.speechSynthesis;
      delete g.SpeechSynthesisUtterance;
    }
  });
  it('is silent without speech API or init, and when muted', () => {
    const v = new VoiceTauntEngine();
    expect(() => v.speak('hello', 1, 1, 'enforcer')).not.toThrow();
    v.muted = true;
    expect(() => v.speak('hello', 1, 1, 'enforcer')).not.toThrow();
  });
});
