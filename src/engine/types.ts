// Core shared types for Berzerk Cubed (BERZERK³).
// Owned by Judge/Orchestrator (main). Worktree agents must not edit this file
// directly; request additions via docs/QUESTIONS.md.

export interface Vec2 {
  x: number;
  y: number;
}

export interface Vec3 extends Vec2 {
  z: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

// ---------- Input & Camera ----------

export interface InputState {
  moveX: number; // -1..1 raw input
  moveY: number; // -1..1 raw input
  mouseScreenX: number;
  mouseScreenY: number;
  aimX: number; // -1..1 analog twin-stick aim (gamepad right stick); 0 = use mouse
  aimY: number;
  firing: boolean;
  dodgePressed: boolean;
  swapPressed: boolean; // F / gamepad X: equip or swap a nearby dropped weapon
  slotSelect: number; // -1 = none, 0..2 = directly select weapon slot (1/2/3)
  slotCycle: -1 | 0 | 1; // -1 previous / +1 next (LB/RB or mouse wheel)
  swivelDir: -1 | 0 | 1; // Q/E or gamepad D-pad camera swivel
}

export interface CameraState {
  x: number;
  y: number;
  angleDeg: number; // 0° default
  targetAngleDeg: number;
  tiltScale: number; // Modulates Approach B layerSpacing (1.0 default)
  layerSpacing: number; // Base Z-spacing in pixels (default 2.0)
  shakeMag: number;
  shakeTimer: number;
}

// ---------- Weapons, Power-Ups & Orbitals ----------

export type WeaponType =
  | 'pulse_rifle'
  | 'spread'
  | 'machine_gun'
  | 'shotgun'
  | 'beam'
  | 'wide_beam'
  | 'flamethrower'
  | 'bouncing_lightning'
  | 'grenade'
  | 'mine';

export type WeaponModifier = 'freeze' | 'lightning_chain' | 'pierce' | 'ricochet';

export type OrbitalType = 'shooter_drone' | 'lightsaber' | 'ablative_shield';

export interface ActiveWeaponState {
  primary: WeaponType;
  level: number;
  modifiers: WeaponModifier[];
  fireCooldown: number;
}

export interface OrbitalState {
  id: string;
  type: OrbitalType;
  orbitAngle: number;
  orbitRadius: number;
  hp: number; // Used by ablative_shield
  maxHp: number;
  fireCooldown: number;
}

export interface PowerUpPickup {
  id: string;
  x: number;
  y: number;
  z: number;
  kind: 'weapon' | 'modifier' | 'orbital' | 'shield_boost' | 'extra_life';
  weaponType?: WeaponType;
  modifier?: WeaponModifier;
  orbitalType?: OrbitalType;
  life: number;
}

// ---------- Player ----------

export interface PlayerState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  radius: number;
  legAngle: number;
  aimAngle: number;
  runCycle: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  shieldRegenDelay: number;
  lives: number;
  // Spacebar dodge-roll (replaces jump)
  dodgeTimer: number; // > 0 while rolling (grants i-frames & knockback)
  dodgeCooldown: number;
  dodgeDirX: number;
  dodgeDirY: number;
  // Invulnerability & edge-fall resurrection
  invulnTimer: number;
  lastSafeX: number;
  lastSafeY: number;
  /** Milestone 4.12: hero death explosion countdown (>0 = hidden, immobile). */
  deathTimer?: number;
  /** Milestone 4.12: hero rez-in teleport countdown (>0 = invulnerable, beam + flash). */
  rezTimer?: number;
  rezDuration?: number;
  /** Milestone 4.12: brief post-rez fading flash halo countdown (0.15s). */
  rezHaloTimer?: number;
  /** Milestone 4.12: world coordinates where hero died (respawn anchor). */
  deathX?: number;
  deathY?: number;
  recoil: number;
  muzzleFlash: number;
  weapon: ActiveWeaponState; // active weapon; mirrors weaponSlots[activeSlot]
  /** Milestone 4: 3-slot physical weapon inventory (null = empty slot). */
  weaponSlots?: Array<ActiveWeaponState | null>;
  activeSlot?: number;
  orbitals: OrbitalState[];
}

// ---------- World, Islands & Hazards ----------

export type OutlineTheme = 'blue' | 'red';

export interface WallSegment {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  heightZ: number;
  electrified: boolean;
  destructible: boolean;
}

export type CardinalDirection = 'north' | 'south' | 'east' | 'west';

