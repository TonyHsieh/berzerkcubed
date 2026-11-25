// Parallax cyber-circuit PCB background with electric blips racing on traces.
import type { CameraState } from '../engine/types';

interface Trace {
  pts: Array<[number, number]>; // tile-local coords
  len: number;
  segLens: number[];
}
interface Blip {
  trace: number;
  t: number; // distance along trace (px)
  speed: number;
}
interface Plane {
  parallax: number;
  tile: number;
  traces: Trace[];
  vias: Array<[number, number, number]>;
  blips: Blip[];
  color: string;
  alpha: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function makeTrace(rand: () => number, tile: number, grid: number): Trace {
  let x = Math.floor(rand() * (tile / grid)) * grid;
  let y = Math.floor(rand() * (tile / grid)) * grid;
  const pts: Array<[number, number]> = [[x, y]];
  const n = 3 + Math.floor(rand() * 4);
  let horiz = rand() < 0.5;
  for (let i = 0; i < n; i++) {
    const d = (1 + Math.floor(rand() * 4)) * grid * (rand() < 0.5 ? -1 : 1);
    if (horiz) x += d;
    else y += d;
    horiz = !horiz;
    pts.push([x, y]);
    // occasional 45° dogleg
    if (rand() < 0.3) {
      x += grid * (rand() < 0.5 ? -1 : 1);
      y += grid * (rand() < 0.5 ? -1 : 1);
      pts.push([x, y]);
    }
  }
  const segLens: number[] = [];
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    segLens.push(l);
    len += l;
  }
  return { pts, len, segLens };
}

function pointAt(tr: Trace, d: number): [number, number] {
  let rem = d;
  for (let i = 0; i < tr.segLens.length; i++) {
    if (rem <= tr.segLens[i]) {
      const f = tr.segLens[i] ? rem / tr.segLens[i] : 0;
      return [
        tr.pts[i][0] + (tr.pts[i + 1][0] - tr.pts[i][0]) * f,
        tr.pts[i][1] + (tr.pts[i + 1][1] - tr.pts[i][1]) * f,
      ];
    }
    rem -= tr.segLens[i];
  }
  const last = tr.pts[tr.pts.length - 1];
  return [last[0], last[1]];
}

export class CircuitBackground {
  private planes: Plane[];

  constructor(seed = 1337) {
    const rand = mulberry32(seed);
    const defs = [
      { parallax: 0.25, tile: 640, grid: 32, traces: 14, color: '#0e7490', alpha: 0.35 },
      { parallax: 0.5, tile: 512, grid: 24, traces: 12, color: '#0891b2', alpha: 0.5 },
      { parallax: 0.8, tile: 448, grid: 16, traces: 10, color: '#22d3ee', alpha: 0.6 },
    ];
    this.planes = defs.map((d) => {
      const traces = Array.from({ length: d.traces }, () => makeTrace(rand, d.tile, d.grid));
      const vias: Plane['vias'] = [];
      for (const t of traces) {
        const a = t.pts[0];
        const b = t.pts[t.pts.length - 1];
        vias.push([a[0], a[1], 2 + rand() * 2], [b[0], b[1], 3 + rand() * 2]);
      }
      const blips: Blip[] = traces.map((_, i) => ({
        trace: i,
        t: rand() * traces[i].len,
        speed: 80 + rand() * 160,
      }));
      return { parallax: d.parallax, tile: d.tile, traces, vias, blips, color: d.color, alpha: d.alpha };
    });
  }

  update(dt: number): void {
    for (const p of this.planes) {
      for (const b of p.blips) {
        const len = p.traces[b.trace].len;
        b.t += b.speed * dt;
        if (len > 0 && b.t > len) b.t %= len;
      }
    }
  }

  /** Exposed for tests: current blip distances for plane `i`. */
  blipPositions(i: number): number[] {
    return this.planes[i].blips.map((b) => b.t);
  }

  get planeCount(): number {
    return this.planes.length;
  }

  render(ctx: CanvasRenderingContext2D, camera: CameraState, width: number, height: number): void {
    ctx.save();
    ctx.fillStyle = '#05070d';
    ctx.fillRect(0, 0, width, height);
    // Rotate with the camera about screen center; cover the rotated diagonal.
    const half = Math.hypot(width, height) / 2;
    ctx.translate(width / 2, height / 2);
    ctx.rotate((camera.angleDeg * Math.PI) / 180);

    for (const p of this.planes) {
      const ox = -camera.x * p.parallax;
      const oy = -camera.y * p.parallax;
      const startI = Math.floor((-half - ox) / p.tile) - 1;
      const endI = Math.ceil((half - ox) / p.tile) + 1;
      const startJ = Math.floor((-half - oy) / p.tile) - 1;
      const endJ = Math.ceil((half - oy) / p.tile) + 1;
      ctx.lineWidth = 1.5;
      ctx.lineCap = 'square';
      for (let i = startI; i <= endI; i++) {
        for (let j = startJ; j <= endJ; j++) {
          const tx = ox + i * p.tile;
          const ty = oy + j * p.tile;
          ctx.globalAlpha = p.alpha;
          ctx.strokeStyle = p.color;
          ctx.beginPath();
          for (const tr of p.traces) {
            ctx.moveTo(tx + tr.pts[0][0], ty + tr.pts[0][1]);
            for (let k = 1; k < tr.pts.length; k++) ctx.lineTo(tx + tr.pts[k][0], ty + tr.pts[k][1]);
          }
          ctx.stroke();
          ctx.fillStyle = p.color;
          for (const [vx, vy, r] of p.vias) ctx.fillRect(tx + vx - r, ty + vy - r, r * 2, r * 2);
          // electric blips (additive glow)
          ctx.globalAlpha = 1;
          ctx.fillStyle = '#e0f2fe';
          ctx.shadowColor = '#67e8f9';
          ctx.shadowBlur = 8;
          for (const b of p.blips) {
            const [bx, by] = pointAt(p.traces[b.trace], b.t);
            ctx.fillRect(tx + bx - 2, ty + by - 2, 4, 4);
          }
          ctx.shadowBlur = 0;
        }
      }
    }
    ctx.restore();
  }
}
