import { describe, expect, it } from 'vitest';
import { createDifficultyConfig } from '../config/difficulty';
import { createEnforcer } from '../enemies/enforcer';
import { createGrenadier, createLaserShooter } from '../enemies/shooter';
import { createDefaultInputState } from '../engine/input';
import type { GameEvent, Projectile } from '../engine/types';
import {
  INITIAL_VANGUARD_MAX,
  INITIAL_VANGUARD_MIN,
  SAFE_SPAWN_CLEARANCE,
  spawnHordeWave,
} from '../enemies/spawner';
import { addOrbital } from '../entities/orbitals';
import {
  damagePlayer,
  HERO_DEATH_DURATION,
  HERO_DEATH_PARTICLE_COUNT,
  HERO_REZ_DURATION,
  HERO_TELEFRAG_RADIUS,
} from '../entities/player';
import {
  applyModifierPickup,
  applyWeaponPickupToSlots,
} from '../entities/weapons';
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
    // This stress test seeds its own 300 enemies; clear the Milestone 4.1
    // opening vanguard so the population assertion stays exact.
    state.enemies.length = 0;
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
    // at the hero's collection spot. Weapon drops now require F to equip/level;
    // modifiers still auto-collect on walk-over.
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

    const equipInput = createDefaultInputState();
    equipInput.swapPressed = true;
    stepGameState(state, equipInput, FIXED_DT); // equip spread into an empty slot
    stepGameState(state, equipInput, FIXED_DT); // duplicate spread -> level 2

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

  it('F near a dropped weapon swaps a full inventory and drops the old weapon on the floor', () => {
    const config = createDifficultyConfig();
    const state = createGameStateForSector(0, config);
    const player = state.player;
    player.invulnTimer = 100;

    // Fill all three physical weapon slots.
    applyWeaponPickupToSlots(player, 'spread');
    applyWeaponPickupToSlots(player, 'machine_gun');
    expect(player.weaponSlots?.every((slot) => slot !== null)).toBe(true);
    const activeBefore = player.weapon.primary;

    state.pickups.push({
      id: 'f_drop',
      x: player.x,
      y: player.y,
      z: 0,
      kind: 'weapon',
      weaponType: 'grenade',
      life: 10,
    });

    stepGameState(state, createDefaultInputState(), FIXED_DT);
    // Dropped weapons never auto-collect.
    expect(state.nearbyWeaponPickup?.id).toBe('f_drop');
    expect(player.weapon.primary).toBe(activeBefore);

    const swapInput = createDefaultInputState();
    swapInput.swapPressed = true;
    stepGameState(state, swapInput, FIXED_DT);

    expect(player.weapon.primary).toBe('grenade');
    expect(state.toast?.text).toContain('DROPPED');
    expect(
      state.pickups.some(
        (pickup) => pickup.kind === 'weapon' && pickup.weaponType === activeBefore,
      ),
    ).toBe(true);
  });
});

