import { vectorToAngleDeg } from '../enemies/enemyUtils';
import type {
  BossState,
  GameEvent,
  PlayerState,
  Projectile,
} from '../engine/types';
import { applyBossDamageToPlayer, nextBossProjectileId } from './bossUtils';

const HOVER_Z = 22;
const SLAM_PEAK_Z = 260;
const BOMB_RUN_Z = 180;

const HOVER_BARRAGE_DURATION = 3.0;
const SKY_SLAM_ASCEND_DURATION = 1.2;
const SKY_SLAM_DROP_DURATION = 0.55;
const SKY_BOMB_RUN_DURATION = 2.4;
const RECOVER_DURATION = 1.2;

const LEG_MAX_HP = 250;
const HEAD_MAX_HP = 600;
const SLAM_SHOCKWAVE_RADIUS = 95;
const SLAM_DAMAGE = 35;

let recogniserSeq = 0;

export function createRecogniser(x: number, y: number): BossState {
  recogniserSeq += 1;
  const totalHp = LEG_MAX_HP * 2 + HEAD_MAX_HP;
  return {
    id: `boss_recogniser_${recogniserSeq}`,
    kind: 'recogniser',
    name: 'RECOGNISER',
    x,
    y,
    z: HOVER_Z,
    vx: 0,
    vy: 0,
    vz: 0,
    angle: 0,
    radius: 44,
    hp: totalHp,
    maxHp: totalHp,
    phase: 'hover_barrage',
    phaseTimer: HOVER_BARRAGE_DURATION,
    parts: [
      {
        id: 'left_leg',
        label: 'Left Strut',
        offsetX: -36,
        offsetY: 16,
        offsetZ: -12,
        radius: 22,
        hp: LEG_MAX_HP,
        maxHp: LEG_MAX_HP,
        destroyed: false,
        vulnerable: true,
      },
      {
        id: 'right_leg',
        label: 'Right Strut',
        offsetX: 36,
        offsetY: 16,
        offsetZ: -12,
        radius: 22,
        hp: LEG_MAX_HP,
        maxHp: LEG_MAX_HP,
        destroyed: false,
        vulnerable: true,
      },
      {
        id: 'head_core',
        label: 'Head Core',
        offsetX: 0,
        offsetY: -12,
        offsetZ: 28,
        radius: 28,
        hp: HEAD_MAX_HP,
        maxHp: HEAD_MAX_HP,
        destroyed: false,
        vulnerable: false, // Locked until both destructible legs are destroyed
      },
    ],
    bladeAngle: 0,
    bladeRadius: 0,
    slamTargetX: x,
    slamTargetY: y,
    slamProgress: 0,
    hitFlash: 0,
  };
}

/**
 * Applies damage to a specific boss part at world coordinates (hitX, hitY).
 * For the Recogniser, hitting `head_core` while legs remain intact deals 0 damage
 * and returns `false`. Destroying both legs unlocks `head_core.vulnerable = true`.
 * Returns `true` if damage was applied to a vulnerable part (or direct boss body).
 */
