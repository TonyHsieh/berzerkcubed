import { createDifficultyConfig } from '../config/difficulty';
import {
  ABB_ICBM_BLAST_RADIUS,
  createAbb,
  steerGuidedIcbm,
  updateAbb,
} from '../bosses/abb';
import {
  applyHigherSectorBossScaling,
  BOSS_REZ_DURATION,
} from '../bosses/bossUtils';
import { createBrainbot, updateBrainbot } from '../bosses/brainbot';
import {
  createBugHive,
  interceptProjectileWithOrbitingBugs,
  updateBugHive,
} from '../bosses/bugHive';
import { createEvilOtto, updateEvilOtto } from '../bosses/evilOtto';
import {
  createMaximilian,
  interceptProjectileWithAblativeShields,
  updateMaximilian,
} from '../bosses/maximilian';
import {
  createRecogniser,
  damageBossPart,
  updateRecogniser,
} from '../bosses/recogniser';
import { createSkullhead, updateSkullhead } from '../bosses/skullhead';
import { applyFreezeHit } from '../enemies/enemyUtils';
import { isMeleeEnemyKind, updateEnforcers } from '../enemies/enforcer';
import { GRENADE_GRAVITY, updateRangedEnemies } from '../enemies/shooter';
import { spawnHordeWave, SAFE_SPAWN_CLEARANCE } from '../enemies/spawner';
import { createCameraState, updateCamera } from '../engine/camera';
import { SpatialGrid } from '../engine/spatialGrid';
import type {
  BossKind,
  BossState,
  CameraState,
  CardinalDirection,
  DifficultyConfig,
  EnemyState,
  GameEvent,
  InputState,
  PlatformIsland,
  PlayerState,
  PowerUpPickup,
  Projectile,
  RoomTransitionState,
} from '../engine/types';
import { getOrbitalWorldPos, updateOrbitals } from '../entities/orbitals';
import {
  applyDodgeShove,
  applyPowerUp,
  clampToSafeIslandFloor,
  createPlayer,
  damagePlayer,
  HERO_POST_REZ_INVULN,
  HERO_REZ_DURATION,
  HERO_TELEFRAG_RADIUS,
  isPlayerInvulnerable,
  resetPlayerLoadout,
  triggerHeroDeath,
  updatePlayer,
} from '../entities/player';
import {
  applyWeaponPickupToSlots,
  createDroppedWeaponPickup,
  cycleWeaponSlot,
  pickupLabel,
  selectWeaponSlot,
  shouldAutoCollectWeapon,
  weaponPickupLabel,
} from '../entities/weapons';
import { damageCrate } from '../world/crate';
import { createSectorIsland, getDoorwayEntryPosition } from '../world/levelData';
import {
  pointHitsSolidWall,
  resolveEntityAgainstWorld,
  unlockCardinalExitDoors,
  updateWorld,
} from '../world/worldSim';

export const FIXED_DT = 1 / 60;

const MAX_STEP_DT = 0.05;
const PICKUP_COLLECT_RADIUS = 18;
const ENFORCER_MELEE_DAMAGE = 14;
export const GRENADE_BLAST_RADIUS = 96;
const SKY_BOMB_BLAST_RADIUS = 68;
const MINE_BLAST_RADIUS = 64;
export const LIGHTNING_CHAIN_RADIUS = 130;
export const LIGHTNING_FLASH_SEC = 0.16;
export const BURN_DURATION_SEC = 3.0;
const BURN_TICK_INTERVAL_SEC = 0.35;
const BURN_TICK_DAMAGE = 6;
const WAVE_INTERVAL_SEC = 5.5;
const INITIAL_WAVE_DELAY_SEC = 0.5;
const POST_REZ_HALO_SEC = 0.15;
const TELEFRAG_BOSS_DAMAGE = 120;
const TELEFRAG_BOSS_KNOCKBACK = 320;
const LIGHTSABER_BOSS_HIT_RADIUS = 16;
const LIGHTSABER_BOSS_DPS = 120;

/** Milestone 4.13: Duration (seconds) of the classic door-walk push-slide room transition. */
export const ROOM_TRANSITION_DURATION = 0.62;

export interface GameState {
  island: PlatformIsland;
  player: PlayerState;
  enemies: EnemyState[];
  playerProjectiles: Projectile[];
  enemyProjectiles: Projectile[];
  bossProjectiles: Projectile[];
  pickups: PowerUpPickup[];
  /** Closest weapon pickup within F range (drives the [F] EQUIP/SWAP prompt). */
  nearbyWeaponPickup: PowerUpPickup | null;
  /** Short-lived HUD toast for pickups / weapon swaps. */
  toast: { text: string; life: number } | null;
  boss: BossState | null;
  camera: CameraState;
  grid: SpatialGrid<EnemyState>;
  events: GameEvent[];
  config: DifficultyConfig;
  score: number;
  sectorIndex: number;
  elapsedTime: number;
  sectorTime: number;
  ottoTimer: number;
  ottoWarningActive: boolean;
  ottoSpawned: boolean;
  waveIndex: number;
  wavesPerSector: number;
  waveSpawnTimer: number;
  bossSpawned: boolean;
  bossDefeated: boolean;
  /** Milestone 4.13: active push-slide room transition when walking through an open exit door. */
  roomTransition: RoomTransitionState | null;
  gameOver: boolean;
  viewport: { width: number; height: number };
}

export function createGameStateForSector(
  sectorIndex: number,
  config: DifficultyConfig = createDifficultyConfig(),
  existingPlayer?: PlayerState,
  score = 0,
): GameState {
  const safeSector = Math.max(0, Math.floor(sectorIndex));
  const island = createSectorIsland(safeSector);
  const spawnX = island.bounds.x + island.bounds.w * 0.5;
  const spawnY = island.bounds.y + island.bounds.h * 0.5;

  const player = existingPlayer
    ? {
        ...existingPlayer,
        x: spawnX,
        y: spawnY,
        z: 0,
        vx: 0,
        vy: 0,
        lastSafeX: spawnX,
        lastSafeY: spawnY,
        dodgeTimer: 0,
        invulnTimer: Math.max(existingPlayer.invulnTimer, 1.5),
      }
    : createPlayer(spawnX, spawnY, config);

  const camera = createCameraState();
  camera.x = player.x;
  camera.y = player.y;

  const state: GameState = {
    island,
    player,
    enemies: [],
    playerProjectiles: [],
    enemyProjectiles: [],
    bossProjectiles: [],
    pickups: [],
    nearbyWeaponPickup: null,
    toast: null,
    boss: null,
    camera,
    grid: new SpatialGrid<EnemyState>(96),
    events: [],
    config,
    score,
    sectorIndex: safeSector,
    elapsedTime: 0,
    sectorTime: 0,
    ottoTimer: 0,
    ottoWarningActive: false,
    ottoSpawned: false,
    waveIndex: 0,
    wavesPerSector: 2 + Math.min(safeSector, 3),
    waveSpawnTimer: INITIAL_WAVE_DELAY_SEC,
    bossSpawned: false,
    bossDefeated: false,
    roomTransition: null,
    gameOver: false,
    viewport: { width: 1280, height: 720 },
  };

  // Milestone 4.11: open with a small, far-away vanguard (including V-Bots)
  // that materializes via TRON rez-in — zero instant pop-in.
  const vanguard = spawnHordeWave(state.island, state.enemies, config, safeSector, {
    heroX: spawnX,
    heroY: spawnY,
    clearance: SAFE_SPAWN_CLEARANCE,
    vanguard: true,
    includeVBots: true,
  });
  state.enemies.push(...vanguard);
  for (let i = 0; i < vanguard.length; i++) state.grid.insert(vanguard[i]);

  return state;
}

export function createGameState(
  config: DifficultyConfig = createDifficultyConfig(),
): GameState {
  return createGameStateForSector(0, config);
}

