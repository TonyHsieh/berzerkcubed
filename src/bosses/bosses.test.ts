import { describe, expect, it } from 'vitest';
import type {
  GameEvent,
  PlatformIsland,
  PlayerState,
  Projectile,
} from '../engine/types';
import { createAbb, updateAbb } from './abb';
import { applyHigherSectorBossScaling } from './bossUtils';
import { createBrainbot, updateBrainbot } from './brainbot';
import {
  createBugHive,
  interceptProjectileWithOrbitingBugs,
  updateBugHive,
} from './bugHive';
import { createEvilOtto, updateEvilOtto } from './evilOtto';
import { createMaximilian, isMaximilianVulnerable, updateMaximilian } from './maximilian';
import {
  createRecogniser,
  damageBossPart,
  updateRecogniser,
} from './recogniser';
import { createSkullhead, updateSkullhead } from './skullhead';

function makePlayer(x = 400, y = 400): PlayerState {
  return {
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    radius: 14,
    legAngle: 0,
    aimAngle: 0,
    runCycle: 0,
    hp: 100,
    maxHp: 100,
    shield: 100,
    maxShield: 100,
    shieldRegenDelay: 0,
    lives: 3,
    dodgeTimer: 0,
    dodgeCooldown: 0,
    dodgeDirX: 0,
    dodgeDirY: 0,
    invulnTimer: 0,
    lastSafeX: x,
    lastSafeY: y,
    recoil: 0,
    muzzleFlash: 0,
    weapon: {
      primary: 'pulse_rifle',
      level: 1,
      modifiers: [],
      fireCooldown: 0,
    },
    orbitals: [],
  };
}

function makeIsland(overrides: Partial<PlatformIsland> = {}): PlatformIsland {
  return {
    id: 'boss_arena',
    bounds: { x: 0, y: 0, w: 1200, h: 1200 },
    outline: 'red',
    hasPerimeterWalls: true,
    walls: [
      {
        id: 'safe_wall_1',
        x: 700,
        y: 350,
        w: 40,
        h: 120,
        heightZ: 48,
        electrified: false,
        destructible: false,
      },
    ],
    doors: [],
    bridges: [],
    crates: [
      {
        id: 'crate_1',
        x: 240,
        y: 400,
        angle: 0,
        radius: 18,
        hp: 50,
        maxHp: 50,
        hitFlash: 0,
      },
    ],
    ...overrides,
  };
}

function makeTestProjectile(
  id: string,
  x: number,
  y: number,
  overrides: Partial<Projectile> = {},
): Projectile {
  return {
    id,
    owner: 'player',
    kind: 'bolt',
    x,
    y,
    z: 10,
    vx: -200,
    vy: 0,
    vz: 0,
    radius: 6,
    damage: 20,
    life: 2,
    maxLife: 2,
    bouncesLeft: 0,
    modifiers: [],
    color: '#00f0ff',
    ...overrides,
  };
}

