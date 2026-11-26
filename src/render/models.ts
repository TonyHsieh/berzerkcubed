// Approach B voxel-stack models. Local sprite "UP" (-Y, 0°) is forward.
import type { OrbitalType, OttoVariant, WeaponType } from '../engine/types';
import { makeSlice, type SpriteStackCache } from './spriteStack';

export const SLICE_SIZE = 24;
type Ctx = CanvasRenderingContext2D;
type Slice = HTMLCanvasElement;

const layers = (n: number, fn: (ctx: Ctx, cx: number, cy: number, z: number) => void): Slice[] =>
  Array.from({ length: n }, (_, z) => makeSlice(SLICE_SIZE, (ctx, s) => fn(ctx, s / 2, s / 2, z)));

const rect = (ctx: Ctx, color: string, x: number, y: number, w: number, h: number) => {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
};

// ---------------- Hero ----------------

export interface HeroModel {
  legsIdle: Slice[];
  legsRun: Slice[][]; // 4 frames
  legsRoll: Slice[];
  torso: Slice[];
  weaponStacks: Record<WeaponType, Slice[]>;
}

function legStack(left: number, right: number, tuck = 0): Slice[] {
  return layers(6, (ctx, cx, cy, z) => {
    if (z < tuck) return;
    if (z === tuck) {
      rect(ctx, '#1e293b', cx - 5, cy - 2 + left, 4, 5);
      rect(ctx, '#1e293b', cx + 1, cy - 2 + right, 4, 5);
      rect(ctx, '#64748b', cx - 5, cy - 3 + left, 4, 2);
      rect(ctx, '#64748b', cx + 1, cy - 3 + right, 4, 2);
    } else if (z <= 3) {
      const c = z === 2 ? '#0284c7' : '#0369a1';
      rect(ctx, c, cx - 5, cy - 2 + left * 0.7, 4, 4);
      rect(ctx, c, cx + 1, cy - 2 + right * 0.7, 4, 4);
    } else {
      rect(ctx, '#334155', cx - 5, cy - 3, 10, 6);
      rect(ctx, '#eab308', cx - 2, cy - 4, 4, 1);
    }
  });
}

const WEAPON_COLORS: Record<WeaponType, string> = {
  pulse_rifle: '#38bdf8',
  spread: '#a78bfa',
  machine_gun: '#facc15',
  shotgun: '#fb923c',
  beam: '#f43f5e',
  wide_beam: '#e879f9',
  flamethrower: '#f97316',
  bouncing_lightning: '#67e8f9',
  grenade: '#4ade80',
  mine: '#fde047',
};

function weaponStack(glow: string, bulk: number): Slice[] {
  return layers(4, (ctx, cx, cy, z) => {
    if (z === 1 || z === 2) {
      rect(ctx, '#1e293b', cx + 5, cy - 11, 3 + bulk, 12);
      rect(ctx, '#94a3b8', cx + 6, cy - 12, 1, 10);
      if (z === 2) rect(ctx, glow, cx + 6, cy - 8, 1 + bulk, 4);
    } else {
      rect(ctx, '#334155', cx + 5, cy - 8, 3, 7);
    }
  });
}

export function buildHeroModel(): HeroModel {
  const torso = layers(10, (ctx, cx, cy, z) => {
    if (z <= 4) {
      const w = z >= 3 ? 14 : 11;
      rect(ctx, z % 2 === 0 ? '#0284c7' : '#0ea5e9', cx - w / 2, cy - 4, w, 7);
      rect(ctx, '#38bdf8', cx - 4, cy - 5, 8, 2);
      rect(ctx, '#475569', cx - 4, cy + 3, 8, 4);
      rect(ctx, '#22d3ee', cx - 2, cy + 6, 4, 1);
    } else if (z === 5) {
      rect(ctx, '#1e293b', cx - 3, cy - 3, 6, 6);
    } else {
      const r = z === 9 ? 3 : 4;
      rect(ctx, '#e2e8f0', cx - r, cy - r, r * 2, r * 2);
      if (z === 7 || z === 8) rect(ctx, '#facc15', cx - 3, cy - r - 1, 6, 2);
    }
  });
  const weaponStacks = {} as Record<WeaponType, Slice[]>;
  (Object.keys(WEAPON_COLORS) as WeaponType[]).forEach((w, i) => {
    weaponStacks[w] = weaponStack(WEAPON_COLORS[w], i % 3 === 0 ? 0 : 1);
  });
  return {
    legsIdle: legStack(0, 0),
    legsRun: [legStack(-4, 4), legStack(-1, 1), legStack(4, -4), legStack(1, -1)],
    legsRoll: legStack(-2, 2, 1),
    torso,
    weaponStacks,
  };
}

