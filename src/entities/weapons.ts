import type {
  ActiveWeaponState,
  GameEvent,
  PlayerState,
  PowerUpPickup,
  Projectile,
  WeaponModifier,
  WeaponType,
} from '../engine/types';

export const MAX_WEAPON_LEVEL = 5;

export interface WeaponSpec {
  type: WeaponType;
  kind: Projectile['kind'];
  fireIntervalSec: number;
  baseDamage: number;
  projectileSpeed: number;
  projectileRadius: number;
  projectileLifeSec: number;
  baseCount: number;
  spreadArcDeg: number;
  baseBounces: number;
  color: string;
}

const WEAPON_SPECS: Record<WeaponType, WeaponSpec> = {
  pulse_rifle: {
    type: 'pulse_rifle',
    kind: 'bolt',
    fireIntervalSec: 0.17,
    baseDamage: 18,
    projectileSpeed: 640,
    projectileRadius: 5,
    projectileLifeSec: 1.1,
    baseCount: 1,
    spreadArcDeg: 0,
    baseBounces: 0,
    color: '#38bdf8',
  },
  spread: {
    type: 'spread',
    kind: 'bolt',
    fireIntervalSec: 0.24,
    baseDamage: 13,
    projectileSpeed: 580,
    projectileRadius: 5,
    projectileLifeSec: 0.9,
    baseCount: 3,
    spreadArcDeg: 28,
    baseBounces: 0,
    color: '#22d3ee',
  },
  machine_gun: {
    type: 'machine_gun',
    kind: 'bolt',
    fireIntervalSec: 0.075,
    baseDamage: 11,
    projectileSpeed: 720,
    projectileRadius: 4,
    projectileLifeSec: 0.95,
    baseCount: 1,
    spreadArcDeg: 6,
    baseBounces: 0,
    color: '#facc15',
  },
  shotgun: {
    type: 'shotgun',
    kind: 'bolt',
    fireIntervalSec: 0.44,
    baseDamage: 15,
    projectileSpeed: 540,
    projectileRadius: 5,
    projectileLifeSec: 0.42,
    baseCount: 6,
    spreadArcDeg: 38,
    baseBounces: 0,
    color: '#fb923c',
  },
  beam: {
    type: 'beam',
    kind: 'beam_segment',
    fireIntervalSec: 0.11,
    baseDamage: 22,
    projectileSpeed: 980,
    projectileRadius: 6,
    projectileLifeSec: 0.55,
    baseCount: 1,
    spreadArcDeg: 0,
    baseBounces: 0,
    color: '#60a5fa',
  },
  wide_beam: {
    type: 'wide_beam',
    kind: 'beam_segment',
    fireIntervalSec: 0.16,
    baseDamage: 28,
    projectileSpeed: 880,
    projectileRadius: 12,
    projectileLifeSec: 0.6,
    baseCount: 1,
    spreadArcDeg: 0,
    baseBounces: 0,
    color: '#a855f7',
  },
  flamethrower: {
    type: 'flamethrower',
    kind: 'flame',
    fireIntervalSec: 0.055,
    baseDamage: 9,
    projectileSpeed: 340,
    projectileRadius: 9,
    projectileLifeSec: 0.45,
    baseCount: 2,
    spreadArcDeg: 20,
    baseBounces: 0,
    color: '#f97316',
  },
  bouncing_lightning: {
    type: 'bouncing_lightning',
    kind: 'lightning',
    fireIntervalSec: 0.25,
    baseDamage: 24,
    projectileSpeed: 690,
    projectileRadius: 6,
    projectileLifeSec: 1.35,
    baseCount: 1,
    spreadArcDeg: 0,
    baseBounces: 3,
    color: '#818cf8',
  },
  grenade: {
    type: 'grenade',
    kind: 'grenade',
    fireIntervalSec: 0.52,
    baseDamage: 48,
    projectileSpeed: 360,
    projectileRadius: 8,
    projectileLifeSec: 1.05,
    baseCount: 1,
    spreadArcDeg: 0,
    baseBounces: 1,
    color: '#4ade80',
  },
  mine: {
    type: 'mine',
    kind: 'mine',
    fireIntervalSec: 0.6,
    baseDamage: 65,
    projectileSpeed: 0,
    projectileRadius: 12,
    projectileLifeSec: 14.0,
    baseCount: 1,
    spreadArcDeg: 0,
    baseBounces: 0,
    color: '#f43f5e',
  },
};