describe('Maximilian (Whirling Blades Boss)', () => {
  it('cycles through stalk -> charge -> whirlwind -> recover -> stalk', () => {
    const boss = createMaximilian(200, 400);
    const player = makePlayer(600, 400);
    const island = makeIsland({ crates: [] });
    const events: GameEvent[] = [];

    const seenPhases = new Set<string>([boss.phase]);
    const initialBladeAngle = boss.bladeAngle;

    for (let i = 0; i < 80; i++) {
      updateMaximilian(boss, player, island, [], 0.1, events);
      seenPhases.add(boss.phase);
    }

    expect(seenPhases.has('stalk')).toBe(true);
    expect(seenPhases.has('charge')).toBe(true);
    expect(seenPhases.has('whirlwind')).toBe(true);
    expect(seenPhases.has('recover')).toBe(true);
    expect(boss.bladeAngle).not.toBe(initialBladeAngle);
  });

  it('shreds player projectiles and destructible crates while leaving safe walls intact', () => {
    const boss = createMaximilian(220, 400);
    const player = makePlayer(600, 400);
    const island = makeIsland();
    const events: GameEvent[] = [];

    const projectiles: Projectile[] = [
      {
        id: 'p_near',
        owner: 'player',
        kind: 'bolt',
        x: 250,
        y: 400,
        z: 10,
        vx: -200,
        vy: 0,
        vz: 0,
        radius: 6,
        damage: 20,
        life: 2.0,
        maxLife: 2.0,
        bouncesLeft: 0,
        modifiers: [],
        color: '#00f0ff',
      },
      {
        id: 'p_far',
        owner: 'player',
        kind: 'bolt',
        x: 900,
        y: 900,
        z: 10,
        vx: 0,
        vy: 0,
        vz: 0,
        radius: 6,
        damage: 20,
        life: 2.0,
        maxLife: 2.0,
        bouncesLeft: 0,
        modifiers: [],
        color: '#00f0ff',
      },
    ];

    updateMaximilian(boss, player, island, projectiles, 0.05, events);

    // Near projectile and crate within bladeRadius are shredded
    expect(projectiles[0].life).toBe(0);
    expect(projectiles[1].life).toBe(2.0);
    expect(island.crates[0].hp).toBe(0);
    expect(events.some((e) => e.type === 'crate_destroyed')).toBe(true);
    // Permanent safe walls remain completely intact
    expect(island.walls).toHaveLength(1);
    expect(island.walls[0].id).toBe('safe_wall_1');
  });

  it('damages player on blade contact but respects dodge-roll i-frames', () => {
    const boss = createMaximilian(400, 400);
    const rollingPlayer = makePlayer(420, 400);
    rollingPlayer.dodgeTimer = 0.2;
    const island = makeIsland({ crates: [] });
    const events: GameEvent[] = [];

    updateMaximilian(boss, rollingPlayer, island, [], 0.05, events);
    expect(rollingPlayer.shield).toBe(100);
    expect(rollingPlayer.hp).toBe(100);

    // Once dodge-roll finishes, blade contact deals damage (shield first)
    rollingPlayer.dodgeTimer = 0;
    updateMaximilian(boss, rollingPlayer, island, [], 0.05, events);
    expect(rollingPlayer.shield).toBeLessThan(100);
  });

  it('only blocks frontal projectiles while stalking, leaving flanks and rear exposed', () => {
    // Player is east of the boss, so Maximilian faces east (angle 90°).
    const boss = createMaximilian(400, 400);
    const player = makePlayer(600, 400);
    const island = makeIsland({ crates: [] });
    const events: GameEvent[] = [];

    const frontal = makeTestProjectile('front', 440, 400);
    const rear = makeTestProjectile('rear', 360, 400);
    const flank = makeTestProjectile('flank', 400, 360);

    updateMaximilian(boss, player, island, [frontal, rear, flank], 0.05, events);

    expect(boss.angle).toBe(90);
    expect(frontal.life).toBe(0); // frontal bolt shredded
    expect(rear.life).toBe(2); // rear bolt reaches the core
    expect(flank.life).toBe(2); // flank bolt reaches the core
  });

  it('is fully vulnerable from every angle during the recover phase', () => {
    const boss = createMaximilian(400, 400);
    boss.phase = 'recover';
    boss.phaseTimer = 1;
    boss.bladeRadius = 34;
    const player = makePlayer(600, 400);
    const island = makeIsland({ crates: [] });
    const events: GameEvent[] = [];

    const bolts = [
      makeTestProjectile('front', 430, 400),
      makeTestProjectile('rear', 370, 400),
      makeTestProjectile('flank', 400, 370),
    ];
    updateMaximilian(boss, player, island, bolts, 0.05, events);

    expect(bolts.every((b) => b.life > 0)).toBe(true);
    expect(boss.bladeRadius).toBeLessThan(58);
  });

  it('lets beams, lightning, grenades and pierce rounds punch through the whirlwind', () => {
    const boss = createMaximilian(400, 400);
    boss.phase = 'whirlwind';
    boss.phaseTimer = 1;
    boss.bladeRadius = 70;
    const player = makePlayer(600, 400);
    const island = makeIsland({ crates: [] });
    const events: GameEvent[] = [];

    const bolts = [
      makeTestProjectile('bolt', 450, 400),
      makeTestProjectile('beam', 450, 400, { kind: 'beam_segment' }),
      makeTestProjectile('lightning', 450, 400, { kind: 'lightning' }),
      makeTestProjectile('grenade', 450, 400, { kind: 'grenade' }),
      makeTestProjectile('pierce', 450, 400, { modifiers: ['pierce'] }),
    ];
    updateMaximilian(boss, player, island, bolts, 0.05, events);

    expect(bolts[0].life).toBe(0); // standard bolt still shredded
    expect(bolts.slice(1).every((b) => b.life > 0)).toBe(true);
  });
});

