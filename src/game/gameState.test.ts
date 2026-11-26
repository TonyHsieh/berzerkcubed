import { describe, expect, it } from 'vitest';
import { createDifficultyConfig } from '../config/difficulty';
import { createEnforcer } from '../enemies/enforcer';
import { createGrenadier, createLaserShooter } from '../enemies/shooter';
import { createDefaultInputState } from '../engine/input';
import type { GameEvent, Projectile } from '../engine/types';
import { createCrate } from '../world/crate';
import {
  createGameState,
  createGameStateForSector,
  FIXED_DT,
  spawnBoss,
  stepGameState,
} from './gameState';

describe('Milestone 3 Integration — Full Headless Simulation Loop', () => {
  it('runs full 60Hz tick loop with 220+ Enforcers and 75 Shooters/Grenadiers without errors', () => {
    const config = createDifficultyConfig({
      maxMeleeEnforcers: 230,
      maxShootersAndGrenadiers: 80,
    });
    const state = createGameState(config);
    // Keep player invulnerable during swarm stress test so test stays focused on 300-unit simulation
    state.player.invulnTimer = 10;

    // Populate 225 melee Enforcers + 50 Laser Shooters + 25 Grenadiers (300 total)
    for (let i = 0; i < 225; i++) {
      const angle = (i / 225) * Math.PI * 2;
      const dist = 160 + (i % 6) * 35;
      state.enemies.push(
        createEnforcer(
          `stress_enf_${i}`,
          Math.cos(angle) * dist,
          Math.sin(angle) * dist,
          config,
        ),
      );
    }
    for (let i = 0; i < 50; i++) {
      const angle = (i / 50) * Math.PI * 2;
      state.enemies.push(
        createLaserShooter(
          `stress_sht_${i}`,
          Math.cos(angle) * 280,
          Math.sin(angle) * 280,
          config,
        ),
      );
    }
    for (let i = 0; i < 25; i++) {
      const angle = (i / 25) * Math.PI * 2;
      state.enemies.push(
        createGrenadier(
          `stress_grn_${i}`,
          Math.cos(angle) * 340,
          Math.sin(angle) * 340,
          config,
        ),
      );
    }

    expect(state.enemies.length).toBe(300);

    const input = createDefaultInputState();
    input.firing = true;
    input.mouseScreenX = 900;
    input.mouseScreenY = 360;

    for (let tick = 0; tick < 60; tick++) {
      stepGameState(state, input, FIXED_DT);
    }

    expect(Number.isFinite(state.player.x)).toBe(true);
    expect(Number.isFinite(state.player.y)).toBe(true);
    expect(state.elapsedTime).toBeCloseTo(1.0, 2);
    expect(state.enemies.every((e) => Number.isFinite(e.x) && Number.isFinite(e.y))).toBe(true);
    expect(state.enemies.length).toBeGreaterThanOrEqual(250);
  });

  it('projectile hits crate -> drops power-up -> hero collects -> weapon levels/combines', () => {
    const config = createDifficultyConfig();
    const state = createGameState(config);
    state.waveIndex = state.wavesPerSector; // prevent wave spawns during controlled test
    state.bossSpawned = true;
    state.island.crates = [createCrate('test_crate_1', 100, 0, 20, 0)];

    // Spawn a deterministic player projectile heading straight into the crate
    const shot: Projectile = {
      id: 'test_crate_shot',
      owner: 'player',
      kind: 'bolt',
      x: 70,
      y: 0,
      z: 14,
      vx: 600,
      vy: 0,
      vz: 0,
      radius: 6,
      damage: 25,
      life: 1.0,
      maxLife: 1.0,
      bouncesLeft: 0,
      modifiers: [],
      color: '#38bdf8',
    };
    state.playerProjectiles.push(shot);

    const idleInput = createDefaultInputState();
    let crateDestroyedEvent = false;

    for (let tick = 0; tick < 10; tick++) {
      stepGameState(state, idleInput, FIXED_DT);
      if (state.events.some((e) => e.type === 'crate_destroyed')) {
        crateDestroyedEvent = true;
      }
      if (state.pickups.length > 0) break;
    }

    expect(crateDestroyedEvent).toBe(true);
    expect(state.island.crates).toHaveLength(0);
    expect(state.pickups).toHaveLength(1);

    // Override dropped pickup to a deterministic weapon + add a duplicate & modifier pickup
    // at the hero's collection spot to verify full pickup -> applyPowerUp -> level/combine flow
    const dropped = state.pickups[0];
    dropped.kind = 'weapon';
    dropped.weaponType = 'spread';
    dropped.x = state.player.x;
    dropped.y = state.player.y;

    state.pickups.push(
      {
        id: 'det_lvl_up',
        x: state.player.x,
        y: state.player.y,
        z: 6,
        kind: 'weapon',
        weaponType: 'spread',
        life: 10,
      },
      {
        id: 'det_mod_freeze',
        x: state.player.x,
        y: state.player.y,
        z: 6,
        kind: 'modifier',
        modifier: 'freeze',
        life: 10,
      },
    );

    stepGameState(state, idleInput, FIXED_DT);

    expect(state.pickups).toHaveLength(0);
    expect(state.player.weapon.primary).toBe('spread');
    expect(state.player.weapon.level).toBe(2);
    expect(state.player.weapon.modifiers).toContain('freeze');
  });

  it('Recogniser leg destruction unlocks head damage inside the full simulation loop', () => {
    const config = createDifficultyConfig();
    const state = createGameStateForSector(1, config);
    state.waveIndex = state.wavesPerSector;
    state.player.invulnTimer = 10;

    const boss = spawnBoss(state, 'recogniser');
    // Place player safely away from boss hover path
    state.player.x = 0;
    state.player.y = 350;

    const head = boss.parts.find((p) => p.id === 'head_core')!;
    const leftLeg = boss.parts.find((p) => p.id === 'left_leg')!;
    const rightLeg = boss.parts.find((p) => p.id === 'right_leg')!;
    expect(head.vulnerable).toBe(false);

    const idle = createDefaultInputState();

    // 1. Fire directly at head_core while legs are intact -> must deal 0 damage
    state.playerProjectiles.push({
      id: 'rec_head_blocked',
      owner: 'player',
      kind: 'bolt',
      x: boss.x + head.offsetX,
      y: boss.y + head.offsetY,
      z: 14,
      vx: 0,
      vy: 0,
      vz: 0,
      radius: 8,
      damage: 100,
      life: 1.0,
      maxLife: 1.0,
      bouncesLeft: 0,
      modifiers: [],
      color: '#38bdf8',
    });
    stepGameState(state, idle, FIXED_DT);
    expect(head.hp).toBe(head.maxHp);
    expect(head.vulnerable).toBe(false);

    // 2. Destroy left_leg and right_leg via player projectiles in stepGameState
    state.playerProjectiles.push(
      {
        id: 'rec_hit_left',
        owner: 'player',
        kind: 'bolt',
        x: boss.x + leftLeg.offsetX,
        y: boss.y + leftLeg.offsetY,
        z: 14,
        vx: 0,
        vy: 0,
        vz: 0,
        radius: 8,
        damage: leftLeg.maxHp + 10,
        life: 1.0,
        maxLife: 1.0,
        bouncesLeft: 0,
        modifiers: [],
        color: '#38bdf8',
      },
      {
        id: 'rec_hit_right',
        owner: 'player',
        kind: 'bolt',
        x: boss.x + rightLeg.offsetX,
        y: boss.y + rightLeg.offsetY,
        z: 14,
        vx: 0,
        vy: 0,
        vz: 0,
        radius: 8,
        damage: rightLeg.maxHp + 10,
        life: 1.0,
        maxLife: 1.0,
        bouncesLeft: 0,
        modifiers: [],
        color: '#38bdf8',
      },
    );
    stepGameState(state, idle, FIXED_DT);

    expect(leftLeg.destroyed).toBe(true);
    expect(rightLeg.destroyed).toBe(true);
    expect(head.vulnerable).toBe(true);

    // 3. Now player projectile hitting head_core damages and defeats the Recogniser
    state.playerProjectiles.push({
      id: 'rec_head_kill',
      owner: 'player',
      kind: 'bolt',
      x: boss.x + head.offsetX,
      y: boss.y + head.offsetY,
      z: 14,
      vx: 0,
      vy: 0,
      vz: 0,
      radius: 8,
      damage: head.maxHp + 10,
      life: 1.0,
      maxLife: 1.0,
      bouncesLeft: 0,
      modifiers: [],
      color: '#38bdf8',
    });
    stepGameState(state, idle, FIXED_DT);

    expect(head.destroyed).toBe(true);
    expect(state.boss).toBeNull();
    expect(state.bossDefeated).toBe(true);
    expect(state.score).toBeGreaterThanOrEqual(1500);
  });

  it('triggers Evil Otto after ottoWarningSec and emits a Sinistar-style voice_taunt event', () => {
    const config = createDifficultyConfig({ ottoWarningSec: 1.0 });
    const state = createGameState(config);
    state.waveIndex = state.wavesPerSector;
    state.bossSpawned = true;
    state.bossDefeated = true;

    const idle = createDefaultInputState();
    const collectedEvents: GameEvent[] = [];

    // Step for 1.2s (72 ticks at 60Hz) past ottoWarningSec = 1.0s
    for (let tick = 0; tick < 72; tick++) {
      stepGameState(state, idle, FIXED_DT);
      collectedEvents.push(...state.events);
    }

    expect(state.ottoSpawned).toBe(true);
    expect(state.boss).not.toBeNull();
    expect(state.boss?.kind).toBe('evil_otto');

    const ottoTaunts = collectedEvents.filter(
      (e) => e.type === 'voice_taunt' && e.speaker === 'evil_otto',
    );
    expect(ottoTaunts.length).toBeGreaterThanOrEqual(1);
  });

  it('respects player dodge-roll i-frames and shield-first damage against enemy projectiles', () => {
    const config = createDifficultyConfig();
    const state = createGameState(config);
    state.waveIndex = state.wavesPerSector;
    state.bossSpawned = true;

    // Start a dodge-roll
    const dodgeInput = createDefaultInputState();
    dodgeInput.moveX = 1;
    dodgeInput.dodgePressed = true;
    stepGameState(state, dodgeInput, FIXED_DT);
    expect(state.player.dodgeTimer).toBeGreaterThan(0);

    // Enemy bolt overlapping rolling player must not deal damage
    state.enemyProjectiles.push({
      id: 'eb_iframe',
      owner: 'enemy',
      kind: 'bolt',
      x: state.player.x,
      y: state.player.y,
      z: 10,
      vx: 0,
      vy: 0,
      vz: 0,
      radius: 8,
      damage: 30,
      life: 1.0,
      maxLife: 1.0,
      bouncesLeft: 0,
      modifiers: [],
      color: '#ff2a55',
    });
    stepGameState(state, createDefaultInputState(), FIXED_DT);
    expect(state.player.shield).toBe(config.playerMaxShield);
    expect(state.player.hp).toBe(config.playerMaxHp);

    // End dodge-roll and hit player -> shield absorbs damage first
    state.player.dodgeTimer = 0;
    state.enemyProjectiles = [
      {
        id: 'eb_hit',
        owner: 'enemy',
        kind: 'bolt',
        x: state.player.x,
        y: state.player.y,
        z: 10,
        vx: 0,
        vy: 0,
        vz: 0,
        radius: 8,
        damage: 35,
        life: 1.0,
        maxLife: 1.0,
        bouncesLeft: 0,
        modifiers: [],
        color: '#ff2a55',
      },
    ];
    stepGameState(state, createDefaultInputState(), FIXED_DT);
    expect(state.player.shield).toBe(config.playerMaxShield - 35);
    expect(state.player.hp).toBe(config.playerMaxHp);
  });
});