let projectileIdCounter = 0;

export function getWeaponSpec(type: WeaponType): WeaponSpec {
  return WEAPON_SPECS[type];
}

export function createStarterWeapon(): ActiveWeaponState {
  return {
    primary: 'pulse_rifle',
    level: 1,
    modifiers: [],
    fireCooldown: 0,
  };
}

export function applyWeaponPickup(
  weapon: ActiveWeaponState,
  weaponType: WeaponType,
): void {
  if (weapon.primary === weaponType) {
    weapon.level = Math.min(MAX_WEAPON_LEVEL, weapon.level + 1);
  } else {
    weapon.primary = weaponType;
    weapon.level = Math.max(1, weapon.level);
  }
}

export function applyModifierPickup(
  weapon: ActiveWeaponState,
  modifier: WeaponModifier,
): void {
  if (!weapon.modifiers.includes(modifier)) {
    weapon.modifiers.push(modifier);
  } else {
    weapon.level = Math.min(MAX_WEAPON_LEVEL, weapon.level + 1);
  }
}

// ---------------- Milestone 4: 3-slot weapon inventory & F-to-swap ----------------

export const WEAPON_SLOT_COUNT = 3;

export const WEAPON_PICKUP_LABELS: Record<WeaponType, string> = {
  pulse_rifle: 'PULSE',
  spread: 'SPREAD',
  machine_gun: 'MGUN',
  shotgun: 'SHOTGUN',
  beam: 'BEAM',
  wide_beam: 'WIDE BEAM',
  flamethrower: 'FLAMER',
  bouncing_lightning: 'TESLA',
  grenade: 'GRENADE',
  mine: 'MINE',
};

export function weaponPickupLabel(type: WeaponType): string {
  return WEAPON_PICKUP_LABELS[type] ?? type.toUpperCase();
}

/** Short hovering label shown under a ground pickup. */
export function pickupLabel(pickup: PowerUpPickup): string {
  switch (pickup.kind) {
    case 'weapon':
      return pickup.weaponType ? weaponPickupLabel(pickup.weaponType) : 'WEAPON';
    case 'modifier':
      return pickup.modifier ? pickup.modifier.replace(/_/g, ' ').toUpperCase() : 'MOD';
    case 'orbital':
      return pickup.orbitalType ? pickup.orbitalType.replace(/_/g, ' ').toUpperCase() : 'ORBITAL';
    case 'shield_boost':
      return 'SHIELD';
    case 'extra_life':
      return '1-UP';
  }
}

function makeWeapon(weaponType: WeaponType, level = 1): ActiveWeaponState {
  const weapon = createStarterWeapon();
  weapon.primary = weaponType;
  weapon.level = Math.max(1, Math.min(MAX_WEAPON_LEVEL, level));
  return weapon;
}

/** Lazily materialize exactly 3 slots for players created before Milestone 4. */
export function ensureWeaponSlots(
  player: PlayerState,
): Array<ActiveWeaponState | null> {
  if (!player.weaponSlots || player.weaponSlots.length !== WEAPON_SLOT_COUNT) {
    player.weaponSlots = [player.weapon, null, null];
    player.activeSlot = 0;
    return player.weaponSlots;
  }
  const active = Math.max(0, Math.min(WEAPON_SLOT_COUNT - 1, player.activeSlot ?? 0));
  player.activeSlot = active;
  if (player.weaponSlots[active] !== player.weapon) {
    player.weaponSlots[active] = player.weapon;
  }
  return player.weaponSlots;
}

