import {
  resolveEnemyAgainstIsland,
  vectorToAngleDeg,
} from '../enemies/enemyUtils';
import type {
  BossState,
  GameEvent,
  PlatformIsland,
  PlayerState,
  Projectile,
} from '../engine/types';
import {
  applyBossDamageToPlayer,
  BOSS_FIRE_ANIM_SEC,
  computeBossShieldConfig,
  nextBossProjectileId,
  stepBossCommonTimers,
} from './bossUtils';

const ABB_RADIUS = 56;
const ABB_MAX_HP = 1350;
const STALK_DURATION = 2.0;
const DASH_DURATION = 0.45;
const HALT_LAUNCH_DURATION = 1.4;
const RECOVER_DURATION = 0.8;

const STALK_SPEED = 110;
const DASH_SPEED = 540;
export const ABB_ICBM_SPEED = 390; // px/s (360-420 high-speed guided rocket)
export const ABB_ICBM_TURN_RATE = 1.25; // rad/s (1.1-1.4 tight turn cap so perpendicular dodge-roll overshoots)
export const ABB_ICBM_BLAST_RADIUS = 112;
const CONTACT_DAMAGE = 28;

/**
 * Milestone 4.16: Sector-scaled ABB ICBM salvo count.
 * Sector 1 (sectorIndex 0) -> 3 missiles, Sector 2 -> 4, Sector 3 -> 5, up to 8.
 */
export function getAbbSalvoCount(sectorIndex = 0): number {
  const sectorNum = Math.max(1, Math.floor(sectorIndex) + 1);
  return Math.min(8, 2 + sectorNum);
}

/**
 * Milestone 4.14: True guided steering for ABB ICBM missiles.
 * Moves forward at high speed (`260–320 px/s`) while capping angular turn rate
 * (`~1.8–2.4 rad/s`), carving wide sweeping dodgeable pursuit arcs.
 */
export function steerGuidedIcbm(
  p: Projectile,
  targetX: number,
  targetY: number,
  dt: number,
): void {
  if (dt <= 0) return;
  p.targetX = targetX;
  p.targetY = targetY;

  const dx = targetX - p.x;
  const dy = targetY - p.y;
  if (dx * dx + dy * dy < 1e-6) return;

  const curSpeed = Math.max(ABB_ICBM_SPEED, Math.hypot(p.vx, p.vy));
  const curAngle = Math.atan2(p.vy, p.vx);
  const desiredAngle = Math.atan2(dy, dx);
  const diff = Math.atan2(
    Math.sin(desiredAngle - curAngle),
    Math.cos(desiredAngle - curAngle),
  );
  const maxStep = (p.turnRate ?? ABB_ICBM_TURN_RATE) * dt;
  const clampedStep = Math.max(-maxStep, Math.min(maxStep, diff));
  const nextAngle = curAngle + clampedStep;

  p.vx = Math.cos(nextAngle) * curSpeed;
  p.vy = Math.sin(nextAngle) * curSpeed;
}

let abbSeq = 0;

/**
 * ABB — Another Boss Bot: light-grey armored tank-mech on dual treads.
 * Uses rapid dodge-dash repositioning (burst speed + afterimage trail), then
 * halts briefly and launches a 360-degree ring of guided homing missiles.
 */
export function createAbb(x: number, y: number, sectorIndex = 0): BossState {
  abbSeq += 1;
  const safeSector = Math.max(0, Math.floor(sectorIndex));
  const shields = computeBossShieldConfig(ABB_MAX_HP, safeSector);
  return {
    id: `boss_abb_${abbSeq}`,
    kind: 'abb',
    name: 'ABB // TANK-MECH',
    x,
    y,
    z: 6,
    vx: 0,
    vy: 0,
    vz: 0,
    angle: 0,
    radius: ABB_RADIUS,
    hp: ABB_MAX_HP,
    maxHp: ABB_MAX_HP,
    phase: 'stalk',
    phaseTimer: STALK_DURATION,
    parts: [
      {
        id: 'abb_chassis',
        label: 'Armored Turret',
        offsetX: 0,
        offsetY: 0,
        offsetZ: 20,
        radius: ABB_RADIUS,
        hp: ABB_MAX_HP,
        maxHp: ABB_MAX_HP,
        destroyed: false,
        vulnerable: true,
      },
    ],
    bladeAngle: 0,
    bladeRadius: 0,
    sectorIndex: safeSector,
    ...shields,
    dashTimer: 0,
    dashDirX: 0,
    dashDirY: 0,
    fireAnimTimer: 0,
    hitFlash: 0,
  };
}

function spawnHomingMissileRing(
  boss: BossState,
  player: PlayerState,
  count: number,
): Projectile[] {
  const missiles: Projectile[] = [];
  for (let i = 0; i < count; i++) {
    const theta = (i / count) * Math.PI * 2;
    missiles.push({
      id: nextBossProjectileId('abb_missile'),
      owner: 'boss',
      kind: 'homing_drone',
      icbm: true,
      turnRate: ABB_ICBM_TURN_RATE,
      blastRadius: ABB_ICBM_BLAST_RADIUS,
      x: boss.x + Math.cos(theta) * (boss.radius * 0.75),
      y: boss.y + Math.sin(theta) * (boss.radius * 0.75),
      z: 18,
      vx: Math.cos(theta) * ABB_ICBM_SPEED,
      vy: Math.sin(theta) * ABB_ICBM_SPEED,
      vz: 0,
      radius: 10,
      damage: 28,
      life: 5.2,
      maxLife: 5.2,
      bouncesLeft: 0,
      modifiers: [],
      color: '#e2e8f0',
      targetX: player.x,
      targetY: player.y,
    });
  }
  return missiles;
}

