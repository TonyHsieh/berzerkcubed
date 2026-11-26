// Approach B modular sprite-stacking: slice builder, dynamic stack renderer,
// and the angle-quantized offscreen cache (SpriteStackCache).

type CanvasFactory = (width: number, height: number) => HTMLCanvasElement;

let canvasFactory: CanvasFactory | null = null;

/** Inject a canvas factory (used by Vitest to run headless). Pass null to reset. */
export function setCanvasFactory(factory: CanvasFactory | null): void {
  canvasFactory = factory;
}

export function createCanvas(width: number, height: number): HTMLCanvasElement {
  if (canvasFactory) return canvasFactory(width, height);
  const c = document.createElement('canvas');
  c.width = width;
  c.height = height;
  return c;
}

export function makeSlice(
  size: number,
  drawFn: (ctx: CanvasRenderingContext2D, size: number) => void,
): HTMLCanvasElement {
  const c = createCanvas(size, size);
  const ctx = c.getContext('2d');
  if (ctx) {
    ctx.imageSmoothingEnabled = false;
    drawFn(ctx, size);
  }
  return c;
}

const DEG2RAD = Math.PI / 180;

/** Milestone 4.13: 3/4 arcade camera pitch vertical foreshortening factor. */
export const DEFAULT_SLICE_PITCH_Y = 0.64;

/** Milestone 4.16: Taller vertical stack spacing multiplier (~1.42x) for all non-Recogniser characters. */
export const CHARACTER_HEIGHT_MULTIPLIER = 1.42;
export const RECOGNISER_HEIGHT_MULTIPLIER = 1.0;

/**
 * Returns the vertical stack spacing multiplier for an entity kind.
 * Recogniser (and static props like crates/walls) remain at 1.0x; all other
 * characters (Hero, Enforcers, V-Bots, Shooters, Grenadiers, and non-Recogniser bosses)
 * receive ~1.42x taller vertical presence.
 */
export function getEntitySpacingMultiplier(kind: string): number {
  const k = kind.toLowerCase();
  if (k === 'recogniser' || k === 'crate' || k === 'wall') {
    return RECOGNISER_HEIGHT_MULTIPLIER;
  }
  return CHARACTER_HEIGHT_MULTIPLIER;
}

/** Dynamic per-layer renderer (Hero, bosses, rotating pickups). */
export function drawStack(
  ctx: CanvasRenderingContext2D,
  slices: HTMLCanvasElement[],
  screenX: number,
  screenY: number,
  worldAngleDeg: number,
  cameraAngleDeg: number,
  scale: number,
  startZPx: number,
  spacingPx: number,
  localOffsetX = 0,
  localOffsetY = 0,
  slicePitchY = DEFAULT_SLICE_PITCH_Y,
): void {
  const rad = (worldAngleDeg + cameraAngleDeg) * DEG2RAD;
  for (let z = 0; z < slices.length; z++) {
    const slice = slices[z];
    const yLift = startZPx + z * spacingPx;
    ctx.save();
    ctx.translate(screenX, screenY - yLift);
    if (slicePitchY !== 1) {
      ctx.scale(1, slicePitchY);
    }
    ctx.rotate(rad);
    ctx.scale(scale, scale);
    ctx.drawImage(slice, -slice.width / 2 + localOffsetX, -slice.height / 2 + localOffsetY);
    ctx.restore();
  }
}

/** Wrap any angle into [0, 360). */
export function normalizeDeg(deg: number): number {
  return ((deg % 360) + 360) % 360;
}

/** Index of the nearest baked angle for a total (world + camera) angle. */
export function quantizeAngleIndex(totalAngleDeg: number, angleSteps: number): number {
  const step = 360 / angleSteps;
  return Math.round(normalizeDeg(totalAngleDeg) / step) % angleSteps;
}

interface CacheEntry {
  tiles: HTMLCanvasElement[];
  tileW: number;
  tileH: number;
  anchorY: number; // y of the ground-center point inside the tile
}

export interface CacheStats {
  bakes: number;
  hits: number;
  misses: number;
}

export class SpriteStackCache {
  private entries = new Map<string, CacheEntry>();
  readonly stats: CacheStats = { bakes: 0, hits: 0, misses: 0 };

  /** Pre-bake `angleSteps` rotated, fully stacked tiles for a slice stack. */
  bake(
    key: string,
    slices: HTMLCanvasElement[],
    scale: number,
    spacingPx: number,
    angleSteps = 24,
    slicePitchY = DEFAULT_SLICE_PITCH_Y,
  ): void {
    if (slices.length === 0) throw new Error(`SpriteStackCache.bake("${key}"): no slices`);
    const sliceSize = Math.max(...slices.map((s) => Math.max(s.width, s.height)));
    const diag = Math.ceil(sliceSize * scale * Math.SQRT2) + 2;
    const stackH = Math.ceil((slices.length - 1) * spacingPx);
    const tileW = diag;
    const tileH = diag + stackH;
    const anchorY = tileH - diag / 2;
    const tiles: HTMLCanvasElement[] = [];
    const step = 360 / angleSteps;

    for (let i = 0; i < angleSteps; i++) {
      const tile = createCanvas(tileW, tileH);
      const tctx = tile.getContext('2d');
      if (tctx) {
        tctx.imageSmoothingEnabled = false;
        drawStack(
          tctx,
          slices,
          tileW / 2,
          anchorY,
          i * step,
          0,
          scale,
          0,
          spacingPx,
          0,
          0,
          slicePitchY,
        );
      }
      tiles.push(tile);
    }
    this.entries.set(key, { tiles, tileW, tileH, anchorY });
    this.stats.bakes += angleSteps;
  }

  has(key: string): boolean {
    return this.entries.has(key);
  }

  angleSteps(key: string): number {
    return this.entries.get(key)?.tiles.length ?? 0;
  }

  /** The baked tile that drawCached would use (exposed for tests/tools). */
  getTile(key: string, worldAngleDeg: number, cameraAngleDeg: number): HTMLCanvasElement | null {
    const e = this.entries.get(key);
    if (!e) return null;
    return e.tiles[quantizeAngleIndex(worldAngleDeg + cameraAngleDeg, e.tiles.length)];
  }

  /** Single drawImage per call. Returns false when `key` was never baked. */
  drawCached(
    ctx: CanvasRenderingContext2D,
    key: string,
    screenX: number,
    screenY: number,
    worldAngleDeg: number,
    cameraAngleDeg: number,
    zLiftPx = 0,
  ): boolean {
    const e = this.entries.get(key);
    if (!e) {
      this.stats.misses++;
      return false;
    }
    const idx = quantizeAngleIndex(worldAngleDeg + cameraAngleDeg, e.tiles.length);
    ctx.drawImage(e.tiles[idx], screenX - e.tileW / 2, screenY - zLiftPx - e.anchorY);
    this.stats.hits++;
    return true;
  }

  clear(): void {
    this.entries.clear();
  }
}
