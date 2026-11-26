// Milestone 4.1 Fix 8: lightweight model gallery / sprite inspector.
// Enable with ?gallery=1. Renders enlarged rotating Approach B turntables of
// every model so silhouettes can be visually approved up close.
import type { ModelSet } from '../render/models';
import { DEFAULT_SLICE_PITCH_Y, drawStack } from '../render/spriteStack';
import type { SpriteStackCache } from '../render/spriteStack';

export function isGalleryEnabled(search: string): boolean {
  return new URLSearchParams(search).get('gallery') === '1';
}

// ---------- Milestone 4.16: Interactive Gallery Controls (Headless-Testable) ----------

export const GALLERY_MIN_SPACING = 1.0;
export const GALLERY_MAX_SPACING = 8.0;
export const GALLERY_SPACING_STEP = 0.1;
export const GALLERY_DEFAULT_SPACING = 3.4;
export const GALLERY_MANUAL_ROTATE_DEG_PER_SEC = 110;
export const GALLERY_AUTO_SPIN_DEG_PER_SEC = 27;

export interface GalleryControlState {
  angleDeg: number;
  spacingPx: number;
  pitchY: number;
  autoSpin: boolean;
}

export function clampGallerySpacing(spacingPx: number): number {
  const safe = Number.isFinite(spacingPx) ? spacingPx : GALLERY_DEFAULT_SPACING;
  const clamped = Math.max(GALLERY_MIN_SPACING, Math.min(GALLERY_MAX_SPACING, safe));
  return Math.round(clamped * 10) / 10;
}

export function createGalleryControlState(
  overrides: Partial<GalleryControlState> = {},
): GalleryControlState {
  const rawAngle = overrides.angleDeg ?? 0;
  return {
    angleDeg: ((rawAngle % 360) + 360) % 360,
    spacingPx: clampGallerySpacing(overrides.spacingPx ?? GALLERY_DEFAULT_SPACING),
    pitchY: overrides.pitchY ?? DEFAULT_SLICE_PITCH_Y,
    autoSpin: overrides.autoSpin ?? true,
  };
}

/** Pure continuous update for held keys (A/D/Left/Right rotate, W/S/Up/Down adjust spacing). */
export function stepGalleryControls(
  state: GalleryControlState,
  heldKeys: ReadonlySet<string>,
  dt: number,
): GalleryControlState {
  const safeDt = Math.max(0, dt);
  const rotLeft = heldKeys.has('KeyA') || heldKeys.has('ArrowLeft');
  const rotRight = heldKeys.has('KeyD') || heldKeys.has('ArrowRight');
  const spaceUp = heldKeys.has('KeyW') || heldKeys.has('ArrowUp');
  const spaceDown = heldKeys.has('KeyS') || heldKeys.has('ArrowDown');

  let angleDeg = state.angleDeg;
  let autoSpin = state.autoSpin;
  let spacingPx = state.spacingPx;

  if (rotLeft !== rotRight) {
    autoSpin = false;
    const dir = rotRight ? 1 : -1;
    angleDeg = (((angleDeg + dir * GALLERY_MANUAL_ROTATE_DEG_PER_SEC * safeDt) % 360) + 360) % 360;
  } else if (autoSpin) {
    angleDeg = (((angleDeg + GALLERY_AUTO_SPIN_DEG_PER_SEC * safeDt) % 360) + 360) % 360;
  }

  if (spaceUp !== spaceDown) {
    const dir = spaceUp ? 1 : -1;
    // Scale continuous adjustment in crisp 0.1px increments (~1.5px/sec while held)
    const steps = Math.max(1, Math.round(safeDt * 15));
    spacingPx = clampGallerySpacing(spacingPx + dir * GALLERY_SPACING_STEP * steps);
  }

  return { angleDeg, spacingPx, pitchY: state.pitchY, autoSpin };
}

