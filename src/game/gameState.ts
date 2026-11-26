import { createDifficultyConfig } from '../config/difficulty';
import { createEvilOtto, updateEvilOtto } from '../bosses/evilOtto';
import { createMaximilian, updateMaximilian } from '../bosses/maximilian';
import {
  createRecogniser,
  damageBossPart,
  updateRecogniser,
} from '../bosses/recogniser';
import { updateEnforcers } from '../enemies/enforcer';
import { GRENADE_GRAVITY, updateRangedEnemies } from '../enemies/shooter';
import { spawnHordeWave } from '../enemies/spawner';
import { createCameraState, updateCamera } from '../engine/camera';
import { SpatialGrid } from '../engine/spatialGrid';
import type {
  BossKind,
  BossState,
  CameraState,
  DifficultyConfig,
  EnemyState,
  GameEvent,
  InputState,
  PlatformIsland,
  PlayerState,
  PowerUpPickup,
  Projectile,
} from '../engine/types';
import { updateOrbitals } from '../entities/orbitals';
import {
  applyDodgeShove,
  applyPowerUp,
  createPlayer,
  damagePlayer,
  isPlayerInvulnerable,
  updatePlayer,
} from '../entities/player';
import {
  applyWeaponPickupToSlots,
  createDroppedWeaponPickup,
  cycleWeaponSlot,
  pickupLabel,
  selectWeaponSlot,
  weaponPickupLabel,
} from '../entities/weapons';
import { damageCrate } from '../world/crate';
import { createSectorIsland } from '../world/levelData';
import {
  pointHitsSolidWall,
  resolveEntityAgainstWorld,
  updateWorld,
} from '../world/worldSim';

export const FIXED_DT = 1 / 60;

const MAX_STEP_DT = 0.05;
const PICKUP_COLLECT_RADIUS = 18;
const ENFORCER_MELEE_DAMAGE = 14;
const GRENADE_BLAST_RADIUS = 72;
const SKY_BOMB_BLAST_RADIUS = 68;
const MINE_BLAST_RADIUS = 64;
const LIGHTNING_CHAIN_RANGE = 180;
const WAVE_INTERVAL_SEC = 5.5;
const INITIAL_WAVE_DELAY_SEC = 0.5;

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

  return {
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
    gameOver: false,
    viewport: { width: 1280, height: 720 },
  };
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
  const boss =
    kind === 'recogniser' ? createRecogniser(x, y) : createMaximilian(x, y);

  if (sectorIndex >= 2) {
    const scale = 1 + (sectorIndex - 1) * 0.25;
    boss.maxHp = Math.round(boss.maxHp * scale);
    boss.hp = boss.maxHp;
    for (let i = 0; i < boss.parts.length; i++) {
      const part = boss.parts[i];
      part.maxHp = Math.round(part.maxHp * scale);
      part.hp = part.maxHp;
    }
  }
  return boss;
}

