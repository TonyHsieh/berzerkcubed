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
} from '../engine/types';
import { getOrbitalWorldPos } from '../entities/orbitals';
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

    if (closedFrac > 0.02) {
      ctx.fillStyle = open >= 0.75 ? 'rgba(34, 211, 238, 0.25)' : '#0f172a';
      ctx.strokeStyle = open >= 0.75 ? '#22d3ee' : '#f59e0b';
      ctx.lineWidth = 2;
      if (horiz) {
        const panelW = (d.w * 0.5) * closedFrac;
        ctx.fillRect(d.x, d.y, panelW, d.h);
        ctx.strokeRect(d.x, d.y, panelW, d.h);
        ctx.fillRect(d.x + d.w - panelW, d.y, panelW, d.h);
        ctx.strokeRect(d.x + d.w - panelW, d.y, panelW, d.h);
      } else {
        const panelH = (d.h * 0.5) * closedFrac;
        ctx.fillRect(d.x, d.y, d.w, panelH);
        ctx.strokeRect(d.x, d.y, d.w, panelH);
        ctx.fillRect(d.x, d.y + d.h - panelH, d.w, panelH);
        ctx.strokeRect(d.x, d.y + d.h - panelH, d.w, panelH);
      }
    }
  }

  // 4. Walls (safe walls vs overtly animated electrified walls)
  for (let i = 0; i < island.walls.length; i++) {
    const w = island.walls[i];
    if (w.electrified) {
      const flicker = 0.65 + 0.35 * Math.sin(elapsedTime * 28 + i * 3.1);
      ctx.save();
      ctx.fillStyle = '#1b1124';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = flicker > 0.8 ? '#fef08a' : '#f43f5e';
      ctx.lineWidth = 3;
      ctx.shadowColor = '#f43f5e';
      ctx.shadowBlur = 16;
      ctx.strokeRect(w.x, w.y, w.w, w.h);

      // Animated crackling lightning bolt along electrified wall centerline
      ctx.strokeStyle = '#67e8f9';
      ctx.lineWidth = 2;
      ctx.beginPath();
      const vertical = w.h >= w.w;
      const steps = 8;
      if (vertical) {
        const cx = w.x + w.w * 0.5;
        ctx.moveTo(cx, w.y);
        for (let s = 1; s < steps; s++) {
          const jitter = Math.sin(elapsedTime * 45 + s * 7.3 + i) * (w.w * 0.35);
          ctx.lineTo(cx + jitter, w.y + (w.h * s) / steps);
        }
        ctx.lineTo(cx, w.y + w.h);
      } else {
        const cy = w.y + w.h * 0.5;
        ctx.moveTo(w.x, cy);
        for (let s = 1; s < steps; s++) {
          const jitter = Math.sin(elapsedTime * 45 + s * 7.3 + i) * (w.h * 0.35);
          ctx.lineTo(w.x + (w.w * s) / steps, cy + jitter);
        }
        ctx.lineTo(w.x + w.w, cy);
      }
      ctx.stroke();
      ctx.restore();
    } else {
      ctx.fillStyle = '#0d1526';
      ctx.fillRect(w.x, w.y, w.w, w.h);
      ctx.strokeStyle = outlineColor;
      ctx.lineWidth = 2;
      ctx.strokeRect(w.x, w.y, w.w, w.h);
    }
  }

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

function drawPickup(
  ctx: CanvasRenderingContext2D,
  pickup: PowerUpPickup,
  screenX: number,
  screenY: number,
  zScale: number,
  elapsedTime: number,
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
  ctx.fillStyle = color;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1.5;
  ctx.shadowColor = color;
  ctx.shadowBlur = 14;
  ctx.translate(screenX, sy);
  ctx.rotate(elapsedTime * 2.4);
  ctx.fillRect(-7, -7, 14, 14);
  ctx.strokeRect(-7, -7, 14, 14);
  ctx.restore();
}

export function createRenderer(options: RendererOptions = {}): GameRenderer {
  const cache = new SpriteStackCache();
  const models = buildAllModels();
  bakeSwarmCaches(cache, models, SPRITE_SCALE, BASE_LAYER_SPACING);

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

      // Pickups
      for (let i = 0; i < state.pickups.length; i++) {
        const pickup = state.pickups[i];
        const s = project(pickup.x, pickup.y);
        renderQueue.push({
          sortY: s.y,
          draw: (c) => drawPickup(c, pickup, s.x, s.y, zScale, state.elapsedTime),
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
