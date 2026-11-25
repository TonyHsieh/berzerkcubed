import { describe, expect, it } from 'vitest';
import { createDifficultyConfig, DEFAULT_DIFFICULTY } from './difficulty';

describe('DifficultyConfig', () => {
  it('defaults to 200+ melee enforcers and 50-100 shooters/grenadiers', () => {
    expect(DEFAULT_DIFFICULTY.maxMeleeEnforcers).toBeGreaterThanOrEqual(200);
    expect(DEFAULT_DIFFICULTY.maxShootersAndGrenadiers).toBeGreaterThanOrEqual(50);
    expect(DEFAULT_DIFFICULTY.maxShootersAndGrenadiers).toBeLessThanOrEqual(100);
  });

  it('supports designer overrides without mutating defaults', () => {
    const custom = createDifficultyConfig({ maxMeleeEnforcers: 300 });
    expect(custom.maxMeleeEnforcers).toBe(300);
    expect(DEFAULT_DIFFICULTY.maxMeleeEnforcers).toBe(220);
  });
});
