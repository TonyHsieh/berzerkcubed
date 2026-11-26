import { vectorToAngleDeg } from '../enemies/enemyUtils';
import type {
  BossState,
  GameEvent,
  OrbitingBugBot,
  PlayerState,
  Projectile,
} from '../engine/types';
import {
  applyBossDamageToPlayer,
  BOSS_FIRE_ANIM_SEC,
  nextBossProjectileId,
  stepBossCommonTimers,
} from './bossUtils';

const HIVE_RADIUS = 54;
const HIVE_MAX_HP = 1300;
const HOVER_Z = 28;
const INITIAL_BUG_COUNT = 6;
const MAX_BUG_COUNT = 8;
const BUG_ORBIT_RADIUS = 96;
const BUG_HP = 45;
const BUG_RADIUS = 16;

const ORBIT_DURATION = 2.6;
const SWOOP_DURATION = 2.2;
const REPLENISH_DURATION = 1.4;

let hiveSeq = 0;
let bugSeq = 0;

function makeOrbitingBug(
  bossX: number,
  bossY: number,
  angle: number,
): OrbitingBugBot {
  bugSeq += 1;
  return {
    id: `bug_bot_${bugSeq}`,
    angle,
    orbitRadius: BUG_ORBIT_RADIUS,
    hp: BUG_HP,
    maxHp: BUG_HP,
    state: 'orbit',
    x: bossX + Math.cos(angle) * BUG_ORBIT_RADIUS,
    y: bossY + Math.sin(angle) * BUG_ORBIT_RADIUS,
    vx: 0,
    vy: 0,
    swoopTimer: 0,
  };
}

/**
 * Floating Tech Hive & Flying Bug Bots:
 * Hexagonal tech hive core surrounded by a whirling protective shield of Flying
 * Bug Bots that intercept incoming player shots and periodically peel off in
 * swooping attack flights toward the hero. Thinning the bug shield opens firing
 * lanes to damage the hive core.
 */
export function createBugHive(x: number, y: number): BossState {
  hiveSeq += 1;
  const bugs: OrbitingBugBot[] = [];
  for (let i = 0; i < INITIAL_BUG_COUNT; i++) {
    bugs.push(makeOrbitingBug(x, y, (i / INITIAL_BUG_COUNT) * Math.PI * 2));
  }
  return {
    id: `boss_bug_hive_${hiveSeq}`,
    kind: 'bug_hive',
    name: 'TECH HIVE',
    x,
    y,
    z: HOVER_Z,
    vx: 0,
    vy: 0,
    vz: 0,
    angle: 0,
    radius: HIVE_RADIUS,
    hp: HIVE_MAX_HP,
    maxHp: HIVE_MAX_HP,
    phase: 'orbit_shield',
    phaseTimer: ORBIT_DURATION,
    parts: [
      {
        id: 'hive_core',
        label: 'Hex Hive Core',
        offsetX: 0,
        offsetY: 0,
        offsetZ: 22,
        radius: HIVE_RADIUS,
        hp: HIVE_MAX_HP,
        maxHp: HIVE_MAX_HP,
        destroyed: false,
        vulnerable: true,
      },
    ],
    bladeAngle: 0,
    bladeRadius: 0,
    orbitingBugs: bugs,
    fireAnimTimer: 0,
    hitFlash: 0,
  };
}

/**
 * Checks whether a player projectile is intercepted by one of the Tech Hive's
 * whirling Flying Bug Bots before it can reach the hive core.
 * Returns `true` if intercepted (damaging/destroying the bug and stopping non-pierce shots).
 */
export function interceptProjectileWithOrbitingBugs(
  boss: BossState,
  proj: Projectile,
  events: GameEvent[],
): boolean {
  if (boss.kind !== 'bug_hive' || !boss.orbitingBugs || boss.orbitingBugs.length === 0) {
    return false;
  }
  if ((boss.rezTimer ?? 0) > 0) return false;

  for (let i = boss.orbitingBugs.length - 1; i >= 0; i--) {
    const bug = boss.orbitingBugs[i];
    if (bug.hp <= 0) continue;
    const dx = proj.x - bug.x;
    const dy = proj.y - bug.y;
    const reach = BUG_RADIUS + proj.radius;
    if (dx * dx + dy * dy <= reach * reach) {
      bug.hp -= proj.damage;
      events.push({ type: 'sfx', sound: 'hit', x: bug.x, y: bug.y });
      if (bug.hp <= 0) {
        events.push({
          type: 'vfx_explosion',
          x: bug.x,
          y: bug.y,
          z: 16,
          color: '#22d3ee',
          count: 10,
        });
        boss.orbitingBugs.splice(i, 1);
      }
      if (proj.modifiers.includes('pierce') && proj.bouncesLeft > 0) {
        proj.bouncesLeft -= 1;
      } else {
        proj.life = 0;
      }
      return true;
    }
  }
  return false;
}