export function updateAbb(
  boss: BossState,
  player: PlayerState,
  island: PlatformIsland,
  dt: number,
  events: GameEvent[],
): Projectile[] {
  const spawned: Projectile[] = [];
  if (dt <= 0 || boss.hp <= 0) return spawned;

  const common = stepBossCommonTimers(boss, dt, events);
  if (common.rezzing) return spawned;

  const prevTimer = boss.phaseTimer;
  boss.phaseTimer -= dt * common.speedMult;

  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const dist = Math.hypot(dx, dy);
  const dirX = dist > 1e-4 ? dx / dist : 0;
  const dirY = dist > 1e-4 ? dy / dist : 1;

  if (boss.phase === 'stalk') {
    const blend = Math.min(1, dt * 5);
    boss.vx += (dirX * STALK_SPEED * common.speedMult - boss.vx) * blend;
    boss.vy += (dirY * STALK_SPEED * common.speedMult - boss.vy) * blend;
    boss.x += boss.vx * dt;
    boss.y += boss.vy * dt;
    boss.angle = vectorToAngleDeg(dirX, dirY);
    boss.dashTimer = 0;

    if (boss.phaseTimer <= 0) {
      // Choose a rapid flanking dodge-dash vector perpendicular to the hero
      const flankSign = ((Math.floor(boss.x + boss.y) & 1) === 0 ? 1 : -1);
      const dashX = -dirY * flankSign * 0.85 + dirX * 0.35;
      const dashY = dirX * flankSign * 0.85 + dirY * 0.35;
      const dMag = Math.max(1e-4, Math.hypot(dashX, dashY));
      boss.dashDirX = dashX / dMag;
      boss.dashDirY = dashY / dMag;
      boss.dashTimer = DASH_DURATION;
      boss.phase = 'dodge_dash';
      boss.phaseTimer = DASH_DURATION;
      events.push({ type: 'sfx', sound: 'dodge', x: boss.x, y: boss.y });
    }
  } else if (boss.phase === 'dodge_dash') {
    const ddx = boss.dashDirX ?? dirX;
    const ddy = boss.dashDirY ?? dirY;
    boss.vx = ddx * DASH_SPEED * common.speedMult;
    boss.vy = ddy * DASH_SPEED * common.speedMult;
    boss.x += boss.vx * dt;
    boss.y += boss.vy * dt;
    boss.dashTimer = Math.max(0, boss.phaseTimer);
    boss.angle = vectorToAngleDeg(ddx, ddy);

    if (boss.phaseTimer <= 0) {
      boss.dashTimer = 0;
      boss.vx = 0;
      boss.vy = 0;
      boss.phase = 'missile_halt';
      boss.phaseTimer = HALT_LAUNCH_DURATION;
      events.push({
        type: 'voice_taunt',
        text: 'TARGET LOCKED. LAUNCHING MISSILE RING.',
        pitch: 0.65,
        rate: 0.95,
        speaker: 'maximilian',
      });
    }
  } else if (boss.phase === 'missile_halt') {
    // Halt briefly, aim turret at player, then unleash 360-degree homing missile ring
    boss.vx *= 0.8;
    boss.vy *= 0.8;
    boss.angle = vectorToAngleDeg(dirX, dirY);

    const launchAt = HALT_LAUNCH_DURATION * 0.55;
    if (prevTimer > launchAt && boss.phaseTimer <= launchAt) {
      boss.fireAnimTimer = BOSS_FIRE_ANIM_SEC;
      const baseCount = getAbbSalvoCount(boss.sectorIndex ?? 0);
      const count = common.rampaging ? Math.min(8, baseCount + 2) : baseCount;
      spawned.push(...spawnHomingMissileRing(boss, player, count));
      events.push({ type: 'sfx', sound: 'shoot', x: boss.x, y: boss.y });
      events.push({ type: 'camera_shake', magnitude: 8, duration: 0.22 });
    }

    if (boss.phaseTimer <= 0) {
      boss.phase = 'recover';
      boss.phaseTimer = RECOVER_DURATION;
    }
  } else {
    boss.vx *= 0.85;
    boss.vy *= 0.85;
    boss.angle = vectorToAngleDeg(dirX, dirY);
    if (boss.phaseTimer <= 0) {
      boss.phase = 'stalk';
      boss.phaseTimer = STALK_DURATION;
    }
  }

  resolveEnemyAgainstIsland(boss, island);

  // Contact damage
  const reach = boss.radius + player.radius;
  const cdx = player.x - boss.x;
  const cdy = player.y - boss.y;
  if (cdx * cdx + cdy * cdy <= reach * reach) {
    applyBossDamageToPlayer(player, CONTACT_DAMAGE, boss.x, boss.y, 260, events);
  }

  return spawned;
}