export function damageBossPart(
  boss: BossState,
  hitX: number,
  hitY: number,
  damage: number,
  events: GameEvent[],
): boolean {
  if (boss.hp <= 0 || damage <= 0 || boss.reconstructing) {
    return false;
  }

  if (boss.parts.length === 0) {
    const dist = Math.hypot(hitX - boss.x, hitY - boss.y);
    if (dist > boss.radius) return false;
    boss.hp = Math.max(0, boss.hp - damage);
    boss.hitFlash = 0.15;
    if (boss.hp <= 0) {
      events.push({
        type: 'vfx_explosion',
        x: boss.x,
        y: boss.y,
        z: boss.z,
        color: '#ff3355',
        count: 28,
      });
      events.push({ type: 'sfx', sound: 'explosion', x: boss.x, y: boss.y });
      events.push({ type: 'camera_shake', magnitude: 14, duration: 0.45 });
    }
    return true;
  }

  // Prefer vulnerable parts if hit overlaps two part circles
  let hitLockedPart = false;

  for (let pass = 0; pass < 2; pass++) {
    const checkVulnerable = pass === 0;
    for (let i = 0; i < boss.parts.length; i++) {
      const part = boss.parts[i];
      if (part.destroyed) continue;
      if (part.vulnerable !== checkVulnerable) continue;

      const px = boss.x + part.offsetX;
      const py = boss.y + part.offsetY;
      const dist = Math.hypot(hitX - px, hitY - py);
      if (dist > part.radius) continue;

      if (!part.vulnerable) {
        hitLockedPart = true;
        continue;
      }

      part.hp = Math.max(0, part.hp - damage);
      boss.hitFlash = 0.15;

      if (part.hp <= 0) {
        part.destroyed = true;
        part.vulnerable = false;
        events.push({
          type: 'vfx_explosion',
          x: px,
          y: py,
          z: boss.z + part.offsetZ,
          color: '#ff6622',
          count: 20,
        });
        events.push({ type: 'sfx', sound: 'explosion', x: px, y: py });
        events.push({ type: 'camera_shake', magnitude: 10, duration: 0.3 });

        // Recogniser: destroying all legs unlocks head_core vulnerability
        if (boss.kind === 'recogniser') {
          const legParts = boss.parts.filter((p) => p.id.includes('leg'));
          const allLegsDestroyed =
            legParts.length > 0 && legParts.every((p) => p.destroyed);
          const headCore = boss.parts.find((p) => p.id === 'head_core');
          if (
            allLegsDestroyed &&
            headCore &&
            !headCore.destroyed &&
            !headCore.vulnerable
          ) {
            headCore.vulnerable = true;
            events.push({
              type: 'sfx',
              sound: 'shield_break',
              x: boss.x,
              y: boss.y,
            });
            events.push({
              type: 'voice_taunt',
              text: 'STRUCTURAL LEGS COMPROMISED. CORE EXPOSED.',
              pitch: 0.65,
              rate: 0.9,
              speaker: 'recogniser',
            });
          }
        }
      }

      // Sync aggregate boss HP from parts
      let remainingHp = 0;
      for (let j = 0; j < boss.parts.length; j++) {
        remainingHp += Math.max(0, boss.parts[j].hp);
      }
      boss.hp = remainingHp;
      return true;
    }
  }

  if (hitLockedPart) {
    events.push({ type: 'sfx', sound: 'electric_zap', x: hitX, y: hitY });
  }
  return false;
}

function spawnBulletPattern(
  boss: BossState,
  count: number,
  speed: number,
  angleOffsetRad: number,
  color: string,
): Projectile[] {
  const bullets: Projectile[] = [];
  for (let i = 0; i < count; i++) {
    const theta = angleOffsetRad + (i / count) * Math.PI * 2;
    bullets.push({
      id: nextBossProjectileId('rec_bolt'),
      owner: 'boss',
      kind: 'bolt',
      x: boss.x + Math.cos(theta) * 28,
      y: boss.y + Math.sin(theta) * 28,
      z: Math.max(8, boss.z),
      vx: Math.cos(theta) * speed,
      vy: Math.sin(theta) * speed,
      vz: 0,
      radius: 6,
      damage: 18,
      life: 3.0,
      maxLife: 3.0,
      bouncesLeft: 0,
      modifiers: [],
      color,
    });
  }
  return bullets;
}

function spawnHomingDrones(
  boss: BossState,
  player: PlayerState,
  count: number,
): Projectile[] {
  const drones: Projectile[] = [];
  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const baseAngle = Math.atan2(dy, dx);
  const droneSpeed = 125;

  for (let i = 0; i < count; i++) {
    const spread = (i - (count - 1) * 0.5) * 0.7;
    const theta = baseAngle + spread;
    drones.push({
      id: nextBossProjectileId('rec_drone'),
      owner: 'boss',
      kind: 'homing_drone',
      x: boss.x + Math.cos(theta) * 34,
      y: boss.y + Math.sin(theta) * 34,
      z: boss.z,
      vx: Math.cos(theta) * droneSpeed,
      vy: Math.sin(theta) * droneSpeed,
      vz: 0,
      radius: 9,
      damage: 22,
      life: 5.5,
      maxLife: 5.5,
      bouncesLeft: 0,
      modifiers: [],
      color: '#ff00cc',
      targetX: player.x,
      targetY: player.y,
    });
  }
  return drones;
}

