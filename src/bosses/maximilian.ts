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
import { applyBossDamageToPlayer } from './bossUtils';

const MAXIMILIAN_BASE_RADIUS = 34;
const MAXIMILIAN_BLADE_RADIUS = 58;
const MAXIMILIAN_WHIRLWIND_BLADE_RADIUS = 70;
const MAXIMILIAN_MAX_HP = 900;

const STALK_DURATION = 2.6;
const CHARGE_DURATION = 1.3;
const WHIRLWIND_DURATION = 1.8;
const RECOVER_DURATION = 0.9;

const STALK_SPEED = 115;
const CHARGE_SPEED = 275;
const WHIRLWIND_SPEED = 155;
const RECOVER_SPEED = 60;

const BLADE_CONTACT_DAMAGE = 32;

const MAXIMILIAN_TAUNTS = [
  'INTRUDER DETECTED. TERMINATE.',
  'BLADES ENGAGED. NO COVER WILL SAVE YOU.',
  'RESISTANCE IS OBSOLETE.',
];

let maximilianSeq = 0;

export function createMaximilian(x: number, y: number): BossState {
  maximilianSeq += 1;
  return {
    id: `boss_maximilian_${maximilianSeq}`,
    kind: 'maximilian',
    name: 'MAXIMILIAN',
    x,
    y,
    z: 14,
    vx: 0,
    vy: 0,
    vz: 0,
    angle: 0,
    radius: MAXIMILIAN_BASE_RADIUS,
    hp: MAXIMILIAN_MAX_HP,
    maxHp: MAXIMILIAN_MAX_HP,
    phase: 'stalk',
    phaseTimer: STALK_DURATION,
    parts: [
      {
        id: 'chassis_core',
        label: 'Chassis Core',
        offsetX: 0,
        offsetY: 0,
        offsetZ: 14,
        radius: MAXIMILIAN_BASE_RADIUS,
        hp: MAXIMILIAN_MAX_HP,
        maxHp: MAXIMILIAN_MAX_HP,
        destroyed: false,
        vulnerable: true,
      },
    ],
    bladeAngle: 0,
    bladeRadius: MAXIMILIAN_BLADE_RADIUS,
    hitFlash: 0,
  };
}

/**
 * Updates Maximilian's state machine (stalk -> charge -> whirlwind -> recover)
 * and executes whirling blade shredding against:
 *  - incoming player projectiles (destroyed on blade contact)
 *  - destructible tech crates (shredded on blade contact, emitting crate_destroyed)
 *  - the player (contact damage + knockback unless invulnerable/rolling)
 * Permanent safe walls remain completely intact.
 */
