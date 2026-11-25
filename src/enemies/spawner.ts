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

/**
 * Spawns a horde wave of melee Enforcers, Laser Shooters, and Grenadiers
 * from active temporary bridges / open sliding doors while strictly respecting
 * `config.maxMeleeEnforcers` (200+) and `config.maxShootersAndGrenadiers` (50-100).
 */
export function spawnHordeWave(
  island: PlatformIsland,
  currentEnemies: EnemyState[],
  config: DifficultyConfig,
  sectorIndex: number,
): EnemyState[] {
  const spawnPoints = getActiveSpawnPoints(island);
  if (spawnPoints.length === 0) {
    return [];
  }

  let existingMelee = 0;
  let existingRanged = 0;
  for (let i = 0; i < currentEnemies.length; i++) {
    const e = currentEnemies[i];
    if (e.hp <= 0) continue;
    if (e.kind === 'enforcer_melee') {
      existingMelee += 1;
    } else if (e.kind === 'laser_shooter' || e.kind === 'grenadier') {
      existingRanged += 1;
    }
  }

  const remainingMelee = Math.max(0, config.maxMeleeEnforcers - existingMelee);
  const remainingRanged = Math.max(
    0,
    config.maxShootersAndGrenadiers - existingRanged,
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
    const sx = anchor.x + Math.cos(theta) * ringRadius;
    const sy = anchor.y + Math.sin(theta) * ringRadius;
    spawned.push(createEnforcer(nextEnemyId('enf'), sx, sy, config));
  }

  // Spawn Laser Shooters & Grenadiers (grenadier share scales slightly with sector)
  const grenadierRatio = Math.min(0.45, 0.3 + sector * 0.03);
  const grenadierCount = Math.floor(rangedToSpawn * grenadierRatio);
  const shooterCount = rangedToSpawn - grenadierCount;

  for (let i = 0; i < shooterCount; i++) {
    const anchor = spawnPoints[(meleeToSpawn + i) % spawnPoints.length];
    const ringRadius = 14 + Math.sqrt((i + 1) % 16) * 11;
    const theta = (meleeToSpawn + i) * goldenAngle;
    const sx = anchor.x + Math.cos(theta) * ringRadius;
    const sy = anchor.y + Math.sin(theta) * ringRadius;
    spawned.push(createLaserShooter(nextEnemyId('sht'), sx, sy, config));
  }

  for (let i = 0; i < grenadierCount; i++) {
    const anchor =
      spawnPoints[(meleeToSpawn + shooterCount + i) % spawnPoints.length];
    const ringRadius = 16 + Math.sqrt((i + 2) % 16) * 11;
    const theta = (meleeToSpawn + shooterCount + i) * goldenAngle;
    const sx = anchor.x + Math.cos(theta) * ringRadius;
    const sy = anchor.y + Math.sin(theta) * ringRadius;
    spawned.push(createGrenadier(nextEnemyId('grn'), sx, sy, config));
  }

  return spawned;
}
