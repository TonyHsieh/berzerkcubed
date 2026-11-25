import { describe, expect, it } from 'vitest';
import type { CameraState } from '../engine/types';
import { CircuitBackground } from './circuitBg';
import { makeFakeCtx } from './testCanvas';

const cam: CameraState = { x: 123, y: -45, angleDeg: 30, targetAngleDeg: 30, tiltScale: 1, layerSpacing: 2, shakeMag: 0, shakeTimer: 0 };

describe('CircuitBackground', () => {
  it('is deterministic per seed and advances blips on update', () => {
    const a = new CircuitBackground(7);
    const b = new CircuitBackground(7);
    expect(a.blipPositions(0)).toEqual(b.blipPositions(0));
    const before = a.blipPositions(1);
    a.update(0.1);
    expect(a.blipPositions(1)).not.toEqual(before);
    expect(a.planeCount).toBe(3);
  });
  it('renders without throwing for a rotated camera', () => {
    const bg = new CircuitBackground();
    const ctx = makeFakeCtx();
    expect(() => bg.render(ctx as unknown as CanvasRenderingContext2D, cam, 800, 600)).not.toThrow();
    expect(ctx.calls.some((c) => c.fn === 'stroke')).toBe(true);
  });
});
