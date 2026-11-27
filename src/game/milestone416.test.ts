import { describe, expect, it } from 'vitest';
import {
  BOSS_BASE_BPM,
  BOSS_MAX_BPM,
  SoundEngine,
} from '../audio/soundEngine';
import {
  VOICE_PRESETS,
  VoiceTauntEngine,
  resolveTauntParams,
} from '../audio/voiceTaunts';
import {
  ABB_ICBM_SPEED,
  ABB_ICBM_TURN_RATE,
  createAbb,
  getAbbSalvoCount,
  steerGuidedIcbm,
  updateAbb,
} from '../bosses/abb';
import { applyHigherSectorBossScaling } from '../bosses/bossUtils';
import { createBrainbot } from '../bosses/brainbot';
import { createBugHive } from '../bosses/bugHive';
import { createEvilOtto } from '../bosses/evilOtto';
import {
  createMaximilian,
  getMaximilianTargetBladeExtend,
  updateMaximilian,
} from '../bosses/maximilian';
import { createRecogniser } from '../bosses/recogniser';
import { createSkullhead } from '../bosses/skullhead';
import { createDifficultyConfig } from '../config/difficulty';
import {
  PAUSE_MENU_ITEMS,
  createDefaultInputState,
  createPauseMenuNav,
  gamepadSnapshotToPauseNavInput,
  parseGamepadSnapshot,
  type GamepadLike,
} from '../engine/input';
import type { GameEvent, Projectile } from '../engine/types';
import { buildAllModels } from '../render/models';
import {
  CHARACTER_HEIGHT_MULTIPLIER,
  RECOGNISER_HEIGHT_MULTIPLIER,
  getEntitySpacingMultiplier,
  setCanvasFactory,
} from '../render/spriteStack';
import { fakeCanvasFactory } from '../render/testCanvas';
import {
  GALLERY_DEFAULT_SPACING,
  GALLERY_MAX_SPACING,
  GALLERY_MIN_SPACING,
  applyGalleryKeyPress,
  clampGallerySpacing,
  computeGalleryCardSpacing,
  createGalleryControlState,
  formatGalleryTelemetry,
  stepGalleryControls,
} from './gallery';
import {
  FIXED_DT,
  computeOttoAlarmTiming,
  createGameState,
  evaluateOttoAlarm,
  stepGameState,
} from './gameState';

function makePad(
  overrides: { axes?: number[]; pressed?: number[] } = {},
): GamepadLike {
  const buttons = Array.from({ length: 16 }, (_, i) => ({
    pressed: overrides.pressed?.includes(i) ?? false,
    value: overrides.pressed?.includes(i) ? 1 : 0,
  }));
  return {
    axes: overrides.axes ?? [0, 0, 0, 0],
    buttons,
  };
}