/** Callers must ensure slots first; this only repoints the active weapon. */
function setActiveSlot(player: PlayerState, index: number): void {
  const slots = player.weaponSlots;
  if (!slots) return;
  const clamped = Math.max(0, Math.min(WEAPON_SLOT_COUNT - 1, index));
  const weapon = slots[clamped];
  if (!weapon) return;
  player.activeSlot = clamped;
  player.weapon = weapon;
  player.weapon.fireCooldown = 0;
}

export function getActiveSlot(player: PlayerState): number {
  ensureWeaponSlots(player);
  return player.activeSlot ?? 0;
}

export function selectWeaponSlot(player: PlayerState, index: number): boolean {
  const slots = ensureWeaponSlots(player);
  if (index < 0 || index >= WEAPON_SLOT_COUNT || !slots[index]) return false;
  setActiveSlot(player, index);
  return true;
}

export function cycleWeaponSlot(player: PlayerState, direction: -1 | 0 | 1): boolean {
  if (direction === 0) return false;
  const slots = ensureWeaponSlots(player);
  const current = getActiveSlot(player);
  for (let step = 1; step <= WEAPON_SLOT_COUNT; step++) {
    const idx =
      (((current + direction * step) % WEAPON_SLOT_COUNT) + WEAPON_SLOT_COUNT) %
      WEAPON_SLOT_COUNT;
    if (slots[idx]) {
      setActiveSlot(player, idx);
      return true;
    }
  }
  return false;
}

export interface WeaponSwapOutcome {
  result: 'upgrade' | 'equip' | 'swap';
  slotIndex: number;
  replaced?: WeaponType;
}

/**
 * `F` near a dropped weapon: level up a carried copy, equip into an empty slot,
 * or swap with the active slot and hand back the replaced weapon for dropping.
 */
export function applyWeaponPickupToSlots(
  player: PlayerState,
  weaponType: WeaponType,
): WeaponSwapOutcome {
  const slots = ensureWeaponSlots(player);
  // Modifiers collected on walk-over persist when equipping a new weapon.
  const inheritedModifiers = [...player.weapon.modifiers];
  const existing = slots.findIndex((s) => s?.primary === weaponType);
  if (existing >= 0) {
    applyWeaponPickup(slots[existing]!, weaponType);
    setActiveSlot(player, existing);
    return { result: 'upgrade', slotIndex: existing };
  }
  const empty = slots.findIndex((s) => s === null);
  if (empty >= 0) {
    slots[empty] = makeWeapon(weaponType);
    slots[empty]!.modifiers = inheritedModifiers;
    setActiveSlot(player, empty);
    return { result: 'equip', slotIndex: empty };
  }
  const active = getActiveSlot(player);
  const replaced = slots[active]?.primary ?? 'pulse_rifle';
  slots[active] = makeWeapon(weaponType);
  slots[active]!.modifiers = inheritedModifiers;
  setActiveSlot(player, active);
  return { result: 'swap', slotIndex: active, replaced };
}

let droppedPickupSeq = 0;

/** A swapped-out weapon becomes a retrieveable ground pickup. */
export function createDroppedWeaponPickup(
  x: number,
  y: number,
  weaponType: WeaponType,
): PowerUpPickup {
  droppedPickupSeq += 1;
  return {
    id: `dropped_weapon_${droppedPickupSeq}`,
    x,
    y,
    z: 0,
    kind: 'weapon',
    weaponType,
    life: 30,
  };
}

function resolveProjectileColor(baseColor: string, modifiers: WeaponModifier[]): string {
  if (modifiers.includes('freeze')) return '#67e8f9';
  if (modifiers.includes('lightning_chain')) return '#a5b4fc';
  return baseColor;
}

