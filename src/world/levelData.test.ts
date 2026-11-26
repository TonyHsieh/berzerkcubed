import { describe, expect, it } from 'vitest';
import type { PlatformIsland } from '../engine/types';
import { createSectorIsland, SPAWN_CLEAR_RADIUS } from './levelData';

function signature(island: PlatformIsland): string {
  return JSON.stringify({
    walls: island.walls.map((w) => [w.x, w.y, w.w, w.h, w.electrified]),
    doors: island.doors.map((d) => [d.x, d.y, d.openFraction]),
    bridges: island.bridges.map((b) => b.active),
    crates: island.crates.map((c) => [c.x, c.y, c.angle]),
  });
}

function pointToRectDistance(px: number, py: number, r: { x: number; y: number; w: number; h: number }): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

describe('Milestone 4.1 — Procedural randomized room layouts (Fix 2)', () => {
  it('produces identical layouts for the same explicit seed', () => {
    expect(signature(createSectorIsland(0, 4242))).toBe(
      signature(createSectorIsland(0, 4242)),
    );
  });

  it('produces different layouts for different seeds', () => {
    const seen = new Set<string>();
    for (let seed = 1; seed <= 12; seed++) {
      seen.add(signature(createSectorIsland(0, seed)));
    }
    expect(seen.size).toBeGreaterThan(8);
  });

  it('keeps the hero spawn area clear of walls and crates', () => {
    for (let seed = 0; seed < 20; seed++) {
      const island = createSectorIsland(0, seed);
      const sx = island.bounds.x + island.bounds.w * 0.5;
      const sy = island.bounds.y + island.bounds.h * 0.5;
      for (const wall of island.walls) {
        expect(pointToRectDistance(sx, sy, wall)).toBeGreaterThanOrEqual(
          SPAWN_CLEAR_RADIUS - 1,
        );
      }
      for (const crate of island.crates) {
        expect(Math.hypot(crate.x - sx, crate.y - sy)).toBeGreaterThanOrEqual(
          SPAWN_CLEAR_RADIUS - 1,
        );
      }
    }
  });

  it('always exposes horde gates and door sync groups on every seed', () => {
    for (const sector of [0, 1, 2, 3]) {
      const island = createSectorIsland(sector, sector * 97 + 3);
      expect(island.bridges.filter((b) => b.spawnsHorde).length).toBeGreaterThanOrEqual(2);
      expect(island.bridges.some((b) => b.active)).toBe(true);
      expect(island.doors.some((d) => d.syncGroup === 0)).toBe(true);
      expect(island.doors.some((d) => d.syncGroup === 1)).toBe(true);
      expect(island.crates.length).toBeGreaterThan(0);
      expect(island.walls.some((w) => w.electrified)).toBe(true);
    }
  });
});
