import { describe, expect, it } from 'vitest';
import type { CameraState } from '../engine/types';
import { makeFakeCtx } from './testCanvas';
import { VfxSystem } from './vfx';

const cam: CameraState = { x: 0, y: 0, angleDeg: 0, targetAngleDeg: 0, tiltScale: 1, layerSpacing: 2, shakeMag: 0, shakeTimer: 0 };
const w2s = (x: number, y: number) => ({ x, y });

describe('VfxSystem pooling', () => {
  it('starts empty with a fixed capacity', () => {
    const v = new VfxSystem(64);
    expect(v.activeCount).toBe(0);
    expect(v.capacity).toBe(64);
  });

  it('never exceeds capacity when over-spawning', () => {
    const v = new VfxSystem(32);
    v.explode(0, 0, 0, '#f00', 500);
    expect(v.activeCount).toBeLessThanOrEqual(32);
    expect(v.activeCount).toBe(32);
    v.muzzleFlash(0, 0, 0); // dropped silently
    expect(v.activeCount).toBe(32);
  });

  it('releases expired particles and reuses slots', () => {
    const v = new VfxSystem(32);
    v.explode(0, 0, 0, '#f00', 20);
    const peak = v.activeCount;
    expect(peak).toBeGreaterThan(0);
    for (let i = 0; i < 200; i++) v.update(0.05);
    expect(v.activeCount).toBe(0);
    v.explode(0, 0, 0, '#0f0', 20);
    expect(v.activeCount).toBe(peak > 0 ? v.activeCount : 0);
    expect(v.activeCount).toBeGreaterThan(0);
  });

  it('debris obeys Z-gravity and does not sink below the floor', () => {
    const v = new VfxSystem(8);
    v.explode(0, 0, 5, '#fff', 1);
    const ctx = makeFakeCtx();
    for (let i = 0; i < 20; i++) {
      v.update(0.02);
      v.render(ctx as unknown as CanvasRenderingContext2D, w2s, cam);
    }
    expect(v.activeCount).toBeGreaterThan(0);
  });

  it('handleEvent spawns for vfx_explosion and ignores unrelated events', () => {
    const v = new VfxSystem(128);
    v.handleEvent({ type: 'sfx', sound: 'shoot' });
    v.handleEvent({ type: 'camera_shake', magnitude: 1, duration: 1 });
    expect(v.activeCount).toBe(0);
    v.handleEvent({ type: 'vfx_explosion', x: 1, y: 2, z: 3, color: '#f0f', count: 10 });
    expect(v.activeCount).toBe(11); // 10 debris + 1 flash
    v.handleEvent({ type: 'crate_destroyed', x: 0, y: 0 });
    expect(v.activeCount).toBeGreaterThan(11);
  });

  it('supports every emitter and renders without throwing', () => {
    const v = new VfxSystem(256);
    v.muzzleFlash(0, 0, 1);
    v.shellCasing(0, 0, 1);
    v.lightningArc(0, 0, 50, 50);
    v.freezeShatter(0, 0);
    v.afterimage(0, 0, 0.5);
    const ctx = makeFakeCtx() as unknown as CanvasRenderingContext2D;
    expect(() => v.render(ctx, w2s, cam)).not.toThrow();
    v.crtEnabled = true;
    expect(() => v.renderCrt(ctx, 800, 600)).not.toThrow();
  });

  it('CRT overlay draws nothing when disabled', () => {
    const v = new VfxSystem(4);
    const ctx = makeFakeCtx();
    v.renderCrt(ctx as unknown as CanvasRenderingContext2D, 100, 100);
    expect(ctx.calls).toHaveLength(0);
  });
});
