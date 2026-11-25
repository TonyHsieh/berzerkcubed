import { vectorToAngleDeg } from '../enemies/enemyUtils';
import type {
  BossState,
  GameEvent,
  OttoVariant,
  PlayerState,
  Projectile,
} from '../engine/types';
import { applyBossDamageToPlayer, nextBossProjectileId } from './bossUtils';

interface OttoVariantSpec {
  variant: OttoVariant;
  name: string;
  baseRadius: number;
  baseHp: number;
  pursueSpeed: number;
  taunt: string;
  pitch: number;
  rate: number;
  color: string;
}

const OTTO_VARIANTS: OttoVariantSpec[] = [
  {
    variant: 'classic',
    name: 'EVIL OTTO',
    baseRadius: 26,
    baseHp: 500,
    pursueSpeed: 165,
    taunt: 'BEWARE! I LIVE! RUN, COWARD!',
    pitch: 0.35,
    rate: 0.78,
    color: '#ffe600',
  },
  {
    variant: 'volt',
    name: 'VOLT-OTTO',
    baseRadius: 30,
    baseHp: 700,
    pursueSpeed: 180,
    taunt: 'BEWARE! VOLT-OTTO LIVES! SURGE AND BURN!',
    pitch: 0.48,
    rate: 0.85,
    color: '#00f0ff',
  },
  {
    variant: 'cryo',
    name: 'CRYO-OTTO',
    baseRadius: 34,
    baseHp: 900,
    pursueSpeed: 170,
    taunt: 'BEWARE! CRYO-OTTO LIVES! FREEZE IN THE VOID!',
    pitch: 0.3,
    rate: 0.72,
    color: '#66f3ff',
  },
  {
    variant: 'vortex',
    name: 'VORTEX-OTTO',
    baseRadius: 38,
    baseHp: 1150,
    pursueSpeed: 192,
    taunt: 'BEWARE! VORTEX-OTTO LIVES! NOTHING ESCAPES!',
    pitch: 0.25,
    rate: 0.75,
    color: '#c84bff',
  },
];

const RECONSTRUCT_DURATION = 2.5;
const PURSUE_DURATION = 2.2;
const ABILITY_DURATION = 1.6;
const CONTACT_DAMAGE = 30;

let ottoSeq = 0;

// Tracks whether an Evil Otto instance has already emitted its Sinistar-style taunt
const tauntedOttos = new WeakSet<BossState>();

function getSpecForVariant(variant: OttoVariant | undefined): OttoVariantSpec {
  return (
    OTTO_VARIANTS.find((spec) => spec.variant === variant) ?? OTTO_VARIANTS[0]
  );
}

/**
 * Creates Evil Otto for the given sector.
 * Returns in progressively larger, differently powered Mega Man-style bodies:
 *   sector 0 -> classic (EVIL OTTO)
 *   sector 1 -> volt    (VOLT-OTTO)
 *   sector 2 -> cryo    (CRYO-OTTO)
 *   sector 3 -> vortex  (VORTEX-OTTO)
 * Higher cycles further scale radius and HP.
 */
export function createEvilOtto(
  x: number,
  y: number,
  sectorIndex: number,
): BossState {
  ottoSeq += 1;
  const safeSector = Math.max(0, Math.floor(sectorIndex));
  const variantIdx = safeSector % OTTO_VARIANTS.length;
  const cycle = Math.floor(safeSector / OTTO_VARIANTS.length);
  const spec = OTTO_VARIANTS[variantIdx];

  const radius = spec.baseRadius + cycle * 4;
  const maxHp = spec.baseHp + cycle * 250;

  return {
    id: `boss_otto_${spec.variant}_${ottoSeq}`,
    kind: 'evil_otto',
    name: cycle > 0 ? `${spec.name} MK.${cycle + 1}` : spec.name,
    x,
    y,
    z: 18,
    vx: 0,
    vy: 0,
    vz: 0,
    angle: 0,
    radius,
    hp: maxHp,
    maxHp,
    phase: 'reconstructing',
    phaseTimer: RECONSTRUCT_DURATION,
    parts: [
      {
        id: 'otto_core',
        label: spec.name,
        offsetX: 0,
        offsetY: 0,
        offsetZ: 14,
        radius,
        hp: maxHp,
        maxHp,
        destroyed: false,
        vulnerable: true,
      },
    ],
    bladeAngle: 0,
    bladeRadius: 0,
    ottoVariant: spec.variant,
    reconstructing: true,
    hitFlash: 0,
  };
}