// ---------------------------------------------------------------------------
// Feature 1 — Boss music proportional tempo ramp
// ---------------------------------------------------------------------------
describe('M4.16 — Feature 1: Boss music proportional tempo ramp', () => {
  it('monotonically increases boss tempo BPM from 148 to ~210 as boss HP drops 1.0 -> 0.0 and resets on death', () => {
    const s = new SoundEngine();
    s.crossfadeToBossMusic();
    expect(s.getMusicMode()).toBe('boss');
    expect(s.getBossTempoBpm()).toBeCloseTo(BOSS_BASE_BPM, 3);
    expect(s.getTempoMultiplier()).toBeCloseTo(1.0, 3);

    const ratios = [1.0, 0.75, 0.5, 0.25, 0.0];
    const bpms: number[] = [];
    for (const r of ratios) {
      s.setBossHpRatio(r);
      bpms.push(s.getBossTempoBpm());
    }
    for (let i = 1; i < bpms.length; i++) {
      expect(bpms[i]).toBeGreaterThan(bpms[i - 1]);
    }
    expect(bpms[bpms.length - 1]).toBeCloseTo(BOSS_MAX_BPM, 1);
    expect(s.getTempoMultiplier()).toBeCloseTo(BOSS_MAX_BPM / BOSS_BASE_BPM, 2);

    // Clamps out-of-range values safely
    s.setBossHpRatio(-5);
    expect(s.getBossTempoBpm()).toBeCloseTo(BOSS_MAX_BPM, 1);
    s.setBossHpRatio(99);
    expect(s.getBossTempoBpm()).toBeCloseTo(BOSS_BASE_BPM, 1);

    // Resets back to base tempo when boss dies (fadeOutMusic) or returning to level music
    s.setBossHpRatio(0.1);
    expect(s.getBossTempoBpm()).toBeGreaterThan(195);
    s.fadeOutMusic();
    expect(s.getBossTempoBpm()).toBeCloseTo(BOSS_BASE_BPM, 3);
    expect(s.getTempoMultiplier()).toBeCloseTo(1.0, 3);

    s.crossfadeToBossMusic();
    s.setBossHpRatio(0.2);
    s.fadeInLevelMusic();
    expect(s.getBossTempoBpm()).toBeCloseTo(BOSS_BASE_BPM, 3);
  });

  it('throttles and deduplicates Tone Transport.bpm.rampTo calls during 60Hz boss ticks', () => {
    const s = new SoundEngine();
    const rampCalls: Array<{ bpm: number; dur: number }> = [];
    let fakeNow = 10.0;
    const fakeTone = {
      now: () => fakeNow,
      getTransport: () => ({
        start: () => undefined,
        bpm: {
          value: 118,
          rampTo: (bpm: number, dur: number) => {
            rampCalls.push({ bpm, dur });
          },
        },
      }),
    };
    const fakeGain = () => ({ gain: { rampTo: () => undefined, value: 0 } });
    (s as unknown as Record<string, unknown>).Tone = fakeTone;
    (s as unknown as Record<string, unknown>).musicRig = {
      masterGain: fakeGain(),
      levelGain: fakeGain(),
      bossGain: fakeGain(),
      levelSeqs: [],
      bossSeqs: [],
      started: true,
    };

    s.crossfadeToBossMusic(1.0);
    expect(rampCalls).toHaveLength(1);

    // 180 ticks (3s) with unchanged HP should schedule 0 additional ramps
    for (let i = 0; i < 180; i++) {
      fakeNow += 1 / 60;
      s.setBossHpRatio(1.0);
    }
    expect(rampCalls).toHaveLength(1);

    // Rapid 60Hz HP drain over 1 second (60 calls) should only schedule ~4 non-overlapping ramps
    for (let i = 1; i <= 60; i++) {
      fakeNow += 1 / 60;
      s.setBossHpRatio(1.0 - i / 60);
    }
    expect(rampCalls.length).toBeGreaterThanOrEqual(2);
    expect(rampCalls.length).toBeLessThanOrEqual(6);
  });
});

