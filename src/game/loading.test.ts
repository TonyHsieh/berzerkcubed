import { describe, expect, it } from 'vitest';
import { fakeCanvasFactory } from '../render/testCanvas';
import { setCanvasFactory } from '../render/spriteStack';
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