describe('Milestone 4.1 — Safe spawn & effortless pickups', () => {
  it('opens with a small vanguard entirely outside the 260px hero bubble', () => {
    const state = createGameState(createDifficultyConfig());
    expect(state.enemies.length).toBeGreaterThanOrEqual(INITIAL_VANGUARD_MIN);
    expect(state.enemies.length).toBeLessThanOrEqual(INITIAL_VANGUARD_MAX);
    for (const e of state.enemies) {
      expect(Math.hypot(e.x - state.player.x, e.y - state.player.y)).toBeGreaterThanOrEqual(
        SAFE_SPAWN_CLEARANCE - 0.001,
      );
    }
  });

  it('routes later waves through gates without spawning inside the safe radius', () => {
    const state = createGameState(createDifficultyConfig());
    state.enemies.length = 0;
    const wave = spawnHordeWave(
      state.island,
      state.enemies,
      state.config,
      0,
      {
        heroX: state.player.x,
        heroY: state.player.y,
        clearance: SAFE_SPAWN_CLEARANCE,
      },
    );
    expect(wave.length).toBeGreaterThan(0);
    for (const e of wave) {
      expect(Math.hypot(e.x - state.player.x, e.y - state.player.y)).toBeGreaterThanOrEqual(
        SAFE_SPAWN_CLEARANCE - 0.001,
      );
    }
  });

  it('auto-collects a weapon into an open slot on walk-over without F', () => {
    const state = createGameStateForSector(0, createDifficultyConfig());
    state.enemies.length = 0;
    state.waveIndex = state.wavesPerSector;
    state.bossSpawned = true;
    state.pickups.push({
      id: 'auto_open',
      x: state.player.x,
      y: state.player.y,
      z: 0,
      kind: 'weapon',
      weaponType: 'spread',
      life: 10,
    });
    stepGameState(state, createDefaultInputState(), FIXED_DT);
    expect(state.player.weapon.primary).toBe('spread');
    expect(state.pickups).toHaveLength(0);
    expect(state.toast?.text).toContain('AUTO-EQUIPPED');
  });

  it('auto-upgrades a duplicate weapon on walk-over without F', () => {
    const state = createGameStateForSector(0, createDifficultyConfig());
    state.enemies.length = 0;
    state.waveIndex = state.wavesPerSector;
    state.bossSpawned = true;
    state.pickups.push(
      {
        id: 'auto_dup_1', x: state.player.x, y: state.player.y, z: 0,
        kind: 'weapon', weaponType: 'pulse_rifle', life: 10,
      },
      {
        id: 'auto_dup_2', x: state.player.x, y: state.player.y, z: 0,
        kind: 'weapon', weaponType: 'pulse_rifle', life: 10,
      },
    );
    stepGameState(state, createDefaultInputState(), FIXED_DT);
    expect(state.player.weapon.primary).toBe('pulse_rifle');
    expect(state.player.weapon.level).toBe(3);
    expect(state.pickups).toHaveLength(0);
  });
});

describe('Milestone 4.11 — Rez-In Protection & New Bosses Integration', () => {
  it('blocks player projectiles against rezzing enemies and bosses until rezTimer reaches 0', () => {
    const config = createDifficultyConfig();
    const state = createGameStateForSector(0, config);
    state.enemies.length = 0;
    state.waveIndex = state.wavesPerSector;
    state.player.invulnTimer = 10;

    const rezzingEnemy = createEnforcer('rez_test_e', 100, 0, config, 1.0);
    state.enemies.push(rezzingEnemy);
    const boss = spawnBoss(state, 'abb', { rezDuration: 1.0 });

    state.playerProjectiles.push(
      {
        id: 'shot_e',
        owner: 'player',
        kind: 'bolt',
        x: rezzingEnemy.x,
        y: rezzingEnemy.y,
        z: 10,
        vx: 0,
        vy: 0,
        vz: 0,
        radius: 8,
        damage: 999,
        life: 1,
        maxLife: 1,
        bouncesLeft: 0,
        modifiers: [],
        color: '#38bdf8',
      },
      {
        id: 'shot_b',
        owner: 'player',
        kind: 'bolt',
        x: boss.x,
        y: boss.y,
        z: 10,
        vx: 0,
        vy: 0,
        vz: 0,
        radius: 8,
        damage: 200,
        life: 1,
        maxLife: 1,
        bouncesLeft: 0,
        modifiers: [],
        color: '#38bdf8',
      },
    );

    const idle = createDefaultInputState();
    stepGameState(state, idle, FIXED_DT);
    expect(rezzingEnemy.hp).toBe(rezzingEnemy.maxHp);
    expect(boss.hp).toBe(boss.maxHp);
  });

  it('steps all four new bosses cleanly inside stepGameState', () => {
    const config = createDifficultyConfig();
    const idle = createDefaultInputState();
    for (const kind of ['abb', 'skullhead', 'bug_hive', 'brainbot'] as const) {
      const state = createGameStateForSector(2, config);
      state.enemies.length = 0;
      state.waveIndex = state.wavesPerSector;
      state.player.invulnTimer = 10;
      const boss = spawnBoss(state, kind);
      expect(boss.kind).toBe(kind);
      expect(boss.shieldLayers).toBeGreaterThanOrEqual(2);
      for (let t = 0; t < 20; t++) {
        stepGameState(state, idle, FIXED_DT);
      }
      expect(Number.isFinite(boss.x) && Number.isFinite(boss.y)).toBe(true);
    }
  });
});