export function updateBugHive(
  boss: BossState,
  player: PlayerState,
  dt: number,
  events: GameEvent[],
): Projectile[] {
  const spawned: Projectile[] = [];
  if (dt <= 0 || boss.hp <= 0) return spawned;

  const common = stepBossCommonTimers(boss, dt, events);
  if (common.rezzing) return spawned;

  const bugs = (boss.orbitingBugs ??= []);
  const prevTimer = boss.phaseTimer;
  boss.phaseTimer -= dt * common.speedMult;

  const dx = player.x - boss.x;
  const dy = player.y - boss.y;
  const dist = Math.hypot(dx, dy);
  const dirX = dist > 1e-4 ? dx / dist : 0;
  const dirY = dist > 1e-4 ? dy / dist : 1;

  // Gentle hover drift toward preferred mid-range
  const hoverSpeed = 68 * common.speedMult;
  const radial = dist > 260 ? 1 : dist < 170 ? -0.6 : 0;
  boss.vx = (dirX * radial - dirY * 0.45) * hoverSpeed;
  boss.vy = (dirY * radial + dirX * 0.45) * hoverSpeed;
  boss.x += boss.vx * dt;
  boss.y += boss.vy * dt;
  boss.angle = (boss.angle + 38 * dt) % 360;

  // Update orbiting & swooping Flying Bug Bots
  const orbitAngularSpeed = 2.6 * common.speedMult;
  for (let i = 0; i < bugs.length; i++) {
    const bug = bugs[i];
    if (bug.state === 'orbit') {
      bug.angle = (bug.angle + orbitAngularSpeed * dt) % (Math.PI * 2);
      bug.x = boss.x + Math.cos(bug.angle) * bug.orbitRadius;
      bug.y = boss.y + Math.sin(bug.angle) * bug.orbitRadius;
      bug.vx = 0;
      bug.vy = 0;
    } else {
      // Swooping dive attack toward player
      bug.swoopTimer -= dt;
      const bdx = player.x - bug.x;
      const bdy = player.y - bug.y;
      const bdist = Math.hypot(bdx, bdy);
      if (bdist > 1e-4) {
        const diveSpeed = 280 * common.speedMult;
        bug.vx += ((bdx / bdist) * diveSpeed - bug.vx) * Math.min(1, dt * 4);
        bug.vy += ((bdy / bdist) * diveSpeed - bug.vy) * Math.min(1, dt * 4);
      }
      bug.x += bug.vx * dt;
      bug.y += bug.vy * dt;
      bug.angle = Math.atan2(bug.y - boss.y, bug.x - boss.x);

      // Swoop contact damage on player
      const reach = BUG_RADIUS + player.radius;
      if (bdx * bdx + bdy * bdy <= reach * reach) {
        applyBossDamageToPlayer(player, 16, bug.x, bug.y, 190, events);
        bug.state = 'orbit';
        bug.swoopTimer = 0;
      } else if (bug.swoopTimer <= 0) {
        bug.state = 'orbit';
      }
    }
  }

  // Phase machine: orbit_shield -> swoop_attack -> replenish
  if (boss.phase === 'orbit_shield') {
    if (boss.phaseTimer <= 0) {
      boss.phase = 'swoop_attack';
      boss.phaseTimer = SWOOP_DURATION;
      // Peel off 1-2 orbiting bugs into swooping attack flights
      const peelCount = common.rampaging ? 3 : 2;
      let peeled = 0;
      for (let i = 0; i < bugs.length && peeled < peelCount; i++) {
        if (bugs[i].state === 'orbit') {
          bugs[i].state = 'swoop';
          bugs[i].swoopTimer = 1.9;
          peeled++;
        }
      }
      if (peeled > 0) {
        events.push({ type: 'sfx', sound: 'blade_whirr', x: boss.x, y: boss.y });
      }
    }
  } else if (boss.phase === 'swoop_attack') {
    // Hive fires a burst of cyan stinger bolts mid-swoop
    const fireMark = SWOOP_DURATION * 0.5;
    if (prevTimer > fireMark && boss.phaseTimer <= fireMark) {
      boss.fireAnimTimer = BOSS_FIRE_ANIM_SEC;
      const baseRad = Math.atan2(dy, dx);
      for (let s = -1; s <= 1; s++) {
        const theta = baseRad + s * 0.28;
        spawned.push({
          id: nextBossProjectileId('hive_bolt'),
          owner: 'boss',
          kind: 'bolt',
          x: boss.x + Math.cos(theta) * (boss.radius * 0.6),
          y: boss.y + Math.sin(theta) * (boss.radius * 0.6),
          z: 16,
          vx: Math.cos(theta) * 260,
          vy: Math.sin(theta) * 260,
          vz: 0,
          radius: 6,
          damage: 16,
          life: 2.5,
          maxLife: 2.5,
          bouncesLeft: 0,
          modifiers: [],
          color: '#22d3ee',
        });
      }
      events.push({ type: 'sfx', sound: 'shoot', x: boss.x, y: boss.y });
    }

    if (boss.phaseTimer <= 0) {
      boss.phase = 'replenish';
      boss.phaseTimer = REPLENISH_DURATION;
    }
  } else {
    // Spawn replacement Flying Bug Bots if below max
    const spawnMark = REPLENISH_DURATION * 0.5;
    if (prevTimer > spawnMark && boss.phaseTimer <= spawnMark) {
      const toSpawn = Math.min(2, MAX_BUG_COUNT - bugs.length);
      for (let i = 0; i < toSpawn; i++) {
        const angle = (bugs.length / MAX_BUG_COUNT) * Math.PI * 2;
        bugs.push(makeOrbitingBug(boss.x, boss.y, angle));
      }
      if (toSpawn > 0) {
        boss.fireAnimTimer = BOSS_FIRE_ANIM_SEC;
        events.push({ type: 'sfx', sound: 'rez_in', x: boss.x, y: boss.y });
      }
    }
    if (boss.phaseTimer <= 0) {
      boss.phase = 'orbit_shield';
      boss.phaseTimer = ORBIT_DURATION;
    }
  }

  // Hive core contact damage
  const reach = boss.radius + player.radius;
  const cdx = player.x - boss.x;
  const cdy = player.y - boss.y;
  if (cdx * cdx + cdy * cdy <= reach * reach) {
    applyBossDamageToPlayer(player, 24, boss.x, boss.y, 240, events);
  }

  void vectorToAngleDeg;
  return spawned;
}
