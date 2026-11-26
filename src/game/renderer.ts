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
const BASE_LAYER_SPACING = 2.0;

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

  // 3. Synchronized sliding doors
  for (let i = 0; i < island.doors.length; i++) {
    const d = island.doors[i];
    const horiz = d.w >= d.h;
    const open = d.openFraction;
    const closedFrac = Math.max(0, 1 - open);

    // Door frame track
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1;
    ctx.strokeRect(d.x, d.y, d.w, d.h);

    const panelColor = open >= 0.75 ? 'rgba(34, 211, 238, 0.25)' : '#0f172a';
    const panelEdge = open >= 0.75 ? '#22d3ee' : '#f59e0b';
    const extrude = 7;
    const drawDoorPanel = (px: number, py: number, pw: number, ph: number): void => {
      // Extruded 3D sliding door block with a glowing top rim.
      ctx.fillStyle = '#0b1220';
      ctx.beginPath();
      ctx.moveTo(px, py); ctx.lineTo(px - extrude, py - extrude);
      ctx.lineTo(px - extrude, py + ph - extrude); ctx.lineTo(px, py + ph);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = panelColor;
      ctx.fillRect(px, py, pw, ph);
      ctx.strokeStyle = panelEdge;
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, pw, ph);
      ctx.fillStyle = open >= 0.75 ? 'rgba(34, 211, 238, 0.4)' : '#1e293b';
      ctx.beginPath();
      ctx.moveTo(px - extrude, py - extrude); ctx.lineTo(px + pw - extrude, py - extrude);
      ctx.lineTo(px + pw, py); ctx.lineTo(px, py);
      ctx.closePath(); ctx.fill(); ctx.stroke();
    };

    if (closedFrac > 0.02) {
      if (horiz) {
        const panelW = (d.w * 0.5) * closedFrac;
        drawDoorPanel(d.x, d.y, panelW, d.h);
        drawDoorPanel(d.x + d.w - panelW, d.y, panelW, d.h);
      } else {
        const panelH = (d.h * 0.5) * closedFrac;
        drawDoorPanel(d.x, d.y, d.w, panelH);
        drawDoorPanel(d.x, d.y + d.h - panelH, d.w, panelH);
      }
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
  const lift = Math.max(10, wall.heightZ * zScale);
  const ex = -lift * 0.32; // fake-isometric lateral offset of the top face

  ctx.save();
  ctx.translate(screenX, screenY);
  ctx.rotate((camAngleDeg * Math.PI) / 180);

  const baseX = -segW / 2;
  const baseY = -segD / 2;
  const topX = baseX + ex;
  const topY = baseY - lift;

  // Left + right side faces (visible extruded depth).
  ctx.fillStyle = wall.electrified ? '#2a0f1a' : '#0b1524';
  ctx.beginPath();
  ctx.moveTo(baseX, baseY); ctx.lineTo(topX, topY);
  ctx.lineTo(topX, topY + segD); ctx.lineTo(baseX, baseY + segD);
  ctx.closePath(); ctx.fill();
  ctx.beginPath();
  ctx.moveTo(baseX + segW, baseY); ctx.lineTo(topX + segW, topY);
  ctx.lineTo(topX + segW, topY + segD); ctx.lineTo(baseX + segW, baseY + segD);
  ctx.closePath(); ctx.fill();

  // Front face with neon outline.
  ctx.fillStyle = wall.electrified ? '#1b1124' : '#0d1526';
  ctx.fillRect(baseX, baseY, segW, segD);
  ctx.strokeStyle = wall.electrified ? '#f43f5e' : outlineColor;
  ctx.lineWidth = 2;
  ctx.strokeRect(baseX, baseY, segW, segD);

  // Glowing top face + rim.
  ctx.shadowColor = wall.electrified ? '#f43f5e' : outlineColor;
  ctx.shadowBlur = 12;
  ctx.fillStyle = wall.electrified ? '#3b1220' : '#12243d';
  ctx.beginPath();
  ctx.moveTo(topX, topY); ctx.lineTo(topX + segW, topY);
  ctx.lineTo(topX + segW + ex, topY + segD); ctx.lineTo(topX + ex, topY + segD);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.shadowBlur = 0;

  if (wall.electrified) {
    // Animated 3D vertical plasma arcs crawling along the extruded faces.
    const flicker = 0.65 + 0.35 * Math.sin(elapsedTime * 28 + index * 3.1);
    ctx.shadowColor = '#67e8f9';
    ctx.shadowBlur = 16;
    ctx.strokeStyle = flicker > 0.8 ? '#fef08a' : '#67e8f9';
    ctx.lineWidth = 2;
    const arcs = Math.max(1, Math.floor(segW / 16));
    for (let a = 0; a < arcs; a++) {
      const ax = baseX + ((a + 0.5) * segW) / arcs;
      ctx.beginPath();
      ctx.moveTo(ax, baseY + segD);
      const steps = 6;
      for (let s = 1; s < steps; s++) {
        const jitter = Math.sin(elapsedTime * 42 + s * 6.7 + a + index) * 2.6;
        ctx.lineTo(ax + jitter, baseY + (segD * s) / steps);
      }
      ctx.lineTo(ax + ex, topY);
      ctx.stroke();
      // Energy bar on the top rim
      ctx.beginPath();
      ctx.moveTo(ax + ex, topY + 1);
      ctx.lineTo(ax + ex + 2, topY + 1);
      ctx.stroke();
    }
    ctx.shadowBlur = 0;
  }

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
): void {
  const camAngle = camera.angleDeg;
  const zLift = boss.z * zScale;

  // Ground shadow
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
  ctx.beginPath();
  ctx.ellipse(screenX, screenY + 6, boss.radius * 0.9, boss.radius * 0.45, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  if (boss.kind === 'maximilian') {
    const scale = 3.2;
    drawStack(
      ctx,
      models.maximilian.body,
      screenX,
      screenY,
      boss.angle,
      camAngle,
      scale,
      zLift,
      spacingPx * 1.3,
    );
    drawStack(
      ctx,
      models.maximilian.blades,
      screenX,
      screenY,
      boss.bladeAngle,
      camAngle,
      scale * 1.15,
      zLift + 5 * spacingPx,
      spacingPx,
    );
    // Whirling blade danger halo
    ctx.save();
    ctx.strokeStyle =
      boss.phase === 'whirlwind'
        ? 'rgba(255, 42, 85, 0.75)'
        : 'rgba(239, 68, 68, 0.35)';
    ctx.lineWidth = boss.phase === 'whirlwind' ? 3 : 1.5;
    ctx.beginPath();
    ctx.arc(screenX, screenY - zLift - 8, boss.bladeRadius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    // Pulsing exposed core telegraphs the fully-vulnerable recovery window.
    if (boss.phase === 'recover') {
      const pulse = 0.5 + 0.5 * Math.sin(elapsedTime * 16);
      ctx.save();
      ctx.strokeStyle = `rgba(255, 240, 120, ${(0.45 + pulse * 0.5).toFixed(2)})`;
      ctx.lineWidth = 2 + pulse * 2;
      ctx.beginPath();
      ctx.arc(screenX, screenY - zLift - 14, 9 + pulse * 7, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
    return;
  }

  if (boss.kind === 'recogniser') {
    const scale = 3.2;
    const leftLeg = boss.parts.find((p) => p.id === 'left_leg');
    const rightLeg = boss.parts.find((p) => p.id === 'right_leg');
    const headCore = boss.parts.find((p) => p.id === 'head_core');

    // Legs: indices 0,2 map to left_leg; indices 1,3 map to right_leg
    for (let i = 0; i < models.recogniser.legs.length; i++) {
      const isLeft = i % 2 === 0;
      const part = isLeft ? leftLeg : rightLeg;
      if (part && part.destroyed) continue;
      drawStack(
        ctx,
        models.recogniser.legs[i],
        screenX,
        screenY,
        boss.angle,
        camAngle,
        scale,
        zLift,
        spacingPx * 1.4,
      );
    }

    drawStack(
      ctx,
      models.recogniser.head,
      screenX,
      screenY,
      boss.angle,
      camAngle,
      scale,
      zLift + 8 * spacingPx * 1.4,
      spacingPx * 1.4,
    );

    if (headCore && headCore.vulnerable && !headCore.destroyed) {
      ctx.save();
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(
        screenX,
        screenY - zLift - 34,
        18 + Math.sin(elapsedTime * 14) * 3,
        0,
        Math.PI * 2,
      );
      ctx.stroke();
      ctx.restore();
    }
    return;
  }

  // Evil Otto
  const variant = boss.ottoVariant ?? 'classic';
  const slices = models.evilOtto[variant] ?? models.evilOtto.classic;
  const scale = 2.6 + (boss.radius - 26) * 0.05;
  ctx.save();
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
    spacingPx * 1.3,
  );
  if (boss.reconstructing) {
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 5]);
    ctx.beginPath();
    ctx.arc(screenX, screenY - zLift - 12, boss.radius + 10, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawProjectile(
  ctx: CanvasRenderingContext2D,
  p: Projectile,
  screenX: number,
  screenY: number,
  zScale: number,
): void {
  const sy = screenY - p.z * zScale;
  ctx.save();
  ctx.fillStyle = p.color;
  ctx.shadowColor = p.color;
  ctx.shadowBlur = 10;

  if (p.kind === 'beam_segment') {
    const angle = Math.atan2(p.vy, p.vx);
    ctx.translate(screenX, sy);
    ctx.rotate(angle);
    ctx.fillRect(-p.radius * 2, -p.radius * 0.55, p.radius * 4, p.radius * 1.1);
  } else if (p.kind === 'lightning') {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(screenX - p.vx * 0.025, sy - p.vy * 0.025);
    ctx.lineTo(screenX + 3, sy - 3);
    ctx.lineTo(screenX, sy);
    ctx.stroke();
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
      const spacingPx = camera.layerSpacing * camera.tiltScale;
      const zScale = spacingPx * 0.5;
      const project = (wx: number, wy: number) =>
        worldToScreen(wx, wy, camera, width, height);

      ctx.imageSmoothingEnabled = false;

      // 1. Parallax cyber-circuit PCB background
      circuitBg.render(ctx, camera, width, height);

      // 2. Floating platform island in camera-rotated world coordinates
      const shake = getCameraShakeOffset(camera);
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
      );
      ctx.restore();

      // 3. Build depth-sorted renderQueue by screen Y
      renderQueue.length = 0;

      // True 3D extruded walls/doors interleave with units and projectiles.
      const wallOutline = state.island.outline === 'red' ? '#ef4444' : '#22d3ee';
      for (let i = 0; i < state.island.walls.length; i++) {
        const wall = state.island.walls[i];
        const s = project(wall.x + wall.w * 0.5, wall.y + wall.h * 0.5);
        renderQueue.push({
          sortY: s.y + wall.h * 0.5,
          draw: (c) =>
            drawWall3D(
              c,
              wall,
              s.x,
              s.y,
              camAngle,
              zScale,
              state.elapsedTime,
              i,
              wallOutline,
            ),
        });
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
            if (e.kind === 'laser_shooter' && e.telegraphTimer > 0) {
              c.save();
              c.strokeStyle = 'rgba(255, 42, 85, 0.75)';
              c.lineWidth = 1.5;
              c.beginPath();
              c.moveTo(s.x, s.y - 10);
              c.lineTo(playerScreen.x, playerScreen.y - 10);
              c.stroke();
              c.restore();
            }
            cache.drawCached(c, key, s.x, s.y, e.angle, camAngle, e.z * zScale);
            if (e.freezeTimer > 0) {
              c.save();
              c.strokeStyle = '#67e8f9';
              c.lineWidth = 1.5;
              c.strokeRect(s.x - 10, s.y - 16, 20, 20);
              c.restore();
            }
          },
        });
      }

      // Hero
      renderQueue.push({
        sortY: playerScreen.y,
        draw: (c) =>
          drawHero(
            c,
            state.player,
            models,
            playerScreen.x,
            playerScreen.y,
            camera,
            spacingPx,
            zScale,
          ),
      });

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
            draw: (c) => drawProjectile(c, p, s.x, s.y, zScale),
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

      // 4. Pooled VFX particles + optional CRT scanline overlay
      vfx.render(ctx, project, camera);
      vfx.renderCrt(ctx, width, height);
    },
  };
}