// ---------------- Enemies ----------------

/**
 * Melee Enforcer: lean, tall humanoid soldier. Separated striding legs with a
 * visible gap, narrow waist, broad shoulder pads and twin neon-red batons.
 * 12 layers × 3 gait frames, still baked into one drawImage per enemy.
 */
export function buildEnforcerFrames(): Slice[][] {
  const swings = [0, 3, -3];
  return swings.map((sw) =>
    layers(12, (ctx, cx, cy, z) => {
      const chassis = '#08080d';
      const plate = '#1c1c26';
      const neon = '#dc2626';
      const hot = '#ff2a2a';
      if (z <= 3) {
        const leg = Math.round((sw * z) / 3);
        rect(ctx, chassis, cx - 5 + leg, cy - 3, 4, 9);
        rect(ctx, chassis, cx + 1 - leg, cy - 3, 4, 9);
        rect(ctx, neon, cx - 5 + leg, cy + 5, 4, 1);
        rect(ctx, neon, cx + 1 - leg, cy + 5, 4, 1);
        if (z === 3) rect(ctx, plate, cx - 5, cy - 3, 10, 3);
      } else if (z <= 8) {
        const w = z <= 5 ? 10 : 14;
        rect(ctx, chassis, cx - w / 2, cy - 7, w, 9);
        rect(ctx, plate, cx - 8, cy - 8, 4, 4);
        rect(ctx, plate, cx + 4, cy - 8, 4, 4);
        rect(ctx, neon, cx - 8, cy - 9, 4, 1);
        rect(ctx, neon, cx + 4, cy - 9, 4, 1);
        rect(ctx, hot, cx - 2, cy - 6 + Math.round(sw / 2), 4, 3);
        rect(ctx, chassis, cx - 9, cy - 2 + sw, 2, 7);
        rect(ctx, chassis, cx + 7, cy - 2 - sw, 2, 7);
        rect(ctx, hot, cx - 10, cy - 7 + sw, 2, 4);
        rect(ctx, hot, cx + 8, cy - 7 - sw, 2, 4);
      } else {
        rect(ctx, chassis, cx - 4, cy - 5, 8, 8);
        rect(ctx, hot, cx - 3, cy - 6, 6, 2);
        rect(ctx, neon, cx - 1, cy - 9, 2, 3);
      }
    }),
  );
}

/** Laser Shooter: wide tripod/turret-shouldered sniper droid with an amber barrel and crest. */
export function buildLaserShooterFrames(): Slice[][] {
  return [0, 1].map((f) => {
    const step = f === 0 ? 2 : -2;
    return layers(12, (ctx, cx, cy, z) => {
      const body = '#0c0c12';
      const amber = '#f59e0b';
      if (z <= 2) {
        rect(ctx, body, cx - 7 + step, cy - 2, 4, 8);
        rect(ctx, body, cx + 3 - step, cy - 2, 4, 8);
        rect(ctx, body, cx - 1, cy, 2, 7);
        rect(ctx, amber, cx - 7 + step, cy + 5, 4, 1);
        rect(ctx, amber, cx + 3 - step, cy + 5, 4, 1);
      } else if (z <= 7) {
        rect(ctx, body, cx - 9, cy - 8, 18, 9);
        rect(ctx, '#b45309', cx - 10, cy - 9, 5, 4);
        rect(ctx, '#b45309', cx + 5, cy - 9, 5, 4);
        rect(ctx, amber, cx - 2, cy - 7, 4, 4);
      } else {
        rect(ctx, body, cx - 4, cy - 5, 8, 7);
        rect(ctx, amber, cx - 3, cy - 6, 6, 2);
        rect(ctx, '#fbbf24', cx - 1, cy - 12, 2, 10);
        rect(ctx, '#fde68a', cx - 1, cy - 12, 2, 2);
      }
    });
  });
}

