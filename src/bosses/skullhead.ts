import { vectorToAngleDeg } from '../enemies/enemyUtils';
import type {
  BossState,
  GameEvent,
  PlayerState,
  Projectile,
} from '../engine/types';
import {
  applyBossDamageToPlayer,
  BOSS_FIRE_ANIM_SEC,
  nextBossProjectileId,
  stepBossCommonTimers,
} from './bossUtils';

const SKULLHEAD_RADIUS = 52;
const SKULLHEAD_MAX_HP = 1250;
const HOVER_Z = 34;

const HOVER_DURATION = 2.2;
const TELEGRAPH_DURATION = 0.9;
const SWEEP_DURATION = 1.8;
const RECOVER_DURATION = 0.8;

const HOVER_SPEED = 115;
const LASER_SPEED = 440;
const LASER_SWEEP_ARC_RAD = 1.3; // ~74° sweep
const EYE_OFFSET_PX = 20;
const CONTACT_DAMAGE = 26;

let skullSeq = 0;

/**
 * Floating Skullhead: white/gold/teal spherical skull-drone with twin glowing
 * amber eyes, spinning halo wings, and dangling mechanical legs.
 * Hovers over the maze while firing telegraphed twin sweeping eye-laser beams.
 */
export function createSkullhead(x: number, y: number): BossState {
  skullSeq += 1;
  return {
    id: `boss_skullhead_${skullSeq}`,
    kind: 'skullhead',
    name: 'SKULLHEAD',
    x,
    y,
    z: HOVER_Z,
    vx: 0,
    vy: 0,
    vz: 0,
    angle: 0,
    radius: SKULLHEAD_RADIUS,
    hp: SKULLHEAD_MAX_HP,
    maxHp: SKULLHEAD_MAX_HP,
    phase: 'hover',
    phaseTimer: HOVER_DURATION,
    parts: [
      {
        id: 'skull_core',
        label: 'Skull Core',
        offsetX: 0,
        offsetY: 0,
        offsetZ: 24,
        radius: SKULLHEAD_RADIUS,
        hp: SKULLHEAD_MAX_HP,
        maxHp: SKULLHEAD_MAX_HP,
        destroyed: false,
        vulnerable: true,
      },
    ],
    bladeAngle: 0,
    bladeRadius: 0,
    laserTelegraphTimer: 0,
    laserActiveTimer: 0,
    laserSweepAngle: 0,
    laserSweepDir: 1,
    fireAnimTimer: 0,
    hitFlash: 0,
  };
}

function spawnTwinEyeLasers(boss: BossState, aimRad: number): Projectile[] {
  const dirX = Math.cos(aimRad);
  const dirY = Math.sin(aimRad);
  const perpX = -dirY;
  const perpY = dirX;
  const out: Projectile[] = [];

  for (const side of [-1, 1]) {
    out.push({
      id: nextBossProjectileId('skull_laser'),
      owner: 'boss',
      kind: 'beam_segment',
      x: boss.x + dirX * 26 + perpX * side * EYE_OFFSET_PX,
      y: boss.y + dirY * 26 + perpY * side * EYE_OFFSET_PX,
      z: 20,
      vx: dirX * LASER_SPEED,
      vy: dirY * LASER_SPEED,
      vz: 0,
      radius: 7,
      damage: 18,
      life: 1.5,
      maxLife: 1.5,
      bouncesLeft: 0,
      modifiers: [],
      color: '#f59e0b',
    });
  }
  return out;
}

