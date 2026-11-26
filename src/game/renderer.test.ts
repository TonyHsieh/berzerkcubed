import { describe, expect, it } from 'vitest';
import { createCameraState, worldToScreen } from '../engine/camera';
import type { SlidingDoor, WallSegment } from '../engine/types';
import { buildSkullhead } from '../render/models';
import { setCanvasFactory } from '../render/spriteStack';
import { fakeCanvasFactory } from '../render/testCanvas';
import {
  chunkSlidingDoorForDepthSort,
  chunkWallForDepthSort,
  DEFAULT_WALL_CHUNK_SIZE,
  REZ_POST_HALO_SEC,
  rezFlashPhase,
} from './renderer';

describe('Milestone 4.12 — 3D Wall & Sliding Door Chunking Under Camera Rotation', () => {
  const makeProject = (angleDeg: number) => {
    const cam = createCameraState();
    cam.x = 0;
    cam.y = 0;
    cam.angleDeg = angleDeg;
    return (wx: number, wy: number) => worldToScreen(wx, wy, cam, 1280, 720);
  };

  it('subdivides long horizontal walls into ~56px chunks and depth-sorts accurately at 0/90/180/270 deg', () => {
    const wall: WallSegment = {
      id: 'long_h',
      x: -180,
      y: -10,
      w: 360,
      h: 20,
      heightZ: 32,
      electrified: false,
      destructible: false,
    };

    for (const angle of [0, 90, 180, 270]) {
      const project = makeProject(angle);
      const chunks = chunkWallForDepthSort(wall, project, DEFAULT_WALL_CHUNK_SIZE);
      expect(chunks.length).toBe(Math.ceil(360 / DEFAULT_WALL_CHUNK_SIZE));
      for (const ch of chunks) {
        expect(ch.w).toBeLessThanOrEqual(DEFAULT_WALL_CHUNK_SIZE + 0.001);
        expect(ch.h).toBe(20);
        const expected = project(ch.x + ch.w * 0.5, ch.y + ch.h * 0.5);
        expect(ch.sortY).toBeCloseTo(expected.y, 4);
      }

      // At 90° and 270°, the horizontal wall runs vertically on screen so its
      // chunks must span strictly monotonic screen-Y values (never collapsed to one Y).
      if (angle === 90) {
        for (let i = 1; i < chunks.length; i++) {
          expect(chunks[i].sortY).toBeGreaterThan(chunks[i - 1].sortY);
        }
      } else if (angle === 270) {
        for (let i = 1; i < chunks.length; i++) {
          expect(chunks[i].sortY).toBeLessThan(chunks[i - 1].sortY);
        }
      }
    }

    // Verify entity behind vs in front of wall flips properly between 0° and 180°
    const northEntity = { x: 0, y: -45 };
    const southEntity = { x: 0, y: 45 };

    const proj0 = makeProject(0);
    const chunks0 = chunkWallForDepthSort(wall, proj0);
    const wallY0 = chunks0[0].sortY;
    expect(proj0(northEntity.x, northEntity.y).y).toBeLessThan(wallY0);
    expect(proj0(southEntity.x, southEntity.y).y).toBeGreaterThan(wallY0);

    const proj180 = makeProject(180);
    const chunks180 = chunkWallForDepthSort(wall, proj180);
    const wallY180 = chunks180[0].sortY;
    expect(proj180(northEntity.x, northEntity.y).y).toBeGreaterThan(wallY180);
    expect(proj180(southEntity.x, southEntity.y).y).toBeLessThan(wallY180);
  });

  it('subdivides sliding doors into retracting 3D depth-sorted chunks and clears when fully open', () => {
    const door: SlidingDoor = {
      id: 'door_1',
      x: -80,
      y: -10,
      w: 160,
      h: 20,
      syncGroup: 0,
      periodSec: 4,
      openFraction: 0,
    };

    const proj90 = makeProject(90);
    const closedChunks = chunkSlidingDoorForDepthSort(door, proj90);
    expect(closedChunks.length).toBeGreaterThanOrEqual(2);
    expect(closedChunks.every((c) => c.isDoor)).toBe(true);
    const closedTotalW = closedChunks.reduce((acc, c) => acc + c.w, 0);
    expect(closedTotalW).toBeCloseTo(160, 2);

    // Half-open door retracts smoothly into doorframe (half total width)
    const halfDoor: SlidingDoor = { ...door, openFraction: 0.5 };
    const halfChunks = chunkSlidingDoorForDepthSort(halfDoor, proj90);
    const halfTotalW = halfChunks.reduce((acc, c) => acc + c.w, 0);
    expect(halfTotalW).toBeCloseTo(80, 2);

    // Fully open door emits no blocking panels
    const openDoor: SlidingDoor = { ...door, openFraction: 1.0 };
    expect(chunkSlidingDoorForDepthSort(openDoor, proj90)).toHaveLength(0);
  });
});

describe('Milestone 4.12 — Rez-In Opaque Flash Climax & Post-Rez Halo', () => {
  it('transitions cleanly through beam (0..0.80) -> opaque flash (0.80..1.0) -> post-rez halo -> done', () => {
    const early = rezFlashPhase(0.2);
    expect(early.stage).toBe('beam');
    expect(early.flashAlpha).toBe(0);
    expect(early.showSolidEntity).toBe(false);
    expect(early.entityAlpha).toBeGreaterThan(0);
    expect(early.entityAlpha).toBeLessThan(0.5);

    const flashStart = rezFlashPhase(0.8);
    expect(flashStart.stage).toBe('flash');
    expect(flashStart.flashAlpha).toBeGreaterThan(0);
    expect(flashStart.entityAlpha).toBe(0);
    expect(flashStart.showSolidEntity).toBe(false);

    const flashPeak = rezFlashPhase(0.99);
    expect(flashPeak.stage).toBe('flash');
    expect(flashPeak.flashAlpha).toBeGreaterThan(0.95);
    expect(flashPeak.flashAlpha).toBeGreaterThan(flashStart.flashAlpha);

    const justMaterialized = rezFlashPhase(1.0, 0);
    expect(justMaterialized.stage).toBe('halo');
    expect(justMaterialized.showSolidEntity).toBe(true);
    expect(justMaterialized.haloAlpha).toBeCloseTo(1, 4);

    const midHalo = rezFlashPhase(1.0, REZ_POST_HALO_SEC * 0.5);
    expect(midHalo.stage).toBe('halo');
    expect(midHalo.haloAlpha).toBeCloseTo(0.5, 4);

    const done = rezFlashPhase(1.0, REZ_POST_HALO_SEC);
    expect(done.stage).toBe('done');
    expect(done.showSolidEntity).toBe(true);
    expect(done.haloAlpha).toBe(0);
  });

  it('builds Floating Skullhead with 14-layer sculpted skull body and compact 3-layer propeller hat', () => {
    setCanvasFactory(fakeCanvasFactory());
    const skull = buildSkullhead();
    expect(skull.body).toHaveLength(14);
    expect(skull.halo).toHaveLength(3);
  });
});