function createScaledBoss(
  kind: BossKind,
  x: number,
  y: number,
  sectorIndex: number,
): BossState {
  if (kind === 'evil_otto') {
    return createEvilOtto(x, y, sectorIndex);
  }
  let boss: BossState;
  switch (kind) {
    case 'recogniser':
      boss = createRecogniser(x, y);
      break;
    case 'abb':
      boss = createAbb(x, y);
      break;
    case 'skullhead':
      boss = createSkullhead(x, y);
      break;
    case 'bug_hive':
      boss = createBugHive(x, y);
      break;
    case 'brainbot':
      boss = createBrainbot(x, y);
      break;
    default:
      boss = createMaximilian(x, y, sectorIndex);
      break;
  }

  return applyHigherSectorBossScaling(boss, sectorIndex);
}

export interface SpawnBossOptions {
  /** TRON rez-in materialization duration (seconds). */
  rezDuration?: number;
}

export function spawnBoss(
  state: GameState,
  kind: BossKind,
  options: SpawnBossOptions = {},
): BossState {
  const b = state.island.bounds;
  const cx = b.x + b.w * 0.5;
  const cy = b.y + b.h * 0.25;
  const boss = createScaledBoss(kind, cx, cy, state.sectorIndex);
  const rez = options.rezDuration ?? 0;
  if (rez > 0) {
    boss.rezTimer = rez;
    boss.rezDuration = rez;
    state.events.push({ type: 'sfx', sound: 'rez_in', x: cx, y: cy });
  }
  state.boss = boss;
  if (kind === 'evil_otto') {
    state.ottoSpawned = true;
    state.ottoWarningActive = true;
  } else {
    state.bossSpawned = true;
    state.bossDefeated = false;
  }
  return boss;
}

export function advanceToNextSector(state: GameState): GameState {
  const next = createGameStateForSector(
    state.sectorIndex + 1,
    state.config,
    state.player,
    state.score,
  );
  next.elapsedTime = state.elapsedTime;
  next.viewport = { ...state.viewport };
  Object.assign(state, next);
  return state;
}

/**
 * Milestone 4.13: Maps a cardinal exit direction to the opposite entrance doorway
 * and unit screen push-slide vector:
 * - east  -> enter west,  slide (-1,  0) (left)
 * - west  -> enter east,  slide ( 1,  0) (right)
 * - north -> enter south, slide ( 0,  1) (down)
 * - south -> enter north, slide ( 0, -1) (up)
 */
export function getRoomTransitionMapping(exitDir: CardinalDirection): {
  enterDir: CardinalDirection;
  slideX: number;
  slideY: number;
  walkAngleDeg: number;
} {
  switch (exitDir) {
    case 'east':
      return { enterDir: 'west', slideX: -1, slideY: 0, walkAngleDeg: 90 };
    case 'west':
      return { enterDir: 'east', slideX: 1, slideY: 0, walkAngleDeg: 270 };
    case 'north':
      return { enterDir: 'south', slideX: 0, slideY: 1, walkAngleDeg: 0 };
    case 'south':
      return { enterDir: 'north', slideX: 0, slideY: -1, walkAngleDeg: 180 };
  }
}

/**
 * Milestone 4.13: Returns the cardinal direction if the player has walked past
 * the threshold of an open cardinal exit door, otherwise `null`.
 */
export function detectOpenExitDoorWalk(
  player: PlayerState,
  island: PlatformIsland,
): CardinalDirection | null {
  for (let i = 0; i < island.doors.length; i++) {
    const door = island.doors[i];
    if (!door.cardinal || door.openFraction < 0.75) continue;

    if (door.cardinal === 'east') {
      if (
        player.x + player.radius >= door.x &&
        player.y >= door.y &&
        player.y <= door.y + door.h
      ) {
        return 'east';
      }
    } else if (door.cardinal === 'west') {
      if (
        player.x - player.radius <= door.x + door.w &&
        player.y >= door.y &&
        player.y <= door.y + door.h
      ) {
        return 'west';
      }
    } else if (door.cardinal === 'north') {
      if (
        player.y - player.radius <= door.y + door.h &&
        player.x >= door.x &&
        player.x <= door.x + door.w
      ) {
        return 'north';
      }
    } else if (door.cardinal === 'south') {
      if (
        player.y + player.radius >= door.y &&
        player.x >= door.x &&
        player.x <= door.x + door.w
      ) {
        return 'south';
      }
    }
  }
  return null;
}

/**
 * Milestone 4.13: Starts a classic door-walk push-slide room transition into
 * `sectorIndex + 1`, placing the hero at the opposite entrance doorway and
 * auto-walking them into the safe entry zone while invulnerable.
 */
export function startRoomTransition(
  state: GameState,
  exitDir: CardinalDirection,
): RoomTransitionState {
  const outgoingIsland = state.island;
  const outgoingCameraX = state.camera.x;
  const outgoingCameraY = state.camera.y;
  const mapping = getRoomTransitionMapping(exitDir);

  const next = createGameStateForSector(
    state.sectorIndex + 1,
    state.config,
    state.player,
    state.score,
  );
  next.elapsedTime = state.elapsedTime;
  next.viewport = { ...state.viewport };

  const heroStart = getDoorwayEntryPosition(next.island, mapping.enterDir, 24);
  const heroEnd = getDoorwayEntryPosition(next.island, mapping.enterDir, 108);

  next.player.x = heroStart.x;
  next.player.y = heroStart.y;
  next.player.vx = 0;
  next.player.vy = 0;
  next.player.lastSafeX = heroEnd.x;
  next.player.lastSafeY = heroEnd.y;
  next.player.legAngle = mapping.walkAngleDeg;
  next.player.aimAngle = mapping.walkAngleDeg;
  next.player.invulnTimer = Math.max(
    next.player.invulnTimer,
    ROOM_TRANSITION_DURATION + 0.6,
  );

  next.camera.x = heroEnd.x;
  next.camera.y = heroEnd.y;
  next.camera.angleDeg = state.camera.angleDeg;
  next.camera.targetAngleDeg = state.camera.targetAngleDeg;

  const transition: RoomTransitionState = {
    active: true,
    exitDir,
    enterDir: mapping.enterDir,
    slideX: mapping.slideX,
    slideY: mapping.slideY,
    progress: 0,
    durationSec: ROOM_TRANSITION_DURATION,
    heroStartX: heroStart.x,
    heroStartY: heroStart.y,
    heroEndX: heroEnd.x,
    heroEndY: heroEnd.y,
    outgoingIsland,
    outgoingCameraX,
    outgoingCameraY,
  };
  next.roomTransition = transition;
  next.events.push({ type: 'sfx', sound: 'door_hum', x: heroEnd.x, y: heroEnd.y });

  Object.assign(state, next);
  return transition;
}

const SECTOR_BOSS_ROTATION: readonly BossKind[] = [
  'maximilian',
  'recogniser',
  'abb',
  'skullhead',
  'bug_hive',
  'brainbot',
];

function getSectorBossKind(sectorIndex: number): BossKind {
  return SECTOR_BOSS_ROTATION[Math.max(0, sectorIndex) % SECTOR_BOSS_ROTATION.length];
}

function scoreForEnemy(kind: EnemyState['kind']): number {
  switch (kind) {
    case 'enforcer_melee':
      return 100;
    case 'v_bot_melee':
      return 120;
    case 'laser_shooter':
      return 150;
    case 'v_bot_laser':
      return 160;
    case 'grenadier':
      return 200;
  }
}

interface DetonationOptions {
  shakeMag?: number;
  shakeDur?: number;
  shockwaveRings?: number;
  particleCount?: number;
  smokeCount?: number;
  damageCratesWhenHostile?: boolean;
}