// ---------------------------------------------------------------------------
// Feature 2 — Evil Otto 10-second countdown & screechy Dalek-style voice
// ---------------------------------------------------------------------------
describe('M4.16 — Feature 2: Evil Otto 10s countdown & Dalek voice', () => {
  it('defaults to ottoCountdownSec === 10 after the 4s post-boss explosion delay', () => {
    const cfg = createDifficultyConfig();
    expect(cfg.ottoCountdownSec).toBe(10.0);
    expect(cfg.ottoAlarmStartDelaySec).toBe(4.0);
    const timing = computeOttoAlarmTiming(cfg);
    expect(timing.delaySec).toBe(4.0);
    expect(timing.totalCountdownSec).toBe(10.0);
    expect(timing.warningSec).toBe(14.0);

    expect(evaluateOttoAlarm(true, false, 3.9, cfg).active).toBe(false);
    const atStart = evaluateOttoAlarm(true, false, 4.0, cfg);
    expect(atStart.active).toBe(true);
    expect(atStart.remainingSec).toBeCloseTo(10.0, 2);
    expect(evaluateOttoAlarm(true, false, 14.0, cfg).shouldSpawnOtto).toBe(true);
  });

  it('uses screechy high-pitched Dalek voice preset (pitch 1.7-1.9, rate 1.15-1.25) and is headless-safe', () => {
    expect(VOICE_PRESETS.evil_otto.pitchMul).toBeGreaterThanOrEqual(1.7);
    expect(VOICE_PRESETS.evil_otto.pitchMul).toBeLessThanOrEqual(1.9);
    expect(VOICE_PRESETS.evil_otto.rateMul).toBeGreaterThanOrEqual(1.15);
    expect(VOICE_PRESETS.evil_otto.rateMul).toBeLessThanOrEqual(1.25);

    const resolved = resolveTauntParams('evil_otto', 1.0, 1.0);
    expect(resolved.pitch).toBeGreaterThanOrEqual(1.5);
    expect(resolved.rate).toBeGreaterThanOrEqual(1.15);

    const engine = new VoiceTauntEngine();
    expect(() => {
      engine.speak('BEWARE!', 1.0, 1.0, 'evil_otto');
      engine.speak('I SENSE YOU!', 1.0, 1.0, 'evil_otto');
      engine.speak('EXTERMINATE THE HUMANOID!', 1.0, 1.0, 'evil_otto');
    }).not.toThrow();
  });

  it('emits BEWARE!, I SENSE YOU!, and EXTERMINATE THE HUMANOID! during the 10s countdown', () => {
    const state = createGameState(createDifficultyConfig());
    state.bossDefeated = true;
    state.boss = null;
    state.ottoTimer = 0;
    const input = createDefaultInputState();
    const taunts: string[] = [];
    // Advance 14.5s (870 ticks at 60Hz)
    for (let i = 0; i < 870; i++) {
      stepGameState(state, input, FIXED_DT);
      for (const e of state.events) {
        if (e.type === 'voice_taunt' && e.speaker === 'evil_otto') {
          taunts.push(e.text);
        }
      }
    }
    expect(taunts).toContain('BEWARE!');
    expect(taunts).toContain('I SENSE YOU!');
    expect(taunts).toContain('EXTERMINATE THE HUMANOID!');
    expect((state.boss as { kind?: string } | null)?.kind).toBe('evil_otto');
  });
});

// ---------------------------------------------------------------------------
// Feature 3 — Universal boss shields across all 7 bosses
// ---------------------------------------------------------------------------
describe('M4.16 — Feature 3: Universal boss shields (all 7 bosses)', () => {
  it('spawns all 7 bosses with shieldLayers >= 1 and shieldHp > 0 even in Sector 1, scaling up in higher sectors', () => {
    const bosses = [
      createMaximilian(400, 400, 0),
      createRecogniser(400, 400),
      createEvilOtto(400, 400, 0),
      createAbb(400, 400, 0),
      createSkullhead(400, 400),
      createBugHive(400, 400),
      createBrainbot(400, 400),
    ];

    expect(bosses).toHaveLength(7);
    for (const boss of bosses) {
      expect(boss.shieldLayers ?? 0).toBeGreaterThanOrEqual(1);
      expect(boss.maxShieldLayers ?? 0).toBeGreaterThanOrEqual(1);
      expect(boss.shieldHp ?? 0).toBeGreaterThan(0);
      expect(boss.shieldMaxHp ?? 0).toBeGreaterThan(0);
    }

    // Scaling up in Sector 4 (sectorIndex 3) increases layers and shield HP
    const s1Abb = createAbb(400, 400, 0);
    const s4Abb = applyHigherSectorBossScaling(createAbb(400, 400, 3), 3);
    expect(s4Abb.shieldLayers!).toBeGreaterThan(s1Abb.shieldLayers!);
    expect(s4Abb.shieldMaxHp!).toBeGreaterThan(s1Abb.shieldMaxHp!);
  });
});

