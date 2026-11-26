import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildAllModels, bakeSwarmCaches, enemyCacheKey } from './models';
import { makeFakeCtx, fakeCanvasFactory, type FakeCtx } from './testCanvas';
import {
  DEFAULT_SLICE_PITCH_Y,
  drawStack,
  SpriteStackCache,
  makeSlice,
  quantizeAngleIndex,
  setCanvasFactory,
} from './spriteStack';

const asCtx = (c: FakeCtx) => c as unknown as CanvasRenderingContext2D;
const drawCalls = (c: FakeCtx) => c.calls.filter((x) => x.fn === 'drawImage');

describe('spriteStack caching', () => {
  let created: HTMLCanvasElement[];
  beforeEach(() => {
    created = [];
    setCanvasFactory(fakeCanvasFactory(created));
  });
  afterEach(() => setCanvasFactory(null));

  it('makeSlice uses the injected factory and runs drawFn', () => {
    let ran = 0;
    const s = makeSlice(24, () => ran++);
    expect(ran).toBe(1);
    expect(s.width).toBe(24);
  });

  it('quantizes to 24 steps of 15° with wraparound and negatives', () => {
    expect(quantizeAngleIndex(0, 24)).toBe(0);
    expect(quantizeAngleIndex(7, 24)).toBe(0);
    expect(quantizeAngleIndex(8, 24)).toBe(1);
    expect(quantizeAngleIndex(359, 24)).toBe(0);
    expect(quantizeAngleIndex(-15, 24)).toBe(23);
    expect(quantizeAngleIndex(375, 24)).toBe(1);
  });

  it('bake creates 24 tiles by default (and honors angleSteps)', () => {
    const cache = new SpriteStackCache();
    const slices = [makeSlice(24, () => {}), makeSlice(24, () => {})];
    const before = created.length;
    cache.bake('a', slices, 2, 2);
    expect(created.length - before).toBe(24);
    expect(cache.angleSteps('a')).toBe(24);
    cache.bake('b', slices, 2, 2, 8);
    expect(cache.angleSteps('b')).toBe(8);
    expect(cache.stats.bakes).toBe(32);
  });

  it('drawCached issues exactly one drawImage and reuses the same tile for nearby angles', () => {
    const cache = new SpriteStackCache();
    cache.bake('a', [makeSlice(24, () => {})], 2, 2);
    const ctx = makeFakeCtx();
    expect(cache.drawCached(asCtx(ctx), 'a', 100, 100, 3, 0)).toBe(true);
    expect(drawCalls(ctx)).toHaveLength(1);
    expect(cache.getTile('a', 3, 0)).toBe(cache.getTile('a', -4, 0));
    expect(cache.getTile('a', 3, 0)).not.toBe(cache.getTile('a', 20, 0));
    // camera angle contributes to the quantized total angle
    expect(cache.getTile('a', 0, 90)).toBe(cache.getTile('a', 90, 0));
  });

  it('never re-bakes on draw: baking cost is paid once', () => {
    const cache = new SpriteStackCache();
    cache.bake('a', [makeSlice(24, () => {})], 2, 2);
    const n = created.length;
    const ctx = makeFakeCtx();
    for (let i = 0; i < 500; i++) cache.drawCached(asCtx(ctx), 'a', i, i, i * 7, 0);
    expect(created.length).toBe(n);
    expect(cache.stats.hits).toBe(500);
    expect(drawCalls(ctx)).toHaveLength(500);
  });

  it('returns false for an unbaked key and draws nothing', () => {
    const cache = new SpriteStackCache();
    const ctx = makeFakeCtx();
    expect(cache.drawCached(asCtx(ctx), 'nope', 0, 0, 0, 0)).toBe(false);
    expect(drawCalls(ctx)).toHaveLength(0);
    expect(cache.stats.misses).toBe(1);
  });

  it('z lift moves the draw position up', () => {
    const cache = new SpriteStackCache();
    cache.bake('a', [makeSlice(24, () => {})], 1, 2);
    const a = makeFakeCtx();
    const b = makeFakeCtx();
    cache.drawCached(asCtx(a), 'a', 50, 50, 0, 0, 0);
    cache.drawCached(asCtx(b), 'a', 50, 50, 0, 0, 10);
    expect((a.calls[0].args[2] as number) - (b.calls[0].args[2] as number)).toBe(10);
  });

  it('bakes the swarm enemy set from real models', () => {
    const cache = new SpriteStackCache();
    const models = buildAllModels();
    bakeSwarmCaches(cache, models, 2.4, 2);
    for (let f = 0; f < models.enforcer.length; f++) {
      expect(cache.has(enemyCacheKey('enforcer_melee', f))).toBe(true);
    }
    expect(models.enforcer.length).toBeGreaterThanOrEqual(2);
    expect(models.enforcer.length).toBeLessThanOrEqual(4);
    expect(cache.has('laser_shooter#0') && cache.has('grenadier#0') && cache.has('crate')).toBe(true);
    expect(cache.has('v_bot_melee#0') && cache.has('v_bot_laser#0')).toBe(true);
    expect(models.recogniser.legs).toHaveLength(2);
    expect(models.abb.length).toBeGreaterThan(0);
    expect(models.skullhead.body.length).toBeGreaterThan(0);
    expect(models.bugHive.hive.length).toBeGreaterThan(0);
    expect(models.bugHive.bugBot.length).toBeGreaterThan(0);
    expect(models.brainbot.length).toBeGreaterThan(0);
    expect(models.evilOtto.vortex.length).toBeGreaterThan(0);
  });

  it('applies 3/4 pitch foreshortening (slicePitchY) before rotate in drawStack and SpriteStackCache.bake', () => {
    const slices = [makeSlice(24, () => {}), makeSlice(24, () => {})];
    const ctx = makeFakeCtx();
    drawStack(asCtx(ctx), slices, 100, 120, 45, 0, 2, 0, 2.8);

    // For each slice: translate -> scale(1, 0.64) -> rotate -> scale(2, 2) -> drawImage
    const firstSliceOps = ctx.calls.slice(0, 7).map((c) => c.fn);
    const pitchScaleIdx = firstSliceOps.indexOf('scale');
    const rotateIdx = firstSliceOps.indexOf('rotate');
    expect(pitchScaleIdx).toBeGreaterThan(-1);
    expect(rotateIdx).toBeGreaterThan(pitchScaleIdx);
    expect(ctx.calls[pitchScaleIdx].args).toEqual([1, DEFAULT_SLICE_PITCH_Y]);

    // SpriteStackCache.bake still bakes 24 quantized tiles with 3/4 pitch intact
    const cache = new SpriteStackCache();
    cache.bake('pitched_unit', slices, 2, 2.8);
    expect(cache.angleSteps('pitched_unit')).toBe(24);
    const drawCtx = makeFakeCtx();
    expect(cache.drawCached(asCtx(drawCtx), 'pitched_unit', 80, 90, 30, 0)).toBe(true);
    expect(drawCalls(drawCtx)).toHaveLength(1);
  });
});