export interface SlidingDoor {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  syncGroup: number;
  periodSec: number;
  openFraction: number; // 0 = closed, 1 = fully open
  /** Milestone 4.13: set on perimeter cardinal exit doors (north/south/east/west). */
  cardinal?: CardinalDirection;
}

export interface RoomTransitionState {
  active: boolean;
  exitDir: CardinalDirection;
  enterDir: CardinalDirection;
  /** Unit push-slide vector: east->(-1,0), west->(1,0), north->(0,1), south->(0,-1). */
  slideX: number;
  slideY: number;
  /** Linear progress 0..1 over durationSec. */
  progress: number;
  durationSec: number;
  heroStartX: number;
  heroStartY: number;
  heroEndX: number;
  heroEndY: number;
  outgoingIsland: PlatformIsland;
  outgoingCameraX: number;
  outgoingCameraY: number;
}

export interface TempBridge {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  active: boolean;
  spawnsHorde: boolean;
}

export interface DestructibleCrate {
  id: string;
  x: number;
  y: number;
  angle: number;
  radius: number;
  hp: number;
  maxHp: number;
  hitFlash: number;
}

export interface PlatformIsland {
  id: string;
  bounds: Rect;
  outline: OutlineTheme;
  hasPerimeterWalls: boolean; // false on dangerous open-edge islands
  walls: WallSegment[];
  doors: SlidingDoor[];
  bridges: TempBridge[];
  crates: DestructibleCrate[];
}

// ---------- Projectiles ----------

export interface Projectile {
  id: string;
  owner: 'player' | 'enemy' | 'boss';
  kind:
    | 'bolt'
    | 'beam_segment'
    | 'flame'
    | 'lightning'
    | 'grenade'
    | 'mine'
    | 'sky_bomb'
    | 'homing_drone'
    | 'electric_wave'
    | 'sawblade';
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  radius: number;
  damage: number;
  life: number;
  maxLife: number;
  bouncesLeft: number;
  modifiers: WeaponModifier[];
  color: string;
  targetX?: number;
  targetY?: number;
  /** Milestone 4.14: ABB guided ICBM missile flag + capped turn rate + blast radius. */
  icbm?: boolean;
  turnRate?: number;
  blastRadius?: number;
  /** Milestone 4.14: visual spin angle (deg) for thrown sawblades. */
  spinAngle?: number;
}

// ---------- Enemies & Bosses ----------

export type EnemyKind =
  | 'enforcer_melee'
  | 'v_bot_melee'
  | 'v_bot_laser'
  | 'laser_shooter'
  | 'grenadier';

export interface EnemyState {
  id: string;
  kind: EnemyKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  radius: number;
  angle: number;
  animFrame: number;
  hp: number;
  maxHp: number;
  fireCooldown: number;
  telegraphTimer: number;
  freezeTimer: number;
  hitFlash: number;
  /** Milestone 4.11: firing animation timer (~0.22s) for barrel recoil / muzzle flash. */
  fireAnimTimer?: number;
  /** Milestone 4.11: TRON rez-in materialization countdown (>0 = invulnerable, stationary). */
  rezTimer?: number;
  rezDuration?: number;
  /** Milestone 4.12: brief post-rez fading flash halo countdown (0.15s). */
  rezHaloTimer?: number;
  /** Milestone 4.14: flamethrower burning status countdown & periodic DOT accumulator. */
  burnTimer?: number;
  burnTickTimer?: number;
  /** Milestone 4.14: cumulative freeze slow fraction (0..0.85), +0.02/hit, -0.01/sec recovery. */
  chillSlow?: number;
  /** Milestone 4.14: electric white/blue flash timer (0.16s) when struck/chained by lightning. */
  lightningFlashTimer?: number;
}

export type BossKind =
  | 'maximilian'
  | 'recogniser'
  | 'evil_otto'
  | 'abb'
  | 'skullhead'
  | 'bug_hive'
  | 'brainbot';

export type OttoVariant = 'classic' | 'volt' | 'cryo' | 'vortex';

export interface OrbitingBugBot {
  id: string;
  angle: number;
  orbitRadius: number;
  hp: number;
  maxHp: number;
  state: 'orbit' | 'swoop';
  x: number;
  y: number;
  vx: number;
  vy: number;
  swoopTimer: number;
}

/** Milestone 4.14: Maximilian's multi-layer rotating ablative shield plate. */
export interface AblativeShieldPlate {
  id: string;
  layer: number;
  angle: number;
  orbitRadius: number;
  radius: number;
  hp: number;
  maxHp: number;
  hitFlash: number;
  x: number;
  y: number;
}

