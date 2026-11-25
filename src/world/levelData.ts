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

export function createSectorIsland(sectorIndex: number): PlatformIsland {
  const safeIndex = Math.max(0, Math.floor(sectorIndex));
  const width = 1400 + Math.min(safeIndex, 4) * 120;
  const height = 1000 + Math.min(safeIndex, 4) * 80;
  const halfW = width / 2;
  const halfH = height / 2;

  const bounds = {
    x: -halfW,
    y: -halfH,
    w: width,
    h: height,
  };

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
    // Top perimeter with center bridge opening
    walls.push(
      {
        id: `s${safeIndex}_wall_top_l`,
        x: -halfW,
        y: -halfH,
        w: halfW - halfGap,
        h: WALL_THICKNESS,
        heightZ: 34,
        electrified: false,
        destructible: false,
      },
      {
        id: `s${safeIndex}_wall_top_r`,
        x: halfGap,
        y: -halfH,
        w: halfW - halfGap,
        h: WALL_THICKNESS,
        heightZ: 34,
        electrified: false,
        destructible: false,
      },
      // Bottom perimeter with center bridge opening
      {
        id: `s${safeIndex}_wall_bot_l`,
        x: -halfW,
        y: halfH - WALL_THICKNESS,
        w: halfW - halfGap,
        h: WALL_THICKNESS,
        heightZ: 34,
        electrified: false,
        destructible: false,
      },
      {
        id: `s${safeIndex}_wall_bot_r`,
        x: halfGap,
        y: halfH - WALL_THICKNESS,
        w: halfW - halfGap,
        h: WALL_THICKNESS,
        heightZ: 34,
        electrified: false,
        destructible: false,
      },
      // Left perimeter with center bridge opening
      {
        id: `s${safeIndex}_wall_left_t`,
        x: -halfW,
        y: -halfH + WALL_THICKNESS,
        w: WALL_THICKNESS,
        h: halfH - halfGap - WALL_THICKNESS,
        heightZ: 34,
        electrified: false,
        destructible: false,
      },
      {
        id: `s${safeIndex}_wall_left_b`,
        x: -halfW,
        y: halfGap,
        w: WALL_THICKNESS,
        h: halfH - halfGap - WALL_THICKNESS,
        heightZ: 34,
        electrified: false,
        destructible: false,
      },
      // Right perimeter with center bridge opening
      {
        id: `s${safeIndex}_wall_right_t`,
        x: halfW - WALL_THICKNESS,
        y: -halfH + WALL_THICKNESS,
        w: WALL_THICKNESS,
        h: halfH - halfGap - WALL_THICKNESS,
        heightZ: 34,
        electrified: false,
        destructible: false,
      },
      {
        id: `s${safeIndex}_wall_right_b`,
        x: halfW - WALL_THICKNESS,
        y: halfGap,
        w: WALL_THICKNESS,
        h: halfH - halfGap - WALL_THICKNESS,
        heightZ: 34,
        electrified: false,
        destructible: false,
      },
    );
  }

  // Interior Berzerk-style tactical walls (mix of safe & electrified walls)
  const colX = Math.round(halfW * 0.42);
  const rowY = Math.round(halfH * 0.36);

  walls.push(
    // West & East electrified hazard pylons
    {
      id: `s${safeIndex}_elec_west`,
      x: -colX - WALL_THICKNESS / 2,
      y: -150,
      w: WALL_THICKNESS,
      h: 300,
      heightZ: 38,
      electrified: true,
      destructible: false,
    },
    {
      id: `s${safeIndex}_elec_east`,
      x: colX - WALL_THICKNESS / 2,
      y: -150,
      w: WALL_THICKNESS,
      h: 300,
      heightZ: 38,
      electrified: true,
      destructible: false,
    },
    // North & South safe corridor baffles
    {
      id: `s${safeIndex}_safe_nw`,
      x: -colX,
      y: -rowY - WALL_THICKNESS / 2,
      w: 190,
      h: WALL_THICKNESS,
      heightZ: 32,
      electrified: false,
      destructible: false,
    },
    {
      id: `s${safeIndex}_safe_ne`,
      x: colX - 190,
      y: -rowY - WALL_THICKNESS / 2,
      w: 190,
      h: WALL_THICKNESS,
      heightZ: 32,
      electrified: false,
      destructible: false,
    },
    {
      id: `s${safeIndex}_safe_sw`,
      x: -colX,
      y: rowY - WALL_THICKNESS / 2,
      w: 190,
      h: WALL_THICKNESS,
      heightZ: 32,
      electrified: false,
      destructible: false,
    },
    {
      id: `s${safeIndex}_safe_se`,
      x: colX - 190,
      y: rowY - WALL_THICKNESS / 2,
      w: 190,
      h: WALL_THICKNESS,
      heightZ: 32,
      electrified: false,
      destructible: false,
    },
  );

  // Synchronized sliding doors (group 0 = north/south gates, group 1 = interior chokepoints)
  doors.push(
    {
      id: `s${safeIndex}_door_north`,
      x: -halfGap,
      y: -halfH + 4,
      w: gateGap,
      h: DOOR_THICKNESS,
      syncGroup: 0,
      periodSec: 6.0,
      openFraction: 0,
    },
    {
      id: `s${safeIndex}_door_south`,
      x: -halfGap,
      y: halfH - DOOR_THICKNESS - 4,
      w: gateGap,
      h: DOOR_THICKNESS,
      syncGroup: 0,
      periodSec: 6.0,
      openFraction: 0,
    },
    {
      id: `s${safeIndex}_door_inner_n`,
      x: -75,
      y: -rowY - DOOR_THICKNESS / 2,
      w: 150,
      h: DOOR_THICKNESS,
      syncGroup: 1,
      periodSec: 6.0,
      openFraction: 1,
    },
    {
      id: `s${safeIndex}_door_inner_s`,
      x: -75,
      y: rowY - DOOR_THICKNESS / 2,
      w: 150,
      h: DOOR_THICKNESS,
      syncGroup: 1,
      periodSec: 6.0,
      openFraction: 1,
    },
  );

  // Temporary horde bridges extending from the 4 cardinal edges
  bridges.push(
    {
      id: `s${safeIndex}_bridge_north`,
      x: -BRIDGE_WIDTH / 2,
      y: -halfH - BRIDGE_LENGTH,
      w: BRIDGE_WIDTH,
      h: BRIDGE_LENGTH,
      active: true,
      spawnsHorde: true,
    },
    {
      id: `s${safeIndex}_bridge_south`,
      x: -BRIDGE_WIDTH / 2,
      y: halfH,
      w: BRIDGE_WIDTH,
      h: BRIDGE_LENGTH,
      active: false,
      spawnsHorde: true,
    },
    {
      id: `s${safeIndex}_bridge_west`,
      x: -halfW - BRIDGE_LENGTH,
      y: -BRIDGE_WIDTH / 2,
      w: BRIDGE_LENGTH,
      h: BRIDGE_WIDTH,
      active: false,
      spawnsHorde: true,
    },
    {
      id: `s${safeIndex}_bridge_east`,
      x: halfW,
      y: -BRIDGE_WIDTH / 2,
      w: BRIDGE_LENGTH,
      h: BRIDGE_WIDTH,
      active: true,
      spawnsHorde: true,
    },
  );

  // Destructible tech crates placed as tactical cover
  const cratePositions: Array<[number, number]> = [
    [-160, -110],
    [160, -110],
    [-160, 110],
    [160, 110],
    [-colX - 110, -220],
    [colX + 110, -220],
    [-colX - 110, 220],
    [colX + 110, 220],
  ];

  for (let i = 0; i < cratePositions.length; i++) {
    const [cx, cy] = cratePositions[i];
    crates.push(createCrate(`s${safeIndex}_crate_${i}`, cx, cy, 45, (i * 15) % 90));
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