describe('Recogniser (Destructible Legs -> Head, Sky-Slam & Sky-Bombs)', () => {
  it('blocks damage to head_core until both destructible legs are destroyed', () => {
    const boss = createRecogniser(500, 500);
    // Clear universal Sector 1 shield to test part-level leg->head lock directly
    boss.shieldLayers = 0;
    boss.shieldHp = 0;
    const events: GameEvent[] = [];

    const head = boss.parts.find((p) => p.id === 'head_core')!;
    const leftLeg = boss.parts.find((p) => p.id === 'left_leg')!;
    const rightLeg = boss.parts.find((p) => p.id === 'right_leg')!;

    expect(head.vulnerable).toBe(false);

    // Direct hit on head_core while legs are alive must deal 0 damage
    const headHitBlocked = damageBossPart(
      boss,
      boss.x + head.offsetX,
      boss.y + head.offsetY,
      100,
      events,
    );
    expect(headHitBlocked).toBe(false);
    expect(head.hp).toBe(head.maxHp);

    // Destroy left leg -> head still locked
    const leftHit = damageBossPart(
      boss,
      boss.x + leftLeg.offsetX,
      boss.y + leftLeg.offsetY,
      leftLeg.maxHp,
      events,
    );
    expect(leftHit).toBe(true);
    expect(leftLeg.destroyed).toBe(true);
    expect(head.vulnerable).toBe(false);

    // Destroy right leg -> head_core unlocks!
    const rightHit = damageBossPart(
      boss,
      boss.x + rightLeg.offsetX,
      boss.y + rightLeg.offsetY,
      rightLeg.maxHp,
      events,
    );
    expect(rightHit).toBe(true);
    expect(rightLeg.destroyed).toBe(true);
    expect(head.vulnerable).toBe(true);
    expect(events.some((e) => e.type === 'voice_taunt')).toBe(true);

    // Now head_core takes full damage until boss is defeated
    const headHitAfter = damageBossPart(
      boss,
      boss.x + head.offsetX,
      boss.y + head.offsetY,
      head.maxHp,
      events,
    );
    expect(headHitAfter).toBe(true);
    expect(head.destroyed).toBe(true);
    expect(boss.hp).toBe(0);
  });

  it('executes hover_barrage, sky-slam with growing shadow, homing drones, and sky-bombs', () => {
    const boss = createRecogniser(300, 300);
    const player = makePlayer(450, 450);
    const events: GameEvent[] = [];
    const allProjectiles: Projectile[] = [];
    const seenPhases = new Set<string>([boss.phase]);
    let maxSlamProgress = 0;
    let maxZ = boss.z;

    for (let i = 0; i < 100; i++) {
      const spawned = updateRecogniser(boss, player, 0.1, events);
      allProjectiles.push(...spawned);
      seenPhases.add(boss.phase);
      if ((boss.slamProgress ?? 0) > maxSlamProgress) {
        maxSlamProgress = boss.slamProgress ?? 0;
      }
      if (boss.z > maxZ) maxZ = boss.z;
    }

    expect(seenPhases.has('hover_barrage')).toBe(true);
    expect(seenPhases.has('sky_slam_ascend')).toBe(true);
    expect(seenPhases.has('sky_slam_drop')).toBe(true);
    expect(seenPhases.has('sky_bomb_run')).toBe(true);
    expect(seenPhases.has('recover')).toBe(true);

    expect(maxSlamProgress).toBeGreaterThan(0.5);
    expect(maxZ).toBeGreaterThan(150);
    expect(allProjectiles.some((p) => p.kind === 'homing_drone')).toBe(true);
    expect(allProjectiles.some((p) => p.kind === 'sky_bomb')).toBe(true);
    expect(allProjectiles.some((p) => p.kind === 'bolt')).toBe(true);
    expect(
      events.some((e) => e.type === 'sfx' && e.sound === 'slam_impact'),
    ).toBe(true);
  });
});