// ---------------------------------------------------------------------------
// Feature 4 — Maximilian extending spinning blades
// ---------------------------------------------------------------------------
describe('M4.16 — Feature 4: Maximilian extending blades', () => {
  it('smoothly extends bladeExtend and bladeRadius during charge and whirlwind, retracting on recover', () => {
    const state = createGameState();
    const max = createMaximilian(500, 500, 0);
    const events: GameEvent[] = [];

    expect(getMaximilianTargetBladeExtend('recover')).toBe(0);
    expect(getMaximilianTargetBladeExtend('charge')).toBeGreaterThan(
      getMaximilianTargetBladeExtend('stalk'),
    );
    expect(getMaximilianTargetBladeExtend('whirlwind')).toBe(1.0);

    // Charge phase extends blades outward
    max.phase = 'charge';
    max.phaseTimer = 1.3;
    const startExtend = max.bladeExtend ?? 0;
    const startRadius = max.bladeRadius;
    for (let i = 0; i < 30; i++) {
      updateMaximilian(max, state.player, state.island, [], FIXED_DT, events);
    }
    expect(max.bladeExtend!).toBeGreaterThan(startExtend + 0.25);
    expect(max.bladeRadius).toBeGreaterThan(startRadius);

    // Whirlwind reaches full melee extension (~1.0)
    max.phase = 'whirlwind';
    max.phaseTimer = 1.8;
    for (let i = 0; i < 45; i++) {
      updateMaximilian(max, state.player, state.island, [], FIXED_DT, events);
    }
    expect(max.bladeExtend!).toBeGreaterThan(0.95);
    expect(max.bladeRadius).toBeGreaterThanOrEqual(88);

    // Recover retracts blades back toward 0
    max.phase = 'recover';
    max.phaseTimer = 0.9;
    for (let i = 0; i < 40; i++) {
      updateMaximilian(max, state.player, state.island, [], FIXED_DT, events);
    }
    expect(max.bladeExtend!).toBeLessThan(0.15);
  });
});

// ---------------------------------------------------------------------------
// Feature 5 — Taller non-Recogniser characters, Skullhead & Brainbot models
// ---------------------------------------------------------------------------
describe('M4.16 — Feature 5: Taller characters, Skullhead face & glass-domed Brainbot', () => {
  it('applies ~1.35x-1.5x vertical spacing multiplier to all characters except Recogniser (1.0x)', () => {
    expect(RECOGNISER_HEIGHT_MULTIPLIER).toBe(1.0);
    expect(CHARACTER_HEIGHT_MULTIPLIER).toBeGreaterThanOrEqual(1.35);
    expect(CHARACTER_HEIGHT_MULTIPLIER).toBeLessThanOrEqual(1.5);

    expect(getEntitySpacingMultiplier('recogniser')).toBe(1.0);
    for (const kind of [
      'hero',
      'enforcer_melee',
      'v_bot_melee',
      'v_bot_laser',
      'laser_shooter',
      'grenadier',
      'maximilian',
      'evil_otto',
      'abb',
      'skullhead',
      'bug_hive',
      'brainbot',
    ]) {
      expect(getEntitySpacingMultiplier(kind)).toBe(CHARACTER_HEIGHT_MULTIPLIER);
    }
  });

  it('builds taller 16-layer Skullhead and round glass-domed Brainbot models headlessly', () => {
    setCanvasFactory(fakeCanvasFactory());
    try {
      const models = buildAllModels();
      expect(models.skullhead.body.length).toBeGreaterThanOrEqual(16);
      expect(models.skullhead.halo.length).toBeGreaterThanOrEqual(3);
      expect(models.brainbot.length).toBeGreaterThanOrEqual(16);
    } finally {
      setCanvasFactory(null);
    }
  });
});

