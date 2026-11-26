// Milestone 4.1 Fix 1: instant startup thermometer + non-blocking asset bake.
// The neon thermometer lives in index.html so it paints at t=0ms, before the
// ES module graph (Vite dev modules + Tone.js) is even downloaded.
import {
  buildAllModels,
  getBakeTasks,
  type ModelSet,
} from '../render/models';
import { SpriteStackCache } from '../render/spriteStack';

const SPRITE_SCALE = 2;
const BASE_LAYER_SPACING = 2.0;

export const LOAD_STAGES = [
  'LOADING ENGINE & AUDIO MODULES',
  'BUILDING HERO, HUMANOID ENEMY & BOSS VOXEL STACKS',
  'BAKING 24-ANGLE OFFSCREEN SWARM CACHES',
  'INITIALIZING CIRCUIT GRID & HUD',
] as const;

export interface LoadingScreen {
  setProgress(fraction: number, label: string): void;
  finish(): void;
  destroy(): void;
}

/** Yield to the browser between heavy bake steps so the UI can repaint. */
function nextFrame(): Promise<void> {
  if (typeof requestAnimationFrame === 'function') {
    return new Promise((resolve) => requestAnimationFrame(() => resolve()));
  }
  return new Promise((resolve) => setTimeout(resolve, 0));
}

/**
 * Build models and bake 24-angle caches in frame-yielded chunks. The same
 * `getBakeTasks` list is used by the synchronous renderer path, so there is a
 * single source of truth for what loading means.
 */
export async function bootstrapAssets(
  onProgress: (fraction: number, label: string) => void,
): Promise<{ models: ModelSet; cache: SpriteStackCache }> {
  onProgress(0.02, LOAD_STAGES[0]);
  await nextFrame();

  const models = buildAllModels();
  onProgress(0.08, LOAD_STAGES[1]);
  await nextFrame();

  const cache = new SpriteStackCache();
  const tasks = getBakeTasks(cache, models, SPRITE_SCALE, BASE_LAYER_SPACING);
  for (let i = 0; i < tasks.length; i++) {
    tasks[i].run();
    const fraction = 0.08 + 0.84 * ((i + 1) / tasks.length);
    onProgress(fraction, LOAD_STAGES[2]);
    await nextFrame();
  }

  onProgress(0.96, LOAD_STAGES[3]);
  await nextFrame();
  onProgress(1, 'READY');
  return { models, cache };
}

const INLINE_STYLE =
  'position:fixed;inset:0;z-index:9999;background:#05070d;display:flex;' +
  'align-items:center;justify-content:center;font-family:ui-monospace,monospace;' +
  'transition:opacity 240ms linear;';

const SCREEN_MARKUP = `
  <div style="text-align:center;color:#38bdf8;min-width:340px;">
    <div style="font-size:34px;font-weight:bold;letter-spacing:8px;text-shadow:0 0 18px #22d3ee;margin-bottom:6px;">BERZERK³</div>
    <div style="font-size:10px;color:#64748b;letter-spacing:3px;margin-bottom:28px;">NEON ARCADE SYSTEM // BOOT SEQUENCE</div>
    <div style="display:flex;align-items:flex-end;justify-content:center;gap:18px;">
      <div style="width:26px;height:220px;border:2px solid #22d3ee;background:#0b1220;position:relative;box-shadow:0 0 14px rgba(34,211,238,0.35);">
        <div id="loading-fill" style="position:absolute;left:2px;right:2px;bottom:2px;height:0%;background:linear-gradient(0deg,#0ea5e9,#22d3ee,#fef08a);box-shadow:0 0 14px #22d3ee;transition:height 120ms linear;"></div>
        <div style="position:absolute;inset:4px;background:repeating-linear-gradient(0deg,transparent 0 12px,rgba(5,7,13,0.55) 12px 14px);pointer-events:none;"></div>
      </div>
      <div style="text-align:left;width:280px;">
        <div id="loading-percent" style="font-size:30px;color:#facc15;text-shadow:0 0 12px #facc15;">0%</div>
        <div id="loading-stage" style="font-size:11px;color:#e2e8f0;letter-spacing:1px;min-height:30px;margin-top:8px;">LOADING ENGINE MODULES...</div>
        <div style="font-size:9px;color:#475569;margin-top:18px;">PRE-BAKING 24-ANGLE SPRITE STACK CACHES</div>
      </div>
    </div>
  </div>
`;

/**
 * DOM neon thermometer. Attaches to the element already present in index.html
 * (so there is no flash / blank frame); headless callers get an inert no-op.
 */
export function createLoadingScreen(): LoadingScreen {
  if (typeof document === 'undefined') {
    return {
      setProgress() {},
      finish() {},
      destroy() {},
    };
  }

  let root = document.getElementById('loading-screen') as HTMLDivElement | null;
  if (!root) {
    root = document.createElement('div');
    root.id = 'loading-screen';
    root.style.cssText = INLINE_STYLE;
    root.innerHTML = SCREEN_MARKUP;
    document.body.appendChild(root);
  } else {
    // Reuse the instant inline screen. Backfill markup for minimal hosts/tests.
    root.style.cssText = INLINE_STYLE;
    if (
      !root.querySelector('#loading-fill') ||
      !root.querySelector('#loading-percent') ||
      !root.querySelector('#loading-stage')
    ) {
      root.innerHTML = SCREEN_MARKUP;
    }
  }
  root.style.display = 'flex';
  root.style.opacity = '1';

  const fill = root.querySelector('#loading-fill') as HTMLDivElement;
  const percent = root.querySelector('#loading-percent') as HTMLDivElement;
  const stage = root.querySelector('#loading-stage') as HTMLDivElement;

  const setProgress = (fraction: number, label: string): void => {
    const clamped = Math.max(0, Math.min(1, fraction));
    fill.style.height = `${(clamped * 100).toFixed(1)}%`;
    percent.textContent = `${Math.round(clamped * 100)}%`;
    stage.textContent = label;
  };

  return {
    setProgress,
    finish() {
      setProgress(1, 'READY');
      root!.style.opacity = '0';
      window.setTimeout(() => root!.remove(), 260);
    },
    destroy() {
      root!.remove();
    },
  };
}