/** Grenadier: squat heavy bombardier mech with twin mortar tubes and a wide stance. */
export function buildGrenadierFrames(): Slice[][] {
  return [0, 1].map((f) => {
    const step = f === 0 ? 3 : -3;
    return layers(12, (ctx, cx, cy, z) => {
      const hull = '#141014';
      const red = '#dc2626';
      const yellow = '#facc15';
      if (z <= 3) {
        rect(ctx, hull, cx - 8 + step, cy - 3, 6, 9);
        rect(ctx, hull, cx + 2 - step, cy - 3, 6, 9);
        rect(ctx, yellow, cx - 8 + step, cy + 5, 6, 1);
        rect(ctx, yellow, cx + 2 - step, cy + 5, 6, 1);
      } else if (z <= 8) {
        rect(ctx, hull, cx - 9, cy - 9, 18, 11);
        rect(ctx, red, cx - 9, cy - 10, 18, 1);
        rect(ctx, '#3f1414', cx - 11, cy - 12, 5, 7);
        rect(ctx, '#3f1414', cx + 7, cy - 12, 5, 7);
        rect(ctx, red, cx - 11, cy - 12, 5, 1);
        rect(ctx, red, cx + 7, cy - 12, 5, 1);
        rect(ctx, yellow, cx - 10, cy - 11, 3, 2);
        rect(ctx, yellow, cx + 8, cy - 11, 3, 2);
      } else {
        rect(ctx, hull, cx - 5, cy - 6, 10, 8);
        rect(ctx, yellow, cx - 4, cy - 7, 8, 2);
        rect(ctx, red, cx - 2, cy - 5, 4, 2);
      }
    });
  });
}

// ---------------- Bosses ----------------

export interface MaximilianModel {
  body: Slice[];
  blades: Slice[]; // rotate independently via bladeAngle
}

export function buildMaximilian(): MaximilianModel {
  // Floating humanoid killer robot: tapered thruster skirt, broad armored
  // shoulders with articulated sawblade arms, horned crimson helmet + visor.
  const body = layers(14, (ctx, cx, cy, z) => {
    const obsidian = '#0a0709';
    const crimson = '#7f1d1d';
    const steel = '#1c1917';
    const glow = '#ff2a2a';
    if (z <= 3) {
      const w = 16 - z * 2;
      rect(ctx, steel, cx - w / 2, cy - 2, w, 6);
      rect(ctx, crimson, cx - w / 2, cy + 3, w, 1);
      if (z === 0) {
        rect(ctx, '#f43f5e', cx - 5, cy + 5, 3, 2);
        rect(ctx, '#f43f5e', cx + 2, cy + 5, 3, 2);
        rect(ctx, '#fde68a', cx - 4, cy + 6, 2, 1);
        rect(ctx, '#fde68a', cx + 3, cy + 6, 2, 1);
      }
    } else if (z <= 8) {
      const broad = z >= 6;
      const w = broad ? 20 : 14;
      rect(ctx, obsidian, cx - w / 2, cy - 6, w, 9);
      rect(ctx, crimson, cx - 10, cy - 7, 5, 3);
      rect(ctx, crimson, cx + 5, cy - 7, 5, 3);
      rect(ctx, steel, cx - 11, cy - 2, 3, 6);
      rect(ctx, steel, cx + 8, cy - 2, 3, 6);
      rect(ctx, '#dc2626', cx - 11, cy + 3, 3, 1);
      rect(ctx, '#dc2626', cx + 8, cy + 3, 3, 1);
      if (z === 7) rect(ctx, glow, cx - 2, cy - 4, 4, 4);
    } else {
      const w = z <= 11 ? 12 : 8;
      rect(ctx, obsidian, cx - w / 2, cy - 5, w, 7);
      rect(ctx, crimson, cx - w / 2, cy - 6, w, 1);
      if (z >= 11 && z <= 12) {
        rect(ctx, glow, cx - 4, cy - 3, 8, 2);
        rect(ctx, '#fecaca', cx - 3, cy - 3, 6, 1);
      }
      if (z === 13) {
        rect(ctx, crimson, cx - 6, cy - 8, 2, 3);
        rect(ctx, crimson, cx + 4, cy - 8, 2, 3);
      }
    }
  });
  const blades = layers(4, (ctx, cx, cy, z) => {
    // Twin toothed voxel sawblades on articulated arms.
    const len = z === 1 || z === 2 ? 4 : 3;
    for (const side of [-1, 1]) {
      const bx = cx + side * 7;
      ctx.fillStyle = z % 2 ? '#e5e7eb' : '#94a3b8';
      ctx.fillRect(bx - 1, cy - len, 2, len * 2);
      ctx.fillRect(bx - len, cy - 1, len * 2, 2);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(bx - len, cy - 1, 2, 3);
      ctx.fillRect(bx + len - 2, cy - 1, 2, 3);
      ctx.fillRect(bx - 1, cy - len, 2, 3);
      ctx.fillRect(bx - 1, cy + len - 2, 2, 3);
    }
  });
  return { body, blades };
}

