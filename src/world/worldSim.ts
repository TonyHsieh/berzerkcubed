import type { PlatformIsland, Rect } from '../engine/types';

const DOOR_PASSABLE_THRESHOLD = 0.75;
const ELECTRIFIED_KNOCKBACK = 260;
const BRIDGE_CYCLE_SEC = 14.0;
const BRIDGE_ACTIVE_WINDOW_SEC = 7.5;

export interface WorldEntityBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
}

export interface WorldCollisionResult {
  hitElectrifiedWall: boolean;
  fellOffEdge: boolean;
}

function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

function pointInRect(x: number, y: number, r: Rect): boolean {
  return x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
}

function resolveCircleVsRect(
  entity: WorldEntityBody,
  rect: Rect,
): { collided: boolean; nx: number; ny: number } {
  const closestX = clamp(entity.x, rect.x, rect.x + rect.w);
  const closestY = clamp(entity.y, rect.y, rect.y + rect.h);

  const dx = entity.x - closestX;
  const dy = entity.y - closestY;
  const distSq = dx * dx + dy * dy;
  const r = entity.radius;

  if (distSq >= r * r) {
    return { collided: false, nx: 0, ny: 0 };
  }

  if (distSq > 1e-8) {
    const dist = Math.sqrt(distSq);
    const nx = dx / dist;
    const ny = dy / dist;
    const overlap = r - dist;
    entity.x += nx * overlap;
    entity.y += ny * overlap;

    const vn = entity.vx * nx + entity.vy * ny;
    if (vn < 0) {
      entity.vx -= vn * nx;
      entity.vy -= vn * ny;
    }
    return { collided: true, nx, ny };
  }

  // Center is inside the rect — push out along the shortest axis
  const leftPen = entity.x - rect.x + r;
  const rightPen = rect.x + rect.w - entity.x + r;
  const topPen = entity.y - rect.y + r;
  const bottomPen = rect.y + rect.h - entity.y + r;
  const minPen = Math.min(leftPen, rightPen, topPen, bottomPen);

  let nx = 0;
  let ny = 0;
  if (minPen === leftPen) {
    entity.x = rect.x - r;
    nx = -1;
    if (entity.vx > 0) entity.vx = 0;
  } else if (minPen === rightPen) {
    entity.x = rect.x + rect.w + r;
    nx = 1;
    if (entity.vx < 0) entity.vx = 0;
  } else if (minPen === topPen) {
    entity.y = rect.y - r;
    ny = -1;
    if (entity.vy > 0) entity.vy = 0;
  } else {
    entity.y = rect.y + rect.h + r;
    ny = 1;
    if (entity.vy < 0) entity.vy = 0;
  }

  return { collided: true, nx, ny };
}

export function isPointOnWalkableSurface(
  x: number,
  y: number,
  island: PlatformIsland,
): boolean {
  if (pointInRect(x, y, island.bounds)) {
    return true;
  }
  for (let i = 0; i < island.bridges.length; i++) {
    const bridge = island.bridges[i];
    if (bridge.active && pointInRect(x, y, bridge)) {
      return true;
    }
  }
  return false;
}

export function setBridgeActive(
  island: PlatformIsland,
  bridgeId: string,
  active: boolean,
): boolean {
  const bridge = island.bridges.find((b) => b.id === bridgeId);
  if (!bridge) return false;
  bridge.active = active;
  return true;
}

/**
 * Milestone 4.13: Unlocks all cardinal exit doors (north/south/east/west) and
 * activates all cardinal bridges when the sector boss is defeated.
 */
export function unlockCardinalExitDoors(island: PlatformIsland): void {
  for (let i = 0; i < island.doors.length; i++) {
    const door = island.doors[i];
    if (door.cardinal !== undefined) {
      door.openFraction = 1;
    }
  }
  for (let i = 0; i < island.bridges.length; i++) {
    island.bridges[i].active = true;
  }
}

export function updateWorld(
  island: PlatformIsland,
  timeSec: number,
  dt: number,
  exitsUnlocked = false,
): void {
  // 1. Synchronized sliding doors: all doors sharing a syncGroup move in lockstep.
  //    When sector exits are unlocked (boss defeated), cardinal exit doors stay fully open.
  for (let i = 0; i < island.doors.length; i++) {
    const door = island.doors[i];
    if (exitsUnlocked && door.cardinal !== undefined) {
      door.openFraction = 1;
      continue;
    }
    const period = Math.max(0.5, door.periodSec);
    const phaseOffset = (door.syncGroup % 2) * 0.5;
    const cycle = (((timeSec / period) + phaseOffset) % 1 + 1) % 1;
    // Smooth cosine wave mapped to 0..1 with brief dwell at open/closed extremes
    const raw = 0.5 - 0.5 * Math.cos(cycle * Math.PI * 2);
    door.openFraction = clamp(raw, 0, 1);
  }

  // 2. Temporary horde bridges cycle open/closed in staggered pairs (or stay active when exits unlocked)
  for (let i = 0; i < island.bridges.length; i++) {
    const bridge = island.bridges[i];
    if (exitsUnlocked) {
      bridge.active = true;
      continue;
    }
    const phaseShift = (i % 2) * (BRIDGE_CYCLE_SEC * 0.5);
    const t = (((timeSec + phaseShift) % BRIDGE_CYCLE_SEC) + BRIDGE_CYCLE_SEC) % BRIDGE_CYCLE_SEC;
    bridge.active = t < BRIDGE_ACTIVE_WINDOW_SEC;
  }

  // 3. Decay crate hitFlash timers
  if (dt > 0) {
    for (let i = 0; i < island.crates.length; i++) {
      const crate = island.crates[i];
      if (crate.hitFlash > 0) {
        crate.hitFlash = Math.max(0, crate.hitFlash - dt);
      }
    }
  }
}

