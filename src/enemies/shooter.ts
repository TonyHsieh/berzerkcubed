import type {
  DifficultyConfig,
  EnemyState,
  GameEvent,
  PlatformIsland,
  PlayerState,
  Projectile,
} from '../engine/types';
import {
  getChillSpeedMultiplier,
  hashToUnit,
  recoverChillSlow,
  resolveEnemyAgainstIsland,
  vectorToAngleDeg,
} from './enemyUtils';

export const SHOOTER_RADIUS = 14;
export const VBOT_LASER_RADIUS = 13;
export const GRENADIER_RADIUS = 15;
export const GRENADE_GRAVITY = 380;
export const ENEMY_FIRE_ANIM_SEC = 0.22;

const SHOOTER_PREF_MIN = 170;
const SHOOTER_PREF_MAX = 300;
const SHOOTER_FIRE_RANGE = 480;
const SHOOTER_TELEGRAPH_SEC = 0.55;
const SHOOTER_COOLDOWN_SEC = 1.65;

const VBOT_LASER_PREF_MIN = 150;
const VBOT_LASER_PREF_MAX = 270;
const VBOT_LASER_FIRE_RANGE = 440;
const VBOT_LASER_TELEGRAPH_SEC = 0.42;
const VBOT_LASER_COOLDOWN_SEC = 1.35;

const GRENADIER_PREF_MIN = 210;
const GRENADIER_PREF_MAX = 380;
const GRENADIER_FIRE_RANGE = 520;
const GRENADIER_TELEGRAPH_SEC = 0.45;
const GRENADIER_COOLDOWN_SEC = 2.4;

const FROZEN_RATE_MULT = 0.5;

let projectileSeq = 0;

function nextProjectileId(prefix: string): string {
  projectileSeq += 1;
  return `${prefix}_${projectileSeq}`;
}

export function createLaserShooter(
  id: string,
  x: number,
  y: number,
  config: DifficultyConfig,
  rezDuration = 0,
): EnemyState {
  const stagger = hashToUnit(id) * 0.9;
  return {
    id,
    kind: 'laser_shooter',
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    radius: SHOOTER_RADIUS,
    angle: 0,
    animFrame: hashToUnit(id) * 4,
    hp: config.shooterHp,
    maxHp: config.shooterHp,
    fireCooldown: 0.5 + stagger,
    telegraphTimer: 0,
    freezeTimer: 0,
    hitFlash: 0,
    fireAnimTimer: 0,
    rezTimer: rezDuration,
    rezDuration,
  };
}

/**
 * Yellow V-Bot: mid-range laser shooter with yellow/white striped V-body,
 * firing glowing bolts from its central optical eye emitter with firing flash.
 */
export function createVBotLaser(
  id: string,
  x: number,
  y: number,
  config: DifficultyConfig,
  rezDuration = 0,
): EnemyState {
  const stagger = hashToUnit(id) * 0.7;
  const hp = Math.max(12, Math.round(config.shooterHp * 0.9));
  return {
    id,
    kind: 'v_bot_laser',
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    radius: VBOT_LASER_RADIUS,
    angle: 0,
    animFrame: hashToUnit(id) * 4,
    hp,
    maxHp: hp,
    fireCooldown: 0.4 + stagger,
    telegraphTimer: 0,
    freezeTimer: 0,
    hitFlash: 0,
    fireAnimTimer: 0,
    rezTimer: rezDuration,
    rezDuration,
  };
}

export function createGrenadier(
  id: string,
  x: number,
  y: number,
  config: DifficultyConfig,
  rezDuration = 0,
): EnemyState {
  const stagger = hashToUnit(id) * 1.1;
  return {
    id,
    kind: 'grenadier',
    x,
    y,
    z: 0,
    vx: 0,
    vy: 0,
    radius: GRENADIER_RADIUS,
    angle: 0,
    animFrame: hashToUnit(id) * 4,
    hp: config.grenadierHp,
    maxHp: config.grenadierHp,
    fireCooldown: 0.8 + stagger,
    telegraphTimer: 0,
    freezeTimer: 0,
    hitFlash: 0,
    fireAnimTimer: 0,
    rezTimer: rezDuration,
    rezDuration,
  };
}