export function updateMaximilian(
  boss: BossState,
  player: PlayerState,
  island: PlatformIsland,
  projectiles: Projectile[],
  dt: number,
  events: GameEvent[],
): void {
  if (dt <= 0 || boss.hp <= 0) return;

  if (boss.hitFlash > 0) {
    boss.hitFlash = Math.max(0, boss.hitFlash - dt);
  }

  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const dist = Math.hypot(dx, dy);
  const dirX = dist > 1e-4 ? dx / dist : 0;
  const dirY = dist > 1e-4 ? dy / dist : 1;

  boss.phaseTimer -= dt;

  // Phase transitions
  if (boss.phaseTimer <= 0) {
    if (boss.phase === 'stalk') {
      boss.phase = 'charge';
      boss.phaseTimer = CHARGE_DURATION;
      boss.vx = dirX * CHARGE_SPEED;
      boss.vy = dirY * CHARGE_SPEED;
      events.push({ type: 'sfx', sound: 'blade_whirr', x: boss.x, y: boss.y });
      events.push({
        type: 'voice_taunt',
        text: MAXIMILIAN_TAUNTS[0],
        pitch: 0.45,
        rate: 0.85,
        speaker: 'maximilian',
      });
    } else if (boss.phase === 'charge') {
      boss.phase = 'whirlwind';
      boss.phaseTimer = WHIRLWIND_DURATION;
      boss.bladeRadius = MAXIMILIAN_WHIRLWIND_BLADE_RADIUS;
      events.push({ type: 'sfx', sound: 'blade_whirr', x: boss.x, y: boss.y });
      events.push({
        type: 'voice_taunt',
        text: MAXIMILIAN_TAUNTS[1],
        pitch: 0.4,
        rate: 0.9,
        speaker: 'maximilian',
      });
    } else if (boss.phase === 'whirlwind') {
      boss.phase = 'recover';
      boss.phaseTimer = RECOVER_DURATION;
      boss.bladeRadius = MAXIMILIAN_BLADE_RADIUS;
    } else {
      boss.phase = 'stalk';
      boss.phaseTimer = STALK_DURATION;
      boss.bladeRadius = MAXIMILIAN_BLADE_RADIUS;
    }
  }

  // Movement & blade spin rate per phase
  let bladeSpinDegPerSec = 360;
  if (boss.phase === 'stalk') {
    const blend = Math.min(1, dt * 5);
    boss.vx += (dirX * STALK_SPEED - boss.vx) * blend;
    boss.vy += (dirY * STALK_SPEED - boss.vy) * blend;
    bladeSpinDegPerSec = 380;
  } else if (boss.phase === 'charge') {
    // Locked surge with slight homing correction
    const blend = Math.min(1, dt * 1.4);
    boss.vx += (dirX * CHARGE_SPEED - boss.vx) * blend;
    boss.vy += (dirY * CHARGE_SPEED - boss.vy) * blend;
    bladeSpinDegPerSec = 780;
  } else if (boss.phase === 'whirlwind') {
    const blend = Math.min(1, dt * 6);
    boss.vx += (dirX * WHIRLWIND_SPEED - boss.vx) * blend;
    boss.vy += (dirY * WHIRLWIND_SPEED - boss.vy) * blend;
    bladeSpinDegPerSec = 1080;
  } else {
    // recover
    const blend = Math.min(1, dt * 6);
    boss.vx += (dirX * RECOVER_SPEED - boss.vx) * blend;
    boss.vy += (dirY * RECOVER_SPEED - boss.vy) * blend;
    bladeSpinDegPerSec = 260;
  }

  boss.bladeAngle = (boss.bladeAngle + bladeSpinDegPerSec * dt) % 360;
  boss.x += boss.vx * dt;
  boss.y += boss.vy * dt;

  // Permanent safe walls remain intact; ignore crates here because blades shred them below.
  resolveEnemyAgainstIsland(boss, island, true);

  if (dist > 1e-4) {
    boss.angle = vectorToAngleDeg(dx, dy);
  }

  // 1. Whirling blades shred incoming player projectiles
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (p.life <= 0 || p.owner !== 'player') continue;
    const reach = boss.bladeRadius + p.radius;
    const pdx = p.x - boss.x;
    const pdy = p.y - boss.y;
    if (pdx * pdx + pdy * pdy <= reach * reach) {
      p.life = 0;
      events.push({ type: 'sfx', sound: 'blade_whirr', x: p.x, y: p.y });
      events.push({
        type: 'vfx_explosion',
        x: p.x,
        y: p.y,
        z: p.z,
        color: '#ff3355',
        count: 6,
      });
    }
  }

  // 2. Whirling blades shred destructible tech crates/cover
  for (let i = 0; i < island.crates.length; i++) {
    const crate = island.crates[i];
    if (crate.hp <= 0) continue;
    const reach = boss.bladeRadius + crate.radius;
    const cdx = crate.x - boss.x;
    const cdy = crate.y - boss.y;
    if (cdx * cdx + cdy * cdy <= reach * reach) {
      crate.hp = 0;
      crate.hitFlash = 0.2;
      events.push({ type: 'crate_destroyed', x: crate.x, y: crate.y });
      events.push({
        type: 'vfx_explosion',
        x: crate.x,
        y: crate.y,
        z: 10,
        color: '#ff5533',
        count: 14,
      });
      events.push({
        type: 'sfx',
        sound: 'explosion',
        x: crate.x,
        y: crate.y,
      });
    }
  }

  // 3. Whirling blades shred the player on contact
  const playerReach = boss.bladeRadius + player.radius;
  const plDx = player.x - boss.x;
  const plDy = player.y - boss.y;
  if (plDx * plDx + plDy * plDy <= playerReach * playerReach) {
    applyBossDamageToPlayer(
      player,
      BLADE_CONTACT_DAMAGE,
      boss.x,
      boss.y,
      260,
      events,
    );
  }
}
