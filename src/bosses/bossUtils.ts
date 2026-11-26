import { getChillSpeedMultiplier, recoverChillSlow } from '../enemies/enemyUtils';
import type { BossState, GameEvent, PlayerState } from '../engine/types';

export const BOSS_REZ_DURATION = 1.0;
export const BOSS_FIRE_ANIM_SEC = 0.22;
export const RAMPAGE_DURATION_SEC = 3.0;
export const RAMPAGE_COOLDOWN_SEC = 11.0;
const SHIELD_REGEN_RATE = 18;
export const SHIELD_REGEN_DELAY_SEC = 3.5;

let bossProjSeq = 0;

export function nextBossProjectileId(prefix: string): string {
  bossProjSeq += 1;
  return `${prefix}_${bossProjSeq}`;
}

/**
 * Applies higher-sector toughness scaling for `sectorIndex >= 2`:
 *  - Higher HP scaling across total HP and all parts
 *  - Multiple regenerating shield layers (`shieldLayers`, `maxShieldLayers`, `shieldLayerHp`)
 *  - Periodic Rampage Invulnerability (`rampageCooldown`, `rampageTimer`)
 */
export function applyHigherSectorBossScaling(
  boss: BossState,
  sectorIndex: number,
): BossState {
  if (sectorIndex < 2) return boss;

  const hpScale = 1 + (sectorIndex - 1) * 0.35;
  boss.maxHp = Math.round(boss.maxHp * hpScale);
  boss.hp = boss.maxHp;
  for (let i = 0; i < boss.parts.length; i++) {
    const part = boss.parts[i];
    part.maxHp = Math.round(part.maxHp * hpScale);
    part.hp = part.maxHp;
  }

  // Multi-layer regenerating shields (2 layers at sector 2-3, 3 at 4-5, 4 at 6+)
  const layers = Math.min(4, 1 + Math.floor(sectorIndex / 2));
  const layerHp = Math.max(120, Math.round(boss.maxHp * 0.14));
  boss.shieldLayers = layers;
  boss.maxShieldLayers = layers;
  boss.shieldLayerHp = layerHp;
  boss.shieldHp = layerHp;
  boss.shieldMaxHp = layerHp;
  boss.shieldRegenDelay = 0;

  // Periodic Rampage Invulnerability bursts
  boss.rampageTimer = 0;
  boss.rampageCooldown = RAMPAGE_COOLDOWN_SEC;

  return boss;
}

/**
 * Advances shared boss timers: hitFlash, fireAnimTimer, TRON rez-in pause,
 * higher-sector multi-layer shield regeneration, and periodic Rampage
 * Invulnerability bursts.
 */
export function stepBossCommonTimers(
  boss: BossState,
  dt: number,
  events: GameEvent[],
): { rezzing: boolean; rampaging: boolean; speedMult: number } {
  if (boss.hitFlash > 0) {
    boss.hitFlash = Math.max(0, boss.hitFlash - dt);
  }
  if ((boss.fireAnimTimer ?? 0) > 0) {
    boss.fireAnimTimer = Math.max(0, (boss.fireAnimTimer ?? 0) - dt);
  }
  if ((boss.lightningFlashTimer ?? 0) > 0) {
    boss.lightningFlashTimer = Math.max(0, (boss.lightningFlashTimer ?? 0) - dt);
  }
  if ((boss.chillSlow ?? 0) > 0) {
    recoverChillSlow(boss, dt);
  }

  // TRON Rez-In materialization: invulnerable, stationary, cannot attack
  if ((boss.rezTimer ?? 0) > 0) {
    boss.rezTimer = Math.max(0, (boss.rezTimer ?? 0) - dt);
    boss.vx = 0;
    boss.vy = 0;
    return { rezzing: true, rampaging: false, speedMult: 0 };
  }

  // Higher-sector multi-layer shield regeneration (when boss has layered shields)
  if ((boss.maxShieldLayers ?? 0) > 0 && (boss.shieldLayers ?? 0) > 0) {
    if ((boss.shieldRegenDelay ?? 0) > 0) {
      boss.shieldRegenDelay = Math.max(0, (boss.shieldRegenDelay ?? 0) - dt);
    } else {
      const layerMax = boss.shieldLayerHp ?? boss.shieldMaxHp ?? 120;
      if ((boss.shieldHp ?? 0) < layerMax) {
        boss.shieldHp = Math.min(layerMax, (boss.shieldHp ?? 0) + SHIELD_REGEN_RATE * dt);
      }
    }
  }

  // Periodic Rampage Invulnerability (2.5-3.5s bursts with accelerated attacks)
  if (boss.rampageCooldown !== undefined) {
    if ((boss.rampageTimer ?? 0) > 0) {
      boss.rampageTimer = Math.max(0, (boss.rampageTimer ?? 0) - dt);
      if (boss.rampageTimer <= 0) {
        boss.rampageCooldown = RAMPAGE_COOLDOWN_SEC;
      }
    } else {
      boss.rampageCooldown = Math.max(0, boss.rampageCooldown - dt);
      if (boss.rampageCooldown <= 0) {
        boss.rampageTimer = RAMPAGE_DURATION_SEC;
        events.push({ type: 'sfx', sound: 'shield_break', x: boss.x, y: boss.y });
        events.push({ type: 'camera_shake', magnitude: 9, duration: 0.3 });
      }
    }
  }

  const rampaging = (boss.rampageTimer ?? 0) > 0;
  const chillMult = getChillSpeedMultiplier(boss);
  return {
    rezzing: false,
    rampaging,
    speedMult: (rampaging ? 1.45 : 1.0) * chillMult,
  };
}

/**
 * Applies boss contact/shockwave damage to the player.
 * Respects Spacebar dodge-roll i-frames (`dodgeTimer > 0`) and post-hit `invulnTimer > 0`.
 * Shield absorbs damage first; overflow damages HP.
 */
export function applyBossDamageToPlayer(
  player: PlayerState,
  damage: number,
  sourceX: number,
  sourceY: number,
  knockbackSpeed: number,
  events: GameEvent[],
): boolean {
  if (
    player.dodgeTimer > 0 ||
    player.invulnTimer > 0 ||
    (player.deathTimer ?? 0) > 0 ||
    (player.rezTimer ?? 0) > 0 ||
    damage <= 0
  ) {
    return false;
  }

  let remaining = damage;
  const hadShield = player.shield > 0;
  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, remaining);
    player.shield -= absorbed;
    remaining -= absorbed;
  }

  if (hadShield && player.shield <= 0) {
    events.push({
      type: 'sfx',
      sound: 'shield_break',
      x: player.x,
      y: player.y,
    });
  }

  if (remaining > 0) {
    player.hp = Math.max(0, player.hp - remaining);
  }

  player.invulnTimer = 0.45;
  player.shieldRegenDelay = Math.max(player.shieldRegenDelay, 3.0);

  // Knockback away from boss
  const dx = player.x - sourceX;
  const dy = player.y - sourceY;
  const dist = Math.hypot(dx, dy);
  if (dist > 1e-4) {
    player.vx = (dx / dist) * knockbackSpeed;
    player.vy = (dy / dist) * knockbackSpeed;
  } else {
    player.vx = knockbackSpeed;
    player.vy = 0;
  }

  events.push({ type: 'sfx', sound: 'hit', x: player.x, y: player.y });
  events.push({ type: 'camera_shake', magnitude: 8, duration: 0.22 });
  return true;
}