function executeVariantAbility(
  boss: BossState,
  player: PlayerState,
  spec: OttoVariantSpec,
  events: GameEvent[],
): Projectile[] {
  const spawned: Projectile[] = [];
  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const baseAngle = Math.atan2(dy, dx);

  if (spec.variant === 'volt') {
    // Bouncing chain-lightning arcs
    const count = 4;
    for (let i = 0; i < count; i++) {
      const spread = (i - (count - 1) * 0.5) * 0.35;
      const theta = baseAngle + spread;
      const speed = 310;
      spawned.push({
        id: nextBossProjectileId('otto_volt'),
        owner: 'boss',
        kind: 'lightning',
        x: boss.x + Math.cos(theta) * boss.radius,
        y: boss.y + Math.sin(theta) * boss.radius,
        z: 14,
        vx: Math.cos(theta) * speed,
        vy: Math.sin(theta) * speed,
        vz: 0,
        radius: 7,
        damage: 20,
        life: 2.4,
        maxLife: 2.4,
        bouncesLeft: 3,
        modifiers: ['lightning_chain'],
        color: spec.color,
      });
    }
    events.push({ type: 'sfx', sound: 'electric_zap', x: boss.x, y: boss.y });
  } else if (spec.variant === 'cryo') {
    // Radial freeze fan
    const count = 10;
    for (let i = 0; i < count; i++) {
      const theta = baseAngle + (i / count) * Math.PI * 2;
      const speed = 230;
      spawned.push({
        id: nextBossProjectileId('otto_cryo'),
        owner: 'boss',
        kind: 'bolt',
        x: boss.x + Math.cos(theta) * boss.radius,
        y: boss.y + Math.sin(theta) * boss.radius,
        z: 12,
        vx: Math.cos(theta) * speed,
        vy: Math.sin(theta) * speed,
        vz: 0,
        radius: 6,
        damage: 16,
        life: 2.8,
        maxLife: 2.8,
        bouncesLeft: 0,
        modifiers: ['freeze'],
        color: spec.color,
      });
    }
    events.push({ type: 'sfx', sound: 'shoot', x: boss.x, y: boss.y });
  } else if (spec.variant === 'vortex') {
    // Spiraling homing drones + vortex plasma bolts
    for (let i = 0; i < 3; i++) {
      const theta = baseAngle + (i / 3) * Math.PI * 2;
      const speed = 155;
      spawned.push({
        id: nextBossProjectileId('otto_vortex_drone'),
        owner: 'boss',
        kind: 'homing_drone',
        x: boss.x + Math.cos(theta) * boss.radius,
        y: boss.y + Math.sin(theta) * boss.radius,
        z: 16,
        vx: Math.cos(theta) * speed,
        vy: Math.sin(theta) * speed,
        vz: 0,
        radius: 8,
        damage: 22,
        life: 4.5,
        maxLife: 4.5,
        bouncesLeft: 0,
        modifiers: [],
        color: spec.color,
        targetX: player.x,
        targetY: player.y,
      });
    }
    for (let i = 0; i < 6; i++) {
      const theta = baseAngle + (i / 6) * Math.PI * 2 + 0.25;
      const speed = 250;
      spawned.push({
        id: nextBossProjectileId('otto_vortex_bolt'),
        owner: 'boss',
        kind: 'bolt',
        x: boss.x + Math.cos(theta) * boss.radius,
        y: boss.y + Math.sin(theta) * boss.radius,
        z: 14,
        vx: Math.cos(theta) * speed,
        vy: Math.sin(theta) * speed,
        vz: 0,
        radius: 6,
        damage: 18,
        life: 2.6,
        maxLife: 2.6,
        bouncesLeft: 1,
        modifiers: ['ricochet'],
        color: spec.color,
      });
    }
    events.push({ type: 'sfx', sound: 'shoot', x: boss.x, y: boss.y });
  } else {
    // Classic Evil Otto: 6-way crimson/gold burst
    const count = 6;
    for (let i = 0; i < count; i++) {
      const theta = baseAngle + (i / count) * Math.PI * 2;
      const speed = 240;
      spawned.push({
        id: nextBossProjectileId('otto_classic'),
        owner: 'boss',
        kind: 'bolt',
        x: boss.x + Math.cos(theta) * boss.radius,
        y: boss.y + Math.sin(theta) * boss.radius,
        z: 14,
        vx: Math.cos(theta) * speed,
        vy: Math.sin(theta) * speed,
        vz: 0,
        radius: 6,
        damage: 18,
        life: 2.5,
        maxLife: 2.5,
        bouncesLeft: 0,
        modifiers: [],
        color: spec.color,
      });
    }
    events.push({ type: 'sfx', sound: 'shoot', x: boss.x, y: boss.y });
  }

  return spawned;
}