describe('Evil Otto (Sinistar-Style Taunt & Mega Man-Style Returning Variants)', () => {
  it('reconstructs with a Sinistar-style taunt while invulnerable, then pursues', () => {
    const otto = createEvilOtto(200, 200, 0);
    const player = makePlayer(500, 500);
    const events: GameEvent[] = [];

    expect(otto.reconstructing).toBe(true);
    expect(otto.phase).toBe('reconstructing');

    // Invulnerable while reconstructing
    expect(damageBossPart(otto, otto.x, otto.y, 100, events)).toBe(false);

    // First update emits Sinistar-style voice taunt once
    updateEvilOtto(otto, player, 0.1, events);
    const tauntsAfter1 = events.filter((e) => e.type === 'voice_taunt');
    expect(tauntsAfter1).toHaveLength(1);
    expect(tauntsAfter1[0].speaker).toBe('evil_otto');

    // Complete reconstruction
    for (let i = 0; i < 30; i++) {
      updateEvilOtto(otto, player, 0.1, events);
    }

    expect(otto.reconstructing).toBe(false);
    expect(otto.phase).toBe('pursue');
    // Taunt was only emitted once
    expect(events.filter((e) => e.type === 'voice_taunt')).toHaveLength(1);
    // Otto moves toward player once active
    expect(otto.x).toBeGreaterThan(200);
  });

  it('returns in progressively larger, differently powered variants across sectors', () => {
    const classic = createEvilOtto(100, 100, 0);
    const volt = createEvilOtto(100, 100, 1);
    const cryo = createEvilOtto(100, 100, 2);
    const vortex = createEvilOtto(100, 100, 3);
    const mk2 = createEvilOtto(100, 100, 4);

    expect(classic.ottoVariant).toBe('classic');
    expect(volt.ottoVariant).toBe('volt');
    expect(cryo.ottoVariant).toBe('cryo');
    expect(vortex.ottoVariant).toBe('vortex');
    expect(mk2.ottoVariant).toBe('classic');

    // Progressively larger & stronger bodies
    expect(volt.radius).toBeGreaterThan(classic.radius);
    expect(cryo.radius).toBeGreaterThan(volt.radius);
    expect(vortex.radius).toBeGreaterThan(cryo.radius);
    expect(mk2.maxHp).toBeGreaterThan(classic.maxHp);
  });

  it('executes distinct Mega Man-style variant attacks for Volt, Cryo, and Vortex Otto', () => {
    const runToAbility = (sectorIndex: number) => {
      const otto = createEvilOtto(200, 200, sectorIndex);
      const player = makePlayer(900, 200);
      const startPlayerX = player.x;
      const events: GameEvent[] = [];
      const projectiles: Projectile[] = [];

      // Advance past reconstruction (2.5s) + pursue (2.2s) + into ability phase
      for (let i = 0; i < 65; i++) {
        projectiles.push(...updateEvilOtto(otto, player, 0.1, events));
      }
      return { otto, player, startPlayerX, projectiles, events };
    };

    const voltRun = runToAbility(1);
    expect(voltRun.projectiles.some((p) => p.kind === 'lightning')).toBe(true);
    expect(
      voltRun.projectiles.some((p) => p.modifiers.includes('lightning_chain')),
    ).toBe(true);

    const cryoRun = runToAbility(2);
    expect(
      cryoRun.projectiles.some((p) => p.modifiers.includes('freeze')),
    ).toBe(true);

    const vortexRun = runToAbility(3);
    expect(vortexRun.projectiles.some((p) => p.kind === 'homing_drone')).toBe(
      true,
    );
    // Vortex-Otto pulls player closer during ability phase
    expect(vortexRun.player.x).toBeLessThan(vortexRun.startPlayerX);
  });
});