function detonateAreaDamage(
  state: GameState,
  x: number,
  y: number,
  blastRadius: number,
  damage: number,
  owner: Projectile['owner'],
  color: string,
  opts: DetonationOptions = {},
): void {
  const shakeMag = opts.shakeMag ?? 9;
  const shakeDur = opts.shakeDur ?? 0.24;
  const shockwaveRings = opts.shockwaveRings ?? 2;
  const particleCount = opts.particleCount ?? 22;

  state.events.push(
    {
      type: 'vfx_explosion',
      x,
      y,
      z: 8,
      color,
      count: particleCount,
    },
    {
      type: 'vfx_shockwave',
      x,
      y,
      z: 6,
      radius: blastRadius,
      color: '#fb923c',
      rings: shockwaveRings,
    },
    { type: 'sfx', sound: 'explosion', x, y },
    { type: 'camera_shake', magnitude: shakeMag, duration: shakeDur },
  );

  if ((opts.smokeCount ?? 0) > 0) {
    state.events.push({
      type: 'vfx_explosion',
      x,
      y,
      z: 14,
      color: '#94a3b8',
      count: opts.smokeCount!,
    });
  }

  if (owner === 'player') {
    for (let i = 0; i < state.enemies.length; i++) {
      const e = state.enemies[i];
      if (e.hp <= 0 || (e.rezTimer ?? 0) > 0) continue;
      const dist = Math.hypot(e.x - x, e.y - y);
      if (dist <= blastRadius + e.radius) {
        e.hp -= damage;
        e.hitFlash = 0.14;
      }
    }

    for (let i = state.island.crates.length - 1; i >= 0; i--) {
      const crate = state.island.crates[i];
      if (crate.hp <= 0) continue;
      const dist = Math.hypot(crate.x - x, crate.y - y);
      if (dist <= blastRadius + crate.radius) {
        const pickup = damageCrate(state.island, crate.id, damage, state.events);
        if (pickup) state.pickups.push(pickup);
      }
    }

    if (state.boss && state.boss.hp > 0) {
      applyProjectileToBoss(state, x, y, blastRadius * 0.6, damage);
    }
  } else {
    const distToPlayer = Math.hypot(state.player.x - x, state.player.y - y);
    if (distToPlayer <= blastRadius + state.player.radius) {
      damagePlayer(state.player, damage, state.config, state.events);
    }

    if (opts.damageCratesWhenHostile) {
      for (let i = state.island.crates.length - 1; i >= 0; i--) {
        const crate = state.island.crates[i];
        if (crate.hp <= 0) continue;
        const dist = Math.hypot(crate.x - x, crate.y - y);
        if (dist <= blastRadius + crate.radius) {
          const pickup = damageCrate(state.island, crate.id, damage, state.events);
          if (pickup) state.pickups.push(pickup);
        }
      }
    }
  }
}

function detonateIcbm(
  state: GameState,
  x: number,
  y: number,
  p: Projectile,
): void {
  detonateAreaDamage(
    state,
    x,
    y,
    p.blastRadius ?? ABB_ICBM_BLAST_RADIUS,
    p.damage,
    p.owner,
    '#f97316',
    {
      shakeMag: 16,
      shakeDur: 0.36,
      shockwaveRings: 3,
      particleCount: 28,
      smokeCount: 14,
      damageCratesWhenHostile: true,
    },
  );
}

/**
 * Milestone 4.14: Lightning Gun chain-hit helper.
 * Flashes the initial victim white/electric-blue and greedily chains to up to
 * `maxChains` (`2 * player.weapon.level`) nearby enemies within `LIGHTNING_CHAIN_RADIUS`
 * without repeating targets, drawing jagged white/cyan arcs between hops.
 */
export function triggerLightningChain(
  state: GameState,
  initialTarget: EnemyState,
  baseDamage: number,
  maxChains: number,
): EnemyState[] {
  initialTarget.lightningFlashTimer = LIGHTNING_FLASH_SEC;
  const chained: EnemyState[] = [];
  if (maxChains <= 0) return chained;

  const visited = new Set<string>([initialTarget.id]);
  let current = initialTarget;
  const chainDamage = Math.max(1, Math.round(baseDamage * 0.65));
  const maxRangeSq = LIGHTNING_CHAIN_RADIUS * LIGHTNING_CHAIN_RADIUS;

  for (let hop = 0; hop < maxChains; hop++) {
    let best: EnemyState | null = null;
    let bestDistSq = maxRangeSq;

    for (let i = 0; i < state.enemies.length; i++) {
      const cand = state.enemies[i];
      if (cand.hp <= 0 || (cand.rezTimer ?? 0) > 0 || visited.has(cand.id)) {
        continue;
      }
      const dx = cand.x - current.x;
      const dy = cand.y - current.y;
      const dSq = dx * dx + dy * dy;
      if (dSq <= bestDistSq) {
        bestDistSq = dSq;
        best = cand;
      }
    }

    if (!best) break;
    visited.add(best.id);
    best.hp -= chainDamage;
    best.hitFlash = 0.12;
    best.lightningFlashTimer = LIGHTNING_FLASH_SEC;
    chained.push(best);

    state.events.push(
      {
        type: 'vfx_lightning_arc',
        x1: current.x,
        y1: current.y,
        x2: best.x,
        y2: best.y,
        color: '#67e8f9',
      },
      {
        type: 'sfx',
        sound: 'electric_zap',
        x: best.x,
        y: best.y,
      },
    );
    current = best;
  }

  return chained;
}

function applyProjectileToBoss(
  state: GameState,
  hitX: number,
  hitY: number,
  projRadius: number,
  damage: number,
): { hit: boolean; damaged: boolean } {
  const boss = state.boss;
  if (!boss || boss.hp <= 0) return { hit: false, damaged: false };

  // TRON Rez-In materialization: non-colliding and invulnerable
  if ((boss.rezTimer ?? 0) > 0) {
    return { hit: false, damaged: false };
  }

  // Reconstructing Evil Otto is invulnerable
  if (boss.reconstructing) {
    const d = Math.hypot(hitX - boss.x, hitY - boss.y);
    if (d <= boss.radius + projRadius) {
      return { hit: true, damaged: false };
    }
    return { hit: false, damaged: false };
  }

  if (boss.parts.length === 0) {
    const d = Math.hypot(hitX - boss.x, hitY - boss.y);
    if (d <= boss.radius + projRadius) {
      const clampedX =
        d > boss.radius && d > 1e-4
          ? boss.x + ((hitX - boss.x) / d) * Math.max(0, boss.radius - 0.5)
          : hitX;
      const clampedY =
        d > boss.radius && d > 1e-4
          ? boss.y + ((hitY - boss.y) / d) * Math.max(0, boss.radius - 0.5)
          : hitY;
      const damaged = damageBossPart(boss, clampedX, clampedY, damage, state.events);
      return { hit: true, damaged };
    }
    return { hit: false, damaged: false };
  }

  // Prefer vulnerable parts first, then locked parts (so locked Recogniser head blocks shots)
  for (let pass = 0; pass < 2; pass++) {
    const checkVulnerable = pass === 0;
    for (let i = 0; i < boss.parts.length; i++) {
      const part = boss.parts[i];
      if (part.destroyed || part.vulnerable !== checkVulnerable) continue;

      const px = boss.x + part.offsetX;
      const py = boss.y + part.offsetY;
      const d = Math.hypot(hitX - px, hitY - py);
      if (d > part.radius + projRadius) continue;

      // Clamp point inside part.radius so projectile radius counts fairly against damageBossPart
      const sampleX =
        d > part.radius && d > 1e-4
          ? px + ((hitX - px) / d) * Math.max(0, part.radius - 0.5)
          : hitX;
      const sampleY =
        d > part.radius && d > 1e-4
          ? py + ((hitY - py) / d) * Math.max(0, part.radius - 0.5)
          : hitY;

      const damaged = damageBossPart(boss, sampleX, sampleY, damage, state.events);
      return { hit: true, damaged };
    }
  }

  return { hit: false, damaged: false };
}