export function spawnBoss(state: GameState, kind: BossKind): BossState {
  const b = state.island.bounds;
  const cx = b.x + b.w * 0.5;
  const cy = b.y + b.h * 0.25;
  const boss = createScaledBoss(kind, cx, cy, state.sectorIndex);
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

function getSectorBossKind(sectorIndex: number): BossKind {
  if (sectorIndex === 0) return 'maximilian';
  if (sectorIndex === 1) return 'recogniser';
  return sectorIndex % 2 === 0 ? 'maximilian' : 'recogniser';
}

function scoreForEnemy(kind: EnemyState['kind']): number {
  switch (kind) {
    case 'enforcer_melee':
      return 100;
    case 'laser_shooter':
      return 150;
    case 'grenadier':
      return 200;
  }
}

function detonateAreaDamage(
  state: GameState,
  x: number,
  y: number,
  blastRadius: number,
  damage: number,
  owner: Projectile['owner'],
  color: string,
): void {
  state.events.push(
    {
      type: 'vfx_explosion',
      x,
      y,
      z: 8,
      color,
      count: 18,
    },
    { type: 'sfx', sound: 'explosion', x, y },
    { type: 'camera_shake', magnitude: 7, duration: 0.2 },
  );

  if (owner === 'player') {
    const nearby = state.grid.queryRadius(x, y, blastRadius);
    for (let i = 0; i < nearby.length; i++) {
      const e = nearby[i];
      if (e.hp <= 0) continue;
      e.hp -= damage;
      e.hitFlash = 0.14;
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
      applyProjectileToBoss(state, x, y, blastRadius * 0.5, damage);
    }
  } else {
    const distToPlayer = Math.hypot(state.player.x - x, state.player.y - y);
    if (distToPlayer <= blastRadius + state.player.radius) {
      damagePlayer(state.player, damage, state.config, state.events);
    }
  }
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

    const prevX = p.x;
    const prevY = p.y;
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    if (p.kind === 'grenade') {
      p.vz -= GRENADE_GRAVITY * dt;
      p.z += p.vz * dt;
      if (p.z <= 0 || p.life <= 0) {
        if (p.bouncesLeft > 0 && p.life > 0) {
          p.z = 0;
          p.vz = Math.abs(p.vz) * 0.45;
          p.vx *= 0.6;
          p.vy *= 0.6;
          p.bouncesLeft -= 1;
        } else {
          p.z = 0;
          p.life = 0;
          detonateAreaDamage(
            state,
            p.x,
            p.y,
            GRENADE_BLAST_RADIUS,
            p.damage,
            p.owner,
            p.color,
          );
        }
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

    // Solid wall collision / ricochet for standard projectiles
    if (pointHitsSolidWall(p.x, p.y, p.radius, state.island)) {
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
        state.events.push({ type: 'sfx', sound: 'electric_zap', x: p.x, y: p.y });
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

    // Airborne grenades fly over obstacles until they land
    if (p.kind === 'grenade' && p.z > 28) continue;

    // 1. vs Enemies (O(1) via SpatialGrid)
    const candidates = state.grid.queryRadius(p.x, p.y, p.radius + 18);
    let hitSomething = false;

    for (let c = 0; c < candidates.length; c++) {
      const enemy = candidates[c];
      if (enemy.hp <= 0) continue;

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
          p.kind === 'mine' ? MINE_BLAST_RADIUS : GRENADE_BLAST_RADIUS,
          p.damage,
          'player',
          p.color,
        );
        hitSomething = true;
        break;
      }

      enemy.hp -= p.damage;
      enemy.hitFlash = 0.12;
      if (p.modifiers.includes('freeze')) {
        enemy.freezeTimer = Math.max(enemy.freezeTimer, 2.5);
      }
      state.events.push({ type: 'sfx', sound: 'hit', x: enemy.x, y: enemy.y });

      if (p.modifiers.includes('lightning_chain') && p.bouncesLeft > 0) {
        p.bouncesLeft -= 1;
        const nearby = state.grid.queryRadius(enemy.x, enemy.y, LIGHTNING_CHAIN_RANGE);
        let nextTarget: EnemyState | null = null;
        let bestDistSq = LIGHTNING_CHAIN_RANGE * LIGHTNING_CHAIN_RANGE;
        for (let k = 0; k < nearby.length; k++) {
          const other = nearby[k];
          if (other.id === enemy.id || other.hp <= 0) continue;
          const dSq = (other.x - enemy.x) ** 2 + (other.y - enemy.y) ** 2;
          if (dSq < bestDistSq) {
            bestDistSq = dSq;
            nextTarget = other;
          }
        }
        if (nextTarget) {
          const speed = Math.max(320, Math.hypot(p.vx, p.vy));
          const dist = Math.max(1, Math.sqrt(bestDistSq));
          p.vx = ((nextTarget.x - enemy.x) / dist) * speed;
          p.vy = ((nextTarget.y - enemy.y) / dist) * speed;
          p.x = enemy.x + ((nextTarget.x - enemy.x) / dist) * (enemy.radius + p.radius + 2);
          p.y = enemy.y + ((nextTarget.y - enemy.y) / dist) * (enemy.radius + p.radius + 2);
          state.events.push({
            type: 'sfx',
            sound: 'electric_zap',
            x: enemy.x,
            y: enemy.y,
          });
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

    // 3. vs Boss Parts
    if (state.boss && state.boss.hp > 0) {
      const res = applyProjectileToBoss(state, p.x, p.y, p.radius, p.damage);
      if (res.hit) {
        if (res.damaged) {
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

    // Airborne grenades and sky-bombs only damage via ground detonation
    if ((p.kind === 'grenade' || p.kind === 'sky_bomb') && p.z > 20) continue;

    const dx = player.x - p.x;
    const dy = player.y - p.y;
    const hitDist = p.radius + player.radius;
    if (dx * dx + dy * dy <= hitDist * hitDist) {
      if (!isPlayerInvulnerable(player)) {
        damagePlayer(player, p.damage, state.config, state.events);
        p.life = 0;
      }
    }
  }
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
  state.sectorTime += clampedDt;

  if (state.toast) {
    state.toast.life -= clampedDt;
    if (state.toast.life <= 0) state.toast = null;
  }

  // Milestone 4: 1/2/3 direct-select and LB/RB / mouse-wheel slot cycling.
  if (input.slotSelect >= 0) selectWeaponSlot(state.player, input.slotSelect);
  if (input.slotCycle !== 0) cycleWeaponSlot(state.player, input.slotCycle);

  // 1. World simulation (sliding doors, temporary bridges, crate hitFlash decay)
  updateWorld(state.island, state.elapsedTime, clampedDt);

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

  if (state.player.dodgeTimer > 0) {
    applyDodgeShove(state.player, state.enemies, state.config);
  }

  // 4. Camera update
  updateCamera(state.camera, state.player, input, clampedDt);

  // 5. Orbitals update (can intercept both enemy & boss projectiles)
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
  );
  if (droneShots.length > 0) {
    state.playerProjectiles.push(...droneShots);
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
        );
        if (spawned.length > 0) {
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
      spawnBoss(state, getSectorBossKind(state.sectorIndex));
    }
  }

  // 7. Enemy AI updates (200+ melee Enforcers + 50-100 Shooters/Grenadiers)
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

  // Enemy world hazards (electrified walls / open-edge falls) & melee contact
  for (let i = 0; i < state.enemies.length; i++) {
    const e = state.enemies[i];
    if (e.hp <= 0) continue;

    const worldRes = resolveEntityAgainstWorld(e, state.island);
    if (worldRes.hitElectrifiedWall) {
      e.hp -= 25;
      e.hitFlash = 0.14;
      state.events.push({ type: 'sfx', sound: 'electric_zap', x: e.x, y: e.y });
    }
    if (worldRes.fellOffEdge) {
      e.hp = 0;
    }

    if (e.hp > 0 && e.kind === 'enforcer_melee') {
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
    if (state.boss.kind === 'maximilian') {
      updateMaximilian(
        state.boss,
        state.player,
        state.island,
        state.playerProjectiles,
        clampedDt,
        state.events,
      );
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
  for (let i = 0; i < state.pickups.length; i++) {
    const pickup = state.pickups[i];
    pickup.life -= clampedDt;
    if (pickup.life <= 0) continue;

    const dx = state.player.x - pickup.x;
    const dy = state.player.y - pickup.y;
    const distSq = dx * dx + dy * dy;
    const inRange = distSq <= collectDist * collectDist;

    if (pickup.kind === 'weapon') {
      // Dropped weapons stay on the floor until the hero equips them with F.
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
  const swapWeaponType = state.nearbyWeaponPickup?.weaponType;
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

  // 16. Game-over check
  if (state.player.hp <= 0 && state.player.lives <= 0) {
    state.gameOver = true;
  }

  return state;
}
