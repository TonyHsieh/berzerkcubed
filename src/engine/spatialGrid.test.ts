import { describe, expect, it } from 'vitest';
import { createDifficultyConfig } from '../config/difficulty';
import { createPlayer } from '../entities/player';
import {
  createCameraState,
  screenToWorld,
  triggerCameraShake,
  updateCamera,
  worldToScreen,
} from './camera';
import { createDefaultInputState } from './input';
import { SpatialGrid } from './spatialGrid';

interface MockBody {
  id: string;
  x: number;
  y: number;
  radius: number;
}

describe('SpatialGrid', () => {
  it('returns only entities within query radius including entity radius', () => {
    const grid = new SpatialGrid<MockBody>(64);
    grid.insert({ id: 'a', x: 10, y: 10, radius: 10 });
    grid.insert({ id: 'b', x: 45, y: 10, radius: 10 });
    grid.insert({ id: 'far', x: 240, y: 240, radius: 10 });

    const hits = grid.queryRadius(10, 10, 30);
    const ids = hits.map((h) => h.id).sort();
    expect(ids).toEqual(['a', 'b']);
  });

  it('deduplicates large entities spanning multiple grid cells', () => {
    const grid = new SpatialGrid<MockBody>(32);
    grid.insert({ id: 'boss', x: 32, y: 32, radius: 48 });

    const hits = grid.queryRadius(32, 32, 60);
    expect(hits).toHaveLength(1);
    expect(hits[0].id).toBe('boss');
  });

  it('handles 350+ swarm entities and clears cleanly', () => {
    const grid = new SpatialGrid<MockBody>(80);
    for (let i = 0; i < 360; i++) {
      const col = i % 20;
      const row = Math.floor(i / 20);
      grid.insert({
        id: `e_${i}`,
        x: col * 40 - 400,
        y: row * 40 - 360,
        radius: 10,
      });
    }

    const nearby = grid.queryRadius(0, 0, 50);
    expect(nearby.length).toBeGreaterThan(0);
    for (const item of nearby) {
      expect(Math.hypot(item.x, item.y)).toBeLessThanOrEqual(50 + item.radius + 1e-6);
    }

    grid.clear();
    expect(grid.queryRadius(0, 0, 1000)).toHaveLength(0);
  });
});

describe('Camera', () => {
  it('defaults to 0 deg rotation and supports Q/E smooth swivel, dynamic tilt, and shake', () => {
    const cam = createCameraState();
    const config = createDifficultyConfig();
    const player = createPlayer(100, -50, config);
    const input = createDefaultInputState();

    expect(cam.angleDeg).toBe(0);
    expect(cam.tiltScale).toBe(1.0);
    expect(cam.layerSpacing).toBe(2.0);

    // Swivel right with E and move fast to trigger dynamic tilt
    input.swivelDir = 1;
    player.vx = 230;
    updateCamera(cam, player, input, 0.25);

    expect(cam.targetAngleDeg).toBeGreaterThan(0);
    expect(cam.angleDeg).toBeGreaterThan(0);
    expect(cam.tiltScale).toBeGreaterThan(1.0);

    // Trigger screen shake and verify it offsets worldToScreen and decays to 0
    triggerCameraShake(cam, 10, 0.2);
    expect(cam.shakeMag).toBe(10);
    expect(cam.shakeTimer).toBe(0.2);

    const shaken = worldToScreen(cam.x, cam.y, cam, 800, 600);
    expect(Math.hypot(shaken.x - 400, shaken.y - 300)).toBeGreaterThan(0);

    updateCamera(cam, player, createDefaultInputState(), 0.3);
    expect(cam.shakeTimer).toBe(0);
    expect(cam.shakeMag).toBe(0);

    // Round-trip worldToScreen -> screenToWorld
    const pt = worldToScreen(240, -110, cam, 800, 600);
    const back = screenToWorld(pt.x, pt.y, cam, 800, 600);
    expect(back.x).toBeCloseTo(240, 3);
    expect(back.y).toBeCloseTo(-110, 3);
  });
});
