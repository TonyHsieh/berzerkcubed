import type { PlatformIsland, Rect } from '../engine/types';

/**
 * Converts a 2D world direction vector (dx, dy) to Approach B world degrees
 * where 0° = North (0, -1), 90° = East (1, 0), 180° = South (0, 1), 270° = West (-1, 0).
 */
export function vectorToAngleDeg(dx: number, dy: number): number {
  return ((Math.atan2(dx, -dy) * 180) / Math.PI + 360) % 360;
}

/**
 * Deterministic 32-bit FNV-1a hash for stable per-entity flanking/stagger offsets.
 */
export function hashString(str: string): number {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Returns a deterministic float in [0, 1) from a string key.
 */
export function hashToUnit(str: string): number {
  return (hashString(str) % 10000) / 10000;
}

/**
 * Pushes a circle entity out of an axis-aligned rectangle if overlapping.
 */
export function resolveCircleVsRect(
  entity: { x: number; y: number; radius: number },
  rect: Rect,
): boolean {
  const closestX = Math.max(rect.x, Math.min(entity.x, rect.x + rect.w));
  const closestY = Math.max(rect.y, Math.min(entity.y, rect.y + rect.h));
  const dx = entity.x - closestX;
  const dy = entity.y - closestY;
  const distSq = dx * dx + dy * dy;

  if (distSq >= entity.radius * entity.radius) {
    return false;
  }

  if (distSq > 1e-8) {
    const dist = Math.sqrt(distSq);
    const push = entity.radius - dist;
    entity.x += (dx / dist) * push;
    entity.y += (dy / dist) * push;
    return true;
  }

  // Center is inside rect: push out through the nearest edge.
  const leftDist = entity.x - rect.x;
  const rightDist = rect.x + rect.w - entity.x;
  const topDist = entity.y - rect.y;
  const bottomDist = rect.y + rect.h - entity.y;
  const minDist = Math.min(leftDist, rightDist, topDist, bottomDist);

  if (minDist === leftDist) {
    entity.x = rect.x - entity.radius;
  } else if (minDist === rightDist) {
    entity.x = rect.x + rect.w + entity.radius;
  } else if (minDist === topDist) {
    entity.y = rect.y - entity.radius;
  } else {
    entity.y = rect.y + rect.h + entity.radius;
  }
  return true;
}

/**
 * Resolves a circle entity against solid island walls, closed sliding doors,
 * intact destructible crates, and perimeter bounds (when perimeter walls exist).
 */
export function resolveEnemyAgainstIsland(
  entity: { x: number; y: number; radius: number },
  island: PlatformIsland,
  ignoreCrates = false,
): void {
  for (let i = 0; i < island.walls.length; i++) {
    resolveCircleVsRect(entity, island.walls[i]);
  }

  for (let i = 0; i < island.doors.length; i++) {
    const door = island.doors[i];
    if (door.openFraction < 0.7) {
      resolveCircleVsRect(entity, door);
    }
  }

  if (!ignoreCrates) {
    for (let i = 0; i < island.crates.length; i++) {
      const crate = island.crates[i];
      if (crate.hp <= 0) continue;
      const dx = entity.x - crate.x;
      const dy = entity.y - crate.y;
      const minDist = entity.radius + crate.radius;
      const distSq = dx * dx + dy * dy;
      if (distSq < minDist * minDist) {
        if (distSq > 1e-8) {
          const dist = Math.sqrt(distSq);
          const push = minDist - dist;
          entity.x += (dx / dist) * push;
          entity.y += (dy / dist) * push;
        } else {
          entity.x += minDist;
        }
      }
    }
  }

  if (island.hasPerimeterWalls) {
    const { x, y, w, h } = island.bounds;
    const r = entity.radius;
    if (entity.x < x + r) entity.x = x + r;
    if (entity.x > x + w - r) entity.x = x + w - r;
    if (entity.y < y + r) entity.y = y + r;
    if (entity.y > y + h - r) entity.y = y + h - r;
  }
}

/** Milestone 4.14: Freeze Gun exact cumulative slow & recovery constants. */
export const FREEZE_HIT_SLOW = 0.02;
export const FREEZE_MAX_SLOW = 0.85;
export const FREEZE_RECOVERY_PER_SEC = 0.01;

/**
 * Adds +2% cumulative speed slow (`+0.02`), clamped at `0.85` max.
 */
export function applyFreezeHit(target: {
  chillSlow?: number;
  freezeTimer?: number;
}): number {
  const next = Math.min(FREEZE_MAX_SLOW, (target.chillSlow ?? 0) + FREEZE_HIT_SLOW);
  target.chillSlow = next;
  if (target.freezeTimer !== undefined) {
    target.freezeTimer = Math.max(target.freezeTimer, 2.5);
  }
  return next;
}

/**
 * Recovers `chillSlow` by `-0.01 * dt` (1% speed recovered per second) down to `0`.
 */
export function recoverChillSlow(
  target: { chillSlow?: number },
  dt: number,
): number {
  const cur = target.chillSlow ?? 0;
  if (cur <= 0 || dt <= 0) {
    target.chillSlow = Math.max(0, cur);
    return target.chillSlow;
  }
  const next = Math.max(0, cur - FREEZE_RECOVERY_PER_SEC * dt);
  target.chillSlow = next;
  return next;
}

/**
 * Returns the movement speed multiplier `(1 - chillSlow)` when chilled, falling
 * back to legacy `freezeTimer` slow (0.35) only when `chillSlow` is unset/0.
 */
export function getChillSpeedMultiplier(target: {
  chillSlow?: number;
  freezeTimer?: number;
}): number {
  const chill = target.chillSlow ?? 0;
  if (chill > 0) {
    return Math.max(1 - FREEZE_MAX_SLOW, 1 - Math.min(FREEZE_MAX_SLOW, chill));
  }
  if ((target.freezeTimer ?? 0) > 0) {
    return 0.35;
  }
  return 1;
}