export function isRangedEnemyKind(kind: EnemyState['kind']): boolean {
  return kind === 'laser_shooter' || kind === 'v_bot_laser' || kind === 'grenadier';
}

/**
 * Updates Laser Shooters, Yellow V-Bots (mid-range laser), and Grenadiers.
 * Respects rez-in materialization pause and sets `fireAnimTimer` (~0.22s) on fire.
 */
export function updateRangedEnemies(
  enemies: EnemyState[],
  player: PlayerState,
  island: PlatformIsland,
  config: DifficultyConfig,
  dt: number,
  events: GameEvent[],
): Projectile[] {
  const spawned: Projectile[] = [];
  if (dt <= 0) return spawned;

  const baseMoveSpeed = config.enforcerSpeed * 0.72;

  for (let i = 0; i < enemies.length; i++) {
    const enemy = enemies[i];
    if (!isRangedEnemyKind(enemy.kind) || enemy.hp <= 0) {
      continue;
    }

    // TRON Rez-In materialization: stationary, invulnerable, cannot attack or fire
    if ((enemy.rezTimer ?? 0) > 0) {
      enemy.rezTimer = Math.max(0, (enemy.rezTimer ?? 0) - dt);
      enemy.vx = 0;
      enemy.vy = 0;
      continue;
    }

    if (enemy.hitFlash > 0) {
      enemy.hitFlash = Math.max(0, enemy.hitFlash - dt);
    }

    if ((enemy.fireAnimTimer ?? 0) > 0) {
      enemy.fireAnimTimer = Math.max(0, (enemy.fireAnimTimer ?? 0) - dt);
    }
    if ((enemy.lightningFlashTimer ?? 0) > 0) {
      enemy.lightningFlashTimer = Math.max(0, (enemy.lightningFlashTimer ?? 0) - dt);
    }

    const isFrozen = enemy.freezeTimer > 0;
    if (isFrozen) {
      enemy.freezeTimer = Math.max(0, enemy.freezeTimer - dt);
    }
    if ((enemy.chillSlow ?? 0) > 0) {
      recoverChillSlow(enemy, dt);
    }

    const chillMult = getChillSpeedMultiplier(enemy);
    const rateScale = isFrozen || (enemy.chillSlow ?? 0) > 0 ? Math.max(FROZEN_RATE_MULT, chillMult) : 1;
    const isVBotLaser = enemy.kind === 'v_bot_laser';
    const speedMult = isVBotLaser ? 1.18 : 1;
    const moveSpeed = baseMoveSpeed * speedMult * chillMult;

    const dx = player.x - enemy.x;
    const dy = player.y - enemy.y;
    const dist = Math.hypot(dx, dy);
    const dirX = dist > 1e-4 ? dx / dist : 0;
    const dirY = dist > 1e-4 ? dy / dist : -1;

    enemy.angle = vectorToAngleDeg(dirX, dirY);

    const isShooter = enemy.kind === 'laser_shooter';
    const prefMin = isVBotLaser
      ? VBOT_LASER_PREF_MIN
      : isShooter
        ? SHOOTER_PREF_MIN
        : GRENADIER_PREF_MIN;
    const prefMax = isVBotLaser
      ? VBOT_LASER_PREF_MAX
      : isShooter
        ? SHOOTER_PREF_MAX
        : GRENADIER_PREF_MAX;
    const fireRange = isVBotLaser
      ? VBOT_LASER_FIRE_RANGE
      : isShooter
        ? SHOOTER_FIRE_RANGE
        : GRENADIER_FIRE_RANGE;

    // Maintain preferred range; slow down while actively telegraphing a shot
    let desiredVx = 0;
    let desiredVy = 0;
    const telegraphMoveScale = enemy.telegraphTimer > 0 ? 0.25 : 1;

    if (dist > prefMax) {
      desiredVx = dirX * moveSpeed * telegraphMoveScale;
      desiredVy = dirY * moveSpeed * telegraphMoveScale;
    } else if (dist < prefMin) {
      desiredVx = -dirX * moveSpeed * 0.9 * telegraphMoveScale;
      desiredVy = -dirY * moveSpeed * 0.9 * telegraphMoveScale;
    } else {
      // Strafe perpendicular to player
      const strafeSign = hashToUnit(enemy.id) < 0.5 ? 1 : -1;
      desiredVx = -dirY * strafeSign * moveSpeed * 0.55 * telegraphMoveScale;
      desiredVy = dirX * strafeSign * moveSpeed * 0.55 * telegraphMoveScale;
    }

    const blend = Math.min(1, dt * 8);
    enemy.vx += (desiredVx - enemy.vx) * blend;
    enemy.vy += (desiredVy - enemy.vy) * blend;
    enemy.x += enemy.vx * dt;
    enemy.y += enemy.vy * dt;

    resolveEnemyAgainstIsland(enemy, island);

    enemy.animFrame = (enemy.animFrame + dt * (isFrozen ? 2 : 6)) % 4;

    // Weapon cooldown & telegraph state machine
    if (enemy.telegraphTimer > 0) {
      enemy.telegraphTimer = Math.max(0, enemy.telegraphTimer - dt * rateScale);
      if (enemy.telegraphTimer <= 0) {
        const stagger = hashToUnit(enemy.id) * 0.4;
        enemy.fireAnimTimer = ENEMY_FIRE_ANIM_SEC;
        if (isVBotLaser) {
          const speed = config.enemyProjectileSpeed * 1.1;
          spawned.push({
            id: nextProjectileId('vbolt'),
            owner: 'enemy',
            kind: 'bolt',
            x: enemy.x + dirX * (enemy.radius + 4),
            y: enemy.y + dirY * (enemy.radius + 4),
            z: 11,
            vx: dirX * speed,
            vy: dirY * speed,
            vz: 0,
            radius: 5,
            damage: 13,
            life: 2.4,
            maxLife: 2.4,
            bouncesLeft: 0,
            modifiers: [],
            color: '#facc15',
          });
          enemy.fireCooldown = VBOT_LASER_COOLDOWN_SEC + stagger;
        } else if (isShooter) {
          const speed = config.enemyProjectileSpeed;
          spawned.push({
            id: nextProjectileId('ebolt'),
            owner: 'enemy',
            kind: 'bolt',
            x: enemy.x + dirX * (enemy.radius + 4),
            y: enemy.y + dirY * (enemy.radius + 4),
            z: 10,
            vx: dirX * speed,
            vy: dirY * speed,
            vz: 0,
            radius: 5,
            damage: 14,
            life: 2.6,
            maxLife: 2.6,
            bouncesLeft: 0,
            modifiers: [],
            color: '#ff2a55',
          });
          enemy.fireCooldown = SHOOTER_COOLDOWN_SEC + stagger;
        } else {
          // High-arcing Z-altitude plasma grenade with ground warning target
          const lobSpeed = Math.max(120, config.enemyProjectileSpeed * 0.65);
          const flightSec = Math.max(0.7, Math.min(1.5, dist / lobSpeed));
          const vx = dx / flightSec;
          const vy = dy / flightSec;
          const vz = 0.5 * GRENADE_GRAVITY * flightSec;

          spawned.push({
            id: nextProjectileId('egren'),
            owner: 'enemy',
            kind: 'grenade',
            x: enemy.x + dirX * (enemy.radius + 4),
            y: enemy.y + dirY * (enemy.radius + 4),
            z: 12,
            vx,
            vy,
            vz,
            radius: 7,
            damage: 24,
            life: flightSec,
            maxLife: flightSec,
            bouncesLeft: 0,
            modifiers: [],
            color: '#ff9500',
            targetX: player.x,
            targetY: player.y,
          });
          enemy.fireCooldown = GRENADIER_COOLDOWN_SEC + stagger;
        }

        events.push({
          type: 'sfx',
          sound: 'shoot',
          x: enemy.x,
          y: enemy.y,
        });
      }
    } else {
      if (enemy.fireCooldown > 0) {
        enemy.fireCooldown = Math.max(0, enemy.fireCooldown - dt * rateScale);
      }
      if (enemy.fireCooldown <= 0 && dist <= fireRange) {
        enemy.telegraphTimer = isVBotLaser
          ? VBOT_LASER_TELEGRAPH_SEC
          : isShooter
            ? SHOOTER_TELEGRAPH_SEC
            : GRENADIER_TELEGRAPH_SEC;
      }
    }
  }

  return spawned;
}
