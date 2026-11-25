import type { DifficultyConfig } from '../engine/types';

export const DEFAULT_DIFFICULTY: DifficultyConfig = {
  maxMeleeEnforcers: 220,
  maxShootersAndGrenadiers: 75,
  enforcerSpeed: 115,
  enforcerHp: 25,
  shooterHp: 45,
  grenadierHp: 60,
  enemyProjectileSpeed: 280,
  ottoWarningSec: 45,
  playerMaxHp: 100,
  playerMaxShield: 100,
  shieldRegenRate: 18,
  shieldRegenDelaySec: 3.0,
  dodgeCooldownSec: 0.75,
  dodgeDurationSec: 0.24,
  dodgeKnockbackRadius: 68,
  dodgeKnockbackForce: 260,
};

export function createDifficultyConfig(
  overrides: Partial<DifficultyConfig> = {},
): DifficultyConfig {
  return {
    ...DEFAULT_DIFFICULTY,
    ...overrides,
  };
}