/** Milestone 4.14: Raycasted eye-laser segment for Floating Skullhead. */
export interface SkullLaserBeam {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
  hitWall: boolean;
  hitPlayer: boolean;
}

export interface BossPart {
  id: string;
  label: string;
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  radius: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  vulnerable: boolean;
}

export interface BossState {
  id: string;
  kind: BossKind;
  name: string;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  angle: number;
  radius: number;
  hp: number;
  maxHp: number;
  phase: string;
  phaseTimer: number;
  parts: BossPart[];
  // Maximilian blade spin / blade-shield meter
  bladeAngle: number;
  bladeRadius: number;
  shieldHp?: number;
  shieldMaxHp?: number;
  /** True while the boss can be damaged (blades retracted / shield broken). */
  vulnerable?: boolean;
  // Milestone 4.11: higher-sector multi-layer regenerating shields & rampage invulnerability
  shieldLayers?: number;
  maxShieldLayers?: number;
  shieldLayerHp?: number;
  shieldRegenDelay?: number;
  rampageTimer?: number;
  rampageCooldown?: number;
  /** Milestone 4.11: firing recoil / muzzle flash timer. */
  fireAnimTimer?: number;
  /** Milestone 4.11: TRON rez-in materialization countdown. */
  rezTimer?: number;
  rezDuration?: number;
  /** Milestone 4.12: brief post-rez fading flash halo countdown (0.15s). */
  rezHaloTimer?: number;
  // Recogniser sky-slam shadow telegraph
  slamTargetX?: number;
  slamTargetY?: number;
  slamProgress?: number; // 0..1 growing shadow
  // Evil Otto variant & reconstruction
  ottoVariant?: OttoVariant;
  reconstructing?: boolean;
  // ABB dodge-dash state
  dashTimer?: number;
  dashDirX?: number;
  dashDirY?: number;
  // Skullhead twin sweeping eye-laser state
  laserTelegraphTimer?: number;
  laserActiveTimer?: number;
  laserSweepAngle?: number;
  laserSweepDir?: number;
  /** Milestone 4.14: wall-clipped twin eye-laser endpoints for rendering & sizzle impacts. */
  skullLaserHits?: SkullLaserBeam[];
  // Maximilian Milestone 4.14: thrown sawblade cooldown & layered ablative shield plates
  sawbladeCooldown?: number;
  ablativePlates?: AblativeShieldPlate[];
  // Milestone 4.14: elemental statuses on bosses
  chillSlow?: number;
  burnTimer?: number;
  burnTickTimer?: number;
  lightningFlashTimer?: number;
  // Bug Hive orbiting bug-bot shield
  orbitingBugs?: OrbitingBugBot[];
  hitFlash: number;
  /** Milestone 4.13: differentiates shield-hit flash (cyan/amber) from core-HP flash (white/red). */
  hitFlashKind?: 'core' | 'shield';
}

// ---------- Events & Difficulty Config ----------

export type GameEvent =
  | { type: 'sfx'; sound: string; x?: number; y?: number }
  | { type: 'voice_taunt'; text: string; pitch: number; rate: number; speaker: string }
  | { type: 'vfx_explosion'; x: number; y: number; z: number; color: string; count: number }
  | { type: 'vfx_shockwave'; x: number; y: number; z: number; radius: number; color: string; rings?: number }
  | { type: 'vfx_lightning_arc'; x1: number; y1: number; x2: number; y2: number; color?: string }
  | { type: 'vfx_flame_smoke'; x: number; y: number; z: number }
  | { type: 'vfx_sizzle'; x: number; y: number; z: number }
  | { type: 'camera_shake'; magnitude: number; duration: number }
  | { type: 'crate_destroyed'; x: number; y: number }
  | { type: 'player_fell'; x: number; y: number };

export interface DifficultyConfig {
  maxMeleeEnforcers: number; // Tunable: 200+
  maxShootersAndGrenadiers: number; // Tunable: 50-100
  enforcerSpeed: number;
  enforcerHp: number;
  shooterHp: number;
  grenadierHp: number;
  enemyProjectileSpeed: number;
  ottoWarningSec: number;
  playerMaxHp: number;
  playerMaxShield: number;
  shieldRegenRate: number;
  shieldRegenDelaySec: number;
  dodgeCooldownSec: number;
  dodgeDurationSec: number;
  dodgeKnockbackRadius: number;
  dodgeKnockbackForce: number;
}
