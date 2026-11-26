import type {
  DestructibleCrate,
  OutlineTheme,
  PlatformIsland,
  SlidingDoor,
  TempBridge,
  WallSegment,
} from '../engine/types';
import { createCrate } from './crate';

const WALL_THICKNESS = 28;
const BRIDGE_WIDTH = 136;
const BRIDGE_LENGTH = 180;
const DOOR_THICKNESS = 22;

/** Hero spawn clearance: no wall or crate may intrude inside this radius (px). */
export const SPAWN_CLEAR_RADIUS = 300;

/** Small deterministic PRNG (mulberry32) so a seed reproduces a layout exactly. */
function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function freshSeed(): number {
  return (Math.random() * 0xffffffff) >>> 0;
}

/**
 * Build a sector island. Passing an explicit `seed` makes the layout fully
 * deterministic (used by tests); omitting it rolls a fresh seed so every new
 * game / restart produces a different room.
 */
export function createSectorIsland(sectorIndex: number, seed?: number): PlatformIsland {
  const safeIndex = Math.max(0, Math.floor(sectorIndex));
  const rng = seededRandom(seed === undefined ? freshSeed() : seed);
  const jitter = (amount: number): number => Math.round((rng() * 2 - 1) * amount);

  const width = 1400 + Math.min(safeIndex, 4) * 120;
  const height = 1000 + Math.min(safeIndex, 4) * 80;
  const halfW = width / 2;
  const halfH = height / 2;

  const bounds = { x: -halfW, y: -halfH, w: width, h: height };

  // Odd sectors are dangerous open-edge red-outlined islands; even sectors have perimeter walls
  const hasPerimeterWalls = safeIndex % 2 === 0;
  const outline: OutlineTheme = hasPerimeterWalls ? 'blue' : 'red';

  const walls: WallSegment[] = [];
  const doors: SlidingDoor[] = [];
  const bridges: TempBridge[] = [];
  const crates: DestructibleCrate[] = [];

  const gateGap = BRIDGE_WIDTH + 24;
  const halfGap = gateGap / 2;

  if (hasPerimeterWalls) {
    walls.push(
      { id: `s${safeIndex}_wall_top_l`, x: -halfW, y: -halfH, w: halfW - halfGap, h: WALL_THICKNESS, heightZ: 34, electrified: false, destructible: false },
      { id: `s${safeIndex}_wall_top_r`, x: halfGap, y: -halfH, w: halfW - halfGap, h: WALL_THICKNESS, heightZ: 34, electrified: false, destructible: false },
      { id: `s${safeIndex}_wall_bot_l`, x: -halfW, y: halfH - WALL_THICKNESS, w: halfW - halfGap, h: WALL_THICKNESS, heightZ: 34, electrified: false, destructible: false },
      { id: `s${safeIndex}_wall_bot_r`, x: halfGap, y: halfH - WALL_THICKNESS, w: halfW - halfGap, h: WALL_THICKNESS, heightZ: 34, electrified: false, destructible: false },
      { id: `s${safeIndex}_wall_left_t`, x: -halfW, y: -halfH + WALL_THICKNESS, w: WALL_THICKNESS, h: halfH - halfGap - WALL_THICKNESS, heightZ: 34, electrified: false, destructible: false },
      { id: `s${safeIndex}_wall_left_b`, x: -halfW, y: halfGap, w: WALL_THICKNESS, h: halfH - halfGap - WALL_THICKNESS, heightZ: 34, electrified: false, destructible: false },
      { id: `s${safeIndex}_wall_right_t`, x: halfW - WALL_THICKNESS, y: -halfH + WALL_THICKNESS, w: WALL_THICKNESS, h: halfH - halfGap - WALL_THICKNESS, heightZ: 34, electrified: false, destructible: false },
      { id: `s${safeIndex}_wall_right_b`, x: halfW - WALL_THICKNESS, y: halfGap, w: WALL_THICKNESS, h: halfH - halfGap - WALL_THICKNESS, heightZ: 34, electrified: false, destructible: false },
    );
  }

  // Interior tactical walls: a seed-varying mix of safe corridors and
  // electrified pylons, always well outside the hero's spawn clearance.
  const colX = Math.round(halfW * (0.52 + rng() * 0.06));
  const rowY = Math.round(halfH * (0.52 + rng() * 0.08));
  const pylonY = -150 + jitter(70);
  const pylonH = 260 + Math.round(rng() * 80);
  const baffleW = 130 + Math.round(rng() * 20);
  const electrifiedBaffle = Math.floor(rng() * 4);

  walls.push(
    {
      id: `s${safeIndex}_elec_west`,
      x: -colX - WALL_THICKNESS / 2,
      y: pylonY,
      w: WALL_THICKNESS,
      h: pylonH,
      heightZ: 38,
      electrified: true,
      destructible: false,
    },
    {
      id: `s${safeIndex}_elec_east`,
      x: colX - WALL_THICKNESS / 2,
      y: pylonY + jitter(50),
      w: WALL_THICKNESS,
      h: pylonH,
      heightZ: 38,
      electrified: true,
      destructible: false,
    },
  );

  const baffleDefs: Array<{ id: string; x: number; y: number; electrified: boolean }> = [
    { id: 'safe_nw', x: -colX, y: -rowY, electrified: electrifiedBaffle === 0 },
    { id: 'safe_ne', x: colX - baffleW, y: -rowY + jitter(12), electrified: electrifiedBaffle === 1 },
    { id: 'safe_sw', x: -colX + jitter(12), y: rowY, electrified: electrifiedBaffle === 2 },
    { id: 'safe_se', x: colX - baffleW, y: rowY + jitter(12), electrified: electrifiedBaffle === 3 },
  ];
  // Keep 3–4 baffles; which one is omitted is seed-driven.
  const omitIndex = Math.floor(rng() * 5);
  for (let i = 0; i < baffleDefs.length; i++) {
    if (i === omitIndex) continue;
    const def = baffleDefs[i];
    walls.push({
      id: `s${safeIndex}_${def.id}`,
      x: def.x,
      y: def.y - WALL_THICKNESS / 2,
      w: baffleW,
      h: WALL_THICKNESS,
      heightZ: 32,
      electrified: def.electrified,
      destructible: false,
    });
  }

  // Synchronized sliding doors (group 0 = perimeter gates, group 1 = interior chokepoints)
  const innerDoorX = -75 + jitter(60);
  const innerDoorY = rowY + 30;
  doors.push(
    { id: `s${safeIndex}_door_north`, x: -halfGap, y: -halfH + 4, w: gateGap, h: DOOR_THICKNESS, syncGroup: 0, periodSec: 6.0, openFraction: 0 },
    { id: `s${safeIndex}_door_south`, x: -halfGap, y: halfH - DOOR_THICKNESS - 4, w: gateGap, h: DOOR_THICKNESS, syncGroup: 0, periodSec: 6.0, openFraction: 0 },
    { id: `s${safeIndex}_door_inner_n`, x: innerDoorX, y: -innerDoorY - DOOR_THICKNESS / 2, w: 150, h: DOOR_THICKNESS, syncGroup: 1, periodSec: 6.0, openFraction: 1 },
    { id: `s${safeIndex}_door_inner_s`, x: innerDoorX, y: innerDoorY - DOOR_THICKNESS / 2, w: 150, h: DOOR_THICKNESS, syncGroup: 1, periodSec: 6.0, openFraction: 1 },
  );

  // Temporary horde bridges extending from the 4 cardinal edges. At least the
  // north + east gates start active so waves always have an entry point.
  bridges.push(
    { id: `s${safeIndex}_bridge_north`, x: -BRIDGE_WIDTH / 2, y: -halfH - BRIDGE_LENGTH, w: BRIDGE_WIDTH, h: BRIDGE_LENGTH, active: true, spawnsHorde: true },
    { id: `s${safeIndex}_bridge_south`, x: -BRIDGE_WIDTH / 2, y: halfH, w: BRIDGE_WIDTH, h: BRIDGE_LENGTH, active: rng() > 0.5, spawnsHorde: true },
    { id: `s${safeIndex}_bridge_west`, x: -halfW - BRIDGE_LENGTH, y: -BRIDGE_WIDTH / 2, w: BRIDGE_LENGTH, h: BRIDGE_WIDTH, active: rng() > 0.5, spawnsHorde: true },
    { id: `s${safeIndex}_bridge_east`, x: halfW, y: -BRIDGE_WIDTH / 2, w: BRIDGE_LENGTH, h: BRIDGE_WIDTH, active: true, spawnsHorde: true },
  );

  // Destructible tech crates as tactical cover, all outside spawn clearance.
  const crateCandidates: Array<[number, number]> = [
    [-colX - 110, -220], [colX + 110, -220],
    [-colX - 110, 220], [colX + 110, 220],
    [-colX - 40, -rowY - 90], [colX + 40, -rowY - 90],
    [-colX - 40, rowY + 90], [colX + 40, rowY + 90],
  ];
  for (let i = 0; i < crateCandidates.length; i++) {
    const [baseX, baseY] = crateCandidates[i];
    const cx = baseX + jitter(20);
    const cy = baseY + jitter(20);
    if (Math.hypot(cx, cy) < SPAWN_CLEAR_RADIUS) continue;
    crates.push(createCrate(`s${safeIndex}_crate_${i}`, cx, cy, 45, Math.round(rng() * 90)));
  }

  return {
    id: `sector_${safeIndex}`,
    bounds,
    outline,
    hasPerimeterWalls,
    walls,
    doors,
    bridges,
    crates,
  };
}