function advanceProjectiles(
  state: GameState,
  list: Projectile[],
  dt: number,
): void {
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.life <= 0) continue;

    p.life -= dt;

    if (p.kind === 'homing_drone') {
      if (p.icbm) {
        steerGuidedIcbm(p, state.player.x, state.player.y, dt);
      } else {
        p.targetX = state.player.x;
        p.targetY = state.player.y;
        const dx = state.player.x - p.x;
        const dy = state.player.y - p.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 1e-4) {
          const speed = Math.max(110, Math.hypot(p.vx, p.vy));
          const desiredVx = (dx / dist) * speed;
          const desiredVy = (dy / dist) * speed;
          const turn = Math.min(1, dt * 3.2);
          p.vx += (desiredVx - p.vx) * turn;
          p.vy += (desiredVy - p.vy) * turn;
        }
      }
    }

    if (p.kind === 'sawblade') {
      p.spinAngle = ((p.spinAngle ?? 0) + 900 * dt) % 360;
    }

    const prevX = p.x;
    const prevY = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.kind === 'grenade') {
      p.vz -= GRENADE_GRAVITY * dt;
      p.z += p.vz * dt;
      const hitWall = pointHitsSolidWall(p.x, p.y, p.radius, state.island);
      if (hitWall || p.z <= 0 || p.life <= 0) {
        const detX = hitWall ? prevX : p.x;
        const detY = hitWall ? prevY : p.y;
        p.x = detX;
        p.y = detY;
        p.z = 0;
        p.life = 0;
        detonateAreaDamage(
          state,
          detX,
          detY,
          p.blastRadius ?? GRENADE_BLAST_RADIUS,
          p.damage,
          p.owner,
          p.color,
        );
      }
      continue;
    }

    if (p.kind === 'sky_bomb') {
      p.z += p.vz * dt;
      if (p.z <= 0 || p.life <= 0) {
        p.z = 0;
        p.life = 0;
        detonateAreaDamage(
          state,
          p.x,
          p.y,
          SKY_BOMB_BLAST_RADIUS,
          p.damage,
          p.owner,
          p.color,
        );
      }
      continue;
    }

    if (p.kind === 'mine') {
      if (p.life <= 0) {
        detonateAreaDamage(
          state,
          p.x,
          p.y,
          MINE_BLAST_RADIUS,
          p.damage,
          p.owner,
          p.color,
        );
      }
      continue;
    }

    // Milestone 4.14: Thrown sawblades shred destructible crates with bright metallic sparks
    if (p.kind === 'sawblade') {
      for (let k = state.island.crates.length - 1; k >= 0; k--) {
        const crate = state.island.crates[k];
        if (crate.hp <= 0) continue;
        const hitDist = p.radius + crate.radius;
        if ((crate.x - p.x) ** 2 + (crate.y - p.y) ** 2 <= hitDist * hitDist) {
          const pickup = damageCrate(state.island, crate.id, crate.maxHp + 10, state.events);
          if (pickup) state.pickups.push(pickup);
          state.events.push(
            { type: 'vfx_explosion', x: crate.x, y: crate.y, z: 12, color: '#ffffff', count: 8 },
            { type: 'vfx_explosion', x: crate.x, y: crate.y, z: 12, color: '#f59e0b', count: 10 },
            { type: 'sfx', sound: 'electric_zap', x: crate.x, y: crate.y },
          );
        }
      }
    }

    // Milestone 4.14: ABB ICBM detonates on crate impact with massive world-shaking blast
    if (p.icbm) {
      let hitCrate = false;
      for (let k = state.island.crates.length - 1; k >= 0; k--) {
        const crate = state.island.crates[k];
        if (crate.hp <= 0) continue;
        const hitDist = p.radius + crate.radius;
        if ((crate.x - p.x) ** 2 + (crate.y - p.y) ** 2 <= hitDist * hitDist) {
          hitCrate = true;
          break;
        }
      }
      if (hitCrate) {
        p.life = 0;
        detonateIcbm(state, p.x, p.y, p);
        continue;
      }
    }

    // Solid wall collision / ricochet for standard projectiles
    if (pointHitsSolidWall(p.x, p.y, p.radius, state.island)) {
      if (p.icbm) {
        p.life = 0;
        detonateIcbm(state, prevX, prevY, p);
        continue;
      }

      if (p.kind === 'sawblade') {
        // Bright metallic spark shower on wall/door impact, then bounce once or shatter
        state.events.push(
          { type: 'vfx_explosion', x: prevX, y: prevY, z: 14, color: '#ffffff', count: 8 },
          { type: 'vfx_explosion', x: prevX, y: prevY, z: 14, color: '#f59e0b', count: 12 },
          { type: 'sfx', sound: 'electric_zap', x: prevX, y: prevY },
        );
      } else if (p.owner === 'boss' && p.kind === 'beam_segment') {
        state.events.push(
          { type: 'vfx_sizzle', x: prevX, y: prevY, z: 16 },
          { type: 'vfx_explosion', x: prevX, y: prevY, z: 16, color: '#fb923c', count: 5 },
          { type: 'sfx', sound: 'electric_zap', x: prevX, y: prevY },
        );
      }

      if (p.bouncesLeft > 0) {
        p.bouncesLeft -= 1;
        const hitXOnly = pointHitsSolidWall(p.x, prevY, p.radius, state.island);
        const hitYOnly = pointHitsSolidWall(prevX, p.y, p.radius, state.island);
        if (hitXOnly) {
          p.vx = -p.vx;
          p.x = prevX;
        }
        if (hitYOnly) {
          p.vy = -p.vy;
          p.y = prevY;
        }
        if (!hitXOnly && !hitYOnly) {
          p.vx = -p.vx;
          p.vy = -p.vy;
          p.x = prevX;
          p.y = prevY;
        }
        if (p.kind !== 'sawblade') {
          state.events.push({ type: 'sfx', sound: 'electric_zap', x: p.x, y: p.y });
        }
      } else {
        p.life = 0;
      }
    }
  }
}

