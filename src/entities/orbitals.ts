import type {
  BossState,
  EnemyState,
  GameEvent,
  OrbitalState,
  OrbitalType,
  PlayerState,
  Projectile,
  Vec2,
} from '../engine/types';

const ORBIT_RADII: Record<OrbitalType, number> = {
  shooter_drone: 48,
  lightsaber: 40,
  ablative_shield: 32,
};

const ORBIT_ANGULAR_SPEED: Record<OrbitalType, number> = {
  shooter_drone: 2.0,
  lightsaber: 4.4,
  ablative_shield: 2.6,
};

const DRONE_FIRE_INTERVAL_SEC = 0.45;
const DRONE_RANGE_PX = 380;
const DRONE_BOLT_SPEED = 620;
const DRONE_BOLT_DAMAGE = 14;
const LIGHTSABER_HIT_RADIUS = 16;
const LIGHTSABER_DPS = 120;
const SHIELD_HIT_RADIUS = 16;

let orbitalIdCounter = 0;
let droneProjCounter = 0;

export function addOrbital(player: PlayerState, type: OrbitalType): OrbitalState {
  orbitalIdCounter += 1;
  const maxHp = type === 'ablative_shield' ? 50 : 999;

  const orbital: OrbitalState = {
    id: `orb_${type}_${orbitalIdCounter}`,
    type,
    orbitAngle: 0,
    orbitRadius: ORBIT_RADII[type],
    hp: maxHp,
    maxHp,
    fireCooldown: 0,
  };

  player.orbitals.push(orbital);

  // Evenly redistribute angles among orbitals of the same type
  const sameType = player.orbitals.filter((o) => o.type === type);
  const step = (Math.PI * 2) / sameType.length;
  for (let i = 0; i < sameType.length; i++) {
    sameType[i].orbitAngle = i * step;
  }

  return orbital;
}

export function getOrbitalWorldPos(player: PlayerState, orbital: OrbitalState): Vec2 {
  return {
    x: player.x + Math.cos(orbital.orbitAngle) * orbital.orbitRadius,
    y: player.y + Math.sin(orbital.orbitAngle) * orbital.orbitRadius,
  };
}

export function updateOrbitals(
  player: PlayerState,
  enemies: EnemyState[],
  enemyProjectiles: Projectile[],
  dt: number,
  events: GameEvent[],
  boss?: BossState | null,
): Projectile[] {
  const spawned: Projectile[] = [];
  if (dt <= 0 || player.orbitals.length === 0) return spawned;

  const destroyedIds = new Set<string>();

  for (let i = 0; i < player.orbitals.length; i++) {
    const orb = player.orbitals[i];
    orb.orbitAngle = (orb.orbitAngle + ORBIT_ANGULAR_SPEED[orb.type] * dt) % (Math.PI * 2);
    if (orb.fireCooldown > 0) {
      orb.fireCooldown = Math.max(0, orb.fireCooldown - dt);
    }

    const pos = getOrbitalWorldPos(player, orb);

    if (orb.type === 'shooter_drone') {
      if (orb.fireCooldown <= 0) {
        let targetX = 0;
        let targetY = 0;
        let hasTarget = false;
        let nearestDistSq = DRONE_RANGE_PX * DRONE_RANGE_PX;

        for (let e = 0; e < enemies.length; e++) {
          const enemy = enemies[e];
          if (enemy.hp <= 0 || (enemy.rezTimer ?? 0) > 0) continue;
          const dx = enemy.x - pos.x;
          const dy = enemy.y - pos.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < nearestDistSq) {
            nearestDistSq = dSq;
            targetX = enemy.x;
            targetY = enemy.y;
            hasTarget = true;
          }
        }

        if (
          boss &&
          boss.hp > 0 &&
          (boss.rezTimer ?? 0) <= 0 &&
          !boss.reconstructing
        ) {
          const dx = boss.x - pos.x;
          const dy = boss.y - pos.y;
          const dSq = dx * dx + dy * dy;
          if (dSq < nearestDistSq) {
            nearestDistSq = dSq;
            targetX = boss.x;
            targetY = boss.y;
            hasTarget = true;
          }
        }

        if (hasTarget) {
          droneProjCounter += 1;
          const dx = targetX - pos.x;
          const dy = targetY - pos.y;
          const dist = Math.max(0.001, Math.sqrt(dx * dx + dy * dy));
          spawned.push({
            id: `drone_bolt_${droneProjCounter}`,
            owner: 'player',
            kind: 'bolt',
            x: pos.x,
            y: pos.y,
            z: player.z + 16,
            vx: (dx / dist) * DRONE_BOLT_SPEED,
            vy: (dy / dist) * DRONE_BOLT_SPEED,
            vz: 0,
            radius: 4,
            damage: DRONE_BOLT_DAMAGE,
            life: 0.85,
            maxLife: 0.85,
            bouncesLeft: 0,
            modifiers: [],
            color: '#22d3ee',
          });
          orb.fireCooldown = DRONE_FIRE_INTERVAL_SEC;
          events.push({ type: 'sfx', sound: 'shoot', x: pos.x, y: pos.y });
        }
      }
    } else if (orb.type === 'lightsaber') {
      // Slice nearby melee swarmers
      for (let e = 0; e < enemies.length; e++) {
        const enemy = enemies[e];
        if (enemy.hp <= 0) continue;
        const dx = enemy.x - pos.x;
        const dy = enemy.y - pos.y;
        const hitDist = LIGHTSABER_HIT_RADIUS + enemy.radius;
        if (dx * dx + dy * dy <= hitDist * hitDist) {
          enemy.hp -= LIGHTSABER_DPS * dt;
          enemy.hitFlash = 0.1;
        }
      }

      // Intercept weak enemy bolts
      for (let p = 0; p < enemyProjectiles.length; p++) {
        const proj = enemyProjectiles[p];
        if (proj.life <= 0 || proj.owner === 'player' || proj.kind !== 'bolt') continue;
        const dx = proj.x - pos.x;
        const dy = proj.y - pos.y;
        const hitDist = LIGHTSABER_HIT_RADIUS + proj.radius;
        if (dx * dx + dy * dy <= hitDist * hitDist) {
          proj.life = 0;
          events.push({ type: 'sfx', sound: 'hit', x: pos.x, y: pos.y });
        }
      }
    } else if (orb.type === 'ablative_shield') {
      for (let p = 0; p < enemyProjectiles.length; p++) {
        const proj = enemyProjectiles[p];
        if (proj.life <= 0 || proj.owner === 'player') continue;
        const dx = proj.x - pos.x;
        const dy = proj.y - pos.y;
        const hitDist = SHIELD_HIT_RADIUS + proj.radius;
        if (dx * dx + dy * dy <= hitDist * hitDist) {
          proj.life = 0;
          orb.hp -= Math.max(1, proj.damage);
          events.push({ type: 'sfx', sound: 'hit', x: pos.x, y: pos.y });
          if (orb.hp <= 0) {
            destroyedIds.add(orb.id);
            events.push({ type: 'sfx', sound: 'shield_break', x: pos.x, y: pos.y });
            break;
          }
        }
      }
    }
  }

  if (destroyedIds.size > 0) {
    player.orbitals = player.orbitals.filter((o) => !destroyedIds.has(o.id));
  }

  return spawned;
}
