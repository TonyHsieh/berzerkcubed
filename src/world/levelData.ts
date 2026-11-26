import type {
  CardinalDirection,
  DestructibleCrate,
  OutlineTheme,
  PlatformIsland,
  Rect,
  SlidingDoor,
  TempBridge,
  Vec2,
  WallSegment,
} from '../engine/types';
import { createCrate } from './crate';

const WALL_THICKNESS = 28;
const BRIDGE_WIDTH = 148;
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

function pointToRectDistance(px: number, py: number, r: Rect): number {
  const dx = Math.max(r.x - px, 0, px - (r.x + r.w));
  const dy = Math.max(r.y - py, 0, py - (r.y + r.h));
  return Math.hypot(dx, dy);
}

function rectsOverlap(a: Rect, b: Rect, pad = 0): boolean {
  return (
    a.x - pad < b.x + b.w &&
    a.x + a.w + pad > b.x &&
    a.y - pad < b.y + b.h &&
    a.y + a.h + pad > b.y
  );
}

/** Returns interior doorway entry anchors just inside each cardinal bridge/gate. */
export function getDoorwayAnchors(island: PlatformIsland): Vec2[] {
  const b = island.bounds;
  const inset = WALL_THICKNESS + 56;
  const anchors: Vec2[] = [];
  for (let i = 0; i < island.bridges.length; i++) {
    const br = island.bridges[i];
    if (br.y + br.h <= b.y + 4) {
      anchors.push({ x: br.x + br.w * 0.5, y: b.y + inset });
    } else if (br.y >= b.y + b.h - 4) {
      anchors.push({ x: br.x + br.w * 0.5, y: b.y + b.h - inset });
    } else if (br.x + br.w <= b.x + 4) {
      anchors.push({ x: b.x + inset, y: br.y + br.h * 0.5 });
    } else {
      anchors.push({ x: b.x + b.w - inset, y: br.y + br.h * 0.5 });
    }
  }
  return anchors;
}

/**
 * Milestone 4.13: Returns the world-space position inside the specified cardinal
 * entrance doorway (`inset` px inside `island.bounds`).
 */
export function getDoorwayEntryPosition(
  island: PlatformIsland,
  enterDir: CardinalDirection,
  inset = WALL_THICKNESS + 76,
): Vec2 {
  const b = island.bounds;
  const cx = b.x + b.w * 0.5;
  const cy = b.y + b.h * 0.5;
  switch (enterDir) {
    case 'north':
      return { x: cx, y: b.y + inset };
    case 'south':
      return { x: cx, y: b.y + b.h - inset };
    case 'west':
      return { x: b.x + inset, y: cy };
    case 'east':
      return { x: b.x + b.w - inset, y: cy };
  }
}

/**
 * Verifies via BFS flood-fill that the hero spawn (center of island) can reach
 * EVERY doorway anchor and EVERY open corridor cell on the grid.
 * Uses a clearance inflation around walls so wide corridors accommodate 2-3x bosses.
 */
export function isMazeFullyConnected(
  island: PlatformIsland,
  cellSize = 44,
  clearance = 18,
): boolean {
  const b = island.bounds;
  const pad = WALL_THICKNESS + 12;
  const minX = b.x + pad;
  const minY = b.y + pad;
  const innerW = b.w - pad * 2;
  const innerH = b.h - pad * 2;
  const cols = Math.max(4, Math.floor(innerW / cellSize));
  const rows = Math.max(4, Math.floor(innerH / cellSize));
  const stepX = innerW / cols;
  const stepY = innerH / rows;

  const blocked = new Uint8Array(cols * rows);
  const idx = (c: number, r: number) => r * cols + c;

  for (let r = 0; r < rows; r++) {
    const cy = minY + (r + 0.5) * stepY;
    for (let c = 0; c < cols; c++) {
      const cx = minX + (c + 0.5) * stepX;
      for (let w = 0; w < island.walls.length; w++) {
        const wall = island.walls[w];
        if (pointToRectDistance(cx, cy, wall) < clearance) {
          blocked[idx(c, r)] = 1;
          break;
        }
      }
    }
  }

  const startC = Math.max(0, Math.min(cols - 1, Math.floor((0 - minX) / stepX)));
  const startR = Math.max(0, Math.min(rows - 1, Math.floor((0 - minY) / stepY)));
  if (blocked[idx(startC, startR)]) return false;

  const visited = new Uint8Array(cols * rows);
  const queue: number[] = [idx(startC, startR)];
  visited[idx(startC, startR)] = 1;
  let head = 0;

  while (head < queue.length) {
    const cur = queue[head++];
    const c = cur % cols;
    const r = (cur - c) / cols;
    const neighbors: Array<[number, number]> = [
      [c + 1, r],
      [c - 1, r],
      [c, r + 1],
      [c, r - 1],
    ];
    for (let n = 0; n < neighbors.length; n++) {
      const [nc, nr] = neighbors[n];
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const ni = idx(nc, nr);
      if (blocked[ni] || visited[ni]) continue;
      visited[ni] = 1;
      queue.push(ni);
    }
  }

  // Every open cell must be reachable (no sealed pockets)
  for (let i = 0; i < blocked.length; i++) {
    if (!blocked[i] && !visited[i]) return false;
  }

  // Every doorway anchor must land on a reachable cell
  const anchors = getDoorwayAnchors(island);
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    const ac = Math.max(0, Math.min(cols - 1, Math.floor((a.x - minX) / stepX)));
    const ar = Math.max(0, Math.min(rows - 1, Math.floor((a.y - minY) / stepY)));
    if (!visited[idx(ac, ar)]) return false;
  }

  return true;
}