function resolvePlayerProjectileCollisions(state: GameState): void {
  const projs = state.playerProjectiles;

  for (let i = 0; i < projs.length; i++) {
    const p = projs[i];
    if (p.life <= 0) continue;

    // 1. vs Enemies (O(1) via SpatialGrid)
    const candidates = state.grid.queryRadius(p.x, p.y, p.radius + 18);
    let hitSomething = false;

    for (let c = 0; c < candidates.length; c++) {
      const enemy = candidates[c];
      if (enemy.hp <= 0 || (enemy.rezTimer ?? 0) > 0) continue;

      const dx = enemy.x - p.x;
      const dy = enemy.y - p.y;
      const hitDist = p.radius + enemy.radius;
      if (dx * dx + dy * dy > hitDist * hitDist) continue;

      if (p.kind === 'mine' || p.kind === 'grenade') {
        p.life = 0;
        detonateAreaDamage(
          state,
          p.x,
          p.y,
          p.kind === 'mine' ? MINE_BLAST_RADIUS : p.blastRadius ?? GRENADE_BLAST_RADIUS,
          p.damage,
          'player',
          p.color,
        );
        hitSomething = true;
        break;
      }

      enemy.hp -= p.damage;
      enemy.hitFlash = 0.12;
      if (p.kind === 'flame') {
        enemy.burnTimer = Math.max(enemy.burnTimer ?? 0, BURN_DURATION_SEC);
        enemy.burnTickTimer = enemy.burnTickTimer ?? 0;
        state.events.push({ type: 'vfx_flame_smoke', x: enemy.x, y: enemy.y, z: 12 });
      }
      if (p.modifiers.includes('freeze')) {
        applyFreezeHit(enemy);
      }
      state.events.push({ type: 'sfx', sound: 'hit', x: enemy.x, y: enemy.y });

      if (p.kind === 'lightning' || p.modifiers.includes('lightning_chain')) {
        const maxChains = 2 * Math.max(1, state.player.weapon.level);
        triggerLightningChain(state, enemy, p.damage, maxChains);
        if (p.modifiers.includes('pierce') && p.bouncesLeft > 0) {
          p.bouncesLeft -= 1;
        } else {
          p.life = 0;
        }
      } else if (p.modifiers.includes('pierce') && p.bouncesLeft > 0) {
        p.bouncesLeft -= 1;
      } else {
        p.life = 0;
      }

      hitSomething = true;
      break;
    }

    if (hitSomething && p.life <= 0) continue;

    // 2. vs Destructible Crates
    for (let k = state.island.crates.length - 1; k >= 0; k--) {
      const crate = state.island.crates[k];
      if (crate.hp <= 0) continue;
      const dx = crate.x - p.x;
      const dy = crate.y - p.y;
      const hitDist = p.radius + crate.radius;
      if (dx * dx + dy * dy <= hitDist * hitDist) {
        if (p.kind === 'grenade' || p.kind === 'mine') {
          p.life = 0;
          detonateAreaDamage(
            state,
            p.x,
            p.y,
            p.kind === 'mine' ? MINE_BLAST_RADIUS : p.blastRadius ?? GRENADE_BLAST_RADIUS,
            p.damage,
            'player',
            p.color,
          );
          break;
        }
        const pickup = damageCrate(state.island, crate.id, p.damage, state.events);
        if (pickup) {
          state.pickups.push(pickup);
        }
        if (p.modifiers.includes('pierce') && p.bouncesLeft > 0) {
          p.bouncesLeft -= 1;
        } else {
          p.life = 0;
        }
        break;
      }
    }

    if (p.life <= 0) continue;

    // 3. vs Boss Parts (Bug Hive orbiting bugs & Maximilian ablative shield plates intercept first)
    if (state.boss && state.boss.hp > 0) {
      if (
        state.boss.kind === 'bug_hive' &&
        interceptProjectileWithOrbitingBugs(state.boss, p, state.events)
      ) {
        if (p.life <= 0) continue;
      }
      if (
        state.boss.kind === 'maximilian' &&
        interceptProjectileWithAblativeShields(state.boss, p, state.events)
      ) {
        if (p.life <= 0) continue;
      }
      if (p.kind === 'grenade') {
        const dBoss = Math.hypot(state.boss.x - p.x, state.boss.y - p.y);
        if (dBoss <= state.boss.radius + p.radius) {
          p.life = 0;
          detonateAreaDamage(
            state,
            p.x,
            p.y,
            p.blastRadius ?? GRENADE_BLAST_RADIUS,
            p.damage,
            'player',
            p.color,
          );
          continue;
        }
      }
      const res = applyProjectileToBoss(state, p.x, p.y, p.radius, p.damage);
      if (res.hit) {
        if (res.damaged) {
          if (p.kind === 'flame') {
            state.boss.burnTimer = Math.max(state.boss.burnTimer ?? 0, BURN_DURATION_SEC);
            state.boss.burnTickTimer = state.boss.burnTickTimer ?? 0;
          }
          if (p.modifiers.includes('freeze')) {
            applyFreezeHit(state.boss);
          }
          if (p.kind === 'lightning' || p.modifiers.includes('lightning_chain')) {
            state.boss.lightningFlashTimer = LIGHTNING_FLASH_SEC;
          }
          state.events.push({ type: 'sfx', sound: 'hit', x: p.x, y: p.y });
        }
        if (p.modifiers.includes('pierce') && p.bouncesLeft > 0 && res.damaged) {
          p.bouncesLeft -= 1;
        } else {
          p.life = 0;
        }
      }
    }
  }
}

function resolveHostileProjectilesVsPlayer(
  state: GameState,
  list: Projectile[],
): void {
  const player = state.player;
  for (let i = 0; i < list.length; i++) {
    const p = list[i];
    if (p.life <= 0) continue;

    // Airborne sky-bombs only damage via ground detonation; grenades detonate on close contact
    if (p.kind === 'sky_bomb' && p.z > 20) continue;

    const dx = player.x - p.x;
    const dy = player.y - p.y;
    const hitDist = p.radius + player.radius;
    if (dx * dx + dy * dy <= hitDist * hitDist) {
      if (p.icbm) {
        p.life = 0;
        detonateIcbm(state, p.x, p.y, p);
      } else if (p.kind === 'grenade') {
        p.life = 0;
        detonateAreaDamage(
          state,
          p.x,
          p.y,
          p.blastRadius ?? GRENADE_BLAST_RADIUS,
          p.damage,
          p.owner,
          p.color,
        );
      } else if (!isPlayerInvulnerable(player)) {
        damagePlayer(player, p.damage, state.config, state.events);
        p.life = 0;
      }
    }
  }
}

export interface TelefragResult {
  enemiesDestroyed: number;
  projectilesCleared: number;
  bossHit: boolean;
}

/**
 * Milestone 4.12: Instantly destroys every non-boss enemy and hostile projectile
 * overlapping `radius` around `(x, y)` in a burst of sparks, and knocks back /
 * damages any overlapping boss so the hero never respawns trapped.
 */
export function telefragTargets(
  x: number,
  y: number,
  radius: number,
  enemies: EnemyState[],
  enemyProjectiles: Projectile[],
  bossProjectiles: Projectile[],
  boss: BossState | null,
  events: GameEvent[],
): TelefragResult {
  let enemiesDestroyed = 0;
  let projectilesCleared = 0;
  let bossHit = false;

  for (let i = 0; i < enemies.length; i++) {
    const e = enemies[i];
    if (e.hp <= 0) continue;
    const hitDist = radius + e.radius;
    const dx = e.x - x;
    const dy = e.y - y;
    if (dx * dx + dy * dy <= hitDist * hitDist) {
      e.hp = 0;
      enemiesDestroyed += 1;
      events.push({
        type: 'vfx_explosion',
        x: e.x,
        y: e.y,
        z: 10,
        color: '#38bdf8',
        count: 10,
      });
    }
  }

  const clearProjectiles = (list: Projectile[]) => {
    for (let i = 0; i < list.length; i++) {
      const p = list[i];
      if (p.life <= 0) continue;
      const hitDist = radius + p.radius;
      const dx = p.x - x;
      const dy = p.y - y;
      if (dx * dx + dy * dy <= hitDist * hitDist) {
        p.life = 0;
        projectilesCleared += 1;
      }
    }
  };
  clearProjectiles(enemyProjectiles);
  clearProjectiles(bossProjectiles);

  if (boss && boss.hp > 0) {
    const hitDist = radius + boss.radius;
    const dx = boss.x - x;
    const dy = boss.y - y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= hitDist * hitDist) {
      bossHit = true;
      const dist = Math.sqrt(distSq);
      const nx = dist > 1e-4 ? dx / dist : 1;
      const ny = dist > 1e-4 ? dy / dist : 0;
      boss.vx += nx * TELEFRAG_BOSS_KNOCKBACK;
      boss.vy += ny * TELEFRAG_BOSS_KNOCKBACK;
      boss.x += nx * Math.max(0, hitDist - dist + 16);
      boss.y += ny * Math.max(0, hitDist - dist + 16);
      boss.hitFlash = 0.2;
      boss.hitFlashKind = 'core';
      if ((boss.rezTimer ?? 0) <= 0 && !boss.reconstructing) {
        boss.hp = Math.max(1, boss.hp - TELEFRAG_BOSS_DAMAGE);
      }
      events.push({
        type: 'vfx_explosion',
        x: boss.x,
        y: boss.y,
        z: 16,
        color: '#facc15',
        count: 18,
      });
    }
  }

  events.push(
    {
      type: 'vfx_explosion',
      x,
      y,
      z: 12,
      color: '#22d3ee',
      count: 24,
    },
    { type: 'sfx', sound: 'slam_impact', x, y },
    { type: 'camera_shake', magnitude: 9, duration: 0.25 },
  );

  return { enemiesDestroyed, projectilesCleared, bossHit };
}

