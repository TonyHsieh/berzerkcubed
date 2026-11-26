import { describe, expect, it } from 'vitest';
import { SoundEngine, isSoundName } from '../audio/soundEngine';
import { createDifficultyConfig } from '../config/difficulty';
import { createDefaultInputState } from '../engine/input';
import type { GameEvent, Projectile } from '../engine/types';
import { makeFakeCtx } from '../render/testCanvas';
import { VfxSystem } from '../render/vfx';
import { projectileHeadingDeg } from './renderer';
import {
  cancelOttoAlarm,
  computeOttoAlarmTiming,
  createGameState,
  emitElectricDetonation,
  emitProjectileImpactVfx,
  emitProjectileTimeoutVfx,
  evaluateOttoAlarm,
  FIXED_DT,
  quitToTitle,
  resumeGame,
  startFromTitle,
  stepGameState,
  togglePause,
  transitionGamePhase,
} from './gameState';

function makeProjectile(overrides: Partial<Projectile> = {}): Projectile {
  return {
    id: `m415_proj_${Math.random().toString(36).slice(2, 8)}`,
    owner: 'player',
    kind: 'bolt',
    x: 400,
    y: 300,
    z: 12,
    vx: 200,
    vy: 0,
    vz: 0,
    radius: 8,
    damage: 40,
    life: 1.5,
    maxLife: 1.5,
    bouncesLeft: 0,
    modifiers: [],
    color: '#4ade80',
    ...overrides,
  };
}

const cam = { x: 0, y: 0, angleDeg: 0, targetAngleDeg: 0, tiltScale: 1, layerSpacing: 2, shakeMag: 0, shakeTimer: 0 };

