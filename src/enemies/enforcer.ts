import type {
  DifficultyConfig,
  EnemyState,
  PlatformIsland,
  PlayerState,
} from '../engine/types';
import {
  hashToUnit,
  resolveEnemyAgainstIsland,
  vectorToAngleDeg,
} from './enemyUtils';

/**
 * Structural interface matching Worktree 2's SpatialGrid<T> contract
 * so Worktree 3 compiles cleanly in isolation and integrates seamlessly.
 */
export interface SpatialQueryGrid<
  T extends { id: string; x: number; y: number; radius: number },
> {
  queryRadius(x: number, y: number, radius: number): T[];
  clear?(): void;
  insert?(item: T): void;
}

export const ENFORCER_RADIUS = 13;
const FROZEN_SPEED_MULT = 0.35;
const SEPARATION_WEIGHT = 1.65;
const STEER_RESPONSIVENESS = 10;

export function createEnforcer(
  id: string,
  x: number,
  y: number,
  config: DifficultyConfig,
): EnemyState {
  return {
    id,
    kind: 'enforcer_melee',
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    radius: ENFORCER_RADIUS,
    angle: 0,
    animFrame: hashToUnit(id) * 4,
    hp: config.enforcerHp,
    maxHp: config.enforcerHp,
    fireCooldown: 0,
    telegraphTimer: 0,
    freezeTimer: 0,
    hitFlash: 0,
  };
}

/**
 * Updates 200+ melee Tron Enforcers with player-chasing flank steering,
 * O(1)-grid spatial separation, freeze slow, and world wall/crate collision.
 */
export function updateEnforcers(
  enemies: EnemyState[],
  player: PlayerState,
  grid: SpatialQueryGrid<EnemyState>,
  island: PlatformIsland,
  config: DifficultyConfig,
  dt: number,
): void {
  if (dt <= 0) return;

  const blend = Math.min(1, dt * STEER_RESPONSIVENESS);

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy.kind !== 'enforcer_melee' || enemy.hp <= 0) continue;

    if (enemy.hitFlash > 0) {
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    }

    const isFrozen = enemy.freezeTimer > 0;
    if (isFrozen) {
      enemy.freezeTimer = Math.max(0, enemy.freezeTimer - dt);
    }

    const effectiveSpeed =
      config.enforcerSpeed * (isFrozen ? FROZEN_SPEED_MULT : 1);

    // 1. Seek vector toward player with subtle per-enemy flanking angle at mid/far range
    const toPlayerX = player.x - enemy.x;
    const toPlayerY = player.y - enemy.y;
    const distToPlayer = Math.hypot(toPlayerX, toPlayerY);

    let seekX = 0;
    let seekY = 0;
    if (distToPlayer > 1e-4) {
      const dirX = toPlayerX / distToPlayer;
      const dirY = toPlayerY / distToPlayer;

      // Taper flank angle to 0 as enforcer closes in for melee contact
      const flankScale = Math.min(1, Math.max(0, (distToPlayer - 65) / 140));
      const flankRad = (hashToUnit(enemy.id) - 0.5) * 0.95 * flankScale; // ~±27°
      const cosF = Math.cos(flankRad);
      const sinF = Math.sin(flankRad);
      seekX = dirX * cosF - dirY * sinF;
      seekY = dirX * sinF + dirY * cosF;
    }

    // 2. Spatial separation against nearby neighbors via SpatialGrid
    const sepQueryRadius = enemy.radius * 2.5;
    const neighbors = grid.queryRadius(enemy.x, enemy.y, sepQueryRadius);
    let sepX = 0;
    let sepY = 0;
    let sepCount = 0;

    for (let j = 0; j < neighbors.length; j++) {
      const other = neighbors[j];
      if (other === enemy || other.id === enemy.id || other.hp <= 0) continue;

      const dx = enemy.x - other.x;
      const dy = enemy.y - other.y;
      const minDist = enemy.radius + other.radius + 3;
      const distSq = dx * dx + dy * dy;

      if (distSq < minDist * minDist) {
        if (distSq > 1e-6) {
          const dist = Math.sqrt(distSq);
          const strength = (minDist - dist) / minDist;
          sepX += (dx / dist) * strength;
          sepY += (dy / dist) * strength;
        } else {
          // Deterministic tie-breaker when two enemies share identical coordinates
          const tieAngle = hashToUnit(`${enemy.id}:${other.id}`) * Math.PI * 2;
          sepX += Math.cos(tieAngle);
          sepY += Math.sin(tieAngle);
        }
        sepCount++;
      }
    }

    if (sepCount > 0) {
      const sepMag = Math.hypot(sepX, sepY);
      if (sepMag > 1e-4) {
        // Cap separation magnitude while preserving direction
        const clampedMag = Math.min(2.0, sepMag);
        sepX = (sepX / sepMag) * clampedMag;
        sepY = (sepY / sepMag) * clampedMag;
      }
    }

    // 3. Combine seek + separation into desired velocity
    let desiredX = seekX + sepX * SEPARATION_WEIGHT;
    let desiredY = seekY + sepY * SEPARATION_WEIGHT;
    const desiredMag = Math.hypot(desiredX, desiredY);
    if (desiredMag > 1e-4) {
      desiredX = (desiredX / desiredMag) * effectiveSpeed;
      desiredY = (desiredY / desiredMag) * effectiveSpeed;
    } else {
      desiredX = 0;
      desiredY = 0;
    }

    enemy.vx += (desiredX - enemy.vx) * blend;
    enemy.vy += (desiredY - enemy.vy) * blend;

    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;

    // 4. World containment (walls, closed doors, crates, perimeter)
    resolveEnemyAgainstIsland(enemy, island);

    // 5. Facing & 4-frame animation cycle
    const speed = Math.hypot(enemy.vx, enemy.vy);
    if (speed > 2) {
      enemy.angle = vectorToAngleDeg(enemy.vx, enemy.vy);
    } else if (distToPlayer > 1e-4) {
      enemy.angle = vectorToAngleDeg(toPlayerX, toPlayerY);
    }
    enemy.animFrame = (enemy.animFrame + dt * (isFrozen ? 3 : 8)) % 4;
  }
}