export function resolveEntityAgainstWorld(
  entity: WorldEntityBody,
  island: PlatformIsland,
): WorldCollisionResult {
  let hitElectrifiedWall = false;

  // 1. Solid & electrified walls
  for (let i = 0; i < island.walls.length; i++) {
    const wall = island.walls[i];
    const res = resolveCircleVsRect(entity, wall);
    if (res.collided && wall.electrified) {
      hitElectrifiedWall = true;
      entity.vx += res.nx * ELECTRIFIED_KNOCKBACK;
      entity.vy += res.ny * ELECTRIFIED_KNOCKBACK;
    }
  }

  // 2. Synchronized sliding doors (solid when openFraction < threshold)
  for (let i = 0; i < island.doors.length; i++) {
    const door = island.doors[i];
    if (door.openFraction < DOOR_PASSABLE_THRESHOLD) {
      resolveCircleVsRect(entity, door);
    }
  }

  // 3. Intact destructible tech crates (circle-vs-circle push-out)
  for (let i = 0; i < island.crates.length; i++) {
    const crate = island.crates[i];
    if (crate.hp <= 0) continue;

    const dx = entity.x - crate.x;
    const dy = entity.y - crate.y;
    const minDist = entity.radius + crate.radius;
    const distSq = dx * dx + dy * dy;

    if (distSq < minDist * minDist) {
      const dist = distSq > 1e-8 ? Math.sqrt(distSq) : 0.001;
      const nx = distSq > 1e-8 ? dx / dist : 1;
      const ny = distSq > 1e-8 ? dy / dist : 0;
      const overlap = minDist - dist;
      entity.x += nx * overlap;
      entity.y += ny * overlap;

      const vn = entity.vx * nx + entity.vy * ny;
      if (vn < 0) {
        entity.vx -= vn * nx;
        entity.vy -= vn * ny;
      }
    }
  }

  // 4. Open-edge chasm fall check
  const onSurface = isPointOnWalkableSurface(entity.x, entity.y, island);
  let fellOffEdge = false;

  if (!onSurface) {
    if (island.hasPerimeterWalls) {
      // Safety clamp inside perimeter-walled island
      entity.x = clamp(
        entity.x,
        island.bounds.x + entity.radius,
        island.bounds.x + island.bounds.w - entity.radius,
      );
      entity.y = clamp(
        entity.y,
        island.bounds.y + entity.radius,
        island.bounds.y + island.bounds.h - entity.radius,
      );
    } else {
      fellOffEdge = true;
    }
  }

  return { hitElectrifiedWall, fellOffEdge };
}

export function pointHitsSolidWall(
  x: number,
  y: number,
  radius: number,
  island: PlatformIsland,
): boolean {
  for (let i = 0; i < island.walls.length; i++) {
    const w = island.walls[i];
    const cx = clamp(x, w.x, w.x + w.w);
    const cy = clamp(y, w.y, w.y + w.h);
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy <= radius * radius) {
      return true;
    }
  }

  for (let i = 0; i < island.doors.length; i++) {
    const d = island.doors[i];
    if (d.openFraction >= DOOR_PASSABLE_THRESHOLD) continue;
    const cx = clamp(x, d.x, d.x + d.w);
    const cy = clamp(y, d.y, d.y + d.h);
    const dx = x - cx;
    const dy = y - cy;
    if (dx * dx + dy * dy <= radius * radius) {
      return true;
    }
  }

  return false;
}

export interface RaycastHit {
  x: number;
  y: number;
  dist: number;
  hit: boolean;
}

function intersectRayRect(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  maxDist: number,
  r: Rect,
): number | null {
  let tMin = 0;
  let tMax = maxDist;

  if (Math.abs(dx) < 1e-8) {
    if (ox < r.x || ox > r.x + r.w) return null;
  } else {
    const invD = 1 / dx;
    let t1 = (r.x - ox) * invD;
    let t2 = (r.x + r.w - ox) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  if (Math.abs(dy) < 1e-8) {
    if (oy < r.y || oy > r.y + r.h) return null;
  } else {
    const invD = 1 / dy;
    let t1 = (r.y - oy) * invD;
    let t2 = (r.y + r.h - oy) * invD;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin > tMax) return null;
  }

  return tMin >= 0 && tMin <= maxDist ? tMin : null;
}

/**
 * Milestone 4.14: Raycasts a segment from `(startX, startY)` along unit direction
 * `(dirX, dirY)` up to `maxDist` against all solid walls and closed sliding doors.
 */
export function raycastSolidWalls(
  startX: number,
  startY: number,
  dirX: number,
  dirY: number,
  maxDist: number,
  island: PlatformIsland,
): RaycastHit {
  const len = Math.hypot(dirX, dirY);
  if (len < 1e-8 || maxDist <= 0) {
    return { x: startX, y: startY, dist: 0, hit: false };
  }
  const ux = dirX / len;
  const uy = dirY / len;

  let bestT = maxDist;
  let hit = false;

  for (let i = 0; i < island.walls.length; i++) {
    const t = intersectRayRect(startX, startY, ux, uy, bestT, island.walls[i]);
    if (t !== null && t < bestT) {
      bestT = t;
      hit = true;
    }
  }

  for (let i = 0; i < island.doors.length; i++) {
    const d = island.doors[i];
    if (d.openFraction >= DOOR_PASSABLE_THRESHOLD) continue;
    const t = intersectRayRect(startX, startY, ux, uy, bestT, d);
    if (t !== null && t < bestT) {
      bestT = t;
      hit = true;
    }
  }

  return {
    x: startX + ux * bestT,
    y: startY + uy * bestT,
    dist: bestT,
    hit,
  };
}