describe('Milestone 4.1 Fix 6 — Maximilian blade-shield & vulnerability', () => {
  it('starts shielded and only exposes the core while blades are retracted', () => {
    const boss = createMaximilian(400, 400);
    expect(boss.maxHp).toBeGreaterThanOrEqual(1200);
    expect(boss.shieldHp).toBe(boss.shieldMaxHp);
    expect(isMaximilianVulnerable(boss)).toBe(false);

    boss.phase = 'recover';
    boss.shieldHp = 0;
    expect(isMaximilianVulnerable(boss)).toBe(true);
  });

  it('drains the shield with sustained fire and opens a recover window', () => {
    const boss = createMaximilian(400, 400);
    boss.phase = 'whirlwind';
    boss.phaseTimer = 20;
    boss.bladeRadius = 70;
    const player = makePlayer(600, 400);
    const island = makeIsland({ crates: [] });
    const events: GameEvent[] = [];
    const shieldMax = boss.shieldMaxHp ?? 260;

    // Repeated frontal standard bolts chip away at the meter until it breaks.
    for (let i = 0; i < 60 && !isMaximilianVulnerable(boss); i++) {
      const bolt = makeTestProjectile(`chip_${i}`, 440, 400);
      updateMaximilian(boss, player, island, [bolt], 0.05, events);
      boss.phase = 'whirlwind';
      boss.phaseTimer = 20;
    }
    expect(boss.shieldHp).toBeLessThan(shieldMax);
    expect(events.some((e) => e.type === 'sfx' && e.sound === 'electric_zap')).toBe(true);
  });

  it('heavy rounds survive the guard and drain more shield than bolts', () => {
    const boss = createMaximilian(400, 400);
    boss.phase = 'whirlwind';
    boss.phaseTimer = 20;
    boss.bladeRadius = 70;
    const player = makePlayer(600, 400);
    const island = makeIsland({ crates: [] });
    const events: GameEvent[] = [];
    const before = boss.shieldHp ?? 0;

    const beam = makeTestProjectile('beam_drain', 450, 400, { kind: 'beam_segment', damage: 40 });
    updateMaximilian(boss, player, island, [beam], 0.05, events);
    expect(beam.life).toBeGreaterThan(0);
    expect(boss.shieldHp).toBeLessThan(before);
  });
});

describe('Milestone 4.11 — Boss Overhaul (2-Leg Recogniser, Multi-Layer Shields, Rampage)', () => {
  it('builds a 2-legged larger Recogniser with distinct left_leg and right_leg geometry', () => {
    const rec = createRecogniser(500, 500);
    const left = rec.parts.find((p) => p.id === 'left_leg')!;
    const right = rec.parts.find((p) => p.id === 'right_leg')!;
    expect(rec.radius).toBeGreaterThanOrEqual(60);
    expect(left.offsetX).toBeLessThan(-30);
    expect(right.offsetX).toBeGreaterThan(30);
  });

  it('applies higher-sector HP scaling, regenerating multi-layer shields, and periodic rampage invulnerability', () => {
    const rec = applyHigherSectorBossScaling(createRecogniser(500, 500), 2);
    const base = createRecogniser(500, 500);
    const player = makePlayer(700, 500);
    const events: GameEvent[] = [];

    expect(rec.maxHp).toBeGreaterThan(base.maxHp);
    expect(rec.shieldLayers).toBeGreaterThanOrEqual(2);
    expect(rec.maxShieldLayers).toBe(rec.shieldLayers);

    // Damage hits the shield layer first before touching boss parts
    const left = rec.parts.find((p) => p.id === 'left_leg')!;
    const startLayers = rec.shieldLayers!;
    const layerHp = rec.shieldLayerHp!;
    damageBossPart(rec, rec.x + left.offsetX, rec.y + left.offsetY, layerHp + 10, events);
    expect(rec.shieldLayers).toBe(startLayers - 1);
    expect(left.hp).toBe(left.maxHp);

    // Trigger rampage invulnerability and verify damage is blocked during rampage
    rec.rampageCooldown = 0.05;
    updateRecogniser(rec, player, 0.1, events);
    expect(rec.rampageTimer).toBeGreaterThan(0);
    const hpBefore = rec.hp;
    const shieldBefore = rec.shieldHp;
    expect(damageBossPart(rec, rec.x + left.offsetX, rec.y + left.offsetY, 100, events)).toBe(false);
    expect(rec.hp).toBe(hpBefore);
    expect(rec.shieldHp).toBe(shieldBefore);

    // Advance past rampage duration -> returns to normal vulnerability
    for (let i = 0; i < 40; i++) {
      updateRecogniser(rec, player, 0.1, events);
    }
    expect(rec.rampageTimer).toBe(0);
  });
});

