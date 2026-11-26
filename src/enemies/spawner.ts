import type {
  DifficultyConfig,
  EnemyState,
  PlatformIsland,
  Vec2,
} from '../engine/types';
import { createEnforcer } from './enforcer';
import { createGrenadier, createLaserShooter } from './shooter';

let spawnSequence = 0;

function nextEnemyId(prefix: string): string {
  spawnSequence += 1;
  return `${prefix}_${spawnSequence}`;
}

export function resetSpawnerCounter(): void {
  spawnSequence = 0;
}

/** Strict minimum distance from the hero spawn before any enemy may appear. */
export const SAFE_SPAWN_CLEARANCE = 260;
export const INITIAL_VANGUARD_MIN = 5;
export const INITIAL_VANGUARD_MAX = 8;

export interface HordeSpawnOptions {
  /** Hero world position used for the safe-spawn clearance check. */
  heroX?: number;
  heroY?: number;
  /** Override the default 260px clearance. */
  clearance?: number;
  /** Spawn a small 5–8 enemy vanguard instead of a full wave. */
  vanguard?: boolean;
}

/** Push a candidate spawn point out of the hero's safe bubble (never inward). */
function safeSpawnPoint(point: Vec2, options: HordeSpawnOptions): Vec2 {
  const { heroX, heroY } = options;
  if (heroX === undefined || heroY === undefined) return point;
  const clearance = options.clearance ?? SAFE_SPAWN_CLEARANCE;
  const dx = point.x - heroX;
  const dy = point.y - heroY;
  const dist = Math.hypot(dx, dy);
  if (dist >= clearance) return point;
  if (dist < 1e-4) {
    // Degenerate case: place the enemy due east of the hero.
    return { x: heroX + clearance, y: heroY };
  }
  const scale = clearance / dist;
  return { x: heroX + dx * scale, y: heroY + dy * scale };
}

/**
 * Collects active horde spawn points from temporary bridges (`active && spawnsHorde`)
 * and open synchronized sliding doors (`openFraction >= 0.5`).
 * If the island has horde bridges or doors defined, only active/open ones emit enemies.
 * If an island has neither bridges nor doors, falls back to perimeter spawn anchors.
 */
function getActiveSpawnPoints(island: PlatformIsland): Vec2[] {
  const points: Vec2[] = [];

  for (let i = 0; i < island.bridges.length; i++) {
    const bridge = island.bridges[i];
    if (bridge.active && bridge.spawnsHorde) {
      points.push({
        x: bridge.x + bridge.w * 0.5,
        y: bridge.y + bridge.h * 0.5,
      });
    }
  }

  for (let i = 0; i < island.doors.length; i++) {
    const door = island.doors[i];
    if (door.openFraction >= 0.5) {
      points.push({
        x: door.x + door.w * 0.5,
        y: door.y + door.h * 0.5,
      });
    }
  }

  const hasGateInfrastructure =
    island.bridges.some((b) => b.spawnsHorde) || island.doors.length > 0;

  if (points.length === 0 && !hasGateInfrastructure) {
    const { x, y, w, h } = island.bounds;
    const inset = 28;
    points.push(
      { x: x + w * 0.5, y: y + inset },
      { x: x + w * 0.5, y: y + h - inset },
      { x: x + inset, y: y + h * 0.5 },
      { x: x + w - inset, y: y + h * 0.5 },
    );
  }

  return points;
}

function countByKind(currentEnemies: EnemyState[]): { melee: number; ranged: number } {
  let melee = 0;
  let ranged = 0;
  for (let i = 0; i < currentEnemies.length; i++) {
    const e = currentEnemies[i];
    if (e.hp <= 0) continue;
    if (e.kind === 'enforcer_melee') melee += 1;
    else if (e.kind === 'laser_shooter' || e.kind === 'grenadier') ranged += 1;
  }
  return { melee, ranged };
}

/**
 * A deliberately small opening vanguard: mostly Enforcers with an occasional
 * ranged unit, all placed far across the island via active gates. No enemy is
 * ever inside SAFE_SPAWN_CLEARANCE of the hero.
 */
