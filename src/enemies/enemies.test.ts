import { describe, expect, it } from 'vitest';
import { createDifficultyConfig } from '../config/difficulty';
import type {
  EnemyState,
  GameEvent,
  PlatformIsland,
  PlayerState,
} from '../engine/types';
import {
  createEnforcer,
  type SpatialQueryGrid,
  updateEnforcers,
} from './enforcer';
import {
  createGrenadier,
  createLaserShooter,
  updateRangedEnemies,
} from './shooter';
import { resetSpawnerCounter, spawnHordeWave } from './spawner';

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
    id: 'test_island',
    bounds: { x: 0, y: 0, w: 1200, h: 1200 },
    outline: 'blue',
    hasPerimeterWalls: true,
    walls: [],
    doors: [],
    bridges: [
      {
        id: 'bridge_north',
        x: 560,
        y: 20,
        w: 80,
        h: 40,
        active: true,
        spawnsHorde: true,
      },
      {
        id: 'bridge_east',
        x: 1140,
        y: 560,
        w: 40,
        h: 80,
        active: true,
        spawnsHorde: true,
      },
    ],
    crates: [],
    ...overrides,
  };
}

/** Lightweight spatial hash grid for headless unit testing. */
class TestSpatialGrid implements SpatialQueryGrid<EnemyState> {
  private readonly cellSize: number;
  private readonly buckets = new Map<string, EnemyState[]>();

  constructor(cellSize = 64) {
    this.cellSize = cellSize;
  }

  clear(): void {
    this.buckets.clear();
  }

  insert(item: EnemyState): void {
    const cx = Math.floor(item.x / this.cellSize);
    const cy = Math.floor(item.y / this.cellSize);
    const key = `${cx},${cy}`;
    let list = this.buckets.get(key);
    if (!list) {
      list = [];
      this.buckets.set(key, list);
    }
    list.push(item);
  }

  queryRadius(x: number, y: number, radius: number): EnemyState[] {
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);
    const out: EnemyState[] = [];
    for (let cx = minCx; cx <= maxCx; cx++) {
      for (let cy = minCy; cy <= maxCy; cy++) {
        const list = this.buckets.get(`${cx},${cy}`);
        if (list) {
          for (let i = 0; i < list.length; i++) {
            out.push(list[i]);
          }
        }
      }
    }
    return out;
  }
}

describe('Enforcers (200+ melee swarm & spatial separation)', () => {
  it('updates 220+ enforcers chasing player and separates overlapping units', () => {
    const config = createDifficultyConfig();
    const player = makePlayer(600, 600);
    const island = makeIsland();
    const grid = new TestSpatialGrid(64);

    // Spawn 220 enforcers clustered tightly at the same spot
    const enforcers: EnemyState[] = [];
    for (let i = 0; i < 220; i++) {
      enforcers.push(createEnforcer(`enf_${i}`, 250, 250, config));
    }

    const initialDist = Math.hypot(player.x - 250, player.y - 250);

    for (let step = 0; step < 30; step++) {
      grid.clear();
      for (const e of enforcers) grid.insert(e);
      updateEnforcers(enforcers, player, grid, island, config, 1 / 60);
    }

    // Swarm should advance toward player
    const avgX = enforcers.reduce((s, e) => s + e.x, 0) / enforcers.length;
    const avgY = enforcers.reduce((s, e) => s + e.y, 0) / enforcers.length;
    expect(Math.hypot(player.x - avgX, player.y - avgY)).toBeLessThan(
      initialDist,
    );

    // Spatial separation should spread them out from a single point
    const uniquePositions = new Set(
      enforcers.map((e) => `${Math.round(e.x)},${Math.round(e.y)}`),
    );
    expect(uniquePositions.size).toBeGreaterThan(150);
  });

  it('slows frozen enforcers and blocks them on solid walls', () => {
    const config = createDifficultyConfig();
    const player = makePlayer(500, 300);
    const island = makeIsland({
      walls: [
        {
          id: 'wall_mid',
          x: 360,
          y: 250,
          w: 30,
          h: 100,
          heightZ: 40,
          electrified: false,
          destructible: false,
        },
      ],
    });
    const grid = new TestSpatialGrid(64);

    const normal = createEnforcer('normal', 200, 120, config);
    const frozen = createEnforcer('frozen', 200, 180, config);
    frozen.freezeTimer = 2.0;

    const blocked = createEnforcer('blocked', 345, 300, config);
    const list = [normal, frozen, blocked];

    for (let step = 0; step < 20; step++) {
      grid.clear();
      for (const e of list) grid.insert(e);
      updateEnforcers(list, player, grid, island, config, 1 / 60);
    }

    const normalDist = Math.hypot(normal.x - 200, normal.y - 120);
    const frozenDist = Math.hypot(frozen.x - 200, frozen.y - 180);
    expect(normalDist).toBeGreaterThan(frozenDist * 2.2);
    expect(frozen.freezeTimer).toBeLessThan(2.0);
    // Blocked enforcer should remain to the left of the wall (x <= 360 - radius)
    expect(blocked.x).toBeLessThanOrEqual(360 - blocked.radius + 0.5);
  });
});

