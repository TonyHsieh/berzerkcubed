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
import { applyBossDamageToPlayer, stepBossCommonTimers } from './bossUtils';

const MAXIMILIAN_BASE_RADIUS = 48;
const MAXIMILIAN_BLADE_RADIUS = 72;
const MAXIMILIAN_WHIRLWIND_BLADE_RADIUS = 88;
const MAXIMILIAN_MAX_HP = 1200;
const MAXIMILIAN_SHIELD_HP = 260;
const STANDARD_SHOT_SHIELD_DAMAGE = 7;

const STALK_DURATION = 2.6;
const CHARGE_DURATION = 1.3;
const WHIRLWIND_DURATION = 1.8;
const RECOVER_DURATION = 0.9;

const STALK_SPEED = 115;
const CHARGE_SPEED = 275;
const WHIRLWIND_SPEED = 155;
const RECOVER_SPEED = 60;

const BLADE_CONTACT_DAMAGE = 32;

// Milestone 4 bugfix: the blades used to shred EVERY projectile within reach in
// EVERY phase, which made Maximilian effectively unkillable. Blades now only
// guard his frontal arc while stalking/charging, heavy attacks punch through the
// whirlwind, and recovery leaves his core completely exposed.
const BLADE_ARC_HALF_DEG = 75;
const RETRACTED_BLADE_RADIUS = 44;

const MAXIMILIAN_TAUNTS = [
  'INTRUDER DETECTED. TERMINATE.',
  'BLADES ENGAGED. NO COVER WILL SAVE YOU.',
  'RESISTANCE IS OBSOLETE.',
];

let maximilianSeq = 0;

/**
 * Heavy / energy attacks punch through the 360° whirlwind guard. Standard bolts
 * (and ricochets) are still shredded. Grenade explosions are resolved by the
 * blast-radius code in gameState, so the grenade carrier itself bypasses blades.
 */
export function projectileBypassesBlades(p: Projectile): boolean {
  return (
    p.kind === 'beam_segment' ||
    p.kind === 'lightning' ||
    p.kind === 'grenade' ||
    p.modifiers.includes('pierce') ||
    p.modifiers.includes('lightning_chain')
  );
}

/** True when a projectile sits inside Maximilian's frontal ±75° blade arc. */
export function inFrontalBladeArc(boss: BossState, dx: number, dy: number): boolean {
  const projAngle = vectorToAngleDeg(dx, dy);
  const delta = ((projAngle - boss.angle + 540) % 360) - 180;
  return Math.abs(delta) <= BLADE_ARC_HALF_DEG;
}

export function isMaximilianVulnerable(boss: BossState): boolean {
  return boss.phase === 'recover' || (boss.shieldHp ?? 0) <= 0 || boss.vulnerable === true;
}

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
    shieldHp: MAXIMILIAN_SHIELD_HP,
    shieldMaxHp: MAXIMILIAN_SHIELD_HP,
    vulnerable: false,
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

  const common = stepBossCommonTimers(boss, dt, events);
  if (common.rezzing) return;

  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const dist = Math.hypot(dx, dy);
  const dirX = dist > 1e-4 ? dx / dist : 0;
  const dirY = dist > 1e-4 ? dy / dist : 1;

  boss.phaseTimer -= dt * common.speedMult;

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
      boss.bladeRadius = RETRACTED_BLADE_RADIUS;
      // Blades retract: shield ring collapses, glowing core is exposed.
      boss.shieldHp = 0;
      boss.vulnerable = true;
      events.push({ type: 'sfx', sound: 'shield_break', x: boss.x, y: boss.y });
      events.push({
        type: 'voice_taunt',
        text: 'CORE EXPOSED!',
        pitch: 0.35,
        rate: 1.1,
        speaker: 'maximilian',
      });
    } else {
      boss.phase = 'stalk';
      boss.phaseTimer = STALK_DURATION;
      boss.bladeRadius = MAXIMILIAN_BLADE_RADIUS;
      boss.shieldHp = Math.max(boss.shieldHp ?? 0, 40);
      boss.vulnerable = false;
    }
  }

  // Energy shield regenerates only while the blades are spinning.
  if (boss.phase !== 'recover') {
    boss.shieldHp = Math.min(
      boss.shieldMaxHp ?? MAXIMILIAN_SHIELD_HP,
      (boss.shieldHp ?? 0) + 26 * dt,
    );
    if ((boss.shieldHp ?? 0) > 0) boss.vulnerable = false;
  }
  boss.vulnerable = isMaximilianVulnerable(boss);

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

  // 1. Blade shredding is now phase- and attack-aware (Milestone 4 bugfix).
  //    recover: blades retracted -> fully vulnerable from every angle.
  //    stalk/charge: only the frontal ±75° arc shreds -> flanks/rear are safe.
  //    whirlwind: 360° shred, but beams/lightning/grenades/pierce punch through.
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (p.life <= 0 || p.owner !== 'player') continue;
    if (boss.phase === 'recover') continue;

    const reach = boss.bladeRadius + p.radius;
    const pdx = p.x - boss.x;
    const pdy = p.y - boss.y;
    if (pdx * pdx + pdy * pdy > reach * reach) continue;

    // Heavy/piercing rounds punch through (survive) but still hammer the
    // shield meter; standard bolts are deflected and destroyed.
    const heavy = projectileBypassesBlades(p);
    const frontal = inFrontalBladeArc(boss, pdx, pdy);
    const interacts = boss.phase === 'whirlwind' || heavy || frontal;
    if (!interacts) continue;

    // Visible deflection: bright sparks + metallic clang. Heavy/piercing shots
    // punch through and drain the shield meter; standard bolts simply bounce.
    boss.shieldHp = Math.max(
      0,
      (boss.shieldHp ?? 0) - (heavy ? p.damage : STANDARD_SHOT_SHIELD_DAMAGE),
    );
    events.push({ type: 'sfx', sound: 'electric_zap', x: p.x, y: p.y });
    events.push({
      type: 'vfx_explosion',
      x: p.x,
      y: p.y,
      z: p.z,
      color: heavy ? '#67e8f9' : '#ff3355',
      count: 6,
    });
    if (!heavy) p.life = 0;

    if ((boss.shieldHp ?? 0) <= 0) {
      // Shield depleted: blades retract into a clearly telegraphed window.
      boss.phase = 'recover';
      boss.phaseTimer = RECOVER_DURATION;
      boss.bladeRadius = RETRACTED_BLADE_RADIUS;
      boss.vulnerable = true;
      events.push({ type: 'sfx', sound: 'shield_break', x: boss.x, y: boss.y });
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