function spawnInitialVanguard(
  island: PlatformIsland,
  spawnPoints: Vec2[],
  config: DifficultyConfig,
  options: HordeSpawnOptions,
): EnemyState[] {
  const size =
    INITIAL_VANGUARD_MIN +
    ((spawnSequence + island.walls.length) % (INITIAL_VANGUARD_MAX - INITIAL_VANGUARD_MIN + 1));
  const vanguard: EnemyState[] = [];
  const goldenAngle = 2.399963229728653;
  for (let i = 0; i < size; i++) {
    const anchor = spawnPoints[i % spawnPoints.length];
    const far = safeSpawnPoint(
      {
        x: anchor.x + Math.cos(i * goldenAngle) * (18 + (i % 4) * 9),
        y: anchor.y + Math.sin(i * goldenAngle) * (18 + (i % 4) * 9),
      },
      options,
    );
    // Keep the opening squad melee-dominant; one shooter every 6th unit.
    vanguard.push(
      i > 0 && i % 6 === 0
        ? createLaserShooter(nextEnemyId('vng_sht'), far.x, far.y, config)
        : createEnforcer(nextEnemyId('vng_enf'), far.x, far.y, config),
    );
  }
  return vanguard;
}

/**
 * Spawns a horde wave of melee Enforcers, Laser Shooters, and Grenadiers
 * from active temporary bridges / open sliding doors while strictly respecting
 * `config.maxMeleeEnforcers` (200+) and `config.maxShootersAndGrenadiers` (50-100).
 *
 * When `options.heroX/heroY` are supplied, every spawn is pushed outside the
 * hero's safe bubble. `options.vanguard` produces the small opening squad.
 */
export function spawnHordeWave(
  island: PlatformIsland,
  currentEnemies: EnemyState[],
  config: DifficultyConfig,
  sectorIndex: number,
  options: HordeSpawnOptions = {},
): EnemyState[] {
  const spawnPoints = getActiveSpawnPoints(island);
  if (spawnPoints.length === 0) {
    return [];
  }

  if (options.vanguard) {
    return spawnInitialVanguard(island, spawnPoints, config, options);
  }

  const counts = countByKind(currentEnemies);
  const remainingMelee = Math.max(0, config.maxMeleeEnforcers - counts.melee);
  const remainingRanged = Math.max(
    0,
    config.maxShootersAndGrenadiers - counts.ranged,
  );

  if (remainingMelee === 0 && remainingRanged === 0) {
    return [];
  }

  const sector = Math.max(0, Math.floor(sectorIndex));
  const desiredMelee = 24 + sector * 12;
  const desiredRanged = 8 + sector * 4;

  const meleeToSpawn = Math.min(remainingMelee, desiredMelee);
  const rangedToSpawn = Math.min(remainingRanged, desiredRanged);

  const spawned: EnemyState[] = [];
  const goldenAngle = 2.399963229728653;

  // Spawn melee Tron Enforcers distributed across active bridges/gates
  for (let i = 0; i < meleeToSpawn; i++) {
    const anchor = spawnPoints[i % spawnPoints.length];
    const ringRadius = 10 + Math.sqrt(i % 25) * 10;
    const theta = i * goldenAngle;
    const far = safeSpawnPoint(
      {
        x: anchor.x + Math.cos(theta) * ringRadius,
        y: anchor.y + Math.sin(theta) * ringRadius,
      },
      options,
    );
    spawned.push(createEnforcer(nextEnemyId('enf'), far.x, far.y, config));
  }

  // Spawn Laser Shooters & Grenadiers (grenadier share scales slightly with sector)
  const grenadierRatio = Math.min(0.45, 0.3 + sector * 0.03);
  const grenadierCount = Math.floor(rangedToSpawn * grenadierRatio);
  const shooterCount = rangedToSpawn - grenadierCount;

  for (let i = 0; i < shooterCount; i++) {
    const anchor = spawnPoints[(meleeToSpawn + i) % spawnPoints.length];
    const ringRadius = 14 + Math.sqrt((i + 1) % 16) * 11;
    const theta = (meleeToSpawn + i) * goldenAngle;
    const far = safeSpawnPoint(
      {
        x: anchor.x + Math.cos(theta) * ringRadius,
        y: anchor.y + Math.sin(theta) * ringRadius,
      },
      options,
    );
    spawned.push(createLaserShooter(nextEnemyId('sht'), far.x, far.y, config));
  }

  for (let i = 0; i < grenadierCount; i++) {
    const anchor = spawnPoints[(meleeToSpawn + shooterCount + i) % spawnPoints.length];
    const ringRadius = 16 + Math.sqrt((i + 2) % 16) * 11;
    const theta = (meleeToSpawn + shooterCount + i) * goldenAngle;
    const far = safeSpawnPoint(
      {
        x: anchor.x + Math.cos(theta) * ringRadius,
        y: anchor.y + Math.sin(theta) * ringRadius,
      },
      options,
    );
    spawned.push(createGrenadier(nextEnemyId('grn'), far.x, far.y, config));
  }

  return spawned;
}