/**
 * Updates Evil Otto:
 * - `reconstructing`: emits Sinistar-style omnibus distorted voice taunt while
 *   reconstructing on-screen (invulnerable, stationary, pulsing Z).
 * - `pursue`: relentless bouncing pursuit toward the player.
 * - `ability`: unleashes Mega Man-style variant attack (classic burst, Volt-Otto
 *   bouncing lightning, Cryo-Otto radial freeze fan, Vortex-Otto gravity pull + drones).
 */
export function updateEvilOtto(
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

  const spec = getSpecForVariant(boss.ottoVariant);
  const prevTimer = boss.phaseTimer;
  boss.phaseTimer -= dt;

  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const dist = Math.hypot(dx, dy);
  const dirX = dist > 1e-4 ? dx / dist : 0;
  const dirY = dist > 1e-4 ? dy / dist : 1;

  if (boss.phase === 'reconstructing' || boss.reconstructing) {
    boss.reconstructing = true;
    boss.vx = 0;
    boss.vy = 0;
    boss.z = 16 + Math.abs(Math.sin(boss.phaseTimer * 6)) * 12;
    boss.angle = vectorToAngleDeg(dirX, dirY);

    if (!tauntedOttos.has(boss)) {
      tauntedOttos.add(boss);
      events.push({
        type: 'voice_taunt',
        text: spec.taunt,
        pitch: spec.pitch,
        rate: spec.rate,
        speaker: 'evil_otto',
      });
      events.push({ type: 'camera_shake', magnitude: 9, duration: 0.4 });
    }

    if (boss.phaseTimer <= 0) {
      boss.reconstructing = false;
      boss.phase = 'pursue';
      boss.phaseTimer = PURSUE_DURATION;
      events.push({
        type: 'vfx_explosion',
        x: boss.x,
        y: boss.y,
        z: boss.z,
        color: spec.color,
        count: 22,
      });
      events.push({ type: 'sfx', sound: 'explosion', x: boss.x, y: boss.y });
    }
    return spawned;
  }

  if (boss.phase === 'pursue') {
    boss.vx = dirX * spec.pursueSpeed;
    boss.vy = dirY * spec.pursueSpeed;
    boss.x += boss.vx * dt;
    boss.y += boss.vy * dt;
    // Classic Evil Otto menacing bounce
    boss.z = 6 + Math.abs(Math.sin(boss.phaseTimer * 7)) * 20;
    boss.angle = vectorToAngleDeg(dirX, dirY);

    if (boss.phaseTimer <= 0) {
      boss.phase = 'ability';
      boss.phaseTimer = ABILITY_DURATION;
    }
  } else if (boss.phase === 'ability') {
    // Move slower while channeling variant ability (classic lunges faster)
    const speedMult = spec.variant === 'classic' ? 1.25 : 0.55;
    boss.vx = dirX * spec.pursueSpeed * speedMult;
    boss.vy = dirY * spec.pursueSpeed * speedMult;
    boss.x += boss.vx * dt;
    boss.y += boss.vy * dt;
    boss.z = 14 + Math.abs(Math.sin(boss.phaseTimer * 10)) * 14;
    boss.angle = vectorToAngleDeg(dirX, dirY);

    // Vortex-Otto applies gravitational pull toward itself during ability phase
    if (spec.variant === 'vortex' && dist > boss.radius + player.radius + 10) {
      const pullAccel = 140;
      player.x -= dirX * pullAccel * dt;
      player.y -= dirY * pullAccel * dt;
    }

    // Fire Mega Man-style variant attack once near the start of the ability phase
    if (prevTimer > ABILITY_DURATION - 0.35 && boss.phaseTimer <= ABILITY_DURATION - 0.35) {
      spawned.push(...executeVariantAbility(boss, player, spec, events));
    }

    if (boss.phaseTimer <= 0) {
      boss.phase = 'pursue';
      boss.phaseTimer = PURSUE_DURATION;
    }
  } else {
    boss.phase = 'pursue';
    boss.phaseTimer = PURSUE_DURATION;
  }

  // Contact damage check when active (not reconstructing)
  const reach = boss.radius + player.radius;
  const curDx = player.x - boss.x;
  const curDy = player.y - boss.y;
  if (curDx * curDx + curDy * curDy <= reach * reach) {
    applyBossDamageToPlayer(player, CONTACT_DAMAGE, boss.x, boss.y, 280, events);
  }

  return spawned;
}
