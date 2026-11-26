import { describe, expect, it } from 'vitest';
import { fakeCanvasFactory } from '../render/testCanvas';
import { setCanvasFactory } from '../render/spriteStack';
import { isGalleryEnabled } from './gallery';
import { bootstrapAssets, LOAD_STAGES } from './loading';

describe('Async loading thermometer & chunked asset baking (Milestone 4)', () => {
  it('reports monotonic progress through named stages and yields baked caches', async () => {
    const factory = fakeCanvasFactory();
    setCanvasFactory(factory);
    const updates: Array<{ fraction: number; label: string }> = [];

    try {
      const { models, cache } = await bootstrapAssets((fraction, label) => {
        updates.push({ fraction, label });
      });

      expect(models.hero.torso.length).toBeGreaterThan(0);
      expect(updates.length).toBeGreaterThan(5);
      expect(updates[0].label).toBe(LOAD_STAGES[0]);
      expect(updates.some((u) => u.label === LOAD_STAGES[1])).toBe(true);
      expect(updates.some((u) => u.label === LOAD_STAGES[2])).toBe(true);
      expect(updates[updates.length - 1].fraction).toBe(1);
      for (let i = 1; i < updates.length; i++) {
        expect(updates[i].fraction).toBeGreaterThanOrEqual(updates[i - 1].fraction);
      }

      // Same eight bake tasks as the synchronous renderer path: 3 enforcer +
      // 2 shooter + 2 grenadier frames + 1 crate, each at 24 angles.
      expect(cache.stats.bakes).toBe(8 * 24);
      expect(cache.has('enforcer_melee#0')).toBe(true);
      expect(cache.has('laser_shooter#0')).toBe(true);
      expect(cache.has('grenadier#0')).toBe(true);
      expect(cache.has('crate')).toBe(true);
    } finally {
      setCanvasFactory(null);
    }
  });
});

describe('Milestone 4.1 — instant boot screen & sprite inspector', () => {
  it('names all four real boot stages for the inline thermometer', () => {
    expect(LOAD_STAGES).toHaveLength(4);
    expect(LOAD_STAGES[0]).toContain('LOADING ENGINE');
    expect(LOAD_STAGES[1]).toContain('VOXEL STACKS');
    expect(LOAD_STAGES[2]).toContain('24-ANGLE');
    expect(LOAD_STAGES[3]).toContain('CIRCUIT GRID');
  });

  it('opens the model gallery only for ?gallery=1', () => {
    expect(isGalleryEnabled('?gallery=1')).toBe(true);
    expect(isGalleryEnabled('?gallery=1&debug=1')).toBe(true);
    expect(isGalleryEnabled('')).toBe(false);
    expect(isGalleryEnabled('?gallery=0')).toBe(false);
  });
});
