// Pooled VFX: voxel debris (Z-gravity), explosions, muzzle flashes, shell
// casings, lightning arcs, freeze-shatter crystals, dodge afterimages, CRT.
import type { CameraState, GameEvent, Vec2 } from '../engine/types';

/** World → screen projection bound to the current camera/viewport. */
export type WorldToScreenFn = (wx: number, wy: number) => Vec2;

type ParticleKind =
  | 'debris'
  | 'flash'
  | 'shell'
  | 'crystal'
  | 'afterimage'
  | 'arc'
  | 'spark'
  | 'ring'
  | 'implode_ring'
  | 'implode_spark'
  | 'flame'
  | 'smoke'
  | 'sizzle';

interface Particle {
  active: boolean;
  kind: ParticleKind;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  angle: number; // facing for afterimage/flash; arc: target y stored in vy etc.
  x2: number; // arc end
  y2: number;
  seed: number;
}

const GRAVITY_Z = 420; // px/s² applied to z

function blank(): Particle {
  return {
    active: false, kind: 'debris', x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0,
    life: 0, maxLife: 1, size: 1, color: '#fff', angle: 0, x2: 0, y2: 0, seed: 0,
  };
}

export class VfxSystem {
  private pool: Particle[];
  private free: number[]; // stack of free indices
  private _active = 0;
  crtEnabled = false;

  constructor(readonly capacity = 2048) {
    this.pool = Array.from({ length: capacity }, blank);
    this.free = Array.from({ length: capacity }, (_, i) => capacity - 1 - i);
  }

  get activeCount(): number {
    return this._active;
  }

  private acquire(kind: ParticleKind, life: number): Particle | null {
    const idx = this.free.pop();
    if (idx === undefined) return null; // pool exhausted: drop, never allocate
    const p = this.pool[idx];
    p.active = true;
    p.kind = kind;
    p.life = p.maxLife = life;
    p.x = p.y = p.z = p.vx = p.vy = p.vz = p.angle = p.x2 = p.y2 = 0;
    p.size = 2;
    p.color = '#fff';
    p.seed = Math.random();
    this._active++;
    return p;
  }

  private release(idx: number): void {
    const p = this.pool[idx];
    if (!p.active) return;
    p.active = false;
    this.free.push(idx);
    this._active--;
  }

  // ---------- Emitters ----------

