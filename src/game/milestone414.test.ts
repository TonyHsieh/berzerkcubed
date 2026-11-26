import { describe, expect, it } from 'vitest';
import {
  ABB_ICBM_BLAST_RADIUS,
  ABB_ICBM_SPEED,
  ABB_ICBM_TURN_RATE,
  createAbb,
  steerGuidedIcbm,
  updateAbb,
} from '../bosses/abb';
import {
  createMaximilian,
  interceptProjectileWithAblativeShields,
} from '../bosses/maximilian';
import {
  computeSkullheadEyeLasers,
  createSkullhead,
  updateSkullhead,
} from '../bosses/skullhead';
import { createDifficultyConfig } from '../config/difficulty';
import {
  applyFreezeHit,
  FREEZE_HIT_SLOW,
  FREEZE_MAX_SLOW,
  FREEZE_RECOVERY_PER_SEC,
  getChillSpeedMultiplier,
  recoverChillSlow,
} from '../enemies/enemyUtils';
import { createEnforcer, updateEnforcers } from '../enemies/enforcer';
import { createDefaultInputState } from '../engine/input';
import { SpatialGrid } from '../engine/spatialGrid';
import type {
  CameraState,
  EnemyState,
  GameEvent,
  PlatformIsland,
  Projectile,
} from '../engine/types';
import { makeFakeCtx } from '../render/testCanvas';
import { VfxSystem } from '../render/vfx';
import { raycastSolidWalls } from '../world/worldSim';
import {
  createGameState,
  FIXED_DT,
  GRENADE_BLAST_RADIUS,
  LIGHTNING_FLASH_SEC,
  spawnBoss,
  stepGameState,
} from './gameState';