/**
 * Milestone 4.12: Pure reducer advancing the hero death explosion -> full loadout
 * reset -> Rez-In teleport invulnerability -> telefrag materialization flow.
 */
export function stepHeroDeath(
  state: GameState,
  dt: number,
): 'alive' | 'dying' | 'rezzing' | 'game_over' {
  const player = state.player;

  if ((player.rezHaloTimer ?? 0) > 0) {
    player.rezHaloTimer = Math.max(0, (player.rezHaloTimer ?? 0) - dt);
  }

  if (
    player.hp <= 0 &&
    (player.deathTimer ?? 0) <= 0 &&
    (player.rezTimer ?? 0) <= 0 &&
    !state.gameOver
  ) {
    triggerHeroDeath(player, state.events);
  }

  if ((player.deathTimer ?? 0) > 0) {
    player.deathTimer = Math.max(0, (player.deathTimer ?? 0) - dt);
    player.vx = 0;
    player.vy = 0;

    if (player.deathTimer <= 0) {
      if (player.lives <= 1) {
        player.lives = 0;
        state.gameOver = true;
        return 'game_over';
      }
      // Decrement lives and fully reset loadout at the exact (clamped) death position
      player.lives -= 1;
      const safe = clampToSafeIslandFloor(
        player.deathX ?? player.x,
        player.deathY ?? player.y,
        state.island,
      );
      resetPlayerLoadout(player, state.config);
      player.x = safe.x;
      player.y = safe.y;
      player.lastSafeX = safe.x;
      player.lastSafeY = safe.y;
      player.rezTimer = HERO_REZ_DURATION;
      player.rezDuration = HERO_REZ_DURATION;
      player.invulnTimer = HERO_REZ_DURATION + HERO_POST_REZ_INVULN;
      state.events.push({ type: 'sfx', sound: 'rez_in', x: player.x, y: player.y });
      return 'rezzing';
    }
    return 'dying';
  }

  if ((player.rezTimer ?? 0) > 0) {
    player.rezTimer = Math.max(0, (player.rezTimer ?? 0) - dt);
    player.vx = 0;
    player.vy = 0;
    player.invulnTimer = Math.max(
      player.invulnTimer,
      player.rezTimer + HERO_POST_REZ_INVULN,
    );

    if (player.rezTimer <= 0) {
      player.rezHaloTimer = POST_REZ_HALO_SEC;
      player.invulnTimer = Math.max(player.invulnTimer, HERO_POST_REZ_INVULN);
      telefragTargets(
        player.x,
        player.y,
        HERO_TELEFRAG_RADIUS,
        state.enemies,
        state.enemyProjectiles,
        state.bossProjectiles,
        state.boss,
        state.events,
      );
      return 'alive';
    }
    return 'rezzing';
  }

  return 'alive';
}

/**
 * Pure headless fixed-timestep simulation step (no DOM/Canvas globals).
 * Advances the entire BERZERK³ world by one clamped step `dt` (typically 1/60s).
 */
