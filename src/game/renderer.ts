import { SoundEngine } from '../audio/soundEngine';
import { VoiceTauntEngine } from '../audio/voiceTaunts';
import { triggerCameraShake, worldToScreen } from '../engine/camera';
import type {
  BossState,
  CameraState,
  DestructibleCrate,
  EnemyState,
  GameEvent,
  PlatformIsland,
  PlayerState,
  PowerUpPickup,
  Projectile,
  SlidingDoor,
  WallSegment,
} from '../engine/types';
import { getOrbitalWorldPos } from '../entities/orbitals';
import { pickupLabel } from '../entities/weapons';
import { CircuitBackground } from '../render/circuitBg';
import {
  bakeSwarmCaches,
  buildAllModels,
  enemyCacheKey,
  type ModelSet,
} from '../render/models';
import { drawStack, SpriteStackCache } from '../render/spriteStack';
import { VfxSystem } from '../render/vfx';
import type { GameState } from './gameState';

const SPRITE_SCALE = 2;
const BASE_LAYER_SPACING = 2.8;
const PITCH_Z_MULTIPLIER = 1.4; // Maps camera.layerSpacing (2.0) -> 2.8px for 3/4 pitch

/** Default chunk size (world px) for subdividing long walls & doors for rotation-safe depth sorting. */
export const DEFAULT_WALL_CHUNK_SIZE = 56;
/** Duration (seconds) of the brief post-rez fading flash halo after materialization completes. */
export const REZ_POST_HALO_SEC = 0.15;

/**
 * Milestone 4.15: Pure travel-heading helper for projectiles (in degrees).
 * Renderer adds `camera.angleDeg` to orient directional bolts such as Tesla lightning spears.
 */
export function projectileHeadingDeg(p: Pick<Projectile, 'vx' | 'vy'>): number {
  if (p.vx === 0 && p.vy === 0) return 0;
  return (Math.atan2(p.vy, p.vx) * 180) / Math.PI;
}

export interface WallChunk {
  x: number;
  y: number;
  w: number;
  h: number;
  heightZ: number;
  electrified: boolean;
  destructible: boolean;
  screenX: number;
  screenY: number;
  sortY: number;
  isDoor?: boolean;
  openFraction?: number;
}

/**
 * Milestone 4.12: Subdivides a long wall segment into ~48-64px Approach-B chunks
 * and projects each chunk's exact center via `project(...)` so walls depth-sort
 * accurately at any Q/E camera rotation angle (0°–360°).
 */
export function chunkWallForDepthSort(
  wall: WallSegment,
  project: (wx: number, wy: number) => { x: number; y: number },
  chunkSize = DEFAULT_WALL_CHUNK_SIZE,
): WallChunk[] {
  const safeSize = Math.max(16, chunkSize);
  const cols = Math.max(1, Math.ceil(wall.w / safeSize));
  const rows = Math.max(1, Math.ceil(wall.h / safeSize));
  const cw = wall.w / cols;
  const ch = wall.h / rows;
  const chunks: WallChunk[] = [];

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const cx = wall.x + c * cw;
      const cy = wall.y + r * ch;
      const s = project(cx + cw * 0.5, cy + ch * 0.5);
      chunks.push({
        x: cx,
        y: cy,
        w: cw,
        h: ch,
        heightZ: wall.heightZ,
        electrified: wall.electrified,
        destructible: wall.destructible,
        screenX: s.x,
        screenY: s.y,
        sortY: s.y,
      });
    }
  }
  return chunks;
}

/**
 * Milestone 4.12: Converts a sliding door into retracting 3D energy-gate panels
 * subdivided into rotation-safe Approach-B chunks for the depth-sorted renderQueue.
 */
export function chunkSlidingDoorForDepthSort(
  door: SlidingDoor,
  project: (wx: number, wy: number) => { x: number; y: number },
  chunkSize = DEFAULT_WALL_CHUNK_SIZE,
): WallChunk[] {
  const open = Math.max(0, Math.min(1, door.openFraction));
  const closedFrac = Math.max(0, 1 - open);
  if (closedFrac <= 0.02) return [];

  const horiz = door.w >= door.h;
  const panels: WallSegment[] = [];
  if (horiz) {
    const panelW = door.w * 0.5 * closedFrac;
    panels.push(
      {
        id: `${door.id}_a`,
        x: door.x,
        y: door.y,
        w: panelW,
        h: door.h,
        heightZ: 28,
        electrified: false,
        destructible: false,
      },
      {
        id: `${door.id}_b`,
        x: door.x + door.w - panelW,
        y: door.y,
        w: panelW,
        h: door.h,
        heightZ: 28,
        electrified: false,
        destructible: false,
      },
    );
  } else {
    const panelH = door.h * 0.5 * closedFrac;
    panels.push(
      {
        id: `${door.id}_a`,
        x: door.x,
        y: door.y,
        w: door.w,
        h: panelH,
        heightZ: 28,
        electrified: false,
        destructible: false,
      },
      {
        id: `${door.id}_b`,
        x: door.x,
        y: door.y + door.h - panelH,
        w: door.w,
        h: panelH,
        heightZ: 28,
        electrified: false,
        destructible: false,
      },
    );
  }

  const chunks: WallChunk[] = [];
  for (let i = 0; i < panels.length; i++) {
    const sub = chunkWallForDepthSort(panels[i], project, chunkSize);
    for (let k = 0; k < sub.length; k++) {
      sub[k].isDoor = true;
      sub[k].openFraction = open;
      chunks.push(sub[k]);
    }
  }
  return chunks;
}

export interface RezFlashPhase {
  stage: 'beam' | 'flash' | 'halo' | 'done';
  beamAlpha: number;
  entityAlpha: number;
  flashAlpha: number;
  haloAlpha: number;
  showSolidEntity: boolean;
}

/**
 * Milestone 4.12: Pure two-stage TRON Rez-In phase calculator.
 * - `0.00..0.80`: rising wireframe/scanline beam + converging rings; entity ghosted inside.
 * - `0.80..1.00`: rapidly brightens into a solid, fully opaque white/neon flash silhouette.
 * - `1.00` + `postRezElapsed < 0.15s`: solid robot snaps in + brief fading flash halo.
 * - `1.00` + `postRezElapsed >= 0.15s`: normal solid entity.
 */
export function rezFlashPhase(
  progress: number,
  postRezElapsed = 0,
): RezFlashPhase {
  const p = Math.max(0, Math.min(1, progress));
  if (p < 0.8) {
    const t = p / 0.8;
    return {
      stage: 'beam',
      beamAlpha: 1,
      entityAlpha: 0.1 + t * 0.25,
      flashAlpha: 0,
      haloAlpha: 0,
      showSolidEntity: false,
    };
  }
  if (p < 1.0) {
    const t = (p - 0.8) / 0.2;
    return {
      stage: 'flash',
      beamAlpha: Math.max(0.25, 1 - t * 0.5),
      entityAlpha: 0,
      flashAlpha: Math.min(1, 0.35 + t * 0.65),
      haloAlpha: 0,
      showSolidEntity: false,
    };
  }
  if (postRezElapsed >= 0 && postRezElapsed < REZ_POST_HALO_SEC) {
    const haloAlpha = Math.max(0, Math.min(1, 1 - postRezElapsed / REZ_POST_HALO_SEC));
    return {
      stage: 'halo',
      beamAlpha: 0,
      entityAlpha: 1,
      flashAlpha: 0,
      haloAlpha,
      showSolidEntity: true,
    };
  }
  return {
    stage: 'done',
    beamAlpha: 0,
    entityAlpha: 1,
    flashAlpha: 0,
    haloAlpha: 0,
    showSolidEntity: true,
  };
}

interface RenderQueueItem {
  sortY: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

export interface GameRenderer {
  readonly cache: SpriteStackCache;
  readonly models: ModelSet;
  readonly circuitBg: CircuitBackground;
  readonly vfx: VfxSystem;
  readonly sound: SoundEngine;
  readonly voice: VoiceTauntEngine;
  initAudio(): Promise<void>;
  dispatchEvents(events: GameEvent[], camera: CameraState): void;
  update(dt: number, state: GameState): void;
  render(
    ctx: CanvasRenderingContext2D,
    state: GameState,
    width: number,
    height: number,
  ): void;
}

export interface RendererOptions {
  sound?: SoundEngine;
  voice?: VoiceTauntEngine;
  vfx?: VfxSystem;
  circuitBg?: CircuitBackground;
  /** Pre-built assets from the async loading screen (skips synchronous bake). */
  models?: ModelSet;
  cache?: SpriteStackCache;
}

function getCameraShakeOffset(camera: CameraState): { x: number; y: number } {
  if (camera.shakeTimer > 0 && camera.shakeMag > 0) {
    return {
      x: Math.sin(camera.shakeTimer * 97.3) * camera.shakeMag,
      y: Math.cos(camera.shakeTimer * 131.7) * camera.shakeMag,
    };
  }
  return { x: 0, y: 0 };
}

function renderIslandWorld(
  ctx: CanvasRenderingContext2D,
  island: PlatformIsland,
  boss: BossState | null,
  projectiles: Projectile[],
  elapsedTime: number,
  exitsUnlocked = false,
): void {
  const b = island.bounds;
  const outlineColor = island.outline === 'red' ? '#ef4444' : '#22d3ee';
  const gridColor =
    island.outline === 'red'
      ? 'rgba(239, 68, 68, 0.14)'
      : 'rgba(34, 211, 238, 0.14)';

  // 1. Temporary horde bridges (under main deck outline)
  for (let i = 0; i < island.bridges.length; i++) {
    const br = island.bridges[i];
    if (!br.active) {
      ctx.save();
      ctx.strokeStyle = 'rgba(148, 163, 184, 0.18)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 1.5;
      ctx.strokeRect(br.x, br.y, br.w, br.h);
      ctx.restore();
      continue;
    }

    const pulse = 0.65 + 0.35 * Math.sin(elapsedTime * 7 + i);
    ctx.fillStyle = '#070b14';
    ctx.fillRect(br.x, br.y, br.w, br.h);
    ctx.strokeStyle = `rgba(250, 204, 21, ${pulse.toFixed(2)})`;
    ctx.lineWidth = 2.5;
    ctx.strokeRect(br.x, br.y, br.w, br.h);

    // Bridge energy chevrons
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
    ctx.lineWidth = 1;
    const step = 28;
    for (let x = br.x + step; x < br.x + br.w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, br.y);
      ctx.lineTo(x, br.y + br.h);
      ctx.stroke();
    }
    for (let y = br.y + step; y < br.y + br.h; y += step) {
      ctx.beginPath();
      ctx.moveTo(br.x, y);
      ctx.lineTo(br.x + br.w, y);
      ctx.stroke();
    }
  }