function spawnSkyBomb(boss: BossState, targetX: number, targetY: number): Projectile {
  return {
    id: nextBossProjectileId('rec_bomb'),
    owner: 'boss',
    kind: 'sky_bomb',
    x: targetX,
    y: targetY,
    z: boss.z,
    vx: 0,
    vy: 0,
    vz: -115,
    radius: 10,
    damage: 28,
    life: 1.5,
    maxLife: 1.5,
    bouncesLeft: 0,
    modifiers: [],
    color: '#ffaa00',
    targetX,
    targetY,
  };
}

/**
 * Updates the Recogniser boss state machine:
 * - `hover_barrage`: hovers above ground, fires geometric bullet curtains + homing drones
 * - `sky_slam_ascend`: zooms high in Z-altitude, tracks player with growing ground shadow (`slamProgress`)
 * - `sky_slam_drop`: locks shadow target, slams down with shockwave bolts & camera shake
 * - `sky_bomb_run`: zooms high and carpets the arena with timed `sky_bomb` projectiles
 * - `recover`: descends back to hover height before looping
 */
export function updateRecogniser(
  boss: BossState,
  player: PlayerState,
  dt: number,
  events: GameEvent[],
): Projectile[] {
  const spawned: Projectile[] = [];
  if (dt <= 0 || boss.hp <= 0) return spawned;

  if (boss.hitFlash > 0) {
    boss.hitFlash = Math.max(0, boss.hitFlash - dt);
  }

  const prevTimer = boss.phaseTimer;
  boss.phaseTimer -= dt;

  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const dist = Math.hypot(dx, dy);
  const dirX = dist > 1e-4 ? dx / dist : 0;
  const dirY = dist > 1e-4 ? dy / dist : 1;

  if (boss.phase === 'hover_barrage') {
    boss.z += (HOVER_Z - boss.z) * Math.min(1, dt * 6);
    boss.slamProgress = 0;

    // Gentle hover drift toward player
    const hoverSpeed = 72;
    boss.vx = dirX * hoverSpeed;
    boss.vy = dirY * hoverSpeed;
    boss.x += boss.vx * dt;
    boss.y += boss.vy * dt;
    boss.angle = vectorToAngleDeg(dirX, dirY);

    // Geometric bullet curtain wave 1
    if (prevTimer > 2.2 && boss.phaseTimer <= 2.2) {
      spawned.push(...spawnBulletPattern(boss, 8, 220, 0, '#00e5ff'));
      events.push({ type: 'sfx', sound: 'shoot', x: boss.x, y: boss.y });
    }

    // Homing drones + offset bullet curtain wave 2
    if (prevTimer > 1.1 && boss.phaseTimer <= 1.1) {
      spawned.push(...spawnHomingDrones(boss, player, 2));
      spawned.push(
        ...spawnBulletPattern(boss, 8, 220, Math.PI / 8, '#ff2a77'),
      );
      events.push({ type: 'sfx', sound: 'shoot', x: boss.x, y: boss.y });
    }

    if (boss.phaseTimer <= 0) {
      boss.phase = 'sky_slam_ascend';
      boss.phaseTimer = SKY_SLAM_ASCEND_DURATION;
      boss.slamTargetX = player.x;
      boss.slamTargetY = player.y;
      boss.slamProgress = 0.05;
      events.push({
        type: 'voice_taunt',
        text: 'ASCENDING. TARGET ACQUIRED.',
        pitch: 0.7,
        rate: 0.9,
        speaker: 'recogniser',
      });
    }
  } else if (boss.phase === 'sky_slam_ascend') {
    const progress = Math.max(
      0,
      Math.min(1, 1 - boss.phaseTimer / SKY_SLAM_ASCEND_DURATION),
    );
    boss.z = HOVER_Z + (SLAM_PEAK_Z - HOVER_Z) * progress;
    // Track player while ascending and grow ground shadow telegraph
    boss.slamTargetX = player.x;
    boss.slamTargetY = player.y;
    boss.slamProgress = progress * 0.65;
    boss.x += (boss.slamTargetX - boss.x) * Math.min(1, dt * 4);
    boss.y += (boss.slamTargetY - boss.y) * Math.min(1, dt * 4);

    if (boss.phaseTimer <= 0) {
      boss.phase = 'sky_slam_drop';
      boss.phaseTimer = SKY_SLAM_DROP_DURATION;
    }
  } else if (boss.phase === 'sky_slam_drop') {
    const progress = Math.max(
      0,
      Math.min(1, 1 - boss.phaseTimer / SKY_SLAM_DROP_DURATION),
    );
    const targetX = boss.slamTargetX ?? boss.x;
    const targetY = boss.slamTargetY ?? boss.y;
    boss.x += (targetX - boss.x) * Math.min(1, dt * 10);
    boss.y += (targetY - boss.y) * Math.min(1, dt * 10);
    boss.z = SLAM_PEAK_Z * (1 - progress * progress);
    boss.slamProgress = 0.65 + progress * 0.35;

    if (boss.phaseTimer <= 0) {
      boss.x = targetX;
      boss.y = targetY;
      boss.z = 0;
      boss.slamProgress = 0;

      // Sky-slam impact shockwave
      events.push({ type: 'sfx', sound: 'slam_impact', x: boss.x, y: boss.y });
      events.push({ type: 'camera_shake', magnitude: 14, duration: 0.45 });
      events.push({
        type: 'vfx_explosion',
        x: boss.x,
        y: boss.y,
        z: 4,
        color: '#00f0ff',
        count: 26,
      });

      spawned.push(...spawnBulletPattern(boss, 12, 260, 0, '#00f0ff'));

      const playerDist = Math.hypot(player.x - boss.x, player.y - boss.y);
      if (playerDist <= SLAM_SHOCKWAVE_RADIUS + player.radius) {
        applyBossDamageToPlayer(
          player,
          SLAM_DAMAGE,
          boss.x,
          boss.y,
          310,
          events,
        );
      }

      boss.phase = 'sky_bomb_run';
      boss.phaseTimer = SKY_BOMB_RUN_DURATION;
    }
  } else if (boss.phase === 'sky_bomb_run') {
    boss.z += (BOMB_RUN_Z - boss.z) * Math.min(1, dt * 5);
    boss.slamProgress = 0;

    // Sweep over the arena toward player
    const sweepSpeed = 165;
    boss.vx = dirX * sweepSpeed;
    boss.vy = dirY * sweepSpeed;
    boss.x += boss.vx * dt;
    boss.y += boss.vy * dt;
    boss.angle = vectorToAngleDeg(dirX, dirY);

    // Drop timed sky-bombs at regular intervals along the bombing run
    const bombInterval = 0.45;
    const prevSlot = Math.floor(prevTimer / bombInterval);
    const currSlot = Math.floor(Math.max(0, boss.phaseTimer) / bombInterval);
    if (currSlot < prevSlot) {
      spawned.push(spawnSkyBomb(boss, boss.x, boss.y));
      events.push({ type: 'sfx', sound: 'shoot', x: boss.x, y: boss.y });
    }

    if (boss.phaseTimer <= 0) {
      boss.phase = 'recover';
      boss.phaseTimer = RECOVER_DURATION;
    }
  } else {
    // recover
    boss.z += (HOVER_Z - boss.z) * Math.min(1, dt * 5);
    boss.vx *= 0.9;
    boss.vy *= 0.9;
    boss.slamProgress = 0;

    if (boss.phaseTimer <= 0) {
      boss.phase = 'hover_barrage';
      boss.phaseTimer = HOVER_BARRAGE_DURATION;
    }
  }

  return spawned;
}
