// Milestone 4.1 Fix 8: lightweight model gallery / sprite inspector.
// Enable with ?gallery=1. Renders enlarged rotating Approach B turntables of
// every model so silhouettes can be visually approved up close.
import type { ModelSet } from '../render/models';
import { DEFAULT_SLICE_PITCH_Y, drawStack } from '../render/spriteStack';
import type { SpriteStackCache } from '../render/spriteStack';

export function isGalleryEnabled(search: string): boolean {
  return new URLSearchParams(search).get('gallery') === '1';
}

export interface GalleryHandle {
  destroy(): void;
  toggle(): void;
}

interface GalleryEntry {
  label: string;
  slices: () => HTMLCanvasElement[];
}

function syntheticWallSlices(): HTMLCanvasElement[] {
  return Array.from({ length: 10 }, (_, z) => {
    const c = document.createElement('canvas');
    c.width = 24;
    c.height = 24;
    const ctx = c.getContext('2d');
    if (!ctx) return c;
    const lift = z / 9;
    ctx.fillStyle = `rgb(${12 + Math.round(lift * 22)}, ${20 + Math.round(lift * 30)}, ${34 + Math.round(lift * 42)})`;
    ctx.fillRect(3, 6, 18, 12);
    ctx.strokeStyle = z === 9 ? '#f43f5e' : '#22d3ee';
    ctx.lineWidth = 1;
    ctx.strokeRect(3, 6, 18, 12);
    return c;
  });
}

function combineRecogniserLegs(left: HTMLCanvasElement[], right: HTMLCanvasElement[]): HTMLCanvasElement[] {
  const len = Math.max(left.length, right.length);
  return Array.from({ length: len }, (_, i) => {
    const c = document.createElement('canvas');
    c.width = 24;
    c.height = 24;
    const ctx = c.getContext('2d');
    if (ctx) {
      if (left[i]) ctx.drawImage(left[i], 0, 0);
      if (right[i]) ctx.drawImage(right[i], 0, 0);
    }
    return c;
  });
}

function entries(models: ModelSet): GalleryEntry[] {
  return [
    { label: 'HERO', slices: () => [...models.hero.legsIdle, ...models.hero.torso] },
    { label: 'RED ROBOT (ENFORCER)', slices: () => models.enforcer[0] },
    { label: 'RED V-BOT (MELEE)', slices: () => models.vBotMelee[0] },
    { label: 'YELLOW V-BOT (LASER)', slices: () => models.vBotLaser[0] },
    { label: 'LASER SHOOTER', slices: () => models.laserShooter[0] },
    { label: 'GRENADIER', slices: () => models.grenadier[0] },
    { label: 'MAXIMILIAN', slices: () => [...models.maximilian.body, ...models.maximilian.blades] },
    {
      label: 'RECOGNISER (2-LEG)',
      slices: () => [
        ...combineRecogniserLegs(models.recogniser.legs[0], models.recogniser.legs[1]),
        ...models.recogniser.head,
      ],
    },
    { label: 'EVIL OTTO', slices: () => models.evilOtto.classic },
    { label: 'ABB // TANK-MECH', slices: () => models.abb },
    { label: 'SKULLHEAD', slices: () => [...models.skullhead.body, ...models.skullhead.halo] },
    { label: 'TECH HIVE', slices: () => models.bugHive.hive },
    { label: 'FLYING BUG BOT', slices: () => models.bugHive.bugBot },
    { label: 'BRAINBOT', slices: () => models.brainbot },
    {
      label: 'POWER-UPS',
      slices: () => [
        ...models.orbitals.shooter_drone,
        ...models.orbitals.lightsaber,
        ...models.orbitals.ablative_shield,
      ],
    },
    { label: '3D WALL', slices: syntheticWallSlices },
  ];
}

/**
 * Opens the gallery overlay. `cache` is accepted so the inspector can be
 * extended with baked-angle readouts without re-baking anything.
 */
export function createModelGallery(
  resources: { models: ModelSet; cache: SpriteStackCache },
): GalleryHandle {
  const list = entries(resources.models);
  const overlay = document.createElement('div');
  overlay.id = 'model-gallery';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:10000;background:rgba(5,7,13,0.96);' +
    'display:flex;flex-direction:column;align-items:center;overflow:auto;padding:24px;' +
    'font-family:ui-monospace,monospace;color:#e2e8f0;';

  const header = document.createElement('div');
  header.style.cssText = 'width:100%;max-width:1180px;display:flex;align-items:center;justify-content:space-between;margin-bottom:18px;';
  header.innerHTML =
    '<div style="font-size:20px;color:#22d3ee;letter-spacing:4px;text-shadow:0 0 12px #22d3ee;">MODEL GALLERY // SPRITE INSPECTOR · 5× TURNTABLE</div>' +
    '<button id="gallery-close" style="background:#0f172a;color:#f43f5e;border:2px solid #f43f5e;padding:6px 14px;font:inherit;cursor:pointer;letter-spacing:2px;">CLOSE [G]</button>';
  overlay.appendChild(header);

  const grid = document.createElement('div');
  grid.style.cssText =
    'display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;width:100%;max-width:1180px;';
  overlay.appendChild(grid);

  const canvases: Array<{ ctx: CanvasRenderingContext2D; slices: HTMLCanvasElement[]; w: number; h: number }> = [];
  for (const entry of list) {
    const card = document.createElement('div');
    card.style.cssText =
      'background:#0b1220;border:1px solid #1e3a5f;border-radius:4px;padding:8px;text-align:center;';
    const label = document.createElement('div');
    label.style.cssText = 'font-size:10px;color:#facc15;letter-spacing:1px;margin-bottom:6px;';
    label.textContent = entry.label;
    const canvas = document.createElement('canvas');
    canvas.width = 180;
    canvas.height = 180;
    canvas.style.cssText = 'width:180px;height:180px;image-rendering:pixelated;';
    card.appendChild(label);
    card.appendChild(canvas);
    grid.appendChild(card);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.imageSmoothingEnabled = false;
      canvases.push({ ctx, slices: entry.slices(), w: canvas.width, h: canvas.height });
    }
  }

  document.body.appendChild(overlay);

  let angle = 0;
  let raf = 0;
  const draw = () => {
    angle = (angle + 0.45) % 360;
    for (const item of canvases) {
      item.ctx.clearRect(0, 0, item.w, item.h);
      item.ctx.fillStyle = '#050a12';
      item.ctx.fillRect(0, 0, item.w, item.h);
      drawStack(
        item.ctx,
        item.slices,
        item.w / 2,
        item.h * 0.78,
        angle,
        0,
        4.5,
        0,
        3.0,
        0,
        0,
        DEFAULT_SLICE_PITCH_Y,
      );
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  let open = true;
  const close = () => {
    overlay.style.display = 'none';
    open = false;
    cancelAnimationFrame(raf);
  };
  const reopen = () => {
    overlay.style.display = 'flex';
    open = true;
    raf = requestAnimationFrame(draw);
  };
  const onCloseClick = () => close();
  overlay.querySelector('#gallery-close')?.addEventListener('click', onCloseClick);
  const onKey = (ev: KeyboardEvent) => {
    if (ev.key === 'g' || ev.key === 'G' || ev.key === 'Escape') {
      if (open) close();
      else reopen();
    }
  };
  window.addEventListener('keydown', onKey);

  return {
    toggle() {
      if (open) close();
      else reopen();
    },
    destroy() {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
      overlay.querySelector('#gallery-close')?.removeEventListener('click', onCloseClick);
      overlay.remove();
    },
  };
}