  // 2. Floating island platform deck (black fill + neon outline + cyber grid)
  ctx.fillStyle = '#060912';
  ctx.fillRect(b.x, b.y, b.w, b.h);

  ctx.strokeStyle = gridColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  const gridStep = 64;
  for (let gx = Math.ceil(b.x / gridStep) * gridStep; gx < b.x + b.w; gx += gridStep) {
    ctx.moveTo(gx, b.y);
    ctx.lineTo(gx, b.y + b.h);
  }
  for (let gy = Math.ceil(b.y / gridStep) * gridStep; gy < b.y + b.h; gy += gridStep) {
    ctx.moveTo(b.x, gy);
    ctx.lineTo(b.x + b.w, gy);
  }
  ctx.stroke();

  // Neon island border
  ctx.save();
  ctx.strokeStyle = outlineColor;
  ctx.lineWidth = island.hasPerimeterWalls ? 3 : 4;
  ctx.shadowColor = outlineColor;
  ctx.shadowBlur = 14;
  ctx.strokeRect(b.x, b.y, b.w, b.h);
  ctx.restore();

  // 3. Synchronized sliding door floor tracks (solid 3D energy-gate panels are
  //    depth-sorted in renderQueue via chunkSlidingDoorForDepthSort + drawDoor3D).
  //    Milestone 4.13: When boss is defeated, cardinal exit doors glow with a
  //    bright inviting neon exit pulse and directional chevrons (>>>) pointing out.
  for (let i = 0; i < island.doors.length; i++) {
    const d = island.doors[i];
    const isUnlockedExit = exitsUnlocked && d.cardinal !== undefined;
    if (isUnlockedExit && d.cardinal) {
      const pulse = 0.65 + 0.35 * Math.sin(elapsedTime * 8);
      ctx.save();
      ctx.fillStyle = `rgba(74, 222, 128, ${(0.16 + pulse * 0.14).toFixed(2)})`;
      ctx.fillRect(d.x, d.y, d.w, d.h);
      ctx.shadowColor = '#4ade80';
      ctx.shadowBlur = 16;
      ctx.strokeStyle = `rgba(74, 222, 128, ${(0.7 + pulse * 0.3).toFixed(2)})`;
      ctx.lineWidth = 2.5;
      ctx.strokeRect(d.x, d.y, d.w, d.h);

      // Directional exit chevrons (>>>) pointing outward from each open cardinal doorway
      const dcx = d.x + d.w * 0.5;
      const dcy = d.y + d.h * 0.5;
      const dirAngle =
        d.cardinal === 'east'
          ? 0
          : d.cardinal === 'south'
            ? Math.PI * 0.5
            : d.cardinal === 'west'
              ? Math.PI
              : -Math.PI * 0.5;
      ctx.translate(dcx, dcy);
      ctx.rotate(dirAngle);
      ctx.strokeStyle = '#fef08a';
      ctx.lineWidth = 2.5;
      for (let c = 0; c < 3; c++) {
        const wave = ((elapsedTime * 3.2 + c * 0.33) % 1);
        const cxOff = -18 + c * 14 + wave * 8;
        ctx.globalAlpha = 0.45 + 0.55 * (1 - Math.abs(wave - 0.5) * 2);
        ctx.beginPath();
        ctx.moveTo(cxOff - 5, -9);
        ctx.lineTo(cxOff + 4, 0);
        ctx.lineTo(cxOff - 5, 9);
        ctx.stroke();
      }
      ctx.restore();
    } else {
      ctx.strokeStyle =
        d.openFraction >= 0.75
          ? 'rgba(34, 211, 238, 0.45)'
          : 'rgba(245, 158, 11, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(d.x, d.y, d.w, d.h);
    }
  }

  // 4. Walls are drawn in the depth-sorted renderQueue as extruded 3D blocks
  //    (see drawWall3D) so they interleave correctly with the Hero, enemies and
  //    projectiles instead of always sitting behind them.