describe('Milestone 4.11 — Four New Bosses (ABB, Skullhead, Bug Hive, Brainbot)', () => {
  it('ABB performs dodge-dash repositioning then launches a 360-degree ring of homing missiles', () => {
    const abb = createAbb(400, 400, 5); // Sector 6 -> full 8-missile salvo ring
    const player = makePlayer(700, 400);
    const island = makeIsland({ crates: [] });
    const events: GameEvent[] = [];
    const seenPhases = new Set<string>([abb.phase]);
    const missiles: Projectile[] = [];
    let sawDash = false;

    for (let i = 0; i < 60; i++) {
      const fired = updateAbb(abb, player, island, 0.1, events);
      missiles.push(...fired);
      seenPhases.add(abb.phase);
      if ((abb.dashTimer ?? 0) > 0) sawDash = true;
    }

    expect(seenPhases.has('dodge_dash')).toBe(true);
    expect(seenPhases.has('missile_halt')).toBe(true);
    expect(sawDash).toBe(true);
    expect(missiles.filter((p) => p.kind === 'homing_drone').length).toBeGreaterThanOrEqual(8);
  });

  it('Skullhead telegraphs then fires twin sweeping eye-laser beams', () => {
    const skull = createSkullhead(400, 400);
    const player = makePlayer(720, 400);
    const events: GameEvent[] = [];
    const beams: Projectile[] = [];
    let sawTelegraph = false;
    let sawSweep = false;

    for (let i = 0; i < 60; i++) {
      beams.push(...updateSkullhead(skull, player, 0.1, events));
      if ((skull.laserTelegraphTimer ?? 0) > 0) sawTelegraph = true;
      if ((skull.laserActiveTimer ?? 0) > 0) sawSweep = true;
    }

    expect(sawTelegraph).toBe(true);
    expect(sawSweep).toBe(true);
    expect(beams.filter((p) => p.kind === 'beam_segment').length).toBeGreaterThanOrEqual(4);
  });

  it('Bug Hive maintains orbiting Flying Bug Bots that intercept shots, swoop, and replenish', () => {
    const hive = createBugHive(400, 400);
    const player = makePlayer(650, 400);
    const events: GameEvent[] = [];

    expect(hive.orbitingBugs?.length).toBeGreaterThanOrEqual(6);

    // Incoming shot hitting an orbiting bug is intercepted and destroys/damages the bug
    const targetBug = hive.orbitingBugs![0];
    const shot = makeTestProjectile('bug_shot', targetBug.x, targetBug.y, { damage: 60 });
    const intercepted = interceptProjectileWithOrbitingBugs(hive, shot, events);
    expect(intercepted).toBe(true);
    expect(shot.life).toBe(0);
    expect(hive.orbitingBugs!.length).toBe(5);

    // Run through orbit_shield -> swoop_attack -> replenish
    let sawSwoop = false;
    for (let i = 0; i < 75; i++) {
      updateBugHive(hive, player, 0.1, events);
      if (hive.orbitingBugs?.some((b) => b.state === 'swoop')) sawSwoop = true;
    }
    expect(sawSwoop).toBe(true);
    expect(hive.orbitingBugs!.length).toBeGreaterThan(5);
  });

  it('Brainbot rolls rapidly and fires ground-hugging crackling electricity waves', () => {
    const brain = createBrainbot(400, 400);
    const player = makePlayer(720, 400);
    const island = makeIsland({ crates: [] });
    const events: GameEvent[] = [];
    const waves: Projectile[] = [];

    for (let i = 0; i < 50; i++) {
      waves.push(...updateBrainbot(brain, player, island, 0.1, events));
    }

    const elecWaves = waves.filter((p) => p.kind === 'electric_wave');
    expect(elecWaves.length).toBeGreaterThanOrEqual(5);
    expect(elecWaves.every((p) => p.z <= 4)).toBe(true);
  });
});
