import { worldToScreen } from '../engine/camera';
import type {
  CameraState,
  DifficultyConfig,
  EnemyState,
  GameEvent,
  InputState,
  PlatformIsland,
  PlayerState,
  PowerUpPickup,
  Projectile,
} from '../engine/types';
import { resolveEntityAgainstWorld } from '../world/worldSim';
import { addOrbital } from './orbitals';
import {
  applyModifierPickup,
  applyWeaponPickup,
  createStarterWeapon,
  fireWeapon,
} from './weapons';

const PLAYER_MOVE_SPEED = 230;
const DODGE_ROLL_SPEED = 470;
const ELECTRIFIED_WALL_DAMAGE = 20;
const RESURRECT_INVULN_SEC = 2.0;
const SAFE_EDGE_MARGIN = 34;

function normalizeAngleDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

function lerpAngleDeg(fromDeg: number, toDeg: number, t: number): number {
  const diff = ((toDeg - fromDeg + 540) % 360) - 180;
  return normalizeAngleDeg(fromDeg + diff * t);
}

export function createPlayer(
  x: number,
  y: number,
  config: DifficultyConfig,
): PlayerState {
  return {
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    radius: 14,
    legAngle: 0,
    aimAngle: 0,
    runCycle: 0,
    hp: config.playerMaxHp,
    maxHp: config.playerMaxHp,
    shield: config.playerMaxShield,
    maxShield: config.playerMaxShield,
    shieldRegenDelay: 0,
    lives: 3,
    dodgeTimer: 0,
    dodgeCooldown: 0,
    dodgeDirX: 0,
    dodgeDirY: -1,
    invulnTimer: 0,
    lastSafeX: x,
    lastSafeY: y,
    recoil: 0,
    muzzleFlash: 0,
    weapon: createStarterWeapon(),
    orbitals: [],
  };
}

export function isPlayerInvulnerable(player: PlayerState): boolean {
  return player.dodgeTimer > 0 || player.invulnTimer > 0;
}

export function damagePlayer(
  player: PlayerState,
  amount: number,
  config: DifficultyConfig,
  events: GameEvent[],
): boolean {
  if (amount <= 0 || isPlayerInvulnerable(player)) {
    return false;
  }

  player.shieldRegenDelay = config.shieldRegenDelaySec;
  let remaining = amount;

  if (player.shield > 0) {
    const absorbed = Math.min(player.shield, remaining);
    player.shield -= absorbed;
    remaining -= absorbed;
    if (player.shield <= 0) {
      player.shield = 0;
      events.push({ type: 'sfx', sound: 'shield_break', x: player.x, y: player.y });
    }
  }

  if (remaining > 0) {
    player.hp = Math.max(0, player.hp - remaining);
  }

  events.push(
    { type: 'sfx', sound: 'hit', x: player.x, y: player.y },
    { type: 'camera_shake', magnitude: 5, duration: 0.14 },
  );

  if (player.hp <= 0 && player.lives > 0) {
    player.lives -= 1;
    player.hp = player.maxHp;
    player.shield = player.maxShield;
    player.invulnTimer = RESURRECT_INVULN_SEC;
    events.push({
      type: 'vfx_explosion',
      x: player.x,
      y: player.y,
      z: 10,
      color: '#38bdf8',
      count: 18,
    });
  }

  return true;
}

export function applyDodgeShove(
  player: PlayerState,
  enemies: EnemyState[],
  config: DifficultyConfig,
): number {
  if (player.dodgeTimer <= 0) return 0;

  let shovedCount = 0;
  const maxRadius = config.dodgeKnockbackRadius;

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (enemy.hp <= 0) continue;

    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const distSq = dx * dx + dy * dy;
    const threshold = maxRadius + enemy.radius;

    if (distSq <= threshold * threshold) {
      const dist = distSq > 1e-6 ? Math.sqrt(distSq) : 1;
      const nx = distSq > 1e-6 ? dx / dist : player.dodgeDirX;
      const ny = distSq > 1e-6 ? dy / dist : player.dodgeDirY;
      enemy.vx += nx * config.dodgeKnockbackForce;
      enemy.vy += ny * config.dodgeKnockbackForce;
      shovedCount += 1;
    }
  }

  return shovedCount;
}