// ---------------------------------------------------------------------------
// Feature 6 — ABB 3-missile Sector 1 salvo + faster, dodgeable ICBM arcs
// ---------------------------------------------------------------------------
describe('M4.16 — Feature 6: ABB salvo scaling & dodgeable ICBM arcs', () => {
  it('fires 3 missiles in Sector 1 and scales up Math.min(8, 2 + sectorNum) in higher sectors', () => {
    expect(getAbbSalvoCount(0)).toBe(3); // Sector 1
    expect(getAbbSalvoCount(1)).toBe(4); // Sector 2
    expect(getAbbSalvoCount(2)).toBe(5); // Sector 3
    expect(getAbbSalvoCount(5)).toBe(8); // Sector 6
    expect(getAbbSalvoCount(10)).toBe(8); // Capped at 8

    const state = createGameState();
    const abbS1 = createAbb(500, 500, 0);
    abbS1.phase = 'missile_halt';
    abbS1.phaseTimer = 1.4;
    const events: GameEvent[] = [];
    const s1Fired: Projectile[] = [];
    for (let i = 0; i < 20; i++) {
      s1Fired.push(...updateAbb(abbS1, state.player, state.island, 0.05, events));
    }
    expect(s1Fired.filter((p) => p.icbm)).toHaveLength(3);

    const abbS3 = createAbb(500, 500, 2);
    abbS3.phase = 'missile_halt';
    abbS3.phaseTimer = 1.4;
    const s3Fired: Projectile[] = [];
    for (let i = 0; i < 20; i++) {
      s3Fired.push(...updateAbb(abbS3, state.player, state.island, 0.05, events));
    }
    expect(s3Fired.filter((p) => p.icbm)).toHaveLength(5);
  });

  it('enforces high ICBM speed (360-420 px/s) and tight angular turn-rate cap (1.1-1.4 rad/s)', () => {
    expect(ABB_ICBM_SPEED).toBeGreaterThanOrEqual(360);
    expect(ABB_ICBM_SPEED).toBeLessThanOrEqual(420);
    expect(ABB_ICBM_TURN_RATE).toBeGreaterThanOrEqual(1.1);
    expect(ABB_ICBM_TURN_RATE).toBeLessThanOrEqual(1.4);

    const missile: Projectile = {
      id: 'm416_icbm',
      owner: 'boss',
      kind: 'homing_drone',
      icbm: true,
      turnRate: ABB_ICBM_TURN_RATE,
      x: 200,
      y: 200,
      z: 18,
      vx: ABB_ICBM_SPEED,
      vy: 0,
      vz: 0,
      radius: 10,
      damage: 28,
      life: 5,
      maxLife: 5,
      bouncesLeft: 0,
      modifiers: [],
      color: '#e2e8f0',
    };
    const dt = 0.05;
    // Target perpendicular (90 deg south) -> heading turns by at most ABB_ICBM_TURN_RATE * dt
    steerGuidedIcbm(missile, 200, 600, dt);
    const angle = Math.atan2(missile.vy, missile.vx);
    expect(angle).toBeCloseTo(ABB_ICBM_TURN_RATE * dt, 4);
    expect(Math.hypot(missile.vx, missile.vy)).toBeCloseTo(ABB_ICBM_SPEED, 1);
  });
});

