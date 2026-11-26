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
  nextBossProjectileId,
  stepBossCommonTimers,
} from './bossUtils';

const BRAINBOT_RADIUS = 52;
const BRAINBOT_MAX_HP = 1200;

const ROLL_DURATION = 2.2;
const WAVE_DURATION = 1.5;
const ROLL_SPEED = 245;
const ELECTRIC_WAVE_SPEED = 285;
const CONTACT_DAMAGE = 26;

let brainSeq = 0;

/**
 * Rolling Brainbot: translucent glass-domed biomechanical brain-in-a-jar mech
 * with glowing green central eye and warm orange neural core.
 * Rolls rapidly across corridors while firing crackling ground-hugging
 * brain-electricity waves that the hero must dodge-roll over or sidestep.
 */
export function createBrainbot(x: number, y: number): BossState {
  brainSeq += 1;
  return {
    id: `boss_brainbot_${brainSeq}`,
    kind: 'brainbot',
    name: 'BRAINBOT',
    x,
    y,
    z: 8,
    vx: 0,
    vy: 0,
    vz: 0,
    angle: 0,
    radius: BRAINBOT_RADIUS,
    hp: BRAINBOT_MAX_HP,
    maxHp: BRAINBOT_MAX_HP,
    phase: 'roll_charge',
    phaseTimer: ROLL_DURATION,
    parts: [
      {
        id: 'brain_dome',
        label: 'Neural Dome',
        offsetX: 0,
        offsetY: 0,
        offsetZ: 22,
        radius: BRAINBOT_RADIUS,
        hp: BRAINBOT_MAX_HP,
        maxHp: BRAINBOT_MAX_HP,
        destroyed: false,
        vulnerable: true,
      },
    ],
    bladeAngle: 0,
    bladeRadius: 0,
    fireAnimTimer: 0,
    hitFlash: 0,
  };
}

function spawnElectricWaveFan(
  boss: BossState,
  baseRad: number,
  count: number,
): Projectile[] {
  const waves: Projectile[] = [];
  const spread = 0.26;
  for (let i = 0; i < count; i++) {
    const offset = (i - (count - 1) * 0.5) * spread;
    const theta = baseRad + offset;
    waves.push({
      id: nextBossProjectileId('brain_elec'),
      owner: 'boss',
      kind: 'electric_wave',
      x: boss.x + Math.cos(theta) * (boss.radius * 0.7),
      y: boss.y + Math.sin(theta) * (boss.radius * 0.7),
      z: 2, // ground-hugging wave
      vx: Math.cos(theta) * ELECTRIC_WAVE_SPEED,
      vy: Math.sin(theta) * ELECTRIC_WAVE_SPEED,
      vz: 0,
      radius: 11,
      damage: 20,
      life: 2.6,
      maxLife: 2.6,
      bouncesLeft: 1,
      modifiers: ['lightning_chain'],
      color: i % 2 === 0 ? '#22d3ee' : '#4ade80',
    });
  }
  return waves;
}

export function updateBrainbot(
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
  const aimRad = Math.atan2(dy, dx);

  if (boss.phase === 'roll_charge') {
    // Rapid rolling pursuit with slight weaving curve
    const weave = Math.sin(boss.phaseTimer * 5) * 0.35;
    const moveRad = aimRad + weave;
    const speed = ROLL_SPEED * common.speedMult;
    const blend = Math.min(1, dt * 6);
    boss.vx += (Math.cos(moveRad) * speed - boss.vx) * blend;
    boss.vy += (Math.sin(moveRad) * speed - boss.vy) * blend;
    boss.x += boss.vx * dt;
    boss.y += boss.vy * dt;
    boss.angle = vectorToAngleDeg(boss.vx, boss.vy);

    // Emit a single ground-hugging crackling wave mid-roll
    const midRoll = ROLL_DURATION * 0.5;
    if (prevTimer > midRoll && boss.phaseTimer <= midRoll) {
      boss.fireAnimTimer = BOSS_FIRE_ANIM_SEC;
      spawned.push(...spawnElectricWaveFan(boss, aimRad, 3));
      events.push({ type: 'sfx', sound: 'electric_zap', x: boss.x, y: boss.y });
    }

    if (boss.phaseTimer <= 0) {
      boss.phase = 'electric_wave';
      boss.phaseTimer = WAVE_DURATION;
    }
  } else {
    // Slow down and unleash wide crackling ground-electricity wave fan
    boss.vx *= 0.85;
    boss.vy *= 0.85;
    boss.x += boss.vx * dt;
    boss.y += boss.vy * dt;
    boss.angle = vectorToAngleDeg(dirX, dirY);

    const pulse1 = WAVE_DURATION * 0.72;
    const pulse2 = WAVE_DURATION * 0.3;
    if (
      (prevTimer > pulse1 && boss.phaseTimer <= pulse1) ||
      (prevTimer > pulse2 && boss.phaseTimer <= pulse2)
    ) {
      boss.fireAnimTimer = BOSS_FIRE_ANIM_SEC;
      const count = common.rampaging ? 7 : 5;
      spawned.push(...spawnElectricWaveFan(boss, aimRad, count));
      events.push({ type: 'sfx', sound: 'electric_zap', x: boss.x, y: boss.y });
      events.push({ type: 'camera_shake', magnitude: 6, duration: 0.16 });
    }

    if (boss.phaseTimer <= 0) {
      boss.phase = 'roll_charge';
      boss.phaseTimer = ROLL_DURATION;
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
