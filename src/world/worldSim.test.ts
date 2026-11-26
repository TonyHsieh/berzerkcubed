import { describe, expect, it } from 'vitest';
import { createDifficultyConfig } from '../config/difficulty';
import { createDefaultInputState } from '../engine/input';
import { createCameraState } from '../engine/camera';
import type { GameEvent } from '../engine/types';
import { createPlayer, updatePlayer } from '../entities/player';
import { damageCrate } from './crate';
import { createSectorIsland } from './levelData';
import {
  isPointOnWalkableSurface,
  resolveEntityAgainstWorld,
  setBridgeActive,
  updateWorld,
} from './worldSim';

describe('World Simulation & Floating Islands', () => {
  it('generates safe perimeter-walled sectors (even) and open-edge dangerous sectors (odd)', () => {
    const safeSector = createSectorIsland(0);
    const dangerSector = createSectorIsland(1);

    expect(safeSector.hasPerimeterWalls).toBe(true);
    expect(safeSector.outline).toBe('blue');
    expect(safeSector.walls.some((w) => w.electrified)).toBe(true);
    expect(safeSector.doors.length).toBeGreaterThanOrEqual(2);
    expect(safeSector.bridges.length).toBeGreaterThanOrEqual(2);
    expect(safeSector.crates.length).toBeGreaterThan(0);

    expect(dangerSector.hasPerimeterWalls).toBe(false);
    expect(dangerSector.outline).toBe('red');
  });

  it('synchronizes sliding doors in the same syncGroup in lockstep', () => {
    const island = createSectorIsland(0);
    updateWorld(island, 3.0, 0.016);

    const group0 = island.doors.filter((d) => d.syncGroup === 0);
    const group1 = island.doors.filter((d) => d.syncGroup === 1);

    expect(group0.length).toBeGreaterThanOrEqual(2);
    expect(group1.length).toBeGreaterThanOrEqual(2);
    expect(group0[0].openFraction).toBeCloseTo(group0[1].openFraction, 6);
    expect(group1[0].openFraction).toBeCloseTo(group1[1].openFraction, 6);
    // Group 0 and group 1 are out of phase
    expect(Math.abs(group0[0].openFraction - group1[0].openFraction)).toBeGreaterThan(0.5);
  });

  it('triggers electrified wall contact with knockback and blocks closed sliding doors', () => {
    const island = createSectorIsland(0);
    const elecWall = island.walls.find((w) => w.electrified);
    expect(elecWall).toBeDefined();
    if (!elecWall) return;

    const body = {
      x: elecWall.x - 4,
      y: elecWall.y + elecWall.h / 2,
      vx: 100,
      vy: 0,
      radius: 14,
    };

    const res = resolveEntityAgainstWorld(body, island);
    expect(res.hitElectrifiedWall).toBe(true);
    expect(res.fellOffEdge).toBe(false);
    expect(body.vx).toBeLessThan(0); // Pushed away from electrified wall

    // Closed door blocks movement; open door allows passage
    const door = island.doors[0];
    door.openFraction = 0.0;
    const blockedBody = {
      x: door.x + door.w / 2,
      y: door.y + door.h / 2,
      vx: 0,
      vy: 50,
      radius: 12,
    };
    resolveEntityAgainstWorld(blockedBody, island);
    expect(
      blockedBody.y <= door.y - blockedBody.radius + 0.01 ||
        blockedBody.y >= door.y + door.h + blockedBody.radius - 0.01,
    ).toBe(true);
  });

  it('supports walkable temporary bridges and open-edge chasm fall + resurrection', () => {
    const island = createSectorIsland(1); // Open-edge dangerous island
    const northBridge = island.bridges[0];

    setBridgeActive(island, northBridge.id, true);
    expect(
      isPointOnWalkableSurface(
        northBridge.x + northBridge.w / 2,
        northBridge.y + northBridge.h / 2,
        island,
      ),
    ).toBe(true);

    setBridgeActive(island, northBridge.id, false);
    expect(
      isPointOnWalkableSurface(
        northBridge.x + northBridge.w / 2,
        northBridge.y + northBridge.h / 2,
        island,
      ),
    ).toBe(false);

    // Deactivate every bridge so the open-edge fall below is unambiguous
    // regardless of the seeded layout's active gates.
    for (const b of island.bridges) setBridgeActive(island, b.id, false);

    // Player walks off open edge -> loses 1 life, emits player_fell, resurrects near lastSafe with invuln
    const config = createDifficultyConfig();
    const cam = createCameraState();
    const player = createPlayer(island.bounds.x + 60, 0, config);
    player.lastSafeX = island.bounds.x + 40;
    player.lastSafeY = 0;
    const startLives = player.lives;

    // Place player just beyond the open left edge
    player.x = island.bounds.x - 40;
    const events: GameEvent[] = [];
    updatePlayer(player, createDefaultInputState(), cam, island, config, 0.016, events);

    expect(player.lives).toBe(startLives - 1);
    expect(events.some((e) => e.type === 'player_fell')).toBe(true);
    expect(isPointOnWalkableSurface(player.x, player.y, island)).toBe(true);
    expect(player.invulnTimer).toBeGreaterThan(0);
  });

  it('damages destructible tech crates and drops a power-up when destroyed', () => {
    const island = createSectorIsland(0);
    const crate = island.crates[0];
    const events: GameEvent[] = [];

    const partial = damageCrate(island, crate.id, 10, events);
    expect(partial).toBeNull();
    expect(crate.hitFlash).toBeGreaterThan(0);

    const drop = damageCrate(island, crate.id, crate.hp + 5, events);
    expect(drop).not.toBeNull();
    expect(island.crates.find((c) => c.id === crate.id)).toBeUndefined();
    expect(events.some((e) => e.type === 'crate_destroyed')).toBe(true);
  });
});