/** Pure discrete key press handler for single-tap adjustments and Space auto-spin toggle. */
export function applyGalleryKeyPress(
  state: GalleryControlState,
  code: string,
): GalleryControlState {
  if (code === 'KeyW' || code === 'ArrowUp') {
    return {
      ...state,
      spacingPx: clampGallerySpacing(state.spacingPx + GALLERY_SPACING_STEP),
    };
  }
  if (code === 'KeyS' || code === 'ArrowDown') {
    return {
      ...state,
      spacingPx: clampGallerySpacing(state.spacingPx - GALLERY_SPACING_STEP),
    };
  }
  if (code === 'KeyA' || code === 'ArrowLeft') {
    return {
      ...state,
      autoSpin: false,
      angleDeg: (((state.angleDeg - 5) % 360) + 360) % 360,
    };
  }
  if (code === 'KeyD' || code === 'ArrowRight') {
    return {
      ...state,
      autoSpin: false,
      angleDeg: (((state.angleDeg + 5) % 360) + 360) % 360,
    };
  }
  if (code === 'Space') {
    return { ...state, autoSpin: !state.autoSpin };
  }
  return state;
}

export function formatGalleryTelemetry(state: GalleryControlState): string {
  const angle = Math.round(((state.angleDeg % 360) + 360) % 360) % 360;
  return `STACK SPACING: ${state.spacingPx.toFixed(1)}px  |  PITCH Y: ${state.pitchY.toFixed(2)}  |  ANGLE: ${angle}°`;
}