function makeProjectile(overrides: Partial<Projectile> = {}): Projectile {
  return {
    id: `m414_proj_${Math.random().toString(36).slice(2, 8)}`,
    owner: 'player',
    kind: 'bolt',
    x: 400,
    y: 400,
    z: 10,
    vx: 0,
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

function makeOpenIslandWithWall(): PlatformIsland {
  return {
    id: 'm414_test_island',
    bounds: { x: 0, y: 0, w: 1200, h: 1200 },
    outline: 'blue',
    hasPerimeterWalls: true,
    walls: [
      {
        id: 'blocking_wall',
        x: 500,
        y: 300,
        w: 40,
        h: 240,
        heightZ: 48,
        electrified: false,
        destructible: false,
      },
    ],
    doors: [
      {
        id: 'closed_door',
        x: 700,
        y: 300,
        w: 24,
        h: 200,
        syncGroup: 0,
        periodSec: 8,
        openFraction: 0.1,
      },
    ],
    bridges: [],
    crates: [
      {
        id: 'test_crate',
        x: 420,
        y: 420,
        angle: 0,
        radius: 18,
        hp: 40,
        maxHp: 40,
        hitFlash: 0,
      },
    ],
  };
}

describe('Milestone 4.14 — Section 1: Explosive Grenades (Player & Grenadier)', () => {
  it('detonates player grenade on landing (z <= 0) with radial AoE damage and explosion events', () => {
    const state = createGameState();
    state.enemies = [];
    state.island.walls = [];
    state.island.doors = [];
    state.island.crates = [];

    const nearEnemy = createEnforcer('e_near', 440, 400, state.config, 0);
    const farEnemy = createEnforcer('e_far', 700, 400, state.config, 0);
    nearEnemy.hp = 100;
    farEnemy.hp = 100;
    state.enemies.push(nearEnemy, farEnemy);

    state.playerProjectiles.push(
      makeProjectile({
        owner: 'player',
        kind: 'grenade',
        x: 400,
        y: 400,
        z: 1,
        vz: -200,
        damage: 50,
        life: 1.0,
        bouncesLeft: 1,
      }),
    );

    stepGameState(state, createDefaultInputState(), FIXED_DT);

    expect(GRENADE_BLAST_RADIUS).toBeGreaterThanOrEqual(85);
    expect(nearEnemy.hp).toBeLessThan(100);
    expect(farEnemy.hp).toBe(100);
    expect(state.events.some((e) => e.type === 'vfx_explosion')).toBe(true);
    expect(state.events.some((e) => e.type === 'vfx_shockwave')).toBe(true);
    expect(state.events.some((e) => e.type === 'camera_shake')).toBe(true);
    expect(state.events.some((e) => e.type === 'sfx' && e.sound === 'explosion')).toBe(true);
  });

  it('detonates grenade on wall impact and on fuse expiry (never silently vanishes)', () => {
    const state = createGameState();
    state.island = makeOpenIslandWithWall();
    state.enemies = [];

    // 1. Wall impact detonation
    state.playerProjectiles.push(
      makeProjectile({
        owner: 'player',
        kind: 'grenade',
        x: 495,
        y: 400,
        z: 20,
        vx: 300,
        vy: 0,
        vz: 10,
        damage: 45,
        life: 2.0,
      }),
    );
    stepGameState(state, createDefaultInputState(), FIXED_DT);
    expect(state.events.some((e) => e.type === 'vfx_explosion')).toBe(true);
    expect(state.events.some((e) => e.type === 'sfx' && e.sound === 'explosion')).toBe(true);
    expect(state.playerProjectiles).toHaveLength(0);

    // 2. Fuse expiry (life <= 0) while airborne -> still detonates and damages player if enemy grenade
    state.player.x = 300;
    state.player.y = 300;
    state.player.invulnTimer = 0;
    state.player.dodgeTimer = 0;
    const shieldBefore = state.player.shield;
    state.enemyProjectiles.push(
      makeProjectile({
        owner: 'enemy',
        kind: 'grenade',
        x: 330,
        y: 300,
        z: 45,
        vx: 0,
        vy: 0,
        vz: 50,
        damage: 25,
        life: 0.005,
        color: '#ff9500',
      }),
    );
    stepGameState(state, createDefaultInputState(), FIXED_DT);
    expect(state.player.shield).toBeLessThan(shieldBefore);
    expect(state.events.some((e) => e.type === 'vfx_explosion')).toBe(true);
    expect(state.events.some((e) => e.type === 'vfx_shockwave')).toBe(true);
  });
});

describe('Milestone 4.14 — Section 2: Maximilian (Thrown Sawblades & Layered Ablative Shields)', () => {
  it('throws spinning sawblade projectiles that erupt in bright metallic sparks on wall impact', () => {
    const state = createGameState();
    state.island = makeOpenIslandWithWall();
    state.enemies = [];
    const boss = spawnBoss(state, 'maximilian');
    boss.x = 350;
    boss.y = 400;
    boss.phase = 'stalk';
    boss.sawbladeCooldown = 0.01;
    state.player.x = 650;
    state.player.y = 400;

    // Step until Maximilian throws a sawblade toward the hero (through the wall at x=500)
    const spawnedSawblades: Projectile[] = [];
    let sawWallSpark = false;
    for (let i = 0; i < 60; i++) {
      stepGameState(state, createDefaultInputState(), FIXED_DT);
      for (const p of state.bossProjectiles) {
        if (p.kind === 'sawblade' && !spawnedSawblades.some((s) => s.id === p.id)) {
          spawnedSawblades.push(p);
        }
      }
      if (
        state.events.some(
          (e) =>
            e.type === 'vfx_explosion' &&
            (e.color === '#ffffff' || e.color === '#f59e0b'),
        ) &&
        state.events.some((e) => e.type === 'sfx' && e.sound === 'electric_zap')
      ) {
        sawWallSpark = true;
      }
    }

    expect(spawnedSawblades.length).toBeGreaterThanOrEqual(1);
    expect(sawWallSpark).toBe(true);
  });

  it('has multi-layer orbiting ablative shield plates that absorb shots before core damage', () => {
    const boss0 = createMaximilian(400, 400, 0);
    const boss2 = createMaximilian(400, 400, 2);
    expect(boss0.ablativePlates?.length).toBeGreaterThanOrEqual(8);
    const layers0 = new Set((boss0.ablativePlates ?? []).map((p) => p.layer));
    const layers2 = new Set((boss2.ablativePlates ?? []).map((p) => p.layer));
    expect(layers0.size).toBeGreaterThanOrEqual(2);
    expect(layers2.size).toBeGreaterThan(layers0.size);

    // Fire a shot directly at a shield plate -> plate absorbs it, flashes, and core HP is untouched
    const state = createGameState();
    state.enemies = [];
    state.island.walls = [];
    state.island.doors = [];
    state.island.crates = [];
    state.boss = createMaximilian(500, 500, 0);
    state.boss.phase = 'recover';
    const plate = state.boss.ablativePlates![0];
    const plateHpBefore = plate.hp;
    const bossHpBefore = state.boss.hp;

    const events: GameEvent[] = [];
    const shot = makeProjectile({
      owner: 'player',
      x: plate.x,
      y: plate.y,
      damage: 25,
    });
    const intercepted = interceptProjectileWithAblativeShields(state.boss, shot, events);
    expect(intercepted).toBe(true);
    expect(shot.life).toBe(0);
    expect(plate.hp).toBe(plateHpBefore - 25);
    expect(plate.hitFlash).toBeGreaterThan(0);
    expect(state.boss.hp).toBe(bossHpBefore);

    // Finish shattering the plate -> emits shield_break + cyan/crimson shards and removes plate
    const plateCountBefore = state.boss.ablativePlates!.length;
    const killShot = makeProjectile({
      owner: 'player',
      x: plate.x,
      y: plate.y,
      damage: plate.hp + 10,
    });
    expect(interceptProjectileWithAblativeShields(state.boss, killShot, events)).toBe(true);
    expect(state.boss.ablativePlates!.length).toBe(plateCountBefore - 1);
    expect(events.some((e) => e.type === 'sfx' && e.sound === 'shield_break')).toBe(true);
  });
});

describe('Milestone 4.14 — Section 3: ABB (RoboTank) Guided ICBM Missiles', () => {
  it('launches ICBM missiles radially in 360° spread and steers with capped angular turn rate', () => {
    const abb = createAbb(500, 500, 5); // Sector 6 -> 8-missile full 360° salvo
    const state = createGameState();
    state.player.x = 850;
    state.player.y = 500;
    const island = makeOpenIslandWithWall();
    const events: GameEvent[] = [];
    const missiles: Projectile[] = [];

    for (let i = 0; i < 60; i++) {
      missiles.push(...updateAbb(abb, state.player, island, 0.1, events));
    }

    const icbms = missiles.filter((m) => m.icbm === true);
    expect(icbms.length).toBeGreaterThanOrEqual(8);

    // Verify radial 360° spread (distinct launch headings spanning all 4 quadrants)
    const quadrants = new Set(
      icbms.map((m) => `${m.vx >= 0 ? '+' : '-'}${m.vy >= 0 ? '+' : '-'}`),
    );
    expect(quadrants.size).toBe(4);

    // Verify capped angular turn rate: heading changes by at most turnRate * dt
    const testMissile = makeProjectile({
      owner: 'boss',
      kind: 'homing_drone',
      icbm: true,
      turnRate: ABB_ICBM_TURN_RATE,
      x: 200,
      y: 200,
      vx: ABB_ICBM_SPEED,
      vy: 0, // pointing East (0 rad)
    });
    const dt = 0.05;
    // Target directly West (pi rad away)
    steerGuidedIcbm(testMissile, 0, 200, dt);
    const newAngle = Math.abs(Math.atan2(testMissile.vy, testMissile.vx));
    const maxAllowed = ABB_ICBM_TURN_RATE * dt + 1e-4;
    expect(newAngle).toBeGreaterThan(0);
    expect(newAngle).toBeLessThanOrEqual(maxAllowed);
    expect(Math.hypot(testMissile.vx, testMissile.vy)).toBeCloseTo(ABB_ICBM_SPEED, 1);
  });

  it('triggers heavy camera_shake (14-18) and large AoE explosion on wall/hero impact', () => {
    const state = createGameState();
    state.island = makeOpenIslandWithWall();
    state.enemies = [];
    state.player.x = 465;
    state.player.y = 400;
    state.player.invulnTimer = 0;
    state.player.dodgeTimer = 0;
    const shieldBefore = state.player.shield;

    // ICBM flying straight into the wall at x=500, within AoE blast radius of the hero
    state.bossProjectiles.push(
      makeProjectile({
        owner: 'boss',
        kind: 'homing_drone',
        icbm: true,
        blastRadius: ABB_ICBM_BLAST_RADIUS,
        x: 496,
        y: 400,
        vx: ABB_ICBM_SPEED,
        vy: 0,
        damage: 28,
        life: 3.0,
      }),
    );

    stepGameState(state, createDefaultInputState(), FIXED_DT);

    expect(state.player.shield).toBeLessThan(shieldBefore);
    const shake = state.events.find((e) => e.type === 'camera_shake');
    expect(shake).toBeDefined();
    if (shake && shake.type === 'camera_shake') {
      expect(shake.magnitude).toBeGreaterThanOrEqual(14);
      expect(shake.magnitude).toBeLessThanOrEqual(18);
      expect(shake.duration).toBeGreaterThanOrEqual(0.3);
    }
    expect(state.events.some((e) => e.type === 'vfx_shockwave')).toBe(true);
    expect(state.events.some((e) => e.type === 'sfx' && e.sound === 'explosion')).toBe(true);
  });
});

describe('Milestone 4.14 — Section 4: Floating Skullhead Wall-Blocked Eye Lasers & Sizzle', () => {
  it('clips both eye lasers at solid walls (no wall penetration) and emits sizzle events', () => {
    const island = makeOpenIslandWithWall();
    const state = createGameState();
    state.island = island;
    state.player.x = 640; // Behind the wall at x=500..540
    state.player.y = 400;
    state.player.invulnTimer = 0;
    const shieldBefore = state.player.shield;

    // Direct raycast check
    const ray = raycastSolidWalls(350, 400, 1, 0, 600, island);
    expect(ray.hit).toBe(true);
    expect(ray.x).toBeCloseTo(500, 1);

    // Skullhead positioned west of the wall aiming east directly at the player behind the wall
    const skull = createSkullhead(320, 400);
    skull.phase = 'eye_lasers';
    skull.phaseTimer = 1.0;
    skull.laserActiveTimer = 1.0;
    skull.laserSweepAngle = 0; // pointing directly +X (East)

    const beams = computeSkullheadEyeLasers(skull, island, state.player);
    expect(beams).toHaveLength(2);
    for (const b of beams) {
      expect(b.hitWall).toBe(true);
      expect(b.hitPlayer).toBe(false);
      expect(b.endX).toBeLessThanOrEqual(500.5);
    }

    // Running updateSkullhead with island emits sizzle events at the wall and does NOT damage hero behind wall
    const events: GameEvent[] = [];
    updateSkullhead(skull, state.player, 0.1, events, island);
    expect(state.player.shield).toBe(shieldBefore);
    expect(events.some((e) => e.type === 'vfx_sizzle')).toBe(true);
    expect(events.some((e) => e.type === 'sfx' && e.sound === 'electric_zap')).toBe(true);
  });
});

describe('Milestone 4.14 — Section 5: Hero Elemental Weapons (Flame, Freeze, Lightning)', () => {
  it('Flamethrower sets burnTimer, deals periodic fire DOT, and emits flame/smoke VFX', () => {
    const state = createGameState();
    state.enemies = [];
    state.island.walls = [];
    state.island.doors = [];
    state.island.crates = [];

    const victim = createEnforcer('burn_target', 500, 500, state.config, 0);
    victim.hp = 120;
    state.enemies.push(victim);

    state.playerProjectiles.push(
      makeProjectile({
        owner: 'player',
        kind: 'flame',
        x: 500,
        y: 500,
        damage: 9,
        radius: 10,
      }),
    );

    // Step 1: flame hits and ignites victim
    stepGameState(state, createDefaultInputState(), FIXED_DT);
    expect(victim.burnTimer).toBeGreaterThan(2.0);
    const hpAfterHit = victim.hp;

    // Advance 0.6s -> periodic fire DOT ticks and emits vfx_flame_smoke
    let sawFlameSmoke = false;
    for (let i = 0; i < 36; i++) {
      stepGameState(state, createDefaultInputState(), FIXED_DT);
      if (state.events.some((e) => e.type === 'vfx_flame_smoke')) {
        sawFlameSmoke = true;
      }
    }
    expect(victim.hp).toBeLessThan(hpAfterHit);
    expect(sawFlameSmoke).toBe(true);
  });

  it('Freeze applies exact cumulative +2% slow per hit (clamped 0.85) and -1%/sec recovery', () => {
    const cfg = createDifficultyConfig();
    const enemy = createEnforcer('chill_target', 500, 500, cfg, 0);
    const normalEnemy = createEnforcer('normal_target', 500, 600, cfg, 0);

    // 1 hit -> +0.02 slow
    applyFreezeHit(enemy);
    expect(enemy.chillSlow).toBeCloseTo(FREEZE_HIT_SLOW, 6);
    expect(getChillSpeedMultiplier(enemy)).toBeCloseTo(1 - 0.02, 6);

    // 9 more hits (10 total) -> 0.20 slow
    for (let i = 0; i < 9; i++) applyFreezeHit(enemy);
    expect(enemy.chillSlow).toBeCloseTo(0.20, 6);
    expect(getChillSpeedMultiplier(enemy)).toBeCloseTo(0.80, 6);

    // 1 second of recovery -> -0.01 (0.19)
    recoverChillSlow(enemy, 1.0);
    expect(enemy.chillSlow).toBeCloseTo(0.20 - FREEZE_RECOVERY_PER_SEC, 6);

    // Clamped at 0.85 max even after 100 hits
    for (let i = 0; i < 100; i++) applyFreezeHit(enemy);
    expect(enemy.chillSlow).toBeCloseTo(FREEZE_MAX_SLOW, 6);
    expect(getChillSpeedMultiplier(enemy)).toBeCloseTo(0.15, 6);

    // Verify enforcer movement speed actually scales down with chillSlow
    const state = createGameState();
    state.player.x = 900;
    state.player.y = 550;
    const grid = new SpatialGrid<EnemyState>(96);
    grid.insert(enemy);
    grid.insert(normalEnemy);
    updateEnforcers([enemy, normalEnemy], state.player, grid, state.island, cfg, 0.1);
    const chilledSpeed = Math.hypot(enemy.vx, enemy.vy);
    const normalSpeed = Math.hypot(normalEnemy.vx, normalEnemy.vy);
    expect(chilledSpeed).toBeLessThan(normalSpeed * 0.3);
  });

  it('Lightning chains to 2 * player.weapon.level nearby enemies with lightningFlashTimer > 0 and arcs', () => {
    const state = createGameState();
    state.enemies = [];
    state.island.walls = [];
    state.island.doors = [];
    state.island.crates = [];
    state.player.weapon.primary = 'bouncing_lightning';
    state.player.weapon.level = 2; // 2 * 2 = 4 chains expected!

    // Place 1 primary target + 5 nearby enemies (within 130px chain hops) + 1 far enemy
    const targets: EnemyState[] = [];
    for (let i = 0; i < 6; i++) {
      const e = createEnforcer(`zap_${i}`, 400 + i * 50, 400, state.config, 0);
      e.hp = 100;
      targets.push(e);
      state.enemies.push(e);
    }
    const farEnemy = createEnforcer('zap_far', 900, 900, state.config, 0);
    farEnemy.hp = 100;
    state.enemies.push(farEnemy);

    state.playerProjectiles.push(
      makeProjectile({
        owner: 'player',
        kind: 'lightning',
        x: 400,
        y: 400,
        damage: 24,
        radius: 8,
      }),
    );

    stepGameState(state, createDefaultInputState(), FIXED_DT);

    // Initial target + 4 chained targets = 5 total damaged & flashed
    const flashed = targets.filter((e) => (e.lightningFlashTimer ?? 0) > 0);
    expect(flashed.length).toBe(5); // 1 initial + 2*level(2) = 5
    expect(flashed[0].lightningFlashTimer).toBeLessThanOrEqual(LIGHTNING_FLASH_SEC);
    expect(targets[5].hp).toBe(100); // 6th enemy beyond 2*level cap is untouched
    expect(farEnemy.hp).toBe(100);

    const arcs = state.events.filter((e) => e.type === 'vfx_lightning_arc');
    expect(arcs.length).toBe(4);
  });

  it('VfxSystem handles shockwave, lightning_arc, flame_smoke, and sizzle events without throwing', () => {
    const vfx = new VfxSystem(256);
    const cam: CameraState = {
      x: 0,
      y: 0,
      angleDeg: 0,
      targetAngleDeg: 0,
      tiltScale: 1,
      layerSpacing: 2,
      shakeMag: 0,
      shakeTimer: 0,
    };
    const w2s = (x: number, y: number) => ({ x, y });
    vfx.handleEvent({ type: 'vfx_shockwave', x: 10, y: 20, z: 4, radius: 96, color: '#fb923c', rings: 3 });
    vfx.handleEvent({ type: 'vfx_lightning_arc', x1: 0, y1: 0, x2: 80, y2: 40, color: '#67e8f9' });
    vfx.handleEvent({ type: 'vfx_flame_smoke', x: 50, y: 50, z: 10 });
    vfx.handleEvent({ type: 'vfx_sizzle', x: 100, y: 100, z: 16 });
    expect(vfx.activeCount).toBeGreaterThan(0);

    const ctx = makeFakeCtx() as unknown as CanvasRenderingContext2D;
    vfx.update(0.05);
    expect(() => vfx.render(ctx, w2s, cam)).not.toThrow();
  });
});