export function applyPowerUp(player: PlayerState, pickup: PowerUpPickup): void {
  switch (pickup.kind) {
    case 'weapon':
      if (pickup.weaponType) {
        applyWeaponPickup(player.weapon, pickup.weaponType);
      }
      break;
    case 'modifier':
      if (pickup.modifier) {
        applyModifierPickup(player.weapon, pickup.modifier);
      }
      break;
    case 'orbital':
      if (pickup.orbitalType) {
        addOrbital(player, pickup.orbitalType);
      }
      break;
    case 'shield_boost':
      player.shield = player.maxShield;
      player.hp = Math.min(player.maxHp, player.hp + 25);
      break;
    case 'extra_life':
      player.lives += 1;
      break;
  }
}

export function updatePlayer(
  player: PlayerState,
  input: InputState,
  camera: CameraState,
  island: PlatformIsland,
  config: DifficultyConfig,
  dt: number,
  events: GameEvent[],
  viewport?: { width: number; height: number },
): Projectile[] {
  if (dt <= 0) return [];

  // 1. Update timers
  if (player.dodgeTimer > 0) player.dodgeTimer = Math.max(0, player.dodgeTimer - dt);
  if (player.dodgeCooldown > 0) {
    player.dodgeCooldown = Math.max(0, player.dodgeCooldown - dt);
  }
  if (player.invulnTimer > 0) player.invulnTimer = Math.max(0, player.invulnTimer - dt);
  if (player.recoil > 0) player.recoil = Math.max(0, player.recoil - dt * 6);
  if (player.muzzleFlash > 0) player.muzzleFlash = Math.max(0, player.muzzleFlash - dt);
  if (player.weapon.fireCooldown > 0) {
    player.weapon.fireCooldown = Math.max(0, player.weapon.fireCooldown - dt);
  }

  // 2. Regenerating energy shield
  let regenDt = dt;
  if (player.shieldRegenDelay > 0) {
    const consumed = Math.min(player.shieldRegenDelay, dt);
    player.shieldRegenDelay = Math.max(0, player.shieldRegenDelay - consumed);
    regenDt = dt - consumed;
  }
  if (regenDt > 0 && player.shield < player.maxShield) {
    player.shield = Math.min(player.maxShield, player.shield + config.shieldRegenRate * regenDt);
  }

  // 3. Rotate raw WASD input by -camera.angleDeg so screen-up is always W
  let moveX = input.moveX;
  let moveY = input.moveY;
  if (moveX !== 0 || moveY !== 0) {
    const camRad = (-camera.angleDeg * Math.PI) / 180;
    const cos = Math.cos(camRad);
    const sin = Math.sin(camRad);
    const rx = moveX * cos - moveY * sin;
    const ry = moveX * sin + moveY * cos;
    const mag = Math.hypot(rx, ry);
    moveX = mag > 0 ? rx / mag : 0;
    moveY = mag > 0 ? ry / mag : 0;
  }

  // 4. Spacebar dodge-roll (i-frames + speed burst + radial shove)
  if (input.dodgePressed && player.dodgeCooldown <= 0 && player.dodgeTimer <= 0) {
    player.dodgeTimer = config.dodgeDurationSec;
    player.dodgeCooldown = config.dodgeCooldownSec;

    if (moveX !== 0 || moveY !== 0) {
      player.dodgeDirX = moveX;
      player.dodgeDirY = moveY;
    } else {
      const facingRad = (player.legAngle * Math.PI) / 180;
      player.dodgeDirX = Math.sin(facingRad);
      player.dodgeDirY = -Math.cos(facingRad);
    }

    player.legAngle = normalizeAngleDeg(
      (Math.atan2(player.dodgeDirX, -player.dodgeDirY) * 180) / Math.PI,
    );
    events.push({ type: 'sfx', sound: 'dodge', x: player.x, y: player.y });
  }

  // 5. Horizontal velocity & leg gait
  if (player.dodgeTimer > 0) {
    player.vx = player.dodgeDirX * DODGE_ROLL_SPEED;
    player.vy = player.dodgeDirY * DODGE_ROLL_SPEED;
  } else if (moveX !== 0 || moveY !== 0) {
    player.vx = moveX * PLAYER_MOVE_SPEED;
    player.vy = moveY * PLAYER_MOVE_SPEED;
    const targetLegAngle = normalizeAngleDeg((Math.atan2(moveX, -moveY) * 180) / Math.PI);
    const turnT = 1 - Math.exp(-16 * dt);
    player.legAngle = lerpAngleDeg(player.legAngle, targetLegAngle, turnT);
    player.runCycle += dt * 11;
  } else {
    const damping = Math.exp(-14 * dt);
    player.vx *= damping;
    player.vy *= damping;
    if (Math.hypot(player.vx, player.vy) < 4) {
      player.vx = 0;
      player.vy = 0;
    }
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;

  // 6. Independent 360° aiming from mouse cursor
  if (viewport || input.mouseScreenX !== 0 || input.mouseScreenY !== 0) {
    const viewW = viewport?.width ?? 1280;
    const viewH = viewport?.height ?? 720;
    const playerScreen = worldToScreen(player.x, player.y, camera, viewW, viewH);
    const sdx = input.mouseScreenX - playerScreen.x;
    const sdy = input.mouseScreenY - playerScreen.y;
    if (sdx * sdx + sdy * sdy > 1) {
      const screenAim = normalizeAngleDeg((Math.atan2(sdx, -sdy) * 180) / Math.PI);
      player.aimAngle = normalizeAngleDeg(screenAim - camera.angleDeg);
    }
  }

  // 7. World collision, electrified walls & open-edge chasm fall + resurrection
  const collision = resolveEntityAgainstWorld(player, island);

  if (collision.hitElectrifiedWall) {
    events.push({ type: 'sfx', sound: 'electric_zap', x: player.x, y: player.y });
    damagePlayer(player, ELECTRIFIED_WALL_DAMAGE, config, events);
  }

  if (collision.fellOffEdge) {
    events.push(
      { type: 'player_fell', x: player.x, y: player.y },
      { type: 'sfx', sound: 'explosion', x: player.x, y: player.y },
      { type: 'camera_shake', magnitude: 9, duration: 0.28 },
    );

    player.lives = Math.max(0, player.lives - 1);

    // Resurrect near last safe edge position, nudged slightly inward toward island center
    const centerX = island.bounds.x + island.bounds.w * 0.5;
    const centerY = island.bounds.y + island.bounds.h * 0.5;
    const toCenterX = centerX - player.lastSafeX;
    const toCenterY = centerY - player.lastSafeY;
    const toCenterMag = Math.hypot(toCenterX, toCenterY);
    const nudge = 24;

    player.x =
      toCenterMag > 1
        ? player.lastSafeX + (toCenterX / toCenterMag) * nudge
        : centerX;
    player.y =
      toCenterMag > 1
        ? player.lastSafeY + (toCenterY / toCenterMag) * nudge
        : centerY;
    player.z = 0;
    player.vx = 0;
    player.vy = 0;
    player.dodgeTimer = 0;
    player.shield = player.maxShield;
    player.invulnTimer = RESURRECT_INVULN_SEC;
  } else {
    // Track last safe position when comfortably inside the island bounds
    const b = island.bounds;
    if (
      player.x >= b.x + SAFE_EDGE_MARGIN &&
      player.x <= b.x + b.w - SAFE_EDGE_MARGIN &&
      player.y >= b.y + SAFE_EDGE_MARGIN &&
      player.y <= b.y + b.h - SAFE_EDGE_MARGIN
    ) {
      player.lastSafeX = player.x;
      player.lastSafeY = player.y;
    }
  }

  // 8. Weapon firing (disabled mid-dodge-roll)
  if (input.firing && player.weapon.fireCooldown <= 0 && player.dodgeTimer <= 0) {
    return fireWeapon(player, events);
  }

  return [];
}