  explode(x: number, y: number, z: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      const p = this.acquire('debris', 0.6 + Math.random() * 0.7);
      if (!p) break;
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 180;
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.vz = 80 + Math.random() * 220;
      p.size = 2 + Math.random() * 3;
      p.color = color;
    }
    const f = this.acquire('flash', 0.18);
    if (f) { f.x = x; f.y = y; f.z = z; f.size = 10 + Math.min(count, 40); f.color = color; }
  }

  muzzleFlash(x: number, y: number, angleRad: number, color = '#fde68a'): void {
    const p = this.acquire('flash', 0.06);
    if (!p) return;
    p.x = x; p.y = y; p.z = 8; p.angle = angleRad; p.size = 7; p.color = color;
  }

  shellCasing(x: number, y: number, ejectAngleRad: number): void {
    const p = this.acquire('shell', 0.7);
    if (!p) return;
    const sp = 50 + Math.random() * 40;
    p.x = x; p.y = y; p.z = 8;
    p.vx = Math.cos(ejectAngleRad) * sp;
    p.vy = Math.sin(ejectAngleRad) * sp;
    p.vz = 90 + Math.random() * 60;
    p.size = 2; p.color = '#facc15';
  }

  lightningArc(x1: number, y1: number, x2: number, y2: number, color = '#67e8f9'): void {
    const p = this.acquire('arc', 0.14);
    if (!p) return;
    p.x = x1; p.y = y1; p.x2 = x2; p.y2 = y2; p.z = 10; p.color = color; p.size = 2;
  }

  freezeShatter(x: number, y: number, z = 6, count = 14): void {
    for (let i = 0; i < count; i++) {
      const p = this.acquire('crystal', 0.5 + Math.random() * 0.5);
      if (!p) break;
      const a = Math.random() * Math.PI * 2;
      const sp = 30 + Math.random() * 120;
      p.x = x; p.y = y; p.z = z;
      p.vx = Math.cos(a) * sp; p.vy = Math.sin(a) * sp;
      p.vz = 60 + Math.random() * 140;
      p.size = 2 + Math.random() * 3;
      p.color = Math.random() < 0.5 ? '#a5f3fc' : '#e0f2fe';
      p.angle = Math.random() * Math.PI;
    }
  }

  afterimage(x: number, y: number, angleRad: number, color = '#22d3ee'): void {
    const p = this.acquire('afterimage', 0.25);
    if (!p) return;
    p.x = x; p.y = y; p.z = 0; p.angle = angleRad; p.size = 8; p.color = color;
  }

  shockwave(x: number, y: number, z: number, radius: number, color = '#fb923c', rings = 1): void {
    const count = Math.max(1, Math.min(4, Math.floor(rings)));
    for (let i = 0; i < count; i++) {
      const p = this.acquire('ring', 0.26 + i * 0.08);
      if (!p) break;
      p.x = x;
      p.y = y;
      p.z = z;
      p.x2 = radius * (1 + i * 0.16);
      p.size = 3.5 - i * 0.6;
      p.color = i === 0 ? '#fef08a' : color;
    }
  }

  flameSmoke(x: number, y: number, z = 10): void {
    for (let i = 0; i < 2; i++) {
      const fl = this.acquire('flame', 0.22 + Math.random() * 0.18);
      if (!fl) break;
      fl.x = x + (Math.random() - 0.5) * 14;
      fl.y = y + (Math.random() - 0.5) * 14;
      fl.z = z + Math.random() * 6;
      fl.vx = (Math.random() - 0.5) * 28;
      fl.vy = (Math.random() - 0.5) * 28;
      fl.vz = 45 + Math.random() * 55;
      fl.size = 3 + Math.random() * 3.5;
      fl.color = Math.random() < 0.45 ? '#f97316' : '#ef4444';
    }
    const sm = this.acquire('smoke', 0.45 + Math.random() * 0.3);
    if (sm) {
      sm.x = x + (Math.random() - 0.5) * 10;
      sm.y = y + (Math.random() - 0.5) * 10;
      sm.z = z + 8;
      sm.vx = (Math.random() - 0.5) * 18;
      sm.vy = (Math.random() - 0.5) * 18;
      sm.vz = 55 + Math.random() * 35;
      sm.size = 4 + Math.random() * 4;
      sm.color = '#94a3b8';
    }
  }

  sizzle(x: number, y: number, z = 16): void {
    const f = this.acquire('flash', 0.1);
    if (f) {
      f.x = x; f.y = y; f.z = z; f.size = 11; f.color = '#fef08a';
    }
    for (let i = 0; i < 4; i++) {
      const s = this.acquire('sizzle', 0.18 + Math.random() * 0.16);
      if (!s) break;
      const a = Math.random() * Math.PI * 2;
      const sp = 70 + Math.random() * 140;
      s.x = x; s.y = y; s.z = z;
      s.vx = Math.cos(a) * sp;
      s.vy = Math.sin(a) * sp;
      s.vz = 60 + Math.random() * 110;
      s.size = 2 + Math.random() * 2;
      s.color = i % 2 === 0 ? '#ffffff' : '#fb923c';
    }
  }

  /**
   * Milestone 4.15: Distinct smaller timeout implosion — shrinking neon ring
   * plus inward-collapsing particles so no projectile ever vanishes silently.
   */
  implode(x: number, y: number, z: number, color: string, radius = 14): void {
    const safeRadius = Math.max(6, radius);
    const ring = this.acquire('implode_ring', 0.2);
    if (ring) {
      ring.x = x;
      ring.y = y;
      ring.z = z;
      ring.x2 = safeRadius;
      ring.size = 2.4;
      ring.color = color;
    }
    const count = 6;
    for (let i = 0; i < count; i++) {
      const life = 0.16 + Math.random() * 0.08;
      const sp = this.acquire('implode_spark', life);
      if (!sp) break;
      const a = (i / count) * Math.PI * 2 + Math.random() * 0.4;
      const dist = safeRadius * (0.85 + Math.random() * 0.35);
      sp.x = x + Math.cos(a) * dist;
      sp.y = y + Math.sin(a) * dist;
      sp.z = z;
      // Velocity directed inward toward (x, y)
      sp.vx = (-Math.cos(a) * dist) / life;
      sp.vy = (-Math.sin(a) * dist) / life;
      sp.vz = 0;
      sp.size = 2;
      sp.color = i % 2 === 0 ? color : '#ffffff';
    }
  }

  /**
   * Milestone 4.15: Vivid Tesla/lightning electric detonation — bright white/cyan
   * core flash + 5-8 radiating jagged micro-lightning tendrils + blue/white sparks.
   */
  electricDetonation(x: number, y: number, z = 8, color = '#67e8f9', tendrils = 6): void {
    const core = this.acquire('flash', 0.16);
    if (core) {
      core.x = x;
      core.y = y;
      core.z = z;
      core.size = 18;
      core.color = '#ffffff';
    }
    const halo = this.acquire('flash', 0.2);
    if (halo) {
      halo.x = x;
      halo.y = y;
      halo.z = z;
      halo.size = 24;
      halo.color = color;
    }
    const count = Math.max(5, Math.min(8, Math.floor(tendrils)));
    for (let t = 0; t < count; t++) {
      const angle = (t / count) * Math.PI * 2 + Math.random() * 0.45;
      const len = 24 + Math.random() * 20;
      this.lightningArc(
        x,
        y,
        x + Math.cos(angle) * len,
        y + Math.sin(angle) * len,
        t % 2 === 0 ? '#ffffff' : color,
      );
    }
    for (let i = 0; i < 10; i++) {
      const p = this.acquire('debris', 0.28 + Math.random() * 0.25);
      if (!p) break;
      const a = Math.random() * Math.PI * 2;
      const sp = 70 + Math.random() * 150;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.vz = 70 + Math.random() * 130;
      p.size = 2 + Math.random() * 2;
      p.color = i % 2 === 0 ? '#ffffff' : color;
    }
  }

  // ---------- Events ----------

  handleEvent(event: GameEvent): void {
    switch (event.type) {
      case 'vfx_explosion':
        this.explode(event.x, event.y, event.z, event.color, event.count);
        break;
      case 'vfx_implosion':
        this.implode(event.x, event.y, event.z, event.color, event.radius ?? 14);
        break;
      case 'vfx_electric_detonation':
        this.electricDetonation(event.x, event.y, event.z, event.color ?? '#67e8f9', event.tendrils ?? 6);
        break;
      case 'vfx_shockwave':
        this.shockwave(event.x, event.y, event.z, event.radius, event.color, event.rings ?? 1);
        break;
      case 'vfx_lightning_arc':
        this.lightningArc(event.x1, event.y1, event.x2, event.y2, event.color ?? '#67e8f9');
        break;
      case 'vfx_flame_smoke':
        this.flameSmoke(event.x, event.y, event.z);
        break;
      case 'vfx_sizzle':
        this.sizzle(event.x, event.y, event.z);
        break;
      case 'crate_destroyed':
        this.explode(event.x, event.y, 4, '#22d3ee', 18);
        break;
      case 'player_fell':
        this.explode(event.x, event.y, 0, '#38bdf8', 12);
        break;
      default:
        break; // sfx / voice / camera_shake are handled elsewhere
    }
  }

  // ---------- Simulation ----------

  update(dt: number): void {
    for (let i = 0; i < this.capacity; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        this.release(i);
        continue;
      }
      if (p.kind === 'debris' || p.kind === 'shell' || p.kind === 'crystal' || p.kind === 'sizzle') {
        p.vz -= GRAVITY_Z * dt;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
        if (p.z < 0) {
          p.z = 0;
          p.vz = -p.vz * 0.35;
          p.vx *= 0.6;
          p.vy *= 0.6;
        }
      } else if (p.kind === 'flame' || p.kind === 'smoke' || p.kind === 'implode_spark') {
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.z += p.vz * dt;
      }
    }
  }

  // ---------- Rendering ----------

  render(ctx: CanvasRenderingContext2D, worldToScreen: WorldToScreenFn, camera: CameraState): void {
    const zScale = camera.layerSpacing * camera.tiltScale * 0.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter'; // additive neon bloom
    for (let i = 0; i < this.capacity; i++) {
      const p = this.pool[i];
      if (!p.active) continue;
      const t = p.life / p.maxLife;
      const s = worldToScreen(p.x, p.y);
      const sy = s.y - p.z * zScale;
      ctx.fillStyle = p.color;
      switch (p.kind) {
        case 'debris':
        case 'crystal':
          ctx.globalAlpha = Math.min(1, t * 1.5);
          ctx.fillRect(s.x - p.size / 2, sy - p.size / 2, p.size, p.size);
          break;
        case 'shell':
          ctx.globalAlpha = Math.min(1, t * 2);
          ctx.fillRect(s.x - 1, sy - 1, 2, 3);
          break;
        case 'flash':
          ctx.globalAlpha = t;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.arc(s.x, sy, p.size * (1.2 - t * 0.4), 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          break;
        case 'afterimage':
          ctx.globalAlpha = t * 0.5;
          ctx.beginPath();
          ctx.ellipse(s.x, sy - 6, p.size, p.size * 1.4, p.angle, 0, Math.PI * 2);
          ctx.fill();
          break;
        case 'arc': {
          const e = worldToScreen(p.x2, p.y2);
          ctx.globalAlpha = t;
          ctx.strokeStyle = p.color;
          ctx.lineWidth = p.size + 1.5;
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 12;
          ctx.beginPath();
          ctx.moveTo(s.x, sy);
          const segs = 6;
          for (let k = 1; k < segs; k++) {
            const f = k / segs;
            const j = (Math.sin(p.seed * 99 + k * 12.9898 + p.life * 60) * 0.5) * 14;
            ctx.lineTo(s.x + (e.x - s.x) * f + j, sy + (e.y - sy) * f - j);
          }
          ctx.lineTo(e.x, e.y - p.z * zScale);
          ctx.stroke();
          // Bright white electric core
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = Math.max(1, p.size * 0.65);
          ctx.stroke();
          ctx.shadowBlur = 0;
          break;
        }
        case 'ring': {
          const prog = 1 - t;
          const r = Math.max(4, p.x2 * (0.18 + prog * 0.88));
          ctx.globalAlpha = Math.min(1, t * 1.2);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1.2, p.size * t);
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 16;
          ctx.beginPath();
          ctx.arc(s.x, sy, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
          break;
        }
        case 'implode_ring': {
          const r = Math.max(1.5, p.x2 * t);
          ctx.globalAlpha = Math.min(1, t * 1.15);
          ctx.strokeStyle = p.color;
          ctx.lineWidth = Math.max(1, p.size * (0.6 + 0.4 * t));
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(s.x, sy, r, 0, Math.PI * 2);
          ctx.stroke();
          ctx.shadowBlur = 0;
          break;
        }
        case 'implode_spark': {
          ctx.globalAlpha = Math.min(1, t * 1.4);
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 6;
          const sz = Math.max(1.2, p.size * t);
          ctx.fillRect(s.x - sz / 2, sy - sz / 2, sz, sz);
          ctx.shadowBlur = 0;
          break;
        }
        case 'flame': {
          ctx.globalAlpha = Math.min(1, t * 1.3);
          ctx.shadowColor = p.color;
          ctx.shadowBlur = 8;
          ctx.beginPath();
          ctx.arc(s.x, sy, Math.max(1.5, p.size * t), 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
          break;
        }
        case 'smoke': {
          ctx.save();
          ctx.globalCompositeOperation = 'source-over';
          ctx.globalAlpha = t * 0.45;
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(s.x, sy, p.size * (1.4 - t * 0.5), 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
          break;
        }
        case 'sizzle': {
          ctx.globalAlpha = Math.min(1, t * 1.6);
          ctx.shadowColor = '#fb923c';
          ctx.shadowBlur = 8;
          ctx.fillRect(s.x - p.size / 2, sy - p.size / 2, p.size, p.size);
          ctx.shadowBlur = 0;
          break;
        }
        default:
          break;
      }
    }
    ctx.restore();
  }

  /** Optional CRT scanline overlay; call last with the canvas size. */
  renderCrt(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (!this.crtEnabled) return;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.18)';
    for (let y = 0; y < height; y += 3) ctx.fillRect(0, y, width, 1);
    const g = ctx.createRadialGradient(width / 2, height / 2, height * 0.4, width / 2, height / 2, height * 0.9);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.restore();
  }
}