export interface RecogniserModel {
  legs: Slice[][]; // one stack per destructible strut (index = leg)
  head: Slice[];
}

export function buildRecogniser(): RecogniserModel {
  const corner: Array<[number, number]> = [[-8, -8], [8, -8], [-8, 8], [8, 8]];
  const legs = corner.map(([ox, oy]) =>
    layers(8, (ctx, cx, cy, z) => {
      rect(ctx, z % 2 ? '#1f2937' : '#111827', cx + ox - 1.5, cy + oy - 1.5, 3, 3);
      if (z === 7) rect(ctx, '#38bdf8', cx + ox - 2, cy + oy - 2, 4, 1);
    }),
  );
  const head = layers(8, (ctx, cx, cy, z) => {
    const w = z < 2 ? 18 : z < 6 ? 20 : 12;
    rect(ctx, '#0b1220', cx - w / 2, cy - w / 2, w, w);
    rect(ctx, '#22d3ee', cx - w / 2, cy - w / 2, w, 1);
    if (z >= 6) rect(ctx, '#f43f5e', cx - 3, cy - 3, 6, 6); // exposed core
  });
  return { legs, head };
}

const OTTO_PALETTE: Record<OttoVariant, { body: string; glow: string; size: number }> = {
  classic: { body: '#1c1917', glow: '#fde047', size: 12 },
  volt: { body: '#1e1b4b', glow: '#facc15', size: 14 },
  cryo: { body: '#0c4a6e', glow: '#a5f3fc', size: 16 },
  vortex: { body: '#3b0764', glow: '#e879f9', size: 18 },
};

export function buildEvilOtto(): Record<OttoVariant, Slice[]> {
  const out = {} as Record<OttoVariant, Slice[]>;
  (Object.keys(OTTO_PALETTE) as OttoVariant[]).forEach((v) => {
    const p = OTTO_PALETTE[v];
    out[v] = layers(10, (ctx, cx, cy, z) => {
      const w = Math.min(22, z === 0 || z === 9 ? p.size - 4 : p.size);
      rect(ctx, p.body, cx - w / 2, cy - w / 2, w, w);
      rect(ctx, p.glow, cx - w / 2, cy - w / 2, w, 1);
      if (z === 5 || z === 6) {
        // two wide menacing eyes
        rect(ctx, p.glow, cx - w / 2 + 2, cy - w / 2 - 1, 3, 3);
        rect(ctx, p.glow, cx + w / 2 - 5, cy - w / 2 - 1, 3, 3);
      }
    });
  });
  return out;
}

// ---------------- Props & orbitals ----------------