export function stepGameState(
  state: GameState,
  input: InputState,
  dt: number,
): GameState {
  state.events.length = 0;

  const clampedDt = Math.max(0, Math.min(dt, MAX_STEP_DT));
  if (clampedDt <= 0) return state;

  if (state.gameOver) {
    updateCamera(state.camera, state.player, input, clampedDt);
    return state;
  }

  state.elapsedTime += clampedDt;

  // Milestone 4.13: Classic door-walk push-slide room transition
  if (state.roomTransition && state.roomTransition.active) {
    const tr = state.roomTransition;
    tr.progress = Math.min(1, tr.progress + clampedDt / Math.max(0.05, tr.durationSec));
    const eased = 1 - Math.pow(1 - tr.progress, 3);
    state.player.x = tr.heroStartX + (tr.heroEndX - tr.heroStartX) * eased;
    state.player.y = tr.heroStartY + (tr.heroEndY - tr.heroStartY) * eased;
    state.player.vx = 0;
    state.player.vy = 0;
    state.player.runCycle = (state.player.runCycle + clampedDt * 12) % 4;
    state.player.invulnTimer = Math.max(state.player.invulnTimer, 0.5);
    state.camera.x = tr.heroEndX;
    state.camera.y = tr.heroEndY;

    if (tr.progress >= 1) {
      state.player.x = tr.heroEndX;
      state.player.y = tr.heroEndY;
      state.player.lastSafeX = tr.heroEndX;
      state.player.lastSafeY = tr.heroEndY;
      tr.active = false;
      state.roomTransition = null;
    }
    return state;
  }

  state.sectorTime += clampedDt;

  if (state.toast) {
    state.toast.life -= clampedDt;
    if (state.toast.life <= 0) state.toast = null;
  }

  // Milestone 4.12: Step hero death explosion / rez-in teleport / telefrag state machine
  const heroLifePhase = stepHeroDeath(state, clampedDt);
  if (heroLifePhase === 'game_over') {
    updateCamera(state.camera, state.player, input, clampedDt);
    return state;
  }
  const heroActive = heroLifePhase === 'alive';

  // Milestone 4: 1/2/3 direct-select and LB/RB / mouse-wheel slot cycling.
  if (heroActive) {
    if (input.slotSelect >= 0) selectWeaponSlot(state.player, input.slotSelect);
    if (input.slotCycle !== 0) cycleWeaponSlot(state.player, input.slotCycle);
  }

  // 1. World simulation (sliding doors, temporary bridges, crate hitFlash decay)
  updateWorld(state.island, state.elapsedTime, clampedDt, state.bossDefeated);

  // 2. Rebuild SpatialGrid for O(1) swarm & projectile queries
  state.grid.clear();
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.hp > 0) {
      state.grid.insert(e);
    }
  }

  // 3. Player update (movement, dodge-roll, world collision, firing)
  const playerFired = updatePlayer(
    state.player,
    input,
    state.camera,
    state.island,
    state.config,
    clampedDt,
    state.events,
    state.viewport,
  );
  if (playerFired.length > 0) {
    state.playerProjectiles.push(...playerFired);
  }

  if (heroActive && state.player.dodgeTimer > 0) {
    applyDodgeShove(state.player, state.enemies, state.config);
  }

  // 3b. Milestone 4.13: Walking past an open cardinal exit door triggers push-slide transition
  if (heroActive && state.bossDefeated) {
    const exitDir = detectOpenExitDoorWalk(state.player, state.island);
    if (exitDir) {
      startRoomTransition(state, exitDir);
      return state;
    }
  }

  // 4. Camera update
  updateCamera(state.camera, state.player, input, clampedDt);

  // 5. Orbitals update (can intercept both enemy & boss projectiles, drones target boss)
  if (heroActive) {
    const hostileView: Projectile[] =
      state.bossProjectiles.length > 0
        ? [...state.enemyProjectiles, ...state.bossProjectiles]
        : state.enemyProjectiles;
    const droneShots = updateOrbitals(
      state.player,
      state.enemies,
      hostileView,
      clampedDt,
      state.events,
      state.boss,
    );
    if (droneShots.length > 0) {
      state.playerProjectiles.push(...droneShots);
    }

    // Milestone 4.13: Orbiting lightsabers slice bosses and trigger boss hitFlash
    if (state.boss && state.boss.hp > 0) {
      for (let i = 0; i < state.player.orbitals.length; i++) {
        const orb = state.player.orbitals[i];
        if (orb.type !== 'lightsaber') continue;
        const pos = getOrbitalWorldPos(state.player, orb);
        const res = applyProjectileToBoss(
          state,
          pos.x,
          pos.y,
          LIGHTSABER_BOSS_HIT_RADIUS,
          LIGHTSABER_BOSS_DPS * clampedDt,
        );
        if (res.damaged) {
          state.events.push({ type: 'sfx', sound: 'hit', x: pos.x, y: pos.y });
        }
      }
    }
  }

  // 6. Wave spawning & sector boss trigger
  if (!state.bossSpawned && !state.bossDefeated && state.boss === null) {
    if (state.waveIndex < state.wavesPerSector) {
      state.waveSpawnTimer -= clampedDt;
      if (state.waveSpawnTimer <= 0) {
        const spawned = spawnHordeWave(
          state.island,
          state.enemies,
          state.config,
          state.sectorIndex,
          {
            heroX: state.player.x,
            heroY: state.player.y,
            clearance: SAFE_SPAWN_CLEARANCE,
            includeVBots: true,
          },
        );
        if (spawned.length > 0) {
          // Gate telegraph + TRON rez-in synth chime
          state.events.push(
            { type: 'sfx', sound: 'door_hum', x: state.player.x, y: state.player.y },
            { type: 'sfx', sound: 'rez_in', x: state.player.x, y: state.player.y },
          );
          state.enemies.push(...spawned);
          for (let i = 0; i < spawned.length; i++) {
            state.grid.insert(spawned[i]);
          }
          state.waveIndex += 1;
          state.waveSpawnTimer = WAVE_INTERVAL_SEC;
        } else if (state.enemies.length > 0) {
          // Caps already saturated; retry soon
          state.waveSpawnTimer = 1.5;
        } else {
          // Bridges/doors temporarily closed; retry next tick
          state.waveSpawnTimer = 0.25;
        }
      }
    } else if (state.enemies.length === 0) {
      spawnBoss(state, getSectorBossKind(state.sectorIndex), {
        rezDuration: BOSS_REZ_DURATION,
      });
    }
  }

  // 7. Enemy AI updates (200+ melee Enforcers + 50-100 Shooters/Grenadiers)
  // Track which enemies were rezzing before this tick so we can trigger the 0.15s post-rez halo.
  const enemyWasRezzing = new Set<string>();
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if ((e.rezTimer ?? 0) > 0) enemyWasRezzing.add(e.id);
    if ((e.rezHaloTimer ?? 0) > 0) {
      e.rezHaloTimer = Math.max(0, (e.rezHaloTimer ?? 0) - clampedDt);
    }
  }

  updateEnforcers(
    state.enemies,
    state.player,
    state.grid,
    state.island,
    state.config,
    clampedDt,
  );

  const rangedFired = updateRangedEnemies(
    state.enemies,
    state.player,
    state.island,
    state.config,
    clampedDt,
    state.events,
  );
  if (rangedFired.length > 0) {
    state.enemyProjectiles.push(...rangedFired);
  }

  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (enemyWasRezzing.has(e.id) && (e.rezTimer ?? 0) <= 0) {
      e.rezHaloTimer = POST_REZ_HALO_SEC;
    }
  }

  // Enemy world hazards (electrified walls / open-edge falls), burning DOT & melee contact
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.hp <= 0 || (e.rezTimer ?? 0) > 0) continue;

    // Milestone 4.14: Flamethrower burning DOT + continuous flame/smoke particles
    if ((e.burnTimer ?? 0) > 0) {
      e.burnTimer = Math.max(0, (e.burnTimer ?? 0) - clampedDt);
      const prevTick = e.burnTickTimer ?? 0;
      e.burnTickTimer = prevTick + clampedDt;
      if (e.burnTickTimer >= BURN_TICK_INTERVAL_SEC) {
        e.burnTickTimer -= BURN_TICK_INTERVAL_SEC;
        e.hp -= BURN_TICK_DAMAGE;
        e.hitFlash = Math.max(e.hitFlash, 0.08);
        state.events.push({ type: 'vfx_flame_smoke', x: e.x, y: e.y, z: 12 });
      } else if (Math.floor((prevTick + clampedDt) / 0.12) > Math.floor(prevTick / 0.12)) {
        state.events.push({ type: 'vfx_flame_smoke', x: e.x, y: e.y, z: 12 });
      }
    }

    const worldRes = resolveEntityAgainstWorld(e, state.island);
    if (worldRes.hitElectrifiedWall) {
      e.hp -= 25;
      e.hitFlash = 0.14;
      state.events.push({ type: 'sfx', sound: 'electric_zap', x: e.x, y: e.y });
    }
    if (worldRes.fellOffEdge) {
      e.hp = 0;
    }

    if (e.hp > 0 && isMeleeEnemyKind(e.kind)) {
      const dx = state.player.x - e.x;
      const dy = state.player.y - e.y;
      const hitDist = state.player.radius + e.radius;
      if (dx * dx + dy * dy <= hitDist * hitDist) {
        if (!isPlayerInvulnerable(state.player)) {
          damagePlayer(
            state.player,
            ENFORCER_MELEE_DAMAGE,
            state.config,
            state.events,
          );
          const dist = Math.max(1, Math.hypot(dx, dy));
          e.vx -= (dx / dist) * 140;
          e.vy -= (dy / dist) * 140;
        }
      }
    }
  }

  // 8. Evil Otto timer after boss cleared (or lingering past ottoWarningSec)
  if (state.bossDefeated && !state.ottoSpawned && state.boss === null) {
    state.ottoTimer += clampedDt;
    if (state.ottoTimer >= state.config.ottoWarningSec * 0.7) {
      state.ottoWarningActive = true;
    }
    if (state.ottoTimer >= state.config.ottoWarningSec) {
      const b = state.island.bounds;
      const ottoX = Math.max(
        b.x + 80,
        Math.min(b.x + b.w - 80, state.player.x + 220),
      );
      const ottoY = Math.max(
        b.y + 80,
        Math.min(b.y + b.h - 80, state.player.y - 140),
      );
      state.boss = createEvilOtto(ottoX, ottoY, state.sectorIndex);
      state.ottoSpawned = true;
      state.ottoWarningActive = true;
    }
  }

  // 9. Active boss update
  if (state.boss && state.boss.hp > 0) {
    const bossWasRezzing = (state.boss.rezTimer ?? 0) > 0;
    if ((state.boss.rezHaloTimer ?? 0) > 0) {
      state.boss.rezHaloTimer = Math.max(0, (state.boss.rezHaloTimer ?? 0) - clampedDt);
    }
    if (state.boss.kind === 'maximilian') {
      const maxFired = updateMaximilian(
        state.boss,
        state.player,
        state.island,
        state.playerProjectiles,
        clampedDt,
        state.events,
      );
      if (maxFired.length > 0) {
        state.bossProjectiles.push(...maxFired);
      }
      // Remove crates shredded by Maximilian's whirling blades
      for (let i = state.island.crates.length - 1; i >= 0; i--) {
        if (state.island.crates[i].hp <= 0) {
          state.island.crates.splice(i, 1);
        }
      }
    } else if (state.boss.kind === 'recogniser') {
      const bossFired = updateRecogniser(
        state.boss,
        state.player,
        clampedDt,
        state.events,
      );
      if (bossFired.length > 0) {
        state.bossProjectiles.push(...bossFired);
      }
    } else if (state.boss.kind === 'evil_otto') {
      const ottoFired = updateEvilOtto(
        state.boss,
        state.player,
        clampedDt,
        state.events,
      );
      if (ottoFired.length > 0) {
        state.bossProjectiles.push(...ottoFired);
      }
    } else if (state.boss.kind === 'abb') {
      const abbFired = updateAbb(
        state.boss,
        state.player,
        state.island,
        clampedDt,
        state.events,
      );
      if (abbFired.length > 0) {
        state.bossProjectiles.push(...abbFired);
      }
    } else if (state.boss.kind === 'skullhead') {
      const skullFired = updateSkullhead(
        state.boss,
        state.player,
        clampedDt,
        state.events,
        state.island,
      );
      if (skullFired.length > 0) {
        state.bossProjectiles.push(...skullFired);
      }
    } else if (state.boss.kind === 'bug_hive') {
      const hiveFired = updateBugHive(
        state.boss,
        state.player,
        clampedDt,
        state.events,
      );
      if (hiveFired.length > 0) {
        state.bossProjectiles.push(...hiveFired);
      }
    } else if (state.boss.kind === 'brainbot') {
      const brainFired = updateBrainbot(
        state.boss,
        state.player,
        state.island,
        clampedDt,
        state.events,
      );
      if (brainFired.length > 0) {
        state.bossProjectiles.push(...brainFired);
      }
    }
    if (bossWasRezzing && (state.boss.rezTimer ?? 0) <= 0) {
      state.boss.rezHaloTimer = POST_REZ_HALO_SEC;
    }
    if ((state.boss.burnTimer ?? 0) > 0 && (state.boss.rezTimer ?? 0) <= 0 && !state.boss.reconstructing) {
      state.boss.burnTimer = Math.max(0, (state.boss.burnTimer ?? 0) - clampedDt);
      const prevTick = state.boss.burnTickTimer ?? 0;
      state.boss.burnTickTimer = prevTick + clampedDt;
      if (state.boss.burnTickTimer >= BURN_TICK_INTERVAL_SEC) {
        state.boss.burnTickTimer -= BURN_TICK_INTERVAL_SEC;
        state.boss.hp = Math.max(0, state.boss.hp - BURN_TICK_DAMAGE);
        state.boss.hitFlash = Math.max(state.boss.hitFlash, 0.08);
        state.events.push({ type: 'vfx_flame_smoke', x: state.boss.x, y: state.boss.y, z: state.boss.z + 18 });
      }
    }
  }

  // 10. Advance all projectiles
  advanceProjectiles(state, state.playerProjectiles, clampedDt);
  advanceProjectiles(state, state.enemyProjectiles, clampedDt);
  advanceProjectiles(state, state.bossProjectiles, clampedDt);

  // 11. Projectile collision resolution
  resolvePlayerProjectileCollisions(state);
  resolveHostileProjectilesVsPlayer(state, state.enemyProjectiles);
  resolveHostileProjectilesVsPlayer(state, state.bossProjectiles);

  // 12. Check boss defeat
  if (state.boss && state.boss.hp <= 0) {
    const defeated = state.boss;
    state.score += 1500 + state.sectorIndex * 500;
    state.events.push(
      {
        type: 'vfx_explosion',
        x: defeated.x,
        y: defeated.y,
        z: defeated.z,
        color: '#ff3366',
        count: 32,
      },
      { type: 'sfx', sound: 'explosion', x: defeated.x, y: defeated.y },
      { type: 'camera_shake', magnitude: 14, duration: 0.45 },
    );
    if (defeated.kind !== 'evil_otto') {
      state.bossDefeated = true;
      state.ottoTimer = 0;
      unlockCardinalExitDoors(state.island);
    }
    state.boss = null;
  }

  // 13. Prune dead enemies & award score
  let writeIdx = 0;
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.hp > 0) {
      state.enemies[writeIdx++] = e;
    } else {
      state.score += scoreForEnemy(e.kind);
      state.events.push(
        {
          type: 'vfx_explosion',
          x: e.x,
          y: e.y,
          z: 6,
          color: e.kind === 'grenadier' ? '#fb923c' : '#ef4444',
          count: 8,
        },
        { type: 'sfx', sound: 'explosion', x: e.x, y: e.y },
      );
    }
  }
  state.enemies.length = writeIdx;

  // 14. Pickups: modifiers/orbitals/boosts auto-collect; weapon drops need [F].
  let pWrite = 0;
  let nearestWeapon: PowerUpPickup | null = null;
  let nearestWeaponDistSq = Infinity;
  const collectDist = state.player.radius + PICKUP_COLLECT_RADIUS;
  const canInteract =
    (state.player.deathTimer ?? 0) <= 0 && (state.player.rezTimer ?? 0) <= 0;
  for (let i = 0; i < state.pickups.length; i++) {
    const pickup = state.pickups[i];
    pickup.life -= clampedDt;
    if (pickup.life <= 0) continue;

    const dx = state.player.x - pickup.x;
    const dy = state.player.y - pickup.y;
    const distSq = dx * dx + dy * dy;
    const inRange = canInteract && distSq <= collectDist * collectDist;

    if (pickup.kind === 'weapon') {
      const weaponType = pickup.weaponType;
      // Milestone 4.1: auto-collect into an open slot or auto-upgrade a copy
      // already carried. Only a full 3-slot inventory of distinct weapons
      // leaves the drop on the floor for an explicit [F] swap.
      if (inRange && weaponType && shouldAutoCollectWeapon(state.player, weaponType)) {
        const outcome = applyWeaponPickupToSlots(state.player, weaponType);
        pickup.life = 0;
        state.score += 50;
        state.toast = {
          text: `${pickupLabel(pickup)} ${outcome.result === 'upgrade' ? 'LEVEL UP' : 'AUTO-EQUIPPED'}`,
          life: 1.6,
        };
        state.events.push({
          type: 'sfx',
          sound: 'door_hum',
          x: pickup.x,
          y: pickup.y,
        });
        continue;
      }
      if (inRange && distSq < nearestWeaponDistSq) {
        nearestWeapon = pickup;
        nearestWeaponDistSq = distSq;
      }
      state.pickups[pWrite++] = pickup;
      continue;
    }

    if (inRange) {
      applyPowerUp(state.player, pickup);
      state.score += 50;
      state.toast = { text: `${pickupLabel(pickup)} ACQUIRED`, life: 1.6 };
      state.events.push({
        type: 'sfx',
        sound: 'door_hum',
        x: pickup.x,
        y: pickup.y,
      });
      continue;
    }

    state.pickups[pWrite++] = pickup;
  }
  state.pickups.length = pWrite;
  state.nearbyWeaponPickup = nearestWeapon;

  // 14b. [F] near a dropped weapon: level up, equip, or swap the active slot.
  const swapWeaponType = canInteract ? state.nearbyWeaponPickup?.weaponType : undefined;
  if (input.swapPressed && swapWeaponType) {
    const drop = state.nearbyWeaponPickup!;
    const outcome = applyWeaponPickupToSlots(state.player, swapWeaponType);
    drop.life = 0;
    state.nearbyWeaponPickup = null;
    state.score += 50;
    state.toast = {
      text:
        outcome.result === 'upgrade'
          ? `${pickupLabel(drop)} LEVELED`
          : outcome.result === 'equip'
            ? `${pickupLabel(drop)} EQUIPPED`
            : `${pickupLabel(drop)} EQUIPPED · ${weaponPickupLabel(outcome.replaced ?? 'pulse_rifle')} DROPPED`,
      life: 2.2,
    };
    state.events.push({
      type: 'sfx',
      sound: 'door_hum',
      x: state.player.x,
      y: state.player.y,
    });
    if (outcome.replaced) {
      state.pickups.push(
        createDroppedWeaponPickup(
          state.player.x + 22,
          state.player.y,
          outcome.replaced,
        ),
      );
    }
    // The consumed drop disappears immediately, not on the next tick.
    state.pickups = state.pickups.filter((p) => p.life > 0);
  }

  // 15. Prune expired projectiles
  state.playerProjectiles = state.playerProjectiles.filter((p) => p.life > 0);
  state.enemyProjectiles = state.enemyProjectiles.filter((p) => p.life > 0);
  state.bossProjectiles = state.bossProjectiles.filter((p) => p.life > 0);

  // 16. Trigger hero death explosion immediately if HP hit 0 this tick (e.g. from boss contact)
  if (
    state.player.hp <= 0 &&
    (state.player.deathTimer ?? 0) <= 0 &&
    (state.player.rezTimer ?? 0) <= 0 &&
    !state.gameOver
  ) {
    triggerHeroDeath(state.player, state.events);
  }

  // Game-over check (only after death explosion timer completes on final life)
  if (
    state.player.hp <= 0 &&
    state.player.lives <= 0 &&
    (state.player.deathTimer ?? 0) <= 0
  ) {
    state.gameOver = true;
  }

  return state;
}