export function updateSkullhead(
  boss: BossState,
  player: PlayerState,
  dt: number,
  events: GameEvent[],
): Projectile[] {
  const spawned: Projectile[] = [];
  if (dt <= 0 || boss.hp <= 0) return spawned;

  const common = stepBossCommonTimers(boss, dt, events);
  if (common.rezzing) return spawned;

  const prevTimer = boss.phaseTimer;
  boss.phaseTimer -= dt * common.speedMult;
  boss.bladeAngle = (boss.bladeAngle + 280 * dt) % 360; // drives halo rotor spin

  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const dist = Math.hypot(dx, dy);
  const dirX = dist > 1e-4 ? dx / dist : 0;
  const dirY = dist > 1e-4 ? dy / dist : 1;

  if (boss.phase === 'hover') {
    // Hover over maze walls, maintaining mid-range orbit around the hero
    const desiredDist = 260;
    const radialFactor = dist > desiredDist + 40 ? 1 : dist < desiredDist - 40 ? -0.7 : 0;
    const strafeX = -dirY;
    const strafeY = dirX;
    boss.vx = (dirX * radialFactor + strafeX * 0.75) * HOVER_SPEED * common.speedMult;
    boss.vy = (dirY * radialFactor + strafeY * 0.75) * HOVER_SPEED * common.speedMult;
    boss.x += boss.vx * dt;
    boss.y += boss.vy * dt;
    boss.z = HOVER_Z + Math.sin(boss.bladeAngle * 0.05) * 6;
    boss.angle = vectorToAngleDeg(dirX, dirY);
    boss.laserTelegraphTimer = 0;
    boss.laserActiveTimer = 0;

    if (boss.phaseTimer <= 0) {
      const aimRad = Math.atan2(dy, dx);
      const sweepDir = (boss.laserSweepDir ?? 1) * -1;
      boss.laserSweepDir = sweepDir;
      boss.laserSweepAngle = aimRad - sweepDir * (LASER_SWEEP_ARC_RAD * 0.5);
      boss.laserTelegraphTimer = TELEGRAPH_DURATION;
      boss.laserActiveTimer = 0;
      boss.phase = 'telegraph_lasers';
      boss.phaseTimer = TELEGRAPH_DURATION;
      events.push({ type: 'sfx', sound: 'electric_zap', x: boss.x, y: boss.y });
    }
  } else if (boss.phase === 'telegraph_lasers') {
    boss.vx *= 0.85;
    boss.vy *= 0.85;
    boss.laserTelegraphTimer = Math.max(0, boss.phaseTimer);
    const sweepRad = boss.laserSweepAngle ?? Math.atan2(dy, dx);
    boss.angle = vectorToAngleDeg(Math.cos(sweepRad), Math.sin(sweepRad));

    if (boss.phaseTimer <= 0) {
      boss.laserTelegraphTimer = 0;
      boss.laserActiveTimer = SWEEP_DURATION;
      boss.phase = 'eye_lasers';
      boss.phaseTimer = SWEEP_DURATION;
      events.push({ type: 'sfx', sound: 'shoot', x: boss.x, y: boss.y });
    }
  } else if (boss.phase === 'eye_lasers') {
    const sweepDir = boss.laserSweepDir ?? 1;
    const sweepSpeed = (LASER_SWEEP_ARC_RAD / SWEEP_DURATION) * common.speedMult;
    boss.laserSweepAngle = (boss.laserSweepAngle ?? 0) + sweepDir * sweepSpeed * dt;
    boss.laserActiveTimer = Math.max(0, boss.phaseTimer);
    const curRad = boss.laserSweepAngle;
    boss.angle = vectorToAngleDeg(Math.cos(curRad), Math.sin(curRad));
    boss.fireAnimTimer = BOSS_FIRE_ANIM_SEC;

    // Emit twin eye-laser beam segments at steady intervals along the sweep
    const fireInterval = common.rampaging ? 0.11 : 0.16;
    const prevSlot = Math.floor(prevTimer / fireInterval);
    const currSlot = Math.floor(Math.max(0, boss.phaseTimer) / fireInterval);
    if (currSlot < prevSlot) {
      spawned.push(...spawnTwinEyeLasers(boss, curRad));
      events.push({ type: 'sfx', sound: 'shoot', x: boss.x, y: boss.y });
    }

    if (boss.phaseTimer <= 0) {
      boss.laserActiveTimer = 0;
      boss.phase = 'recover';
      boss.phaseTimer = RECOVER_DURATION;
    }
  } else {
    boss.laserTelegraphTimer = 0;
    boss.laserActiveTimer = 0;
    boss.angle = vectorToAngleDeg(dirX, dirY);
    if (boss.phaseTimer <= 0) {
      boss.phase = 'hover';
      boss.phaseTimer = HOVER_DURATION;
    }
  }

  // Contact damage
  const reach = boss.radius + player.radius;
  const cdx = player.x - boss.x;
  const cdy = player.y - boss.y;
  if (cdx * cdx + cdy * cdy <= reach * reach) {
    applyBossDamageToPlayer(player, CONTACT_DAMAGE, boss.x, boss.y, 250, events);
  }

  return spawned;
}
