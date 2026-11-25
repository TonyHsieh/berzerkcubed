import type { GameEvent, PlayerState } from '../engine/types';

let bossProjSeq = 0;

export function nextBossProjectileId(prefix: string): string {
  bossProjSeq += 1;
  return `${prefix}_${bossProjSeq}`;
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
  if (player.dodgeTimer > 0 || player.invulnTimer > 0 || damage <= 0) {
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