// ---------------------------------------------------------------------------
// Feature 7 — Full gamepad Pause Menu navigation
// ---------------------------------------------------------------------------
describe('M4.16 — Feature 7: Gamepad Pause Menu navigation', () => {
  it('wraps Up/Down cleanly across Resume/Restart/Gallery/Quit, activates on A, and resumes on Start/B', () => {
    const nav = createPauseMenuNav(PAUSE_MENU_ITEMS);
    expect(nav.getSelectedIndex()).toBe(0);

    // Up from 0 wraps cleanly to 3 ('quit')
    const rUp = nav.poll(
      gamepadSnapshotToPauseNavInput(parseGamepadSnapshot(makePad({ pressed: [12] }))),
      FIXED_DT,
    );
    expect(rUp.selectedIndex).toBe(3);
    expect(rUp.activated).toBeNull();
    expect(rUp.closed).toBe(false);

    // Release, then Down wraps cleanly from 3 back to 0 ('resume')
    nav.poll(gamepadSnapshotToPauseNavInput(parseGamepadSnapshot(makePad())), FIXED_DT);
    const rDownWrap = nav.poll(
      gamepadSnapshotToPauseNavInput(parseGamepadSnapshot(makePad({ pressed: [13] }))),
      FIXED_DT,
    );
    expect(rDownWrap.selectedIndex).toBe(0);

    // Left stick down moves to 1 ('restart'), then A (button 0) activates 'restart'
    nav.poll(gamepadSnapshotToPauseNavInput(parseGamepadSnapshot(makePad())), FIXED_DT);
    const rStickDown = nav.poll(
      gamepadSnapshotToPauseNavInput(parseGamepadSnapshot(makePad({ axes: [0, 0.85, 0, 0] }))),
      FIXED_DT,
    );
    expect(rStickDown.selectedIndex).toBe(1);

    const rConfirm = nav.poll(
      gamepadSnapshotToPauseNavInput(parseGamepadSnapshot(makePad({ pressed: [0] }))),
      FIXED_DT,
    );
    expect(rConfirm.activated).toBe('restart');
    expect(rConfirm.closed).toBe(false);

    // Start (button 9) immediately resumes/closes
    nav.poll(gamepadSnapshotToPauseNavInput(parseGamepadSnapshot(makePad())), FIXED_DT);
    const rStart = nav.poll(
      gamepadSnapshotToPauseNavInput(parseGamepadSnapshot(makePad({ pressed: [9] }))),
      FIXED_DT,
    );
    expect(rStart.closed).toBe(true);

    // B (button 1) also immediately resumes/closes
    nav.poll(gamepadSnapshotToPauseNavInput(parseGamepadSnapshot(makePad())), FIXED_DT);
    const rCancel = nav.poll(
      gamepadSnapshotToPauseNavInput(parseGamepadSnapshot(makePad({ pressed: [1] }))),
      FIXED_DT,
    );
    expect(rCancel.closed).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Feature 8 — Interactive Model Gallery controls & live telemetry readout
// ---------------------------------------------------------------------------
describe('M4.16 — Feature 8: Interactive Model Gallery controls', () => {
  it('clamps spacingPx to 1.0..8.0 in 0.1px increments and updates angle/autoSpin on WASD & Arrow keys', () => {
    expect(clampGallerySpacing(0.2)).toBe(GALLERY_MIN_SPACING);
    expect(clampGallerySpacing(99)).toBe(GALLERY_MAX_SPACING);
    expect(clampGallerySpacing(3.44)).toBe(3.4);

    let g = createGalleryControlState({ angleDeg: 180, spacingPx: 3.4, autoSpin: true });
    expect(formatGalleryTelemetry(g)).toBe(
      'STACK SPACING: 3.4px  |  PITCH Y: 0.64  |  ANGLE: 180°',
    );

    // W / ArrowUp increases spacing by 0.1px; S / ArrowDown decreases by 0.1px
    g = applyGalleryKeyPress(g, 'KeyW');
    expect(g.spacingPx).toBe(3.5);
    g = applyGalleryKeyPress(g, 'ArrowUp');
    expect(g.spacingPx).toBe(3.6);
    g = applyGalleryKeyPress(g, 'KeyS');
    expect(g.spacingPx).toBe(3.5);
    g = applyGalleryKeyPress(g, 'ArrowDown');
    expect(g.spacingPx).toBe(3.4);

    // A/D and Left/Right rotate smoothly and pause autoSpin
    const beforeAngle = g.angleDeg;
    g = stepGalleryControls(g, new Set(['KeyD']), 0.2);
    expect(g.autoSpin).toBe(false);
    expect(g.angleDeg).toBeGreaterThan(beforeAngle);

    const afterD = g.angleDeg;
    g = stepGalleryControls(g, new Set(['ArrowLeft']), 0.2);
    expect(g.angleDeg).toBeLessThan(afterD);

    // Space toggles auto-spin back on
    g = applyGalleryKeyPress(g, 'Space');
    expect(g.autoSpin).toBe(true);
    const spinStart = g.angleDeg;
    g = stepGalleryControls(g, new Set(), 0.25);
    expect(g.angleDeg).toBeGreaterThan(spinStart);
  });

  it('matches in-game spacing-to-scale proportions in the model gallery by default', () => {
    expect(GALLERY_DEFAULT_SPACING).toBe(2.8);
    // Hero in-game: scale 2.0, spacing 2.8 * 1.42
    const heroCardSpacing = computeGalleryCardSpacing(2.8, 'hero', 2.0, 1.0, 3.2);
    expect(heroCardSpacing / 3.2).toBeCloseTo((2.8 * CHARACTER_HEIGHT_MULTIPLIER) / 2.0, 4);
    // Boss (e.g. Skullhead) in-game: scale 4.8, spacing 2.8 * 1.42 * 1.5
    const bossCardSpacing = computeGalleryCardSpacing(2.8, 'skullhead', 4.8, 1.5, 3.6);
    expect(bossCardSpacing / 3.6).toBeCloseTo((2.8 * CHARACTER_HEIGHT_MULTIPLIER * 1.5) / 4.8, 4);
    // Recogniser in-game: scale 5.0, spacing 2.8 * 1.0 * 1.6
    const recCardSpacing = computeGalleryCardSpacing(2.8, 'recogniser', 5.0, 1.6, 3.8);
    expect(recCardSpacing / 3.8).toBeCloseTo((2.8 * RECOGNISER_HEIGHT_MULTIPLIER * 1.6) / 5.0, 4);
  });
});