/**
 * Build a sector island with classic Berzerk-style randomized orthogonal corridor
 * mazes (L-walls, T-junctions, and pillar partitions), 2-4 cardinal doorways, wide
 * corridors for 2-3x bosses, and BFS-verified full connectivity.
 *
 * Passing an explicit `seed` makes the layout deterministic (used by tests);
 * omitting it rolls a fresh seed so every new game / restart produces a new maze.
 */
export function createSectorIsland(sectorIndex: number, seed?: number): PlatformIsland {
  const safeIndex = Math.max(0, Math.floor(sectorIndex));
  const rng = seededRandom(seed === undefined ? freshSeed() : seed);
  const jitter = (amount: number): number => Math.round((rng() * 2 - 1) * amount);

  const width = 1480 + Math.min(safeIndex, 4) * 120;
  const height = 1080 + Math.min(safeIndex, 4) * 80;
  const halfW = width / 2;
  const halfH = height / 2;

  const bounds: Rect = { x: -halfW, y: -halfH, w: width, h: height };

  // Odd sectors are dangerous open-edge red-outlined islands; even sectors have perimeter walls
  const hasPerimeterWalls = safeIndex % 2 === 0;
  const outline: OutlineTheme = hasPerimeterWalls ? 'blue' : 'red';

  const walls: WallSegment[] = [];
  const doors: SlidingDoor[] = [];
  const bridges: TempBridge[] = [];
  const crates: DestructibleCrate[] = [];

  // Wide cardinal doorway gap so 2-3x larger bosses and swarms pass cleanly
  const gateGap = BRIDGE_WIDTH + 52;
  const halfGap = gateGap / 2;

  // Milestone 4.13: All 4 cardinal doorways (north/south/east/west) exist on every
  // sector so defeating the boss unlocks all 4 exits for classic Berzerk door-walk transitions.
  const openNorth = true;
  const openEast = true;
  const openSouth = true;
  const openWest = true;

  if (hasPerimeterWalls) {
    if (openNorth) {
      walls.push(
        { id: `s${safeIndex}_wall_top_l`, x: -halfW, y: -halfH, w: halfW - halfGap, h: WALL_THICKNESS, heightZ: 36, electrified: false, destructible: false },
        { id: `s${safeIndex}_wall_top_r`, x: halfGap, y: -halfH, w: halfW - halfGap, h: WALL_THICKNESS, heightZ: 36, electrified: false, destructible: false },
      );
    } else {
      walls.push({ id: `s${safeIndex}_wall_top`, x: -halfW, y: -halfH, w: width, h: WALL_THICKNESS, heightZ: 36, electrified: false, destructible: false });
    }

    if (openSouth) {
      walls.push(
        { id: `s${safeIndex}_wall_bot_l`, x: -halfW, y: halfH - WALL_THICKNESS, w: halfW - halfGap, h: WALL_THICKNESS, heightZ: 36, electrified: false, destructible: false },
        { id: `s${safeIndex}_wall_bot_r`, x: halfGap, y: halfH - WALL_THICKNESS, w: halfW - halfGap, h: WALL_THICKNESS, heightZ: 36, electrified: false, destructible: false },
      );
    } else {
      walls.push({ id: `s${safeIndex}_wall_bot`, x: -halfW, y: halfH - WALL_THICKNESS, w: width, h: WALL_THICKNESS, heightZ: 36, electrified: false, destructible: false });
    }

    if (openWest) {
      walls.push(
        { id: `s${safeIndex}_wall_left_t`, x: -halfW, y: -halfH + WALL_THICKNESS, w: WALL_THICKNESS, h: halfH - halfGap - WALL_THICKNESS, heightZ: 36, electrified: false, destructible: false },
        { id: `s${safeIndex}_wall_left_b`, x: -halfW, y: halfGap, w: WALL_THICKNESS, h: halfH - halfGap - WALL_THICKNESS, heightZ: 36, electrified: false, destructible: false },
      );
    } else {
      walls.push({ id: `s${safeIndex}_wall_left`, x: -halfW, y: -halfH + WALL_THICKNESS, w: WALL_THICKNESS, h: height - WALL_THICKNESS * 2, heightZ: 36, electrified: false, destructible: false });
    }

    if (openEast) {
      walls.push(
        { id: `s${safeIndex}_wall_right_t`, x: halfW - WALL_THICKNESS, y: -halfH + WALL_THICKNESS, w: WALL_THICKNESS, h: halfH - halfGap - WALL_THICKNESS, heightZ: 36, electrified: false, destructible: false },
        { id: `s${safeIndex}_wall_right_b`, x: halfW - WALL_THICKNESS, y: halfGap, w: WALL_THICKNESS, h: halfH - halfGap - WALL_THICKNESS, heightZ: 36, electrified: false, destructible: false },
      );
    } else {
      walls.push({ id: `s${safeIndex}_wall_right`, x: halfW - WALL_THICKNESS, y: -halfH + WALL_THICKNESS, w: WALL_THICKNESS, h: height - WALL_THICKNESS * 2, heightZ: 36, electrified: false, destructible: false });
    }
  }

  // Temporary horde bridges on cardinal doorways (at least north + east active)
  bridges.push(
    { id: `s${safeIndex}_bridge_north`, x: -BRIDGE_WIDTH / 2, y: -halfH - BRIDGE_LENGTH, w: BRIDGE_WIDTH, h: BRIDGE_LENGTH, active: true, spawnsHorde: true },
    { id: `s${safeIndex}_bridge_east`, x: halfW, y: -BRIDGE_WIDTH / 2, w: BRIDGE_LENGTH, h: BRIDGE_WIDTH, active: true, spawnsHorde: true },
  );
  if (openSouth || !hasPerimeterWalls) {
    bridges.push({
      id: `s${safeIndex}_bridge_south`,
      x: -BRIDGE_WIDTH / 2,
      y: halfH,
      w: BRIDGE_WIDTH,
      h: BRIDGE_LENGTH,
      active: openSouth && rng() > 0.35,
      spawnsHorde: true,
    });
  }
  if (openWest || !hasPerimeterWalls) {
    bridges.push({
      id: `s${safeIndex}_bridge_west`,
      x: -halfW - BRIDGE_LENGTH,
      y: -BRIDGE_WIDTH / 2,
      w: BRIDGE_LENGTH,
      h: BRIDGE_WIDTH,
      active: openWest && rng() > 0.35,
      spawnsHorde: true,
    });
  }

  // Build temporary island shell so we can run BFS connectivity checks while placing maze walls
  const island: PlatformIsland = {
    id: `sector_${safeIndex}`,
    bounds,
    outline,
    hasPerimeterWalls,
    walls,
    doors,
    bridges,
    crates,
  };

  // Doorway throat exclusion zones (keep wide boss-passable entry lanes clear)
  const doorwayZones: Rect[] = [
    { x: -halfGap - 24, y: -halfH, w: gateGap + 48, h: 170 },
    { x: -halfGap - 24, y: halfH - 170, w: gateGap + 48, h: 170 },
    { x: -halfW, y: -halfGap - 24, w: 170, h: gateGap + 48 },
    { x: halfW - 170, y: -halfGap - 24, w: 170, h: gateGap + 48 },
  ];

  const canPlaceWall = (candidate: WallSegment): boolean => {
    // 1. Respect hero spawn clearance
    if (pointToRectDistance(0, 0, candidate) < SPAWN_CLEAR_RADIUS) return false;
    // 2. Stay inside perimeter with wide corridor margin (>= 120px from outer walls)
    const margin = WALL_THICKNESS + 110;
    if (
      candidate.x < -halfW + margin ||
      candidate.y < -halfH + margin ||
      candidate.x + candidate.w > halfW - margin ||
      candidate.y + candidate.h > halfH - margin
    ) {
      return false;
    }
    // 3. Keep doorway throats clear
    for (let i = 0; i < doorwayZones.length; i++) {
      if (rectsOverlap(candidate, doorwayZones[i], 12)) return false;
    }
    // 4. Test BFS full connectivity with boss-friendly clearance
    walls.push(candidate);
    const connected = isMazeFullyConnected(island, 44, 20);
    if (!connected) {
      walls.pop();
      return false;
    }
    return true;
  };

  // Classic Berzerk-style orthogonal maze partitions across the 4 quadrants:
  // Generates a randomized mix of L-walls, T-junctions, and pillar partitions.
  const quadSigns: Array<[number, number, string]> = [
    [-1, -1, 'nw'],
    [1, -1, 'ne'],
    [-1, 1, 'sw'],
    [1, 1, 'se'],
  ];

  const qxBase = Math.round(halfW * 0.56);
  const qyBase = Math.round(halfH * 0.54);
  let elecCount = 0;

  for (let qi = 0; qi < quadSigns.length; qi++) {
    const [sx, sy, tag] = quadSigns[qi];
    const pattern = Math.floor(rng() * 3); // 0 = L-wall, 1 = T-junction, 2 = pillar + baffle
    const ax = sx * (qxBase + jitter(36));
    const ay = sy * (qyBase + jitter(28));
    const hLen = 150 + Math.round(rng() * 70);
    const vLen = 120 + Math.round(rng() * 65);
    const makeElec = qi < 2 || rng() < 0.35;

    if (pattern === 0) {
      // L-wall: horizontal arm + perpendicular vertical arm
      const hx = sx < 0 ? ax - hLen * 0.5 : ax - hLen * 0.5;
      const hy = ay - WALL_THICKNESS / 2;
      const hSeg: WallSegment = {
        id: `s${safeIndex}_maze_${tag}_lh`,
        x: Math.round(hx),
        y: Math.round(hy),
        w: hLen,
        h: WALL_THICKNESS,
        heightZ: 36,
        electrified: false,
        destructible: false,
      };
      const vx = sx < 0 ? Math.round(hx) : Math.round(hx + hLen - WALL_THICKNESS);
      const vy = sy < 0 ? Math.round(hy) : Math.round(hy - vLen + WALL_THICKNESS);
      const vSeg: WallSegment = {
        id: `s${safeIndex}_maze_${tag}_lv`,
        x: vx,
        y: vy,
        w: WALL_THICKNESS,
        h: vLen,
        heightZ: 38,
        electrified: makeElec,
        destructible: false,
      };
      canPlaceWall(hSeg);
      if (canPlaceWall(vSeg) && vSeg.electrified) elecCount++;
    } else if (pattern === 1) {
      // T-junction: horizontal bar + stem extending away from center
      const hx = Math.round(ax - hLen * 0.5);
      const hy = Math.round(ay - WALL_THICKNESS / 2);
      const hSeg: WallSegment = {
        id: `s${safeIndex}_maze_${tag}_th`,
        x: hx,
        y: hy,
        w: hLen,
        h: WALL_THICKNESS,
        heightZ: 36,
        electrified: makeElec,
        destructible: false,
      };
      const stemLen = 90 + Math.round(rng() * 45);
      const vSeg: WallSegment = {
        id: `s${safeIndex}_maze_${tag}_tv`,
        x: Math.round(ax - WALL_THICKNESS / 2),
        y: sy < 0 ? hy - stemLen : hy + WALL_THICKNESS,
        w: WALL_THICKNESS,
        h: stemLen,
        heightZ: 36,
        electrified: false,
        destructible: false,
      };
      if (canPlaceWall(hSeg) && hSeg.electrified) elecCount++;
      canPlaceWall(vSeg);
    } else {
      // Pillar + offset corridor baffle
      const pillarSize = 54 + Math.round(rng() * 18);
      const pillar: WallSegment = {
        id: `s${safeIndex}_maze_${tag}_pillar`,
        x: Math.round(ax - pillarSize / 2),
        y: Math.round(ay - pillarSize / 2),
        w: pillarSize,
        h: pillarSize,
        heightZ: 42,
        electrified: makeElec,
        destructible: false,
      };
      if (canPlaceWall(pillar) && pillar.electrified) elecCount++;
    }
  }

  // Side corridor vertical pylons (outside spawn clearance) for classic Berzerk framing
  const pylonX = Math.round(halfW * (0.56 + rng() * 0.05));
  const pylonH = 170 + Math.round(rng() * 60);
  const westPylon: WallSegment = {
    id: `s${safeIndex}_elec_west`,
    x: -pylonX - WALL_THICKNESS / 2,
    y: Math.round(-pylonH / 2 + jitter(40)),
    w: WALL_THICKNESS,
    h: pylonH,
    heightZ: 38,
    electrified: true,
    destructible: false,
  };
  const eastPylon: WallSegment = {
    id: `s${safeIndex}_elec_east`,
    x: pylonX - WALL_THICKNESS / 2,
    y: Math.round(-pylonH / 2 + jitter(40)),
    w: WALL_THICKNESS,
    h: pylonH,
    heightZ: 38,
    electrified: true,
    destructible: false,
  };
  if (canPlaceWall(westPylon)) elecCount++;
  if (canPlaceWall(eastPylon)) elecCount++;

  // Guarantee at least one electrified wall exists
  if (elecCount === 0 && walls.length > 0) {
    const internal = walls.find((w) => !w.id.includes('_wall_'));
    if (internal) internal.electrified = true;
  }

  // Synchronized sliding doors (group 0 = all 4 cardinal exit gates, group 1 = interior chokepoints)
  const innerDoorX = -75 + jitter(50);
  const innerDoorY = Math.round(halfH * 0.62);
  doors.push(
    { id: `s${safeIndex}_door_north`, x: -halfGap, y: -halfH + 4, w: gateGap, h: DOOR_THICKNESS, syncGroup: 0, periodSec: 6.0, openFraction: 0, cardinal: 'north' },
    { id: `s${safeIndex}_door_south`, x: -halfGap, y: halfH - DOOR_THICKNESS - 4, w: gateGap, h: DOOR_THICKNESS, syncGroup: 0, periodSec: 6.0, openFraction: 0, cardinal: 'south' },
    { id: `s${safeIndex}_door_west`, x: -halfW + 4, y: -halfGap, w: DOOR_THICKNESS, h: gateGap, syncGroup: 0, periodSec: 6.0, openFraction: 0, cardinal: 'west' },
    { id: `s${safeIndex}_door_east`, x: halfW - DOOR_THICKNESS - 4, y: -halfGap, w: DOOR_THICKNESS, h: gateGap, syncGroup: 0, periodSec: 6.0, openFraction: 0, cardinal: 'east' },
    { id: `s${safeIndex}_door_inner_n`, x: innerDoorX, y: -innerDoorY - DOOR_THICKNESS / 2, w: 150, h: DOOR_THICKNESS, syncGroup: 1, periodSec: 6.0, openFraction: 1 },
    { id: `s${safeIndex}_door_inner_s`, x: innerDoorX, y: innerDoorY - DOOR_THICKNESS / 2, w: 150, h: DOOR_THICKNESS, syncGroup: 1, periodSec: 6.0, openFraction: 1 },
  );

  // Destructible tech crates placed in corridors, outside spawn clearance and walls
  const crateCandidates: Array<[number, number]> = [
    [-halfW + 170, -halfH + 170],
    [halfW - 170, -halfH + 170],
    [-halfW + 170, halfH - 170],
    [halfW - 170, halfH - 170],
    [-Math.round(halfW * 0.45), -Math.round(halfH * 0.72)],
    [Math.round(halfW * 0.45), -Math.round(halfH * 0.72)],
    [-Math.round(halfW * 0.45), Math.round(halfH * 0.72)],
    [Math.round(halfW * 0.45), Math.round(halfH * 0.72)],
  ];
  for (let i = 0; i < crateCandidates.length; i++) {
    const [baseX, baseY] = crateCandidates[i];
    const cx = baseX + jitter(24);
    const cy = baseY + jitter(24);
    if (Math.hypot(cx, cy) < SPAWN_CLEAR_RADIUS) continue;
    let overlapsWall = false;
    for (let w = 0; w < walls.length; w++) {
      if (pointToRectDistance(cx, cy, walls[w]) < 28) {
        overlapsWall = true;
        break;
      }
    }
    if (overlapsWall) continue;
    crates.push(createCrate(`s${safeIndex}_crate_${i}`, cx, cy, 45, Math.round(rng() * 90)));
  }

  return island;
}