export function buildCrate(): Slice[] {
  return layers(6, (ctx, cx, cy, z) => {
    rect(ctx, z % 2 ? '#1e293b' : '#0f172a', cx - 8, cy - 8, 16, 16);
    rect(ctx, '#22d3ee', cx - 8, cy - 8, 16, 1);
    rect(ctx, '#22d3ee', cx - 8, cy + 7, 16, 1);
    if (z === 5) rect(ctx, '#0ea5e9', cx - 4, cy - 4, 8, 8);
  });
}

export function buildOrbitalStacks(): Record<OrbitalType, Slice[]> {
  return {
    shooter_drone: layers(3, (ctx, cx, cy, z) => {
      rect(ctx, '#334155', cx - 3, cy - 3, 6, 6);
      if (z === 2) rect(ctx, '#22d3ee', cx - 1, cy - 4, 2, 2);
    }),
    lightsaber: layers(3, (ctx, cx, cy, z) => {
      rect(ctx, z === 1 ? '#e0f2fe' : '#38bdf8', cx - 1, cy - 8, 2, 16);
      rect(ctx, '#475569', cx - 2, cy + 6, 4, 3);
    }),
    ablative_shield: layers(4, (ctx, cx, cy, z) => {
      rect(ctx, z % 2 ? '#0ea5e9' : '#0369a1', cx - 6, cy - 2, 12, 4);
      rect(ctx, '#7dd3fc', cx - 6, cy - 2, 12, 1);
    }),
  };
}

// ---------------- Aggregate + cache baking ----------------

export interface ModelSet {
  hero: HeroModel;
  enforcer: Slice[][];
  laserShooter: Slice[][];
  grenadier: Slice[][];
  maximilian: MaximilianModel;
  recogniser: RecogniserModel;
  evilOtto: Record<OttoVariant, Slice[]>;
  crate: Slice[];
  orbitals: Record<OrbitalType, Slice[]>;
}

export function buildAllModels(): ModelSet {
  return {
    hero: buildHeroModel(),
    enforcer: buildEnforcerFrames(),
    laserShooter: buildLaserShooterFrames(),
    grenadier: buildGrenadierFrames(),
    maximilian: buildMaximilian(),
    recogniser: buildRecogniser(),
    evilOtto: buildEvilOtto(),
    crate: buildCrate(),
    orbitals: buildOrbitalStacks(),
  };
}

/** Cache key for an enemy kind + animation frame (e.g. "enforcer_melee#1"). */
export const enemyCacheKey = (kind: string, frame: number): string => `${kind}#${frame}`;

export interface BakeTask {
  label: string;
  run: () => void;
}

/**
 * Frame-yieldable bake steps. The loading screen runs these one at a time with
 * requestAnimationFrame yields; bakeSwarmCaches runs the same list eagerly.
 */
export function getBakeTasks(
  cache: SpriteStackCache,
  models: ModelSet,
  scale: number,
  spacingPx: number,
): BakeTask[] {
  const tasks: BakeTask[] = [];
  const bakeFrames = (kind: string, frames: Slice[][]) =>
    frames.forEach((frame, i) => {
      tasks.push({
        label: `BAKING 24-ANGLE ${kind.toUpperCase()} CACHE ${i + 1}/${frames.length}`,
        run: () => cache.bake(enemyCacheKey(kind, i), frame, scale, spacingPx),
      });
    });

  bakeFrames('enforcer_melee', models.enforcer);
  bakeFrames('laser_shooter', models.laserShooter);
  bakeFrames('grenadier', models.grenadier);
  tasks.push({
    label: 'BAKING DESTRUCTIBLE CRATE CACHE',
    run: () => cache.bake('crate', models.crate, scale, spacingPx),
  });
  return tasks;
}

/** Pre-bake the swarm enemies and crates (24 angles × frames) at startup. */
export function bakeSwarmCaches(
  cache: SpriteStackCache,
  models: ModelSet,
  scale: number,
  spacingPx: number,
): void {
  for (const task of getBakeTasks(cache, models, scale, spacingPx)) {
    task.run();
  }
}