export function fireWeapon(player: PlayerState, events: GameEvent[]): Projectile[] {
  const weapon = player.weapon;
  const spec = WEAPON_SPECS[weapon.primary];
  const level = Math.max(1, Math.min(MAX_WEAPON_LEVEL, weapon.level));
  const modifiers = [...weapon.modifiers];

  // Level scaling: faster fire rate, higher damage, extra pellets/width/bounces
  const cooldownScale = 1 - (level - 1) * 0.08;
  weapon.fireCooldown = Math.max(0.035, spec.fireIntervalSec * cooldownScale);
  player.recoil = 1.0;
  player.muzzleFlash = 0.08;

  const aimRad = (player.aimAngle * Math.PI) / 180;
  const forwardX = Math.sin(aimRad);
  const forwardY = -Math.cos(aimRad);
  const rightX = Math.cos(aimRad);
  const rightY = Math.sin(aimRad);

  const muzzleX =
    spec.kind === 'mine' ? player.x : player.x + forwardX * 22 + rightX * 8;
  const muzzleY =
    spec.kind === 'mine' ? player.y : player.y + forwardY * 22 + rightY * 8;

  let count = spec.baseCount;
  if (weapon.primary === 'spread') {
    count = spec.baseCount + (level - 1) * 2;
  } else if (weapon.primary === 'shotgun') {
    count = spec.baseCount + (level - 1);
  } else if (weapon.primary === 'pulse_rifle' && level >= 3) {
    count = level >= 5 ? 3 : 2;
  } else if (weapon.primary === 'bouncing_lightning' && level >= 4) {
    count = 2;
  }

  const damage = Math.round(spec.baseDamage * (1 + (level - 1) * 0.22));
  const radius =
    weapon.primary === 'wide_beam'
      ? spec.projectileRadius + (level - 1) * 3
      : spec.projectileRadius;

  let bouncesLeft = spec.baseBounces;
  if (weapon.primary === 'bouncing_lightning') {
    bouncesLeft += level - 1;
  }
  if (modifiers.includes('ricochet')) {
    bouncesLeft += 2;
  }
  if (modifiers.includes('lightning_chain')) {
    bouncesLeft += 2;
  }
  if (modifiers.includes('pierce')) {
    bouncesLeft += 1;
  }

  const color = resolveProjectileColor(spec.color, modifiers);
  const projectiles: Projectile[] = [];

  const effectiveArcDeg =
    count > 1 ? Math.max(spec.spreadArcDeg, 10 + (count - 1) * 4) : spec.spreadArcDeg;

  for (let i = 0; i < count; i++) {
    projectileIdCounter += 1;
    let angleOffsetDeg = 0;

    if (count > 1) {
      const frac = i / (count - 1) - 0.5;
      angleOffsetDeg = frac * effectiveArcDeg;
    } else if (spec.spreadArcDeg > 0) {
      // Deterministic micro-jitter based on projectile counter for machine gun
      const jitter = ((projectileIdCounter % 5) - 2) / 2;
      angleOffsetDeg = jitter * (spec.spreadArcDeg * 0.5);
    }

    const shotRad = ((player.aimAngle + angleOffsetDeg) * Math.PI) / 180;
    const dirX = Math.sin(shotRad);
    const dirY = -Math.cos(shotRad);

    const vx = spec.projectileSpeed === 0 ? 0 : dirX * spec.projectileSpeed;
    const vy = spec.projectileSpeed === 0 ? 0 : dirY * spec.projectileSpeed;
    const vz = spec.kind === 'grenade' ? 210 : 0;

    const proj: Projectile = {
      id: `pproj_${projectileIdCounter}`,
      owner: 'player',
      kind: spec.kind,
      x: muzzleX,
      y: muzzleY,
      z: spec.kind === 'mine' ? 2 : player.z + 16,
      vx,
      vy,
      vz,
      radius,
      damage,
      life: spec.projectileLifeSec,
      maxLife: spec.projectileLifeSec,
      bouncesLeft,
      modifiers: [...modifiers],
      color,
    };

    if (spec.kind === 'grenade') {
      proj.targetX = muzzleX + vx * spec.projectileLifeSec;
      proj.targetY = muzzleY + vy * spec.projectileLifeSec;
    }

    projectiles.push(proj);
  }

  events.push({ type: 'sfx', sound: 'shoot', x: player.x, y: player.y });
  return projectiles;
}