  // 5. Recogniser sky-slam growing ground shadow telegraph
  if (
    boss &&
    boss.kind === 'recogniser' &&
    (boss.slamProgress ?? 0) > 0 &&
    boss.slamTargetX !== undefined &&
    boss.slamTargetY !== undefined
  ) {
    const prog = boss.slamProgress ?? 0;
    const radius = 24 + prog * 74;
    ctx.save();
    ctx.fillStyle = `rgba(0, 0, 0, ${(0.25 + prog * 0.45).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(boss.slamTargetX, boss.slamTargetY, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = prog > 0.65 ? '#ff2a55' : '#22d3ee';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(boss.slamTargetX, boss.slamTargetY, radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 6. Ground warning rings for Z-arcing grenades & sky-bombs
  for (let i = 0; i < projectiles.length; i++) {
    const p = projectiles[i];
    if (
      (p.kind === 'grenade' || p.kind === 'sky_bomb') &&
      p.targetX !== undefined &&
      p.targetY !== undefined
    ) {
      const frac = 1 - Math.max(0, Math.min(1, p.life / Math.max(0.01, p.maxLife)));
      const r = p.kind === 'sky_bomb' ? 32 + frac * 34 : 18 + frac * 42;
      ctx.save();
      ctx.strokeStyle = p.owner === 'player' ? 'rgba(74, 222, 128, 0.55)' : 'rgba(255, 149, 0, 0.75)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(p.targetX, p.targetY, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }
}

/**
 * Extruded Approach-B wall block. Drawn in screen space (rotated by the camera)
 * and enqueued in the depth-sorted queue so it Z-sorts against units and shots.
 */
function drawWall3D(
  ctx: CanvasRenderingContext2D,
  wall: WallSegment,
  screenX: number,
  screenY: number,
  camAngleDeg: number,
  zScale: number,
  elapsedTime: number,
  index: number,
  outlineColor: string,
): void {
  const segW = wall.w;
  const segD = wall.h;
  // Milestone 4.1 Fix 4: true vertical Approach B Z-stack. No lateral `ex`
  // skew — every layer lifts strictly in screen -Y, like drawStack().
  const stepCount = 10;
  const spacingPx = Math.max(1.2, (wall.heightZ * zScale) / stepCount);
  const rad = (camAngleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localCorners: Array<[number, number]> = [
    [-segW / 2, -segD / 2],
    [segW / 2, -segD / 2],
    [segW / 2, segD / 2],
    [-segW / 2, segD / 2],
  ];
  const poly = localCorners.map(([x, y]) => ({
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  }));
  const neon = wall.electrified ? '#f43f5e' : outlineColor;

  ctx.save();
  ctx.translate(screenX, screenY);

  for (let z = 0; z < stepCount; z++) {
    const lift = z * spacingPx;
    const t = z / (stepCount - 1);
    ctx.beginPath();
    for (let i = 0; i < poly.length; i++) {
      if (i === 0) ctx.moveTo(poly[i].x, poly[i].y - lift);
      else ctx.lineTo(poly[i].x, poly[i].y - lift);
    }
    ctx.closePath();
    const shade = Math.round(10 + t * 26);
    ctx.fillStyle = wall.electrified
      ? `rgb(${shade + 14}, 8, ${shade + 6})`
      : `rgb(8, ${shade}, ${shade + 20})`;
    ctx.fill();
    ctx.strokeStyle = neon;
    ctx.globalAlpha = z === stepCount - 1 ? 0.95 : 0.32;
    ctx.lineWidth = z === stepCount - 1 ? 2 : 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Bright neon top cap.
  ctx.save();
  ctx.shadowColor = neon;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = neon;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < poly.length; i++) {
    const ly = poly[i].y - (stepCount - 1) * spacingPx;
    if (i === 0) ctx.moveTo(poly[i].x, ly);
    else ctx.lineTo(poly[i].x, ly);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  if (wall.electrified) {
    // Glowing plasma arcs climbing the vertical stack.
    const flicker = 0.65 + 0.35 * Math.sin(elapsedTime * 28 + index * 3.1);
    ctx.shadowColor = '#67e8f9';
    ctx.shadowBlur = 14;
    ctx.strokeStyle = flicker > 0.8 ? '#fef08a' : '#67e8f9';
    ctx.lineWidth = 2;
    const arcs = Math.max(1, Math.floor(segW / 18));
    for (let a = 0; a < arcs; a++) {
      const bx = -segW / 2 + ((a + 0.5) * segW) / arcs;
      const by = -segD / 2;
      const px = bx * cos - by * sin;
      const py = bx * sin + by * cos;
      ctx.beginPath();
      ctx.moveTo(px, py);
      for (let s = 1; s <= 5; s++) {
        const jitter = Math.sin(elapsedTime * 42 + s * 6.7 + a + index) * 2.4;
        ctx.lineTo(px + jitter, py - ((stepCount - 1) * spacingPx * s) / 5);
      }
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

  ctx.restore();
}

/**
 * Milestone 4.12: True vertical Approach-B 3D stacked energy-gate block for
 * sliding doors, aligned seamlessly with walls at any Q/E camera angle.
 */
function drawDoor3D(
  ctx: CanvasRenderingContext2D,
  chunk: WallChunk,
  camAngleDeg: number,
  zScale: number,
  elapsedTime: number,
): void {
  const segW = chunk.w;
  const segD = chunk.h;
  const open = chunk.openFraction ?? 0;
  const stepCount = 8;
  const spacingPx = Math.max(1.2, (chunk.heightZ * zScale) / stepCount);
  const rad = (camAngleDeg * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const localCorners: Array<[number, number]> = [
    [-segW / 2, -segD / 2],
    [segW / 2, -segD / 2],
    [segW / 2, segD / 2],
    [-segW / 2, segD / 2],
  ];
  const poly = localCorners.map(([x, y]) => ({
    x: x * cos - y * sin,
    y: x * sin + y * cos,
  }));

  const isOpening = open >= 0.75;
  const neon = isOpening ? '#22d3ee' : '#f59e0b';
  const pulse = 0.72 + 0.28 * Math.sin(elapsedTime * 10);

  ctx.save();
  ctx.translate(chunk.screenX, chunk.screenY);

  for (let z = 0; z < stepCount; z++) {
    const lift = z * spacingPx;
    const t = z / (stepCount - 1);
    ctx.beginPath();
    for (let i = 0; i < poly.length; i++) {
      if (i === 0) ctx.moveTo(poly[i].x, poly[i].y - lift);
      else ctx.lineTo(poly[i].x, poly[i].y - lift);
    }
    ctx.closePath();
    const shade = Math.round(12 + t * 24);
    ctx.fillStyle = isOpening
      ? `rgba(14, ${shade + 22}, ${shade + 42}, 0.82)`
      : `rgb(${shade + 18}, ${shade + 8}, 10)`;
    ctx.fill();
    ctx.strokeStyle = neon;
    ctx.globalAlpha = z === stepCount - 1 ? 0.95 : 0.35 * pulse;
    ctx.lineWidth = z === stepCount - 1 ? 2 : 1;
    ctx.stroke();
    ctx.globalAlpha = 1;
  }

  // Glowing energy-gate top cap
  ctx.save();
  ctx.shadowColor = neon;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = neon;
  ctx.lineWidth = 2;
  ctx.beginPath();
  for (let i = 0; i < poly.length; i++) {
    const ly = poly[i].y - (stepCount - 1) * spacingPx;
    if (i === 0) ctx.moveTo(poly[i].x, ly);
    else ctx.lineTo(poly[i].x, ly);
  }
  ctx.closePath();
  ctx.stroke();
  ctx.restore();

  ctx.restore();
}

function drawHero(
  ctx: CanvasRenderingContext2D,
  player: PlayerState,
  models: ModelSet,
  screenX: number,
  screenY: number,
  camera: CameraState,
  spacingPx: number,
  zScale: number,
): void {
  const camAngle = camera.angleDeg;
  const baseZ = player.z * zScale;

  // Ground shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.beginPath();
  ctx.ellipse(screenX, screenY + 4, 14, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Energy shield aura when shield > 0
  if (player.shield > 0) {
    ctx.save();
    ctx.strokeStyle =
      player.dodgeTimer > 0
        ? 'rgba(250, 204, 21, 0.85)'
        : 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = player.dodgeTimer > 0 ? 3 : 1.5;
    ctx.beginPath();
    ctx.ellipse(screenX, screenY - baseZ - 12, 18, 12, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 1. Legs (idle / 4-frame run / dodge roll)
  const speedSq = player.vx * player.vx + player.vy * player.vy;
  const legSlices =
    player.dodgeTimer > 0
      ? models.hero.legsRoll
      : speedSq > 100
        ? models.hero.legsRun[Math.floor(player.runCycle) % models.hero.legsRun.length]
        : models.hero.legsIdle;

  drawStack(
    ctx,
    legSlices,
    screenX,
    screenY,
    player.legAngle,
    camAngle,
    SPRITE_SCALE,
    baseZ,
    spacingPx,
  );

  // 2. Z-interleaved torso + weapon using rifleScreenRelY depth check
  const torsoStartZ = baseZ + legSlices.length * spacingPx;
  const weaponSlices =
    models.hero.weaponStacks[player.weapon.primary] ??
    models.hero.weaponStacks.pulse_rifle;
  const aimTotalRad = ((player.aimAngle + camAngle) * Math.PI) / 180;
  const rifleScreenRelY = -Math.cos(aimTotalRad);
  const recoilY = player.recoil * 2.5;

  if (rifleScreenRelY < 0) {
    drawStack(
      ctx,
      weaponSlices,
      screenX,
      screenY,
      player.aimAngle,
      camAngle,
      SPRITE_SCALE,
      torsoStartZ + spacingPx,
      spacingPx,
      0,
      recoilY,
    );
    drawStack(
      ctx,
      models.hero.torso,
      screenX,
      screenY,
      player.aimAngle,
      camAngle,
      SPRITE_SCALE,
      torsoStartZ,
      spacingPx,
    );
  } else {
    drawStack(
      ctx,
      models.hero.torso,
      screenX,
      screenY,
      player.aimAngle,
      camAngle,
      SPRITE_SCALE,
      torsoStartZ,
      spacingPx,
    );
    drawStack(
      ctx,
      weaponSlices,
      screenX,
      screenY,
      player.aimAngle,
      camAngle,
      SPRITE_SCALE,
      torsoStartZ + spacingPx,
      spacingPx,
      0,
      recoilY,
    );
  }
}

/**
 * TRON "REZ-In" upright screen-space vertical materialization beam (camera-angle invariant):
 * - 0%..80%: neon wireframe/scanline beam + converging energy rings (entity ghosted inside).
 * - 80%..100%: rapidly brightens into a solid, fully opaque white/neon flash silhouette.
 */
function drawRezInBeam(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  radius: number,
  heightPx: number,
  progress: number,
  color: string,
  elapsedTime: number,
): void {
  const clamped = Math.max(0, Math.min(1, progress));
  const phase = rezFlashPhase(clamped);
  const scanY = screenY - Math.min(1, clamped / 0.8) * heightPx;
  ctx.save();

  // Stage 1 (and fading behind Stage 2): Upright screen-space vertical neon wireframe beam
  if (phase.beamAlpha > 0) {
    ctx.fillStyle = color;
    ctx.globalAlpha = 0.16 * phase.beamAlpha;
    ctx.fillRect(screenX - radius, screenY - heightPx, radius * 2, heightPx);

    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.6 * phase.beamAlpha;
    ctx.lineWidth = 1;
    const gridStep = Math.max(6, radius * 0.5);
    for (let gx = -radius; gx <= radius; gx += gridStep) {
      ctx.beginPath();
      ctx.moveTo(screenX + gx, screenY - heightPx);
      ctx.lineTo(screenX + gx, screenY);
      ctx.stroke();
    }

    // Converging horizontal energy rings
    ctx.shadowColor = color;
    ctx.shadowBlur = 14;
    for (let r = 0; r < 2; r++) {
      const ringPhase = (clamped * 2.5 + r * 0.5) % 1;
      const ringScale = 1.65 - ringPhase * 0.65;
      ctx.globalAlpha = (0.35 + ringPhase * 0.55) * phase.beamAlpha;
      ctx.strokeStyle = r === 0 ? '#ffffff' : color;
      ctx.lineWidth = r === 0 ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.ellipse(
        screenX,
        scanY + r * 8,
        radius * ringScale,
        Math.max(4, radius * 0.35 * ringScale),
        0,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
    }

    // Digital rez sparks along the scan ring
    ctx.globalAlpha = 0.9 * phase.beamAlpha;
    ctx.fillStyle = color;
    for (let s = 0; s < 5; s++) {
      const a = elapsedTime * 14 + s * 1.25;
      const sx = screenX + Math.cos(a) * radius * 0.95;
      const sy = scanY + Math.sin(a * 1.7) * 5;
      ctx.fillRect(sx - 1.5, sy - 1.5, 3, 3);
    }
  }

  // Stage 2 (80%..100%): Solid, fully opaque white/neon flash silhouette covering footprint
  if (phase.flashAlpha > 0) {
    const silW = radius * 1.9;
    const silH = heightPx * 0.92;
    ctx.shadowColor = color;
    ctx.shadowBlur = 24;

    // Outer neon flash shell
    ctx.globalAlpha = phase.flashAlpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.ellipse(
      screenX,
      screenY - silH * 0.45,
      silW * 0.58,
      silH * 0.54,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();

    // Solid opaque white core silhouette
    ctx.globalAlpha = Math.min(1, phase.flashAlpha * 1.05);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.ellipse(
      screenX,
      screenY - silH * 0.45,
      silW * 0.44,
      silH * 0.46,
      0,
      0,
      Math.PI * 2,
    );
    ctx.fill();
  }

  ctx.restore();
}

/**
 * Milestone 4.12: Brief 0.15s fading flash halo immediately after solid materialization.
 */
function drawPostRezHalo(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  radius: number,
  heightPx: number,
  haloTimer: number,
  color: string,
): void {
  const elapsed = Math.max(0, REZ_POST_HALO_SEC - haloTimer);
  const phase = rezFlashPhase(1.0, elapsed);
  if (phase.haloAlpha <= 0) return;

  const expand = 1 + (1 - phase.haloAlpha) * 0.45;
  ctx.save();
  ctx.globalAlpha = phase.haloAlpha * 0.85;
  ctx.shadowColor = color;
  ctx.shadowBlur = 18;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 3 * phase.haloAlpha + 1;
  ctx.beginPath();
  ctx.ellipse(
    screenX,
    screenY - heightPx * 0.4,
    radius * expand,
    heightPx * 0.45 * expand,
    0,
    0,
    Math.PI * 2,
  );
  ctx.stroke();
  ctx.restore();
}

/**
 * Glowing weapon/eye muzzle flash for enemies & bosses when `fireAnimTimer > 0`.
 */
function drawFiringFlash(
  ctx: CanvasRenderingContext2D,
  screenX: number,
  screenY: number,
  worldAngleDeg: number,
  camAngleDeg: number,
  offsetDist: number,
  liftY: number,
  color: string,
  intensity: number,
): void {
  const rad = ((worldAngleDeg + camAngleDeg) * Math.PI) / 180;
  // Approach B local UP (-Y, 0°) is forward: sin(rad), -cos(rad)
  const fx = screenX + Math.sin(rad) * offsetDist;
  const fy = screenY - liftY - Math.cos(rad) * offsetDist;
  const r = 6 + intensity * 10;
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 16;
  ctx.fillStyle = color;
  ctx.globalAlpha = Math.min(1, 0.55 + intensity * 0.45);
  ctx.beginPath();
  ctx.arc(fx, fy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(fx, fy, r * 0.45, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBoss(
  ctx: CanvasRenderingContext2D,
  boss: BossState,
  models: ModelSet,
  screenX: number,
  screenY: number,
  camera: CameraState,
  spacingPx: number,
  zScale: number,
  elapsedTime: number,
  project: (wx: number, wy: number) => { x: number; y: number },
): void {
  const camAngle = camera.angleDeg;
  const zLift = boss.z * zScale;
  const rezzing = (boss.rezTimer ?? 0) > 0;
  const rezProg = rezzing
    ? 1 - (boss.rezTimer ?? 0) / Math.max(0.01, boss.rezDuration ?? 1.0)
    : 1;
  const bossHeightPx = 150;

  // Ground shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(screenX, screenY + 8, boss.radius * 0.95, boss.radius * 0.48, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.save();
  const bossRezPhase = rezzing ? rezFlashPhase(rezProg) : null;
  const hitFlashing = boss.hitFlash > 0 && !rezzing;
  const isShieldHit = boss.hitFlashKind === 'shield';
  if (rezzing && bossRezPhase) {
    // 0%..80%: ghosted inside rising scanline clip; 80%..100%: hidden under opaque flash silhouette
    if (bossRezPhase.entityAlpha <= 0) {
      ctx.globalAlpha = 0;
    } else {
      ctx.globalAlpha = bossRezPhase.entityAlpha;
      const revealH = Math.max(2, bossHeightPx * Math.min(1, rezProg / 0.8));
      ctx.beginPath();
      ctx.rect(
        screenX - boss.radius * 2.5,
        screenY + 30 - revealH,
        boss.radius * 5,
        revealH + 40,
      );
      ctx.clip();
    }
  } else if (hitFlashing) {
    // Milestone 4.13: Crisp bright-white (core) or electric cyan/amber (shield) flash pass
    ctx.filter = isShieldHit
      ? 'brightness(2.8) contrast(1.3) saturate(2.0)'
      : 'brightness(3.5) contrast(1.4)';
  }

  if (boss.kind === 'maximilian') {
    const scale = 4.8;
    drawStack(
      ctx,
      models.maximilian.body,
      screenX,
      screenY,
      boss.angle,
      camAngle,
      scale,
      zLift,
      spacingPx * 1.5,
    );
    drawStack(
      ctx,
      models.maximilian.blades,
      screenX,
      screenY,
      boss.bladeAngle,
      camAngle,
      scale * 1.15,
      zLift + 6 * spacingPx,
      spacingPx * 1.2,
    );
    // Whirling blade danger halo
    ctx.save();
    ctx.strokeStyle =
      boss.phase === 'whirlwind'
        ? 'rgba(255, 42, 85, 0.75)'
        : 'rgba(239, 68, 68, 0.35)';
    ctx.lineWidth = boss.phase === 'whirlwind' ? 3 : 1.5;
    ctx.beginPath();
    ctx.arc(screenX, screenY - zLift - 12, boss.bladeRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    if (boss.phase !== 'recover' && (boss.shieldHp ?? 0) > 0) {
      const shieldFrac = (boss.shieldHp ?? 0) / Math.max(1, boss.shieldMaxHp ?? 1);
      const shimmer = 0.5 + 0.5 * Math.sin(elapsedTime * 9);
      ctx.save();
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 18;
      ctx.strokeStyle = `rgba(244, 63, 94, ${(0.45 + shieldFrac * 0.4 + shimmer * 0.1).toFixed(2)})`;
      ctx.lineWidth = 3 + shieldFrac * 2;
      ctx.beginPath();
      ctx.arc(screenX, screenY - zLift - 12, boss.bladeRadius + 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    if (boss.phase === 'recover') {
      const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * 16);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 240, 120, ${(0.45 + pulse * 0.5).toFixed(2)})`;
      ctx.lineWidth = 2 + pulse * 2;
      ctx.beginPath();
      ctx.arc(screenX, screenY - zLift - 18, 12 + pulse * 8, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = `rgba(254, 240, 138, ${(0.7 + pulse * 0.3).toFixed(2)})`;
      ctx.font = 'bold 12px ui-monospace, monospace';
      ctx.textAlign = 'center';
      ctx.fillText('VULNERABLE!', screenX, screenY - zLift - 52);
      ctx.restore();
    }

    // Milestone 4.14: Multi-layer orbiting ablative shield plates around Maximilian
    const plates = boss.ablativePlates ?? [];
    for (let i = 0; i < plates.length; i++) {
      const plate = plates[i];
      if (plate.hp <= 0) continue;
      const ps = project(plate.x, plate.y);
      const hpFrac = Math.max(0.2, plate.hp / Math.max(1, plate.maxHp));
      const plateScreenAngle = plate.angle + (camAngle * Math.PI) / 180;
      const baseColor = plate.layer % 2 === 0 ? '#22d3ee' : '#f43f5e';
      const activeColor = plate.hitFlash > 0 ? '#ffffff' : baseColor;
      ctx.save();
      ctx.translate(ps.x, ps.y - zLift - 12);
      ctx.rotate(plateScreenAngle + Math.PI * 0.5);
      ctx.shadowColor = activeColor;
      ctx.shadowBlur = plate.hitFlash > 0 ? 18 : 10;
      ctx.fillStyle = plate.hitFlash > 0 ? '#ffffff' : `rgba(15, 23, 42, 0.9)`;
      ctx.fillRect(-13, -5, 26, 10);
      ctx.strokeStyle = activeColor;
      ctx.lineWidth = plate.hitFlash > 0 ? 3 : 2;
      ctx.globalAlpha = 0.45 + hpFrac * 0.55;
      ctx.strokeRect(-13, -5, 26, 10);
      ctx.restore();
    }
  } else if (boss.kind === 'recogniser') {
    // Milestone 4.11: 2-3x larger Recogniser with TWO distinct leg columns
    const scale = 5.0;
    const leftLeg = boss.parts.find((p) => p.id === 'left_leg');
    const rightLeg = boss.parts.find((p) => p.id === 'right_leg');
    const headCore = boss.parts.find((p) => p.id === 'head_core');

    // Left leg [0] and Right leg [1]
    if (!leftLeg || !leftLeg.destroyed) {
      drawStack(
        ctx,
        models.recogniser.legs[0],
        screenX,
        screenY,
        boss.angle,
        camAngle,
        scale,
        zLift,
        spacingPx * 1.6,
      );
    } else {
      // Sparking destroyed left-leg socket
      ctx.save();
      ctx.fillStyle = '#f97316';
      ctx.fillRect(screenX - 36 + Math.sin(elapsedTime * 35) * 4, screenY - zLift - 12, 6, 6);
      ctx.restore();
    }
    if (!rightLeg || !rightLeg.destroyed) {
      drawStack(
        ctx,
        models.recogniser.legs[1],
        screenX,
        screenY,
        boss.angle,
        camAngle,
        scale,
        zLift,
        spacingPx * 1.6,
      );
    } else {
      // Sparking destroyed right-leg socket
      ctx.save();
      ctx.fillStyle = '#f97316';
      ctx.fillRect(screenX + 30 + Math.cos(elapsedTime * 35) * 4, screenY - zLift - 12, 6, 6);
      ctx.restore();
    }

    drawStack(
      ctx,
      models.recogniser.head,
      screenX,
      screenY,
      boss.angle,
      camAngle,
      scale,
      zLift + 9 * spacingPx * 1.6,
      spacingPx * 1.6,
    );

    if (headCore && headCore.vulnerable && !headCore.destroyed) {
      ctx.save();
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        screenX,
        screenY - zLift - 58,
        24 + Math.sin(elapsedTime * 14) * 4,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    }
  } else if (boss.kind === 'abb') {
    const scale = 4.8;
    drawStack(
      ctx,
      models.abb,
      screenX,
      screenY,
      boss.angle,
      camAngle,
      scale,
      zLift,
      spacingPx * 1.5,
    );
  } else if (boss.kind === 'skullhead') {
    const scale = 4.8;
    drawStack(
      ctx,
      models.skullhead.body,
      screenX,
      screenY,
      boss.angle,
      camAngle,
      scale,
      zLift,
      spacingPx * 1.5,
    );
    // Tiny spinning propeller hat perched cleanly on the very top of the dome
    ctx.save();
    ctx.globalAlpha = 0.95;
    drawStack(
      ctx,
      models.skullhead.halo,
      screenX,
      screenY,
      boss.bladeAngle,
      camAngle,
      scale * 0.85,
      zLift + models.skullhead.body.length * spacingPx * 1.5,
      spacingPx,
    );
    ctx.restore();

    // Milestone 4.14: Wall-clipped twin eye-laser telegraph lines & active beams with sizzle flare
    const laserHits = boss.skullLaserHits;
    const sweepRad = boss.laserSweepAngle ?? 0;
    const camRad = (camAngle * Math.PI) / 180;
    const screenRad = sweepRad + camRad;
    const dirX = Math.cos(screenRad);
    const dirY = Math.sin(screenRad);
    const perpX = -dirY;
    const perpY = dirX;
    if ((boss.laserTelegraphTimer ?? 0) > 0) {
      ctx.save();
      ctx.strokeStyle = 'rgba(250, 204, 21, 0.75)';
      ctx.setLineDash([6, 6]);
      ctx.lineWidth = 2;
      if (laserHits && laserHits.length > 0) {
        for (let i = 0; i < laserHits.length; i++) {
          const h = laserHits[i];
          const p0 = project(h.startX, h.startY);
          const p1 = project(h.endX, h.endY);
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y - zLift - 26);
          ctx.lineTo(p1.x, p1.y - 18);
          ctx.stroke();
        }
      } else {
        for (const side of [-1, 1]) {
          const ox = screenX + perpX * side * 18;
          const oy = screenY - zLift - 34 + perpY * side * 18;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(ox + dirX * 520, oy + dirY * 520);
          ctx.stroke();
        }
      }
      ctx.restore();
    } else if ((boss.laserActiveTimer ?? 0) > 0) {
      ctx.save();
      ctx.shadowColor = '#f59e0b';
      ctx.shadowBlur = 18;
      if (laserHits && laserHits.length > 0) {
        for (let i = 0; i < laserHits.length; i++) {
          const h = laserHits[i];
          const p0 = project(h.startX, h.startY);
          const p1 = project(h.endX, h.endY);
          const y0 = p0.y - zLift - 26;
          const y1 = p1.y - 18;
          ctx.strokeStyle = '#f97316';
          ctx.lineWidth = 7;
          ctx.beginPath();
          ctx.moveTo(p0.x, y0);
          ctx.lineTo(p1.x, y1);
          ctx.stroke();

          ctx.strokeStyle = '#fef08a';
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.moveTo(p0.x, y0);
          ctx.lineTo(p1.x, y1);
          ctx.stroke();

          // Molten sizzle impact flare at exact wall/door or hero contact point
          if (h.hitWall || h.hitPlayer) {
            const flareR = 7 + Math.sin(elapsedTime * 55 + i * 2) * 3;
            ctx.fillStyle = '#fb923c';
            ctx.beginPath();
            ctx.arc(p1.x, y1, flareR + 4, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#ffffff';
            ctx.beginPath();
            ctx.arc(p1.x, y1, flareR * 0.55, 0, Math.PI * 2);
            ctx.fill();
          }
        }
      } else {
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 6;
        for (const side of [-1, 1]) {
          const ox = screenX + perpX * side * 18;
          const oy = screenY - zLift - 34 + perpY * side * 18;
          ctx.beginPath();
          ctx.moveTo(ox, oy);
          ctx.lineTo(ox + dirX * 540, oy + dirY * 540);
          ctx.stroke();
        }
      }
      ctx.restore();
    }
  } else if (boss.kind === 'bug_hive') {
    const scale = 4.8;
    drawStack(
      ctx,
      models.bugHive.hive,
      screenX,
      screenY,
      boss.angle,
      camAngle,
      scale,
      zLift,
      spacingPx * 1.5,
    );
    // Draw orbiting & swooping Flying Bug Bots
    const bugs = boss.orbitingBugs ?? [];
    for (let i = 0; i < bugs.length; i++) {
      const bug = bugs[i];
      if (bug.hp <= 0) continue;
      const bs = project(bug.x, bug.y);
      const bugDeg = (bug.angle * 180) / Math.PI + 90;
      drawStack(
        ctx,
        models.bugHive.bugBot,
        bs.x,
        bs.y,
        bugDeg,
        camAngle,
        2.2,
        16 * zScale,
        spacingPx,
      );
    }
  } else if (boss.kind === 'brainbot') {
    const scale = 4.8;
    drawStack(
      ctx,
      models.brainbot,
      screenX,
      screenY,
      boss.angle,
      camAngle,
      scale,
      zLift,
      spacingPx * 1.5,
    );
    // Translucent cyan neural glass dome shimmer
    ctx.save();
    ctx.strokeStyle = 'rgba(103, 232, 249, 0.55)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screenX, screenY - zLift - 34, 34, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  } else {
    // Evil Otto (scaled up 2x+)
    const variant = boss.ottoVariant ?? 'classic';
    const slices = models.evilOtto[variant] ?? models.evilOtto.classic;
    const scale = 4.5 + (boss.radius - 26) * 0.06;
    if (boss.reconstructing) {
      ctx.globalAlpha = 0.45 + 0.45 * Math.abs(Math.sin(elapsedTime * 18));
    }
    drawStack(
      ctx,
      slices,
      screenX,
      screenY,
      boss.angle,
      camAngle,
      scale,
      zLift,
      spacingPx * 1.5,
    );
    if (boss.reconstructing) {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([5, 5]);
      ctx.beginPath();
      ctx.arc(screenX, screenY - zLift - 18, boss.radius + 14, 0, Math.PI * 2);
      ctx.stroke();
    }
  }
  ctx.restore();