export interface GalleryHandle {
  destroy(): void;
  toggle(): void;
  close?(): void;
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

export interface GalleryOptions {
  onClose?: () => void;
  closeLabel?: string;
}

/**
 * Opens the gallery overlay. `cache` is accepted so the inspector can be
 * extended with baked-angle readouts without re-baking anything.
 */
export function createModelGallery(
  resources: { models: ModelSet; cache: SpriteStackCache },
  options: GalleryOptions = {},
): GalleryHandle {
  const list = entries(resources.models);
  const overlay = document.createElement('div');
  overlay.id = 'model-gallery';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:10000;background:rgba(5,7,13,0.96);' +
    'display:flex;flex-direction:column;align-items:center;overflow:auto;padding:24px;' +
    'font-family:ui-monospace,monospace;color:#e2e8f0;';

  const closeLabel = options.closeLabel ?? 'CLOSE [G]';
  const header = document.createElement('div');
  header.style.cssText = 'width:100%;max-width:1180px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;';
  header.innerHTML =
    '<div style="font-size:20px;color:#22d3ee;letter-spacing:4px;text-shadow:0 0 12px #22d3ee;">MODEL GALLERY // SPRITE INSPECTOR · 5× TURNTABLE</div>' +
    '<div style="display:flex;gap:8px;align-items:center;">' +
    '<button id="gallery-spin-toggle" style="background:#0f172a;color:#4ade80;border:1px solid #4ade80;padding:6px 12px;font:inherit;font-size:11px;cursor:pointer;letter-spacing:1px;">AUTO-SPIN: ON [SPACE]</button>' +
    `<button id="gallery-close" style="background:#0f172a;color:#f43f5e;border:2px solid #f43f5e;padding:6px 14px;font:inherit;cursor:pointer;letter-spacing:2px;">${closeLabel}</button>` +
    '</div>';
  overlay.appendChild(header);

  // Milestone 4.16: Prominent live numeric telemetry badge + interactive controls legend
  const telemetryBar = document.createElement('div');
  telemetryBar.style.cssText =
    'width:100%;max-width:1180px;display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;' +
    'background:rgba(11,18,32,0.92);border:1px solid #22d3ee;padding:10px 16px;margin-bottom:16px;box-shadow:0 0 14px rgba(34,211,238,0.22);';
  telemetryBar.innerHTML =
    '<div id="gallery-telemetry" style="font-size:14px;font-weight:bold;color:#facc15;letter-spacing:1.5px;text-shadow:0 0 8px rgba(250,204,21,0.45);"></div>' +
    '<div style="font-size:11px;color:#94a3b8;letter-spacing:0.8px;">A/D or ←/→ Rotate · W/S or ↑/↓ Stack Spacing (0.1px) · SPACE Auto-Spin</div>';
  overlay.appendChild(telemetryBar);

  const telemetryEl = telemetryBar.querySelector('#gallery-telemetry') as HTMLDivElement;
  const spinToggleBtn = header.querySelector('#gallery-spin-toggle') as HTMLButtonElement;

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

  let controlState = createGalleryControlState();
  const heldKeys = new Set<string>();
  let lastFrameMs = typeof performance !== 'undefined' ? performance.now() : 0;
  let raf = 0;

  const syncTelemetry = () => {
    telemetryEl.textContent = formatGalleryTelemetry(controlState);
    spinToggleBtn.textContent = `AUTO-SPIN: ${controlState.autoSpin ? 'ON' : 'OFF'} [SPACE]`;
    spinToggleBtn.style.color = controlState.autoSpin ? '#4ade80' : '#f59e0b';
    spinToggleBtn.style.borderColor = controlState.autoSpin ? '#4ade80' : '#f59e0b';
  };
  syncTelemetry();

  const draw = (nowMs: number) => {
    const dt = lastFrameMs > 0 ? Math.min(0.1, Math.max(0, (nowMs - lastFrameMs) / 1000)) : 1 / 60;
    lastFrameMs = nowMs;
    controlState = stepGalleryControls(controlState, heldKeys, dt);
    syncTelemetry();

    for (const item of canvases) {
      item.ctx.clearRect(0, 0, item.w, item.h);
      item.ctx.fillStyle = '#050a12';
      item.ctx.fillRect(0, 0, item.w, item.h);
      drawStack(
        item.ctx,
        item.slices,
        item.w / 2,
        item.h * 0.78,
        controlState.angleDeg,
        0,
        4.5,
        0,
        controlState.spacingPx,
        0,
        0,
        controlState.pitchY,
      );
    }
    raf = requestAnimationFrame(draw);
  };
  raf = requestAnimationFrame(draw);

  let open = true;
  const close = () => {
    if (!open) return;
    heldKeys.clear();
    overlay.style.display = 'none';
    open = false;
    cancelAnimationFrame(raf);
    options.onClose?.();
  };
  const reopen = () => {
    overlay.style.display = 'flex';
    open = true;
    lastFrameMs = typeof performance !== 'undefined' ? performance.now() : 0;
    raf = requestAnimationFrame(draw);
  };
  const onCloseClick = () => close();
  const onSpinClick = () => {
    controlState = applyGalleryKeyPress(controlState, 'Space');
    syncTelemetry();
  };
  overlay.querySelector('#gallery-close')?.addEventListener('click', onCloseClick);
  spinToggleBtn.addEventListener('click', onSpinClick);

  const GALLERY_CONTROL_CODES = new Set([
    'KeyA', 'KeyD', 'KeyW', 'KeyS',
    'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown',
    'Space',
  ]);

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key === 'g' || ev.key === 'G' || ev.key === 'Escape') {
      if (open) {
        ev.preventDefault();
        ev.stopPropagation();
        close();
      } else if (!options.onClose) {
        reopen();
      }
      return;
    }
    if (!open) return;
    if (GALLERY_CONTROL_CODES.has(ev.code)) {
      ev.preventDefault();
      ev.stopPropagation();
      if (!heldKeys.has(ev.code)) {
        controlState = applyGalleryKeyPress(controlState, ev.code);
        syncTelemetry();
      }
      if (ev.code !== 'Space') {
        heldKeys.add(ev.code);
      }
    }
  };
  const onKeyUp = (ev: KeyboardEvent) => {
    heldKeys.delete(ev.code);
  };
  window.addEventListener('keydown', onKeyDown, true);
  window.addEventListener('keyup', onKeyUp, true);

  return {
    toggle() {
      if (open) close();
      else reopen();
    },
    close() {
      close();
    },
    destroy() {
      heldKeys.clear();
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKeyDown, true);
      window.removeEventListener('keyup', onKeyUp, true);
      overlay.querySelector('#gallery-close')?.removeEventListener('click', onCloseClick);
      spinToggleBtn.removeEventListener('click', onSpinClick);
      overlay.remove();
    },
  };
}