describe('Ranged Enemies (Laser Shooters & Grenadiers)', () => {
  it('laser shooter telegraphs before firing a dodgeable plasma bolt', () => {
    const config = createDifficultyConfig();
    const player = makePlayer(400, 400);
    const island = makeIsland();
    const shooter = createLaserShooter('sht_1', 180, 400, config);
    shooter.fireCooldown = 0;
    const events: GameEvent[] = [];

    // First tick initiates telegraph, does not immediately fire
    const firstTick = updateRangedEnemies(
      [shooter],
      player,
      island,
      config,
      0.1,
      events,
    );
    expect(firstTick).toHaveLength(0);
    expect(shooter.telegraphTimer).toBeGreaterThan(0);

    // Advance through telegraph duration to fire
    const fired: ReturnType<typeof updateRangedEnemies> = [];
    for (let i = 0; i < 10; i++) {
      fired.push(
        ...updateRangedEnemies([shooter], player, island, config, 0.1, events),
      );
    }

    expect(fired.length).toBeGreaterThanOrEqual(1);
    expect(fired[0].owner).toBe('enemy');
    expect(fired[0].kind).toBe('bolt');
    expect(fired[0].vx).toBeGreaterThan(0);
    expect(events.some((e) => e.type === 'sfx' && e.sound === 'shoot')).toBe(
      true,
    );
  });

  it('grenadier lobs a Z-arcing grenade with ground target coordinates', () => {
    const config = createDifficultyConfig();
    const player = makePlayer(520, 400);
    const island = makeIsland();
    const grenadier = createGrenadier('grn_1', 220, 400, config);
    grenadier.fireCooldown = 0;
    const events: GameEvent[] = [];

    const fired: ReturnType<typeof updateRangedEnemies> = [];
    for (let i = 0; i < 10; i++) {
      fired.push(
        ...updateRangedEnemies(
          [grenadier],
          player,
          island,
          config,
          0.1,
          events,
        ),
      );
    }

    expect(fired.length).toBeGreaterThanOrEqual(1);
    const grenade = fired[0];
    expect(grenade.owner).toBe('enemy');
    expect(grenade.kind).toBe('grenade');
    expect(grenade.vz).toBeGreaterThan(0);
    expect(grenade.targetX).toBe(player.x);
    expect(grenade.targetY).toBe(player.y);
  });

  it('supports 75 simultaneous shooters and grenadiers cleanly', () => {
    const config = createDifficultyConfig();
    const player = makePlayer(600, 600);
    const island = makeIsland();
    const ranged: EnemyState[] = [];
    for (let i = 0; i < 50; i++) {
      ranged.push(createLaserShooter(`s_${i}`, 200 + (i % 10) * 30, 200, config));
    }
    for (let i = 0; i < 25; i++) {
      ranged.push(createGrenadier(`g_${i}`, 200 + (i % 10) * 30, 900, config));
    }

    const events: GameEvent[] = [];
    let totalProjectiles = 0;
    for (let step = 0; step < 30; step++) {
      totalProjectiles += updateRangedEnemies(
        ranged,
        player,
        island,
        config,
        0.1,
        events,
      ).length;
    }

    expect(totalProjectiles).toBeGreaterThan(0);
  });
});

describe('Horde Spawner (Bridge/Gate Spawning & Caps)', () => {
  it('enforces maxMeleeEnforcers (200+) and maxShootersAndGrenadiers (50-100) caps', () => {
    resetSpawnerCounter();
    const config = createDifficultyConfig({
      maxMeleeEnforcers: 210,
      maxShootersAndGrenadiers: 65,
    });
    const island = makeIsland();
    const activeEnemies: EnemyState[] = [];

    // Repeatedly spawn waves across high sectors until caps are saturated
    for (let wave = 0; wave < 20; wave++) {
      const added = spawnHordeWave(island, activeEnemies, config, wave);
      activeEnemies.push(...added);
    }

    const meleeCount = activeEnemies.filter(
      (e) => e.kind === 'enforcer_melee',
    ).length;
    const rangedCount = activeEnemies.filter(
      (e) => e.kind === 'laser_shooter' || e.kind === 'grenadier',
    ).length;

    expect(meleeCount).toBe(210);
    expect(rangedCount).toBe(65);

    // One more wave when already at cap must spawn 0 enemies
    expect(spawnHordeWave(island, activeEnemies, config, 10)).toHaveLength(0);
  });

  it('spawns 0 enemies when all horde bridges are inactive and doors are closed', () => {
    const config = createDifficultyConfig();
    const island = makeIsland({
      bridges: [
        {
          id: 'b_closed',
          x: 500,
          y: 0,
          w: 80,
          h: 40,
          active: false,
          spawnsHorde: true,
        },
      ],
      doors: [
        {
          id: 'd_closed',
          x: 0,
          y: 500,
          w: 24,
          h: 90,
          syncGroup: 0,
          periodSec: 4,
          openFraction: 0.1,
        },
      ],
    });

    const spawned = spawnHordeWave(island, [], config, 2);
    expect(spawned).toHaveLength(0);

    // Opening the synchronized door allows spawning
    island.doors[0].openFraction = 0.9;
    const spawnedAfterOpen = spawnHordeWave(island, [], config, 2);
    expect(spawnedAfterOpen.length).toBeGreaterThan(0);
  });

  it('ignores dead enemies (hp <= 0) when computing remaining cap budget', () => {
    const config = createDifficultyConfig({
      maxMeleeEnforcers: 10,
      maxShootersAndGrenadiers: 5,
    });
    const island = makeIsland();
    const deadEnforcers = Array.from({ length: 10 }, (_, i) => {
      const e = createEnforcer(`dead_${i}`, 100, 100, config);
      e.hp = 0;
      return e;
    });

    const spawned = spawnHordeWave(island, deadEnforcers, config, 1);
    const newMelee = spawned.filter((e) => e.kind === 'enforcer_melee').length;
    expect(newMelee).toBe(10);
  });
});
