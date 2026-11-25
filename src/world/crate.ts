import type {
  DestructibleCrate,
  GameEvent,
  OrbitalType,
  PlatformIsland,
  PowerUpPickup,
  WeaponModifier,
  WeaponType,
} from '../engine/types';

const DROP_WEAPONS: WeaponType[] = [
  'spread',
  'machine_gun',
  'shotgun',
  'beam',
  'wide_beam',
  'flamethrower',
  'bouncing_lightning',
  'grenade',
  'mine',
];

const DROP_MODIFIERS: WeaponModifier[] = [
  'freeze',
  'lightning_chain',
  'pierce',
  'ricochet',
];

const DROP_ORBITALS: OrbitalType[] = [
  'shooter_drone',
  'lightsaber',
  'ablative_shield',
];

let pickupCounter = 0;

export function createCrate(
  id: string,
  x: number,
  y: number,
  hp = 45,
  angle = 0,
): DestructibleCrate {
  return {
    id,
    x,
    y,
    angle,
    radius: 18,
    hp,
    maxHp: hp,
    hitFlash: 0,
  };
}

function createPowerUpFromCrate(crate: DestructibleCrate): PowerUpPickup {
  pickupCounter += 1;
  const seed = Math.abs(Math.floor(crate.x * 13 + crate.y * 7) + pickupCounter);
  const roll = seed % 10;

  const base = {
    id: `pickup_${pickupCounter}`,
    x: crate.x,
    y: crate.y,
    z: 6,
    life: 20,
  };

  if (roll < 4) {
    return {
      ...base,
      kind: 'weapon',
      weaponType: DROP_WEAPONS[seed % DROP_WEAPONS.length],
    };
  }
  if (roll < 7) {
    return {
      ...base,
      kind: 'modifier',
      modifier: DROP_MODIFIERS[seed % DROP_MODIFIERS.length],
    };
  }
  if (roll < 9) {
    return {
      ...base,
      kind: 'orbital',
      orbitalType: DROP_ORBITALS[seed % DROP_ORBITALS.length],
    };
  }
  return {
    ...base,
    kind: seed % 2 === 0 ? 'shield_boost' : 'extra_life',
  };
}

export function damageCrate(
  island: PlatformIsland,
  crateId: string,
  damage: number,
  events: GameEvent[],
): PowerUpPickup | null {
  if (damage <= 0) return null;

  const idx = island.crates.findIndex((c) => c.id === crateId);
  if (idx === -1) return null;

  const crate = island.crates[idx];
  crate.hp -= damage;
  crate.hitFlash = 0.16;

  if (crate.hp > 0) {
    return null;
  }

  island.crates.splice(idx, 1);

  events.push(
    { type: 'crate_destroyed', x: crate.x, y: crate.y },
    {
      type: 'vfx_explosion',
      x: crate.x,
      y: crate.y,
      z: 8,
      color: '#f59e0b',
      count: 14,
    },
    { type: 'sfx', sound: 'explosion', x: crate.x, y: crate.y },
  );

  return createPowerUpFromCrate(crate);
}