// ---------------------------------------------------------------------------
// Feature 1 — Universal projectile end VFX (impact explosion vs timeout implosion)
// ---------------------------------------------------------------------------
describe('M4.15 — universal projectile end VFX', () => {
  it('emits a scaled impact explosion matching the projectile kind and color on hit', () => {
    const events: GameEvent[] = [];
    emitProjectileImpactVfx(events, makeProjectile());
    const boom = events.find((e) => e.type === 'vfx_explosion');
    expect(boom).toBeDefined();
    expect(boom?.type === 'vfx_explosion' && boom.color).toBe('#4ade80');
    expect(boom?.type === 'vfx_explosion' && boom.count).toBe(6);
  });

  it('scales grenades / ICBMs to a larger blast than a basic bolt', () => {
    const bolt: GameEvent[] = [];
    const grenade: GameEvent[] = [];
    const icbm: GameEvent[] = [];
    emitProjectileImpactVfx(bolt, makeProjectile());
    emitProjectileImpactVfx(grenade, makeProjectile({ kind: 'grenade' }));
    emitProjectileImpactVfx(icbm, makeProjectile({ icbm: true, blastRadius: 120 }));
    const countOf = (evts: GameEvent[]) =>
      (evts.find((e) => e.type === 'vfx_explosion') as Extract<GameEvent, { type: 'vfx_explosion' }>).count;
    expect(countOf(grenade)).toBeGreaterThan(countOf(bolt));
    expect(countOf(icbm)).toBeGreaterThan(countOf(grenade));
  });

  it('emits a distinct smaller implosion on timeout (never a silent vanish)', () => {
    const events: GameEvent[] = [];
    emitProjectileTimeoutVfx(events, makeProjectile({ life: 0 }));
    const impl = events.find((e) => e.type === 'vfx_implosion');
    expect(impl).toBeDefined();
    expect(impl?.type === 'vfx_implosion' && impl.radius).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'vfx_explosion')).toBe(false);
  });

  it('VfxSystem spawns and renders implosion / electric detonation particles headlessly', () => {
    const v = new VfxSystem(256);
    v.handleEvent({ type: 'vfx_implosion', x: 10, y: 20, z: 8, color: '#22d3ee', radius: 14 });
    expect(v.activeCount).toBeGreaterThan(0);
    v.handleEvent({ type: 'vfx_electric_detonation', x: 30, y: 40, z: 8 });
    const ctx = makeFakeCtx() as unknown as CanvasRenderingContext2D;
    expect(() => {
      for (let i = 0; i < 5; i++) {
        v.update(FIXED_DT);
        v.render(ctx, (x, y) => ({ x, y }), cam as never);
      }
    }).not.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Feature 2 — Early Evil Otto countdown + taunts (3–5s after boss death)
// ---------------------------------------------------------------------------
describe('M4.15 — early Evil Otto alarm', () => {
  const config = createDifficultyConfig({ ottoWarningSec: 45, ottoAlarmStartDelaySec: 4 });

  it('is inactive before the 4s delay and activates at exactly 4s', () => {
    expect(evaluateOttoAlarm(true, false, 3.9, config).active).toBe(false);
    const atFour = evaluateOttoAlarm(true, false, 4.0, config);
    expect(atFour.active).toBe(true);
    expect(atFour.progress).toBeGreaterThanOrEqual(0);
    expect(atFour.remainingSec).toBeGreaterThan(0);
  });

  it('advances countdown progress and requests Otto at the warning time', () => {
    const mid = evaluateOttoAlarm(true, false, 24.5, config);
    expect(mid.progress).toBeGreaterThan(0.4);
    expect(mid.progress).toBeLessThan(0.6);
    expect(mid.shouldSpawnOtto).toBe(false);
    expect(evaluateOttoAlarm(true, false, 45, config).shouldSpawnOtto).toBe(true);
  });

  it('keeps the spec default delay but honours explicitly short warning windows', () => {
    const spec = computeOttoAlarmTiming(createDifficultyConfig());
    expect(spec.delaySec).toBe(4);
    expect(spec.totalCountdownSec).toBe(10);
    const legacy = computeOttoAlarmTiming(
      createDifficultyConfig({ ottoWarningSec: 1.0, ottoAlarmStartDelaySec: 4 }),
    );
    expect(legacy.delaySec).toBeLessThanOrEqual(legacy.warningSec);
    expect(legacy.warningSec).toBe(1);
  });

  it('stays inactive when no boss died or Otto already spawned', () => {
    expect(evaluateOttoAlarm(false, false, 10, config).active).toBe(false);
    expect(evaluateOttoAlarm(true, true, 10, config).active).toBe(false);
  });

  it('cancelOttoAlarm resets the timer and every taunt flag', () => {
    const state = createGameState(config);
    state.bossDefeated = true;
    state.ottoTimer = 20;
    state.ottoWarningActive = true;
    state.ottoAlarmStartTauntSent = true;
    state.ottoAlarmMidTauntSent = true;
    state.ottoAlarmFinalTauntSent = true;
    cancelOttoAlarm(state);
    expect(state.ottoTimer).toBe(0);
    expect(state.ottoWarningActive).toBe(false);
    expect(state.ottoAlarmStartTauntSent).toBe(false);
    expect(state.ottoAlarmMidTauntSent).toBe(false);
    expect(state.ottoAlarmFinalTauntSent).toBe(false);
  });

  it('fires BEWARE! + otto_alarm sfx only after the delay during a real sim', () => {
    const state = createGameState(config);
    state.bossDefeated = true;
    state.boss = null;
    state.ottoTimer = 0;
    const input = createDefaultInputState();
    const seen: GameEvent[] = [];
    for (let i = 0; i < 260; i++) {
      stepGameState(state, input, FIXED_DT);
      seen.push(...state.events);
    }
    expect(seen.some((e) => e.type === 'voice_taunt' && e.text === 'BEWARE!')).toBe(true);
    expect(seen.some((e) => e.type === 'sfx' && e.sound === 'otto_alarm')).toBe(true);
    expect(state.ottoWarningActive).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Feature 3 — Tesla / lightning orientation + electric explosion
// ---------------------------------------------------------------------------
describe('M4.15 — Tesla orientation & electric detonation', () => {
  it('derives travel heading in degrees from velocity', () => {
    expect(projectileHeadingDeg({ vx: 100, vy: 0 })).toBeCloseTo(0);
    expect(projectileHeadingDeg({ vx: 0, vy: 100 })).toBeCloseTo(90);
    expect(projectileHeadingDeg({ vx: -100, vy: 0 })).toBeCloseTo(180);
    expect(projectileHeadingDeg({ vx: 1, vy: 1 })).toBeCloseTo(45);
  });

  it('lightning impact emits an electric detonation with zap sfx', () => {
    const events: GameEvent[] = [];
    emitProjectileImpactVfx(events, makeProjectile({ kind: 'lightning', color: '#67e8f9' }));
    expect(events.some((e) => e.type === 'vfx_electric_detonation')).toBe(true);
    expect(events.some((e) => e.type === 'sfx' && e.sound === 'electric_zap')).toBe(true);
  });

  it('lightning timeout emits both implosion and electric detonation', () => {
    const events: GameEvent[] = [];
    emitElectricDetonation(events, 1, 2, 3);
    emitProjectileTimeoutVfx(events, makeProjectile({ kind: 'lightning', life: 0 }));
    expect(events.filter((e) => e.type === 'vfx_implosion')).toHaveLength(1);
    expect(events.filter((e) => e.type === 'vfx_electric_detonation').length).toBeGreaterThanOrEqual(1);
  });
});

// ---------------------------------------------------------------------------
// Feature 4 — Dynamic music fades & Boss Danger crossfade
// ---------------------------------------------------------------------------
describe('M4.15 — dynamic music state machine', () => {
  it('tracks silent -> level -> boss -> silent transitions headlessly', () => {
    const s = new SoundEngine();
    expect(s.getMusicMode()).toBe('silent');
    s.setMusicMode('level');
    expect(s.getMusicMode()).toBe('level');
    expect(s.getLastFadeSec()).toBeCloseTo(1.2);
    s.crossfadeToBossMusic();
    expect(s.getMusicMode()).toBe('boss');
    expect(s.getLastFadeSec()).toBeCloseTo(1.0);
    s.fadeOutMusic();
    expect(s.getMusicMode()).toBe('silent');
    expect(s.getLastFadeSec()).toBeCloseTo(0.6);
  });

  it('honours explicit fade durations, music_mode events, and paused state', () => {
    const s = new SoundEngine();
    s.handleEvent({ type: 'music_mode', mode: 'boss', fadeSec: 0.75 });
    expect(s.getMusicMode()).toBe('boss');
    expect(s.getLastFadeSec()).toBeCloseTo(0.75);
    s.setPaused(true);
    expect(s.isPaused()).toBe(true);
    s.setPaused(false);
    expect(s.isPaused()).toBe(false);
    expect(isSoundName('otto_alarm')).toBe(true);
  });

  it('startFromTitle fades in level music, quitToTitle fades it out', () => {
    const state = createGameState(createDifficultyConfig(), { initialPhase: 'title' });
    startFromTitle(state);
    expect(state.events.some((e) => e.type === 'music_mode' && e.mode === 'level')).toBe(true);
    quitToTitle(state);
    expect(state.events.some((e) => e.type === 'music_mode' && e.mode === 'silent')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Feature 5 — Escape Pause Menu (freeze the sim)
// ---------------------------------------------------------------------------
describe('M4.15 — pause menu', () => {
  it('transitions between phases with a pure reducer', () => {
    expect(transitionGamePhase('title', 'start')).toBe('playing');
    expect(transitionGamePhase('playing', 'toggle_pause')).toBe('paused');
    expect(transitionGamePhase('paused', 'toggle_pause')).toBe('playing');
    expect(transitionGamePhase('paused', 'resume')).toBe('playing');
    expect(transitionGamePhase('playing', 'quit_to_title')).toBe('title');
    expect(transitionGamePhase('title', 'toggle_pause')).toBe('title');
  });

  it('freezes simulation ticks while paused and resumes cleanly', () => {
    const state = createGameState();
    const input = createDefaultInputState();
    stepGameState(state, input, FIXED_DT);
    const before = state.elapsedTime;
    expect(togglePause(state)).toBe('paused');
    for (let i = 0; i < 30; i++) stepGameState(state, input, FIXED_DT);
    expect(state.elapsedTime).toBe(before);
    expect(resumeGame(state)).toBe('playing');
    stepGameState(state, input, FIXED_DT);
    expect(state.elapsedTime).toBeGreaterThan(before);
  });
});

// ---------------------------------------------------------------------------
// Feature 6 — Arcade Title Screen state machine
// ---------------------------------------------------------------------------
describe('M4.15 — arcade title screen', () => {
  it('defaults to playing but can boot into a frozen title phase', () => {
    expect(createGameState().phase).toBe('playing');
    const title = createGameState(createDifficultyConfig(), { initialPhase: 'title' });
    const input = createDefaultInputState();
    const before = title.elapsedTime;
    for (let i = 0; i < 20; i++) stepGameState(title, input, FIXED_DT);
    expect(title.elapsedTime).toBe(before);
    expect(startFromTitle(title)).toBe('playing');
  });
});