describe('Milestone 4.12 — Hero Death Explosion, Full Loadout Reset & Telefrag Rez-In', () => {
  it('explodes in red dots, freezes input during deathTimer, resets loadout at death pos, stays invulnerable during rezTimer, and telefrags overlapping hostiles', () => {
    const config = createDifficultyConfig();
    const state = createGameStateForSector(0, config);
    state.enemies.length = 0;
    state.waveIndex = state.wavesPerSector;
    state.bossSpawned = true;

    const player = state.player;
    player.lives = 3;
    const deathX = player.x + 40;
    const deathY = player.y - 30;
    player.x = deathX;
    player.y = deathY;

    // Upgrade hero heavily before death: 3 weapon slots, modifiers, orbitals
    applyWeaponPickupToSlots(player, 'spread');
    applyWeaponPickupToSlots(player, 'spread');
    applyWeaponPickupToSlots(player, 'machine_gun');
    applyModifierPickup(player.weapon, 'freeze');
    applyModifierPickup(player.weapon, 'pierce');
    addOrbital(player, 'shooter_drone');
    addOrbital(player, 'lightsaber');
    expect(player.orbitals.length).toBe(2);
    expect(player.weapon.modifiers.length).toBe(2);

    // Lethal damage triggers death explosion (45-60 bright red particles)
    const hitEvents: GameEvent[] = [];
    damagePlayer(player, player.shield + player.hp + 50, config, hitEvents);
    expect(player.hp).toBe(0);
    expect(player.deathTimer).toBeCloseTo(HERO_DEATH_DURATION, 4);
    const redExplosion = hitEvents.find(
      (ev) => ev.type === 'vfx_explosion' && ev.count >= 45 && ev.count <= 60,
    );
    expect(redExplosion).toBeDefined();
    expect(hitEvents.some((ev) => ev.type === 'sfx' && ev.sound === 'explosion')).toBe(true);
    expect(hitEvents.some((ev) => ev.type === 'camera_shake')).toBe(true);

    // During deathTimer, player cannot move or shoot
    const activeInput = createDefaultInputState();
    activeInput.moveX = 1;
    activeInput.firing = true;
    stepGameState(state, activeInput, FIXED_DT);
    expect(player.x).toBeCloseTo(deathX, 4);
    expect(player.y).toBeCloseTo(deathY, 4);
    expect(state.playerProjectiles).toHaveLength(0);

    // Advance until deathTimer finishes -> transitions to rezTimer with full loadout reset
    const deathTicks = Math.ceil(HERO_DEATH_DURATION / FIXED_DT) + 2;
    for (let t = 0; t < deathTicks; t++) {
      stepGameState(state, activeInput, FIXED_DT);
      if ((player.rezTimer ?? 0) > 0) break;
    }

    expect(player.lives).toBe(2);
    expect(player.deathTimer).toBe(0);
    expect(player.rezTimer).toBeGreaterThan(0);
    expect(player.hp).toBe(config.playerMaxHp);
    expect(player.shield).toBe(config.playerMaxShield);
    expect(player.weapon.primary).toBe('pulse_rifle');
    expect(player.weapon.level).toBe(1);
    expect(player.weapon.modifiers).toHaveLength(0);
    expect(player.weaponSlots?.[0]?.primary).toBe('pulse_rifle');
    expect(player.weaponSlots?.[1]).toBeNull();
    expect(player.weaponSlots?.[2]).toBeNull();
    expect(player.orbitals).toHaveLength(0);
    expect(player.x).toBeCloseTo(deathX, 2);
    expect(player.y).toBeCloseTo(deathY, 2);

    // Place overlapping enemies, a far enemy, hostile projectiles, and an overlapping boss
    const nearEnemy = createEnforcer('tf_near', deathX + 20, deathY, config, 0);
    const farEnemy = createEnforcer('tf_far', deathX + HERO_TELEFRAG_RADIUS + 180, deathY, config, 0);
    state.enemies.push(nearEnemy, farEnemy);
    state.enemyProjectiles.push({
      id: 'tf_ep',
      owner: 'enemy',
      kind: 'bolt',
      x: deathX + 10,
      y: deathY,
      z: 10,
      vx: 0,
      vy: 0,
      vz: 0,
      radius: 6,
      damage: 40,
      life: 5,
      maxLife: 5,
      bouncesLeft: 0,
      modifiers: [],
      color: '#ff2a55',
    });
    const boss = spawnBoss(state, 'abb');
    boss.x = deathX + 30;
    boss.y = deathY;
    const bossHpBefore = boss.hp;

    // During rezTimer, hero is 100% invulnerable to direct damage
    const tookDuringRez = damagePlayer(player, 999, config, []);
    expect(tookDuringRez).toBe(false);
    expect(player.hp).toBe(config.playerMaxHp);

    // Finish rezTimer -> hero materializes and telefrags overlapping hostiles
    const rezTicks = Math.ceil(HERO_REZ_DURATION / FIXED_DT) + 2;
    for (let t = 0; t < rezTicks; t++) {
      stepGameState(state, createDefaultInputState(), FIXED_DT);
      if ((player.rezTimer ?? 0) <= 0) break;
    }

    expect(player.rezTimer).toBe(0);
    expect(player.invulnTimer).toBeGreaterThan(0); // 0.5s post-rez grace
    expect(player.rezHaloTimer).toBeGreaterThan(0); // 0.15s fading flash halo
    expect(state.enemies.some((e) => e.id === 'tf_near')).toBe(false);
    expect(state.enemies.some((e) => e.id === 'tf_far')).toBe(true);
    expect(state.enemyProjectiles.some((p) => p.id === 'tf_ep')).toBe(false);
    expect(boss.hp).toBeLessThan(bossHpBefore);
    expect(Math.hypot(boss.x - deathX, boss.y - deathY)).toBeGreaterThan(HERO_TELEFRAG_RADIUS);
  });

  it('plays the red-dot death explosion before Game Over when dying on final life (lives === 1)', () => {
    const config = createDifficultyConfig();
    const state = createGameStateForSector(0, config);
    state.enemies.length = 0;
    state.waveIndex = state.wavesPerSector;
    state.bossSpawned = true;
    state.player.lives = 1;

    const events: GameEvent[] = [];
    damagePlayer(state.player, state.player.shield + state.player.hp + 50, config, events);
    expect(
      events.some(
        (ev) => ev.type === 'vfx_explosion' && ev.count === HERO_DEATH_PARTICLE_COUNT,
      ),
    ).toBe(true);
    expect(state.player.deathTimer).toBeGreaterThan(0);
    expect(state.gameOver).toBe(false);

    // Still not game over mid-explosion
    stepGameState(state, createDefaultInputState(), FIXED_DT);
    expect(state.gameOver).toBe(false);

    // Once deathTimer finishes, transitions cleanly to Game Over
    const ticks = Math.ceil(HERO_DEATH_DURATION / FIXED_DT) + 2;
    for (let t = 0; t < ticks; t++) {
      stepGameState(state, createDefaultInputState(), FIXED_DT);
    }
    expect(state.player.lives).toBe(0);
    expect(state.gameOver).toBe(true);
  });
});