  // Milestone 4.13: Unmistakable boss hit-flash rim + silhouette pulse + radial sparks
  if (hitFlashing) {
    const flashAlpha = Math.max(0.25, Math.min(1, boss.hitFlash / 0.12));
    const rimPrimary = isShieldHit ? '#22d3ee' : '#ffffff';
    const rimAccent = isShieldHit ? '#fbbf24' : '#ff2a55';
    const centerY = screenY - zLift - 26;
    ctx.save();
    ctx.globalAlpha = flashAlpha * 0.42;
    ctx.fillStyle = rimPrimary;
    ctx.beginPath();
    ctx.ellipse(screenX, centerY, boss.radius * 0.92, boss.radius * 0.78, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = flashAlpha;
    ctx.shadowColor = rimAccent;
    ctx.shadowBlur = 22;
    ctx.strokeStyle = rimPrimary;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.ellipse(screenX, centerY, boss.radius * 1.05, boss.radius * 0.86, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Punchy radial hit-spark burst
    ctx.strokeStyle = rimAccent;
    ctx.lineWidth = 2.5;
    for (let s = 0; s < 8; s++) {
      const a = (s * Math.PI) / 4 + elapsedTime * 12;
      const r0 = boss.radius * 0.72;
      const r1 = boss.radius * (1.18 + flashAlpha * 0.25);
      ctx.beginPath();
      ctx.moveTo(screenX + Math.cos(a) * r0, centerY + Math.sin(a) * r0 * 0.78);
      ctx.lineTo(screenX + Math.cos(a) * r1, centerY + Math.sin(a) * r1 * 0.78);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Boss firing flash
  if ((boss.fireAnimTimer ?? 0) > 0 && !rezzing) {
    const intensity = (boss.fireAnimTimer ?? 0) / 0.22;
    drawFiringFlash(
      ctx,
      screenX,
      screenY,
      boss.angle,
      camAngle,
      boss.radius * 0.75,
      zLift + 26,
      boss.kind === 'brainbot' ? '#4ade80' : '#facc15',
      intensity,
    );
  }

  // Higher-sector multi-layer shield rings
  if ((boss.shieldLayers ?? 0) > 0 && !rezzing) {
    ctx.save();
    const layers = boss.shieldLayers ?? 0;
    for (let l = 0; l < layers; l++) {
      ctx.strokeStyle = l === layers - 1 ? '#22d3ee' : 'rgba(56, 189, 248, 0.45)';
      ctx.lineWidth = l === layers - 1 ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.arc(screenX, screenY - zLift - 20, boss.radius + 10 + l * 7, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Periodic Rampage Invulnerability pulsing golden/crimson aura
  if ((boss.rampageTimer ?? 0) > 0 && !rezzing) {
    const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * 18);
    ctx.save();
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 24;
    ctx.strokeStyle = pulse > 0.5 ? '#facc15' : '#ef4444';
    ctx.lineWidth = 4 + pulse * 3;
    ctx.beginPath();
    ctx.arc(screenX, screenY - zLift - 22, boss.radius + 18 + pulse * 6, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#fef08a';
    ctx.font = 'bold 12px ui-monospace, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('RAMPAGE — INVULNERABLE!', screenX, screenY - zLift - boss.radius - 48);
    ctx.restore();
  }

  // TRON Rez-In beam + opaque flash overlay for bosses, plus 0.15s post-rez halo
  if (rezzing) {
    drawRezInBeam(ctx, screenX, screenY, boss.radius * 1.15, bossHeightPx, rezProg, '#22d3ee', elapsedTime);
  } else if ((boss.rezHaloTimer ?? 0) > 0) {
    drawPostRezHalo(ctx, screenX, screenY, boss.radius * 1.15, bossHeightPx, boss.rezHaloTimer ?? 0, '#22d3ee');
  }
}

function drawProjectile(
  ctx: CanvasRenderingContext2D,
  p: Projectile,
  screenX: number,
  screenY: number,
  zScale: number,
  camAngleDeg = 0,
  elapsedTime = 0,
): void {
  const sy = screenY - p.z * zScale;
  const camRad = (camAngleDeg * Math.PI) / 180;
  ctx.save();
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 10;

  if (p.kind === 'flame') {
    // Milestone 4.14: Animated flickering fireball (white-hot core -> yellow -> orange -> crimson corona)
    const flicker = 0.85 + 0.3 * Math.sin(elapsedTime * 48 + p.x * 0.2);
    const r = Math.max(7, p.radius) * flicker;
    const heading = Math.atan2(p.vy, p.vx) + camRad;
    ctx.translate(screenX, sy);
    ctx.rotate(heading);

    // Trailing embers
    ctx.shadowBlur = 6;
    ctx.shadowColor = '#f97316';
    for (let e = 0; e < 3; e++) {
      const ex = -r * (1.1 + e * 0.55);
      const ey = Math.sin(elapsedTime * 35 + e * 2.4 + p.y) * (r * 0.45);
      ctx.fillStyle = e === 0 ? '#facc15' : '#ea580c';
      ctx.fillRect(ex - 1.5, ey - 1.5, 3, 3);
    }

    // Jagged crimson outer flame corona
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    const spikes = 9;
    for (let k = 0; k < spikes * 2; k++) {
      const a = (k * Math.PI) / spikes;
      const rad = k % 2 === 0 ? r * (1.18 + 0.2 * Math.sin(elapsedTime * 60 + k)) : r * 0.72;
      const px = Math.cos(a) * rad - (k % 2 === 0 ? 1.5 : 0);
      const py = Math.sin(a) * rad;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Bright orange mid-flame
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.72, 0, Math.PI * 2);
    ctx.fill();

    // Bright yellow inner flame
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(r * 0.1, 0, r * 0.48, 0, Math.PI * 2);
    ctx.fill();

    // White-hot core
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(r * 0.15, 0, r * 0.25, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === 'sawblade') {
    // Milestone 4.14: Maximilian's spinning voxel sawblade
    const spinRad = ((p.spinAngle ?? elapsedTime * 900) * Math.PI) / 180;
    const r = Math.max(10, p.radius);
    ctx.translate(screenX, sy);
    ctx.rotate(spinRad);
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    const teeth = 8;
    for (let k = 0; k < teeth * 2; k++) {
      const a = (k * Math.PI) / teeth;
      const rad = k % 2 === 0 ? r : r * 0.62;
      const px = Math.cos(a) * rad;
      const py = Math.sin(a) * rad;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.32, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === 'homing_drone' && p.icbm) {
    // Milestone 4.14: ABB ICBM-style guided rocket rotated along velocity heading
    const heading = Math.atan2(p.vy, p.vx) + camRad;
    const thrust = 0.8 + 0.4 * Math.sin(elapsedTime * 55 + p.x);
    ctx.translate(screenX, sy);
    ctx.rotate(heading);

    // Trailing exhaust smoke puffs behind tail
    ctx.shadowBlur = 0;
    for (let s = 0; s < 3; s++) {
      ctx.fillStyle = `rgba(148, 163, 184, ${(0.5 - s * 0.14).toFixed(2)})`;
      ctx.beginPath();
      ctx.arc(-18 - s * 7, Math.sin(elapsedTime * 22 + s * 2) * 2.5, 3.5 + s * 1.4, 0, Math.PI * 2);
      ctx.fill();
    }

    // Bright orange-yellow thruster flame
    ctx.shadowColor = '#f97316';
    ctx.shadowBlur = 14;
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(-11, -3.5);
    ctx.lineTo(-11 - 12 * thrust, 0);
    ctx.lineTo(-11, 3.5);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.moveTo(-11, -2);
    ctx.lineTo(-11 - 7 * thrust, 0);
    ctx.lineTo(-11, 2);
    ctx.closePath();
    ctx.fill();

    // Swept tail fins
    ctx.shadowBlur = 4;
    ctx.fillStyle = '#dc2626';
    ctx.beginPath();
    ctx.moveTo(-11, -4);
    ctx.lineTo(-14, -9);
    ctx.lineTo(-6, -4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-11, 4);
    ctx.lineTo(-14, 9);
    ctx.lineTo(-6, 4);
    ctx.closePath();
    ctx.fill();

    // Elongated light-grey/white ICBM fuselage
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(-11, -4, 18, 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-10, -2, 16, 2.5);

    // Red warhead nosecone
    ctx.fillStyle = '#ef4444';
    ctx.beginPath();
    ctx.moveTo(7, -4);
    ctx.lineTo(15, 0);
    ctx.lineTo(7, 4);
    ctx.closePath();
    ctx.fill();
  } else if (p.kind === 'beam_segment') {
    const angle = Math.atan2(p.vy, p.vx) + camRad;
    ctx.translate(screenX, sy);
    ctx.rotate(angle);
    ctx.fillRect(-p.radius * 2, -p.radius * 0.55, p.radius * 4, p.radius * 1.1);
  } else if (p.kind === 'electric_wave') {
    // Crackling ground-hugging brain-electricity arc
    const angle = Math.atan2(p.vy, p.vx) + camRad;
    ctx.translate(screenX, sy);
    ctx.rotate(angle);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-p.radius * 1.6, 0);
    ctx.lineTo(-p.radius * 0.6, -6);
    ctx.lineTo(0, 5);
    ctx.lineTo(p.radius * 0.7, -5);
    ctx.lineTo(p.radius * 1.6, 0);
    ctx.stroke();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.2;
    ctx.stroke();
  } else if (p.kind === 'lightning') {
    // Milestone 4.15: Travel-aligned jagged crackling electric arc spear
    const headingRad = (projectileHeadingDeg(p) * Math.PI) / 180 + camRad;
    const len = Math.max(22, p.radius * 3.4);
    const jitterA = Math.sin(elapsedTime * 68 + p.x * 0.31) * 4.5;
    const jitterB = Math.cos(elapsedTime * 74 + p.y * 0.27) * 5.0;
    const jitterC = Math.sin(elapsedTime * 82 + p.x * 0.19 - p.y * 0.13) * 3.5;

    ctx.translate(screenX, sy);
    ctx.rotate(headingRad);

    // Outer cyan/blue electric corona
    ctx.shadowColor = p.color || '#67e8f9';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = p.color || '#67e8f9';
    ctx.lineWidth = 4.2;
    ctx.lineJoin = 'miter';
    ctx.beginPath();
    ctx.moveTo(-len * 0.65, 0);
    ctx.lineTo(-len * 0.3, jitterA);
    ctx.lineTo(0, -jitterB);
    ctx.lineTo(len * 0.28, jitterC);
    ctx.lineTo(len * 0.55, 0);
    ctx.stroke();

    // Bright white-hot crackling core spear
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.8;
    ctx.beginPath();
    ctx.moveTo(-len * 0.62, 0);
    ctx.lineTo(-len * 0.3, jitterA * 0.7);
    ctx.lineTo(0, -jitterB * 0.7);
    ctx.lineTo(len * 0.28, jitterC * 0.7);
    ctx.lineTo(len * 0.62, 0);
    ctx.stroke();

    // Crackling side micro-arcs off the spearhead
    ctx.strokeStyle = p.color || '#38bdf8';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(len * 0.18, 0);
    ctx.lineTo(len * 0.36, -6.5);
    ctx.moveTo(len * 0.12, 0);
    ctx.lineTo(len * 0.32, 6.5);
    ctx.stroke();

    // Glowing spearhead tip
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(len * 0.55, 0, 2.6, 0, Math.PI * 2);
    ctx.fill();
  } else if (p.kind === 'mine') {
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(screenX, sy, p.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.arc(screenX, sy, Math.max(3, p.radius), 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Distinct, instantly recognizable icons per pickup kind (Milestone 4). */
function drawPickupIcon(
  ctx: CanvasRenderingContext2D,
  pickup: PowerUpPickup,
  color: string,
): void {
  const box = (x: number, y: number, w: number, h: number) => ctx.fillRect(x, y, w, h);
  const line = (x1: number, y1: number, x2: number, y2: number) => {
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
  };
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.2;

  if (pickup.kind === 'weapon') {
    switch (pickup.weaponType) {
      case 'spread':
        line(-8, 6, -2, -6); line(0, 7, 0, -8); line(8, 6, 2, -6);
        box(-2, 6, 4, 4);
        break;
      case 'machine_gun':
        box(-3, -9, 2, 14); box(1, -9, 2, 14); box(-4, 5, 8, 4);
        ctx.strokeRect(-5, -2, 10, 5);
        break;
      case 'shotgun':
        box(-4, -9, 3, 14); box(1, -9, 3, 14); box(-4, 4, 8, 3);
        break;
      case 'beam':
      case 'wide_beam':
        box(-2, -8, 4, 16);
        box(pickup.weaponType === 'wide_beam' ? -7 : -4, 4, pickup.weaponType === 'wide_beam' ? 14 : 8, 3);
        break;
      case 'flamethrower':
        box(-3, -3, 6, 10);
        ctx.beginPath(); ctx.moveTo(-2, -4); ctx.lineTo(0, -11); ctx.lineTo(2, -4); ctx.fill();
        break;
      case 'bouncing_lightning':
        ctx.beginPath();
        ctx.moveTo(2, -10); ctx.lineTo(-4, -1); ctx.lineTo(1, -1);
        ctx.lineTo(-2, 10); ctx.lineTo(5, -1); ctx.lineTo(0, -1);
        ctx.closePath(); ctx.fill();
        break;
      case 'grenade':
        ctx.beginPath(); ctx.arc(0, 2, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        line(2, -4, 5, -8);
        break;
      case 'mine':
        ctx.beginPath(); ctx.arc(0, 0, 6, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
        for (let a = 0; a < 8; a++) {
          const r = (a * Math.PI) / 4;
          line(Math.cos(r) * 6, Math.sin(r) * 6, Math.cos(r) * 10, Math.sin(r) * 10);
        }
        break;
      default: // pulse_rifle
        box(-2, -10, 4, 15); box(-5, 4, 10, 4); box(-1, -13, 2, 3);
        break;
    }
    return;
  }

  if (pickup.kind === 'modifier') {
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(8, 0); ctx.lineTo(0, 9); ctx.lineTo(-8, 0);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    return;
  }
  if (pickup.kind === 'orbital') {
    ctx.beginPath(); ctx.arc(0, 0, 7, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(0, 0, 3, 0, Math.PI * 2); ctx.fill();
    return;
  }
  if (pickup.kind === 'shield_boost') {
    ctx.beginPath();
    ctx.moveTo(0, -9); ctx.lineTo(8, -5); ctx.lineTo(8, 3);
    ctx.lineTo(0, 9); ctx.lineTo(-8, 3); ctx.lineTo(-8, -5);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    return;
  }
  // extra_life: plus / 1-UP
  box(-2, -8, 4, 16); box(-8, -2, 16, 4);
}

function drawPickup(
  ctx: CanvasRenderingContext2D,
  pickup: PowerUpPickup,
  screenX: number,
  screenY: number,
  zScale: number,
  elapsedTime: number,
  prompt?: string,
): void {
  const bob = Math.sin(elapsedTime * 5 + pickup.x * 0.1) * 4;
  const sy = screenY - (pickup.z + 6 + bob) * zScale;
  const color =
    pickup.kind === 'weapon'
      ? '#38bdf8'
      : pickup.kind === 'modifier'
        ? '#a855f7'
        : pickup.kind === 'orbital'
          ? '#22d3ee'
          : pickup.kind === 'extra_life'
            ? '#4ade80'
            : '#facc15';

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.translate(screenX, sy);
  drawPickupIcon(ctx, pickup, color);

  // Crisp hovering short label so players always know what they grabbed.
  ctx.shadowBlur = 0;
  ctx.font = 'bold 9px ui-monospace, monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#05070d';
  const label = pickupLabel(pickup);
  const labelW = ctx.measureText(label).width;
  ctx.fillRect(-labelW / 2 - 3, 14, labelW + 6, 12);
  ctx.fillStyle = color;
  ctx.fillText(label, 0, 23);

  if (prompt) {
    ctx.font = 'bold 10px ui-monospace, monospace';
    const promptW = ctx.measureText(prompt).width;
    ctx.fillStyle = '#05070d';
    ctx.fillRect(-promptW / 2 - 4, -28, promptW + 8, 14);
    ctx.fillStyle = '#facc15';
    ctx.fillText(prompt, 0, -18);
  }
  ctx.restore();
}

export function createRenderer(options: RendererOptions = {}): GameRenderer {
  const models = options.models ?? buildAllModels();
  const cache =
    options.cache ??
    (() => {
      const baked = new SpriteStackCache();
      bakeSwarmCaches(baked, models, SPRITE_SCALE, BASE_LAYER_SPACING);
      return baked;
    })();

  const circuitBg = options.circuitBg ?? new CircuitBackground();
  const vfx = options.vfx ?? new VfxSystem();
  const sound = options.sound ?? new SoundEngine();
  const voice = options.voice ?? new VoiceTauntEngine();
  let audioInitialized = false;

  const renderQueue: RenderQueueItem[] = [];

  return {
    cache,
    models,
    circuitBg,
    vfx,
    sound,
    voice,

    async initAudio(): Promise<void> {
      if (audioInitialized) return;
      audioInitialized = true;
      await Promise.all([sound.init(), voice.init()]);
    },

    dispatchEvents(events: GameEvent[], camera: CameraState): void {
      for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        vfx.handleEvent(ev);
        sound.handleEvent(ev);
        voice.handleEvent(ev);
        if (ev.type === 'camera_shake') {
          triggerCameraShake(camera, ev.magnitude, ev.duration);
        }
      }
    },

    update(dt: number, state: GameState): void {
      circuitBg.update(dt);
      vfx.update(dt);

      if (state.player.dodgeTimer > 0) {
        vfx.afterimage(
          state.player.x,
          state.player.y,
          (state.player.legAngle * Math.PI) / 180,
          '#22d3ee',
        );
      }
      // ABB dodge-dash afterimage trail
      if (state.boss && state.boss.kind === 'abb' && (state.boss.dashTimer ?? 0) > 0) {
        vfx.afterimage(
          state.boss.x,
          state.boss.y,
          (state.boss.angle * Math.PI) / 180,
          '#f97316',
        );
      }
      if (state.player.muzzleFlash > 0.05) {
        const aimRad = (state.player.aimAngle * Math.PI) / 180;
        vfx.muzzleFlash(
          state.player.x + Math.sin(aimRad) * 24,
          state.player.y - Math.cos(aimRad) * 24,
          aimRad,
        );
      }
    },

    render(
      ctx: CanvasRenderingContext2D,
      state: GameState,
      width: number,
      height: number,
    ): void {
      const camera = state.camera;
      const camAngle = camera.angleDeg;
      const spacingPx = camera.layerSpacing * camera.tiltScale * PITCH_Z_MULTIPLIER;
      const zScale = spacingPx * 0.5;
      const project = (wx: number, wy: number) =>
        worldToScreen(wx, wy, camera, width, height);

      ctx.imageSmoothingEnabled = false;

      // 1. Parallax cyber-circuit PCB background
      circuitBg.render(ctx, camera, width, height);

      // Milestone 4.15: Title Screen renders over live animated parallax circuit board only
      if (state.phase === 'title') {
        vfx.renderCrt(ctx, width, height);
        return;
      }

      const shake = getCameraShakeOffset(camera);
      const tr = state.roomTransition && state.roomTransition.active ? state.roomTransition : null;
      const trEase = tr ? 1 - Math.pow(1 - tr.progress, 3) : 1;

      // Milestone 4.13: Outgoing room push-slides out & fades during door-walk transition
      if (tr) {
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - trEase);
        ctx.translate(tr.slideX * width * trEase, tr.slideY * height * trEase);
        ctx.translate(width * 0.5 + shake.x, height * 0.5 + shake.y);
        ctx.rotate((camAngle * Math.PI) / 180);
        ctx.translate(-tr.outgoingCameraX, -tr.outgoingCameraY);
        renderIslandWorld(ctx, tr.outgoingIsland, null, [], state.elapsedTime, true);
        ctx.restore();
      }

      // Incoming / active room transform (slides in & fades in during transition)
      ctx.save();
      if (tr) {
        ctx.globalAlpha = Math.min(1, 0.2 + trEase * 0.8);
        ctx.translate(
          -tr.slideX * width * (1 - trEase),
          -tr.slideY * height * (1 - trEase),
        );
      }

      // 2. Floating platform island in camera-rotated world coordinates
      ctx.save();
      ctx.translate(width * 0.5 + shake.x, height * 0.5 + shake.y);
      ctx.rotate((camAngle * Math.PI) / 180);
      ctx.translate(-camera.x, -camera.y);
      renderIslandWorld(
        ctx,
        state.island,
        state.boss,
        [...state.playerProjectiles, ...state.enemyProjectiles, ...state.bossProjectiles],
        state.elapsedTime,
        state.bossDefeated,
      );
      ctx.restore();

      // 3. Build depth-sorted renderQueue by screen Y
      renderQueue.length = 0;

      // True 3D extruded walls & sliding doors subdivided into ~56px Approach-B
      // chunks so every chunk projects & depth-sorts accurately at any Q/E angle.
      const wallOutline = state.island.outline === 'red' ? '#ef4444' : '#22d3ee';
      let wallChunkIdx = 0;
      for (let i = 0; i < state.island.walls.length; i++) {
        const wall = state.island.walls[i];
        const chunks = chunkWallForDepthSort(wall, project);
        for (let k = 0; k < chunks.length; k++) {
          const chunk = chunks[k];
          const idx = wallChunkIdx++;
          const segWall: WallSegment = {
            id: `${wall.id}_c${k}`,
            x: chunk.x,
            y: chunk.y,
            w: chunk.w,
            h: chunk.h,
            heightZ: chunk.heightZ,
            electrified: chunk.electrified,
            destructible: chunk.destructible,
          };
          renderQueue.push({
            sortY: chunk.sortY,
            draw: (c) =>
              drawWall3D(
                c,
                segWall,
                chunk.screenX,
                chunk.screenY,
                camAngle,
                zScale,
                state.elapsedTime,
                idx,
                wallOutline,
              ),
          });
        }
      }

      // 3D stacked sliding door energy-gate chunks
      for (let i = 0; i < state.island.doors.length; i++) {
        const door = state.island.doors[i];
        const doorChunks = chunkSlidingDoorForDepthSort(door, project);
        for (let k = 0; k < doorChunks.length; k++) {
          const chunk = doorChunks[k];
          renderQueue.push({
            sortY: chunk.sortY,
            draw: (c) =>
              drawDoor3D(c, chunk, camAngle, zScale, state.elapsedTime),
          });
        }
      }

      // Crates
      for (let i = 0; i < state.island.crates.length; i++) {
        const crate: DestructibleCrate = state.island.crates[i];
        if (crate.hp <= 0) continue;
        const s = project(crate.x, crate.y);
        renderQueue.push({
          sortY: s.y,
          draw: (c) => {
            cache.drawCached(c, 'crate', s.x, s.y, crate.angle, camAngle, 0);
            if (crate.hitFlash > 0) {
              c.save();
              c.strokeStyle = '#fef08a';
              c.lineWidth = 2;
              c.strokeRect(s.x - 16, s.y - 24, 32, 32);
              c.restore();
            }
          },
        });
      }

      // Enemies (200+ Enforcers + 50-100 Shooters/Grenadiers via SpriteStackCache)
      const playerScreen = project(state.player.x, state.player.y);
      for (let i = 0; i < state.enemies.length; i++) {
        const e: EnemyState = state.enemies[i];
        if (e.hp <= 0) continue;
        const s = project(e.x, e.y);
        // Cull far off-screen enemies
        if (s.x < -80 || s.x > width + 80 || s.y < -80 || s.y > height + 80) {
          continue;
        }
        const frameCount = e.kind === 'enforcer_melee' ? 3 : 2;
        const frame = Math.floor(e.animFrame) % frameCount;
        const key = enemyCacheKey(e.kind, frame);
        renderQueue.push({
          sortY: s.y,
          draw: (c) => {
            const rezzing = (e.rezTimer ?? 0) > 0;
            const rezProg = rezzing
              ? 1 - (e.rezTimer ?? 0) / Math.max(0.01, e.rezDuration ?? 1.0)
              : 1;
            const firing = (e.fireAnimTimer ?? 0) > 0 && !rezzing;

            if ((e.kind === 'laser_shooter' || e.kind === 'v_bot_laser') && e.telegraphTimer > 0 && !rezzing) {
              c.save();
              c.strokeStyle =
                e.kind === 'v_bot_laser'
                  ? 'rgba(250, 204, 21, 0.78)'
                  : 'rgba(255, 42, 85, 0.75)';
              c.lineWidth = 1.5;
              c.beginPath();
              c.moveTo(s.x, s.y - 12);
              c.lineTo(playerScreen.x, playerScreen.y - 10);
              c.stroke();
              c.restore();
            }

            // Barrel recoil kickback when firing
            let drawX = s.x;
            let drawY = s.y;
            if (firing) {
              const kick = ((e.fireAnimTimer ?? 0) / 0.22) * 3.5;
              const rad = ((e.angle + camAngle) * Math.PI) / 180;
              drawX -= Math.sin(rad) * kick;
              drawY += Math.cos(rad) * kick;
            }

            const enemyRezColor =
              e.kind === 'v_bot_laser' || e.kind === 'grenadier' ? '#facc15' : '#22d3ee';
            const enemyRezPhase = rezzing ? rezFlashPhase(rezProg) : null;

            c.save();
            if (rezzing && enemyRezPhase) {
              if (enemyRezPhase.entityAlpha <= 0) {
                c.globalAlpha = 0;
              } else {
                c.globalAlpha = enemyRezPhase.entityAlpha;
                const spriteH = 56;
                const revealH = Math.max(2, spriteH * Math.min(1, rezProg / 0.8));
                c.beginPath();
                c.rect(s.x - 32, s.y + 12 - revealH, 64, revealH + 16);
                c.clip();
              }
            }
            cache.drawCached(c, key, drawX, drawY, e.angle, camAngle, e.z * zScale);
            c.restore();

            if (rezzing) {
              drawRezInBeam(
                c,
                s.x,
                s.y,
                e.radius + 4,
                56,
                rezProg,
                enemyRezColor,
                state.elapsedTime,
              );
            } else if ((e.rezHaloTimer ?? 0) > 0) {
              drawPostRezHalo(
                c,
                s.x,
                s.y,
                e.radius + 4,
                56,
                e.rezHaloTimer ?? 0,
                enemyRezColor,
              );
            }

            if (firing) {
              const intensity = (e.fireAnimTimer ?? 0) / 0.22;
              const flashColor =
                e.kind === 'v_bot_laser'
                  ? '#facc15'
                  : e.kind === 'grenadier'
                    ? '#f97316'
                    : '#ff2a55';
              drawFiringFlash(
                c,
                drawX,
                drawY,
                e.angle,
                camAngle,
                e.radius + 8,
                14,
                flashColor,
                intensity,
              );
            }

            const chill = e.chillSlow ?? 0;
            if (chill > 0 || e.freezeTimer > 0) {
              const intensity = chill > 0 ? Math.min(1, 0.25 + chill * 0.95) : 0.45;
              c.save();
              c.fillStyle = `rgba(56, 189, 248, ${(intensity * 0.42).toFixed(2)})`;
              c.shadowColor = '#38bdf8';
              c.shadowBlur = 10 + intensity * 8;
              c.beginPath();
              c.ellipse(s.x, s.y - 10, e.radius + 3, e.radius + 6, 0, 0, Math.PI * 2);
              c.fill();
              c.strokeStyle = `rgba(165, 243, 252, ${intensity.toFixed(2)})`;
              c.lineWidth = 1.5 + intensity;
              c.stroke();
              c.restore();
            }

            if ((e.burnTimer ?? 0) > 0) {
              const flicker = 0.7 + 0.3 * Math.sin(state.elapsedTime * 40 + e.x);
              c.save();
              c.shadowColor = '#f97316';
              c.shadowBlur = 12;
              c.fillStyle = 'rgba(239, 68, 68, 0.65)';
              c.beginPath();
              c.arc(s.x, s.y - 14, (e.radius * 0.75) * flicker, 0, Math.PI * 2);
              c.fill();
              c.fillStyle = 'rgba(250, 204, 21, 0.85)';
              c.beginPath();
              c.arc(s.x, s.y - 16, (e.radius * 0.42) * flicker, 0, Math.PI * 2);
              c.fill();
              c.restore();
            }

            if ((e.lightningFlashTimer ?? 0) > 0) {
              const alpha = Math.min(1, (e.lightningFlashTimer ?? 0) / 0.16);
              c.save();
              c.shadowColor = '#38bdf8';
              c.shadowBlur = 18;
              c.fillStyle = `rgba(255, 255, 255, ${(alpha * 0.78).toFixed(2)})`;
              c.beginPath();
              c.ellipse(s.x, s.y - 10, e.radius + 4, e.radius + 7, 0, 0, Math.PI * 2);
              c.fill();
              c.strokeStyle = `rgba(56, 189, 248, ${alpha.toFixed(2)})`;
              c.lineWidth = 2.5;
              c.stroke();
              c.restore();
            }
          },
        });
      }

      // Hero (hidden during death explosion; two-stage Rez-In beam + opaque flash on respawn)
      const heroDying = (state.player.deathTimer ?? 0) > 0;
      const heroRezzing = (state.player.rezTimer ?? 0) > 0;
      if (!heroDying) {
        renderQueue.push({
          sortY: playerScreen.y,
          draw: (c) => {
            if (heroRezzing) {
              const rezProg =
                1 -
                (state.player.rezTimer ?? 0) /
                  Math.max(0.01, state.player.rezDuration ?? 1.0);
              const phase = rezFlashPhase(rezProg);
              if (phase.entityAlpha > 0) {
                c.save();
                c.globalAlpha = phase.entityAlpha;
                drawHero(
                  c,
                  state.player,
                  models,
                  playerScreen.x,
                  playerScreen.y,
                  camera,
                  spacingPx,
                  zScale,
                );
                c.restore();
              }
              drawRezInBeam(
                c,
                playerScreen.x,
                playerScreen.y,
                state.player.radius + 6,
                64,
                rezProg,
                '#22d3ee',
                state.elapsedTime,
              );
              return;
            }
            drawHero(
              c,
              state.player,
              models,
              playerScreen.x,
              playerScreen.y,
              camera,
              spacingPx,
              zScale,
            );
            if ((state.player.rezHaloTimer ?? 0) > 0) {
              drawPostRezHalo(
                c,
                playerScreen.x,
                playerScreen.y,
                state.player.radius + 6,
                64,
                state.player.rezHaloTimer ?? 0,
                '#22d3ee',
              );
            }
          },
        });
      }

      // Orbitals
      for (let i = 0; i < state.player.orbitals.length; i++) {
        const orb = state.player.orbitals[i];
        const pos = getOrbitalWorldPos(state.player, orb);
        const s = project(pos.x, pos.y);
        const orbDeg = (orb.orbitAngle * 180) / Math.PI;
        renderQueue.push({
          sortY: s.y,
          draw: (c) => {
            drawStack(
              c,
              models.orbitals[orb.type],
              s.x,
              s.y,
              orbDeg,
              camAngle,
              SPRITE_SCALE,
              14 * zScale,
              spacingPx,
            );
          },
        });
      }

      // Active Boss
      if (state.boss && state.boss.hp > 0) {
        const boss = state.boss;
        const bs = project(boss.x, boss.y);
        renderQueue.push({
          sortY: bs.y,
          draw: (c) =>
            drawBoss(
              c,
              boss,
              models,
              bs.x,
              bs.y,
              camera,
              spacingPx,
              zScale,
              state.elapsedTime,
              project,
            ),
        });
      }

      // Pickups (distinct icons + hovering labels + [F] equip prompt)
      for (let i = 0; i < state.pickups.length; i++) {
        const pickup = state.pickups[i];
        const s = project(pickup.x, pickup.y);
        let prompt: string | undefined;
        const near = state.nearbyWeaponPickup;
        if (near && near.id === pickup.id && near.weaponType) {
          const slots = state.player.weaponSlots ?? [];
          const carried = slots.some((slot) => slot?.primary === near.weaponType);
          const full = slots.length > 0 && slots.every((slot) => slot !== null);
          prompt = `[F] ${carried ? 'UPGRADE' : full ? 'SWAP' : 'EQUIP'}`;
        }
        renderQueue.push({
          sortY: s.y,
          draw: (c) => drawPickup(c, pickup, s.x, s.y, zScale, state.elapsedTime, prompt),
        });
      }

      // Projectiles
      const enqueueProjectiles = (list: Projectile[]) => {
        for (let i = 0; i < list.length; i++) {
          const p = list[i];
          if (p.life <= 0) continue;
          const s = project(p.x, p.y);
          renderQueue.push({
            sortY: s.y,
            draw: (c) => drawProjectile(c, p, s.x, s.y, zScale, camAngle, state.elapsedTime),
          });
        }
      };
      enqueueProjectiles(state.playerProjectiles);
      enqueueProjectiles(state.enemyProjectiles);
      enqueueProjectiles(state.bossProjectiles);

      // Sort back-to-front by screen Y
      renderQueue.sort((a, b) => a.sortY - b.sortY);
      for (let i = 0; i < renderQueue.length; i++) {
        renderQueue[i].draw(ctx);
      }

      // Close incoming / active room push-slide transform
      ctx.restore();

      // 4. Pooled VFX particles + Evil Otto alarm border pulse + optional CRT scanline overlay
      vfx.render(ctx, project, camera);

      if (state.ottoWarningActive && !state.gameOver) {
        const pulse = 0.5 + 0.5 * Math.sin(state.elapsedTime * 12);
        const borderColor = pulse > 0.5 ? '#ef4444' : '#f59e0b';
        const alpha = 0.32 + pulse * 0.45;
        ctx.save();
        ctx.strokeStyle = borderColor;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 10 + pulse * 8;
        ctx.shadowColor = borderColor;
        ctx.shadowBlur = 24;
        ctx.strokeRect(4, 4, Math.max(0, width - 8), Math.max(0, height - 8));
        ctx.restore();
      }

      vfx.renderCrt(ctx, width, height);
    },
  };
}
