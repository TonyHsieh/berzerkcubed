// Approach B voxel-stack models. Local sprite "UP" (-Y, 0°) is forward.
// Milestone 4.11: Light-to-medium metallic grey structural tones (#64748b, #94a3b8, #cbd5e1)
// paired with high-contrast red/yellow/orange/gold/cyan accents (zero black enemy silhouettes).
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
      rect(ctx, '#475569', cx - 5, cy - 2 + left, 4, 5);
      rect(ctx, '#475569', cx + 1, cy - 2 + right, 4, 5);
      rect(ctx, '#94a3b8', cx - 5, cy - 3 + left, 4, 2);
      rect(ctx, '#94a3b8', cx + 1, cy - 3 + right, 4, 2);
    } else if (z <= 3) {
      const c = z === 2 ? '#0284c7' : '#0ea5e9';
      rect(ctx, c, cx - 5, cy - 2 + left * 0.7, 4, 4);
      rect(ctx, c, cx + 1, cy - 2 + right * 0.7, 4, 4);
    } else {
      rect(ctx, '#64748b', cx - 5, cy - 3, 10, 6);
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
      rect(ctx, '#64748b', cx + 5, cy - 11, 3 + bulk, 12);
      rect(ctx, '#cbd5e1', cx + 6, cy - 12, 1, 10);
      if (z === 2) rect(ctx, glow, cx + 6, cy - 8, 1 + bulk, 4);
    } else {
      rect(ctx, '#94a3b8', cx + 5, cy - 8, 3, 7);
    }
  });
}

export function buildHeroModel(): HeroModel {
  const torso = layers(10, (ctx, cx, cy, z) => {
    if (z <= 4) {
      const w = z >= 3 ? 14 : 11;
      rect(ctx, z % 2 === 0 ? '#0284c7' : '#0ea5e9', cx - w / 2, cy - 4, w, 7);
      rect(ctx, '#38bdf8', cx - 4, cy - 5, 8, 2);
      // Glowing cyan chest core across front Z-band (z=1..3)
      if (z >= 1 && z <= 3) {
        rect(ctx, '#22d3ee', cx - 2, cy - 6, 4, 2);
        if (z === 2) rect(ctx, '#ffffff', cx - 1, cy - 6, 2, 1);
      }
      rect(ctx, '#64748b', cx - 4, cy + 3, 8, 4);
      rect(ctx, '#22d3ee', cx - 2, cy + 6, 4, 1);
    } else if (z === 5) {
      rect(ctx, '#64748b', cx - 3, cy - 3, 6, 6);
    } else {
      const r = z === 9 ? 3 : 4;
      rect(ctx, z === 9 ? '#f8fafc' : '#e2e8f0', cx - r, cy - r, r * 2, r * 2);
      // Distinct 3/4 front face bands: chin breather (z=6), bold gold visor (z=7..8), forehead crest (z=9)
      if (z === 6) {
        rect(ctx, '#334155', cx - 3, cy - r - 1, 6, 2);
        rect(ctx, '#94a3b8', cx - 2, cy - r - 1, 4, 1);
      } else if (z === 7 || z === 8) {
        rect(ctx, '#facc15', cx - 3, cy - r - 1, 6, 2);
        if (z === 8) rect(ctx, '#fef9c3', cx - 2, cy - r - 1, 4, 1);
      }
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

// ---------------- Redesigned Swarm Enemies (Metallic Grey + High-Contrast Accents) ----------------

/**
 * Basic Red Robot (`enforcer_melee`): Classic arcade Berzerk red robot silhouette —
 * bright crimson-red armor over medium-grey joints, rounded dome head with scanning
 * cyclops eye, wide boxy shoulders, hanging articulated arms, separated striding legs.
 */
export function buildEnforcerFrames(): Slice[][] {
  const swings = [0, 3, -3];
  return swings.map((sw) =>
    layers(12, (ctx, cx, cy, z) => {
      const crimson = '#dc2626';
      const brightRed = '#ef4444';
      const joint = '#64748b';
      const metal = '#94a3b8';
      const visor = '#fef08a';
      if (z <= 3) {
        const leg = Math.round((sw * z) / 3);
        rect(ctx, z === 0 ? metal : crimson, cx - 5 + leg, cy - 3, 4, 8);
        rect(ctx, z === 0 ? metal : crimson, cx + 1 - leg, cy - 3, 4, 8);
        rect(ctx, joint, cx - 5 + leg, cy + 4, 4, 2);
        rect(ctx, joint, cx + 1 - leg, cy + 4, 4, 2);
        if (z === 3) rect(ctx, joint, cx - 5, cy - 3, 10, 4);
      } else if (z <= 8) {
        // Boxy crimson torso + wide shoulders + hanging articulated arms
        const w = z <= 5 ? 11 : 14;
        rect(ctx, crimson, cx - w / 2, cy - 6, w, 9);
        rect(ctx, brightRed, cx - w / 2 + 1, cy - 7, w - 2, 2);
        rect(ctx, metal, cx - 9, cy - 6, 3, 4);
        rect(ctx, metal, cx + 6, cy - 6, 3, 4);
        // Hanging articulated arms
        rect(ctx, joint, cx - 9, cy - 2 + sw, 2, 7);
        rect(ctx, joint, cx + 7, cy - 2 - sw, 2, 7);
        rect(ctx, brightRed, cx - 10, cy + 3 + sw, 3, 3);
        rect(ctx, brightRed, cx + 7, cy + 3 - sw, 3, 3);
        if (z === 5 || z === 6) {
          // Metallic chest grille / core panel on front facade
          rect(ctx, '#1e293b', cx - 3, cy - 7, 6, 2);
          rect(ctx, '#cbd5e1', cx - 2, cy - 7, 4, 1);
        }
      } else {
        // Rounded dome head: mouth grille (z=9), recessed scanning cyclops eye (z=10), crimson forehead (z=11)
        const hw = z === 11 ? 6 : 8;
        rect(ctx, brightRed, cx - hw / 2, cy - 5, hw, 7);
        if (z === 9) {
          rect(ctx, '#1e293b', cx - 3, cy - 6, 6, 2);
          rect(ctx, '#94a3b8', cx - 2, cy - 6, 1, 1);
          rect(ctx, '#94a3b8', cx + 1, cy - 6, 1, 1);
        } else if (z === 10) {
          rect(ctx, '#0f172a', cx - 4, cy - 6, 8, 2);
          rect(ctx, visor, cx - 2 + Math.sign(sw), cy - 6, 3, 2);
          rect(ctx, '#ffffff', cx - 1 + Math.sign(sw), cy - 6, 1, 1);
        } else if (z === 11) {
          rect(ctx, '#f87171', cx - 2, cy - 6, 4, 1);
        }
      }
    }),
  );
}

/**
 * V-Shaped Attack Robot builder (inverted trapezoid V-body on single central rolling
 * wheel, prominent single glowing eye, side claw-arms, and top antenna).
 */
function buildVBotFrames(primary: string, stripe: string, eyeColor: string): Slice[][] {
  return [0, 1].map((f) => {
    const claw = f === 0 ? 1 : -1;
    return layers(12, (ctx, cx, cy, z) => {
      const darkMetal = '#64748b';
      const lightMetal = '#cbd5e1';
      if (z <= 2) {
        // Single central rolling wheel
        rect(ctx, darkMetal, cx - 2, cy - 5, 4, 10);
        rect(ctx, lightMetal, cx - 3, cy - 2, 6, 4);
        rect(ctx, f === 0 ? '#94a3b8' : '#cbd5e1', cx - 1, cy - 6, 2, 12);
      } else if (z <= 9) {
        // Inverted trapezoid V-body: narrow at waist (z=3), wide at shoulders (z=9)
        const w = 6 + (z - 3) * 2;
        rect(ctx, primary, cx - w / 2, cy - 5, w, 9);
        if (z === 5 || z === 7) {
          rect(ctx, stripe, cx - w / 2 + 1, cy - 5, w - 2, 2);
        }
        // Front mouth/vent grille band on lower V-face (z=4..5)
        if (z === 4 || z === 5) {
          rect(ctx, '#1e293b', cx - 3, cy - 6, 6, 2);
          rect(ctx, stripe, cx - 2, cy - 6, 4, 1);
        }
        // Side claw-arms extending from upper V
        if (z >= 6 && z <= 8) {
          rect(ctx, '#94a3b8', cx - w / 2 - 3, cy - 4 + claw, 3, 6);
          rect(ctx, '#94a3b8', cx + w / 2, cy - 4 - claw, 3, 6);
          rect(ctx, lightMetal, cx - w / 2 - 4, cy - 6 + claw, 2, 3);
          rect(ctx, lightMetal, cx + w / 2 + 2, cy - 6 - claw, 2, 3);
        }
        // Prominent single glowing central optical eye in dark housing (z=7..8) + brow (z=9)
        if (z === 7 || z === 8) {
          rect(ctx, '#0f172a', cx - 4, cy - 7, 8, 3);
          rect(ctx, eyeColor, cx - 2, cy - 7, 4, 2);
          rect(ctx, '#ffffff', cx - 1, cy - 7, 2, 1);
        } else if (z === 9) {
          rect(ctx, lightMetal, cx - 4, cy - 6, 8, 2);
        }
      } else {
        // Top cap + antenna
        rect(ctx, '#94a3b8', cx - 4, cy - 3, 8, 5);
        rect(ctx, lightMetal, cx - 1, cy - 3, 2, 2);
        if (z === 11) {
          rect(ctx, eyeColor, cx - 1, cy - 5, 2, 3);
        }
      }
    });
  });
}

/** Red V-Bot (`v_bot_melee`): aggressive fast melee rusher. */
export function buildVBotMeleeFrames(): Slice[][] {
  return buildVBotFrames('#dc2626', '#cbd5e1', '#fef08a');
}

/** Yellow V-Bot (`v_bot_laser`): mid-range laser shooter with yellow/white stripe chassis. */
export function buildVBotLaserFrames(): Slice[][] {
  return buildVBotFrames('#eab308', '#f8fafc', '#22d3ee');
}

/**
 * Laser Shooter (`laser_shooter`): wide angular yellow & light-grey industrial torso
 * with glowing red triangular chest core, twin articulated legs, and dual underslung
 * heavy laser rifles.
 */
export function buildLaserShooterFrames(): Slice[][] {
  return [0, 1].map((f) => {
    const step = f === 0 ? 2 : -2;
    return layers(12, (ctx, cx, cy, z) => {
      const grey = '#94a3b8';
      const lightGrey = '#cbd5e1';
      const yellow = '#facc15';
      const redCore = '#ef4444';
      if (z <= 3) {
        // Twin articulated legs
        rect(ctx, '#64748b', cx - 6 + step, cy - 2, 4, 8);
        rect(ctx, '#64748b', cx + 2 - step, cy - 2, 4, 8);
        rect(ctx, yellow, cx - 6 + step, cy + 5, 4, 2);
        rect(ctx, yellow, cx + 2 - step, cy + 5, 4, 2);
      } else if (z <= 8) {
        // Wide angular yellow & light-grey industrial torso
        rect(ctx, grey, cx - 8, cy - 6, 16, 10);
        rect(ctx, yellow, cx - 9, cy - 7, 18, 4);
        rect(ctx, lightGrey, cx - 6, cy - 5, 12, 6);
        // Glowing red triangular chest core
        if (z >= 5 && z <= 7) {
          const tw = z === 5 ? 6 : z === 6 ? 4 : 2;
          rect(ctx, redCore, cx - tw / 2, cy - 7, tw, 3);
        }
        // Dual underslung heavy laser rifles
        if (z >= 5 && z <= 7) {
          rect(ctx, '#64748b', cx - 10, cy - 11, 3, 10);
          rect(ctx, '#64748b', cx + 7, cy - 11, 3, 10);
          rect(ctx, '#ff2a55', cx - 10, cy - 12, 3, 2);
          rect(ctx, '#ff2a55', cx + 7, cy - 12, 3, 2);
        }
      } else {
        // Sensor head with distinct jaw grille (z=9), glowing cyan visor (z=10), yellow brow (z=11)
        rect(ctx, lightGrey, cx - 5, cy - 4, 10, 7);
        rect(ctx, yellow, cx - 5, cy - 5, 10, 2);
        if (z === 9) {
          rect(ctx, '#1e293b', cx - 3, cy - 6, 6, 2);
        } else if (z === 10) {
          rect(ctx, '#0f172a', cx - 4, cy - 6, 8, 2);
          rect(ctx, '#22d3ee', cx - 3, cy - 6, 6, 2);
          rect(ctx, '#ffffff', cx - 1, cy - 6, 2, 1);
        } else {
          rect(ctx, yellow, cx - 4, cy - 6, 8, 2);
        }
      }
    });
  });
}

/**
 * Grenadier (`grenadier`): tall yellow & medium-grey bipedal artillery walker with
 * 4-6 fanning angled shoulder/back mortar cannons.
 */
export function buildGrenadierFrames(): Slice[][] {
  return [0, 1].map((f) => {
    const step = f === 0 ? 3 : -3;
    return layers(12, (ctx, cx, cy, z) => {
      const metal = '#64748b';
      const light = '#94a3b8';
      const yellow = '#facc15';
      const orange = '#f97316';
      if (z <= 4) {
        // Tall bipedal walker legs
        rect(ctx, metal, cx - 7 + step, cy - 2, 5, 8);
        rect(ctx, metal, cx + 2 - step, cy - 2, 5, 8);
        rect(ctx, yellow, cx - 7 + step, cy + 5, 5, 2);
        rect(ctx, yellow, cx + 2 - step, cy + 5, 5, 2);
      } else if (z <= 8) {
        // Heavy yellow & grey armored hull with front chest core & vent grille
        rect(ctx, light, cx - 8, cy - 6, 16, 10);
        rect(ctx, yellow, cx - 7, cy - 7, 14, 4);
        rect(ctx, orange, cx - 3, cy - 8, 6, 2);
        if (z === 6 || z === 7) {
          rect(ctx, '#1e293b', cx - 4, cy - 8, 8, 2);
          rect(ctx, orange, cx - 2, cy - 8, 4, 2);
        }
      } else {
        // Head visor + 6 fanning shoulder/back mortar barrels
        rect(ctx, metal, cx - 5, cy - 4, 10, 7);
        rect(ctx, yellow, cx - 4, cy - 5, 8, 2);
        if (z === 9 || z === 10) {
          rect(ctx, '#0f172a', cx - 4, cy - 6, 8, 2);
          rect(ctx, '#ef4444', cx - 3, cy - 6, 2, 2);
          rect(ctx, '#ef4444', cx + 1, cy - 6, 2, 2);
        }
        const offsets = [-9, -6, -3, 1, 4, 7];
        const lift = z - 8;
        for (const ox of offsets) {
          rect(ctx, '#cbd5e1', cx + ox, cy - 6 - lift, 2, 5);
          if (z === 11) rect(ctx, orange, cx + ox, cy - 7 - lift, 2, 2);
        }
      }
    });
  });
}

// ---------------- Bosses (Light/Medium Grey Armor + High-Contrast Neon) ----------------

export interface MaximilianModel {
  body: Slice[];
  blades: Slice[]; // rotate independently via bladeAngle
}

export function buildMaximilian(): MaximilianModel {
  const body = layers(14, (ctx, cx, cy, z) => {
    const steel = '#64748b';
    const lightSteel = '#94a3b8';
    const crimson = '#dc2626';
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
      rect(ctx, lightSteel, cx - w / 2, cy - 6, w, 9);
      rect(ctx, crimson, cx - 10, cy - 7, 5, 3);
      rect(ctx, crimson, cx + 5, cy - 7, 5, 3);
      rect(ctx, steel, cx - 11, cy - 2, 3, 6);
      rect(ctx, steel, cx + 8, cy - 2, 3, 6);
      rect(ctx, '#ef4444', cx - 11, cy + 3, 3, 1);
      rect(ctx, '#ef4444', cx + 8, cy + 3, 3, 1);
      if (z >= 6 && z <= 7) {
        // Front chest reactor core
        rect(ctx, '#1e293b', cx - 3, cy - 7, 6, 3);
        rect(ctx, glow, cx - 2, cy - 7, 4, 2);
      }
    } else {
      const w = z <= 11 ? 12 : 8;
      rect(ctx, steel, cx - w / 2, cy - 5, w, 7);
      rect(ctx, crimson, cx - w / 2, cy - 6, w, 1);
      if (z === 9 || z === 10) {
        // Armored front jaw / breather grille
        rect(ctx, '#0f172a', cx - 4, cy - 6, 8, 2);
        rect(ctx, '#94a3b8', cx - 3, cy - 6, 2, 1);
        rect(ctx, '#94a3b8', cx + 1, cy - 6, 2, 1);
      }
      if (z >= 11 && z <= 12) {
        // Blazing red Maximilian horizontal eye visor on front face
        rect(ctx, '#0f172a', cx - 5, cy - 6, 10, 3);
        rect(ctx, glow, cx - 4, cy - 6, 8, 2);
        rect(ctx, '#fecaca', cx - 3, cy - 6, 6, 1);
      }
      if (z === 13) {
        rect(ctx, crimson, cx - 6, cy - 8, 2, 3);
        rect(ctx, crimson, cx + 4, cy - 8, 2, 3);
      }
    }
  });
  const blades = layers(4, (ctx, cx, cy, z) => {
    const len = z === 1 || z === 2 ? 4 : 3;
    for (const side of [-1, 1]) {
      const bx = cx + side * 7;
      ctx.fillStyle = z % 2 ? '#e5e7eb' : '#cbd5e1';
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
  /** TWO clearly separated vertical leg columns: [0] = left_leg, [1] = right_leg. */
  legs: Slice[][];
  /** Wide horizontal arch crossbar with geometric cutouts + sloped triangular cockpit head. */
  head: Slice[];
}

/**
 * Recogniser (Milestone 4.11 Fix): TWO clearly separated vertical leg columns with
 * flared triangular feet, wide horizontal arch crossbar with geometric cutouts, and
 * sloped triangular cockpit head on top — in medium-grey armor with blazing neon red outlines.
 */
export function buildRecogniser(): RecogniserModel {
  const buildLeg = (side: -1 | 1): Slice[] =>
    layers(9, (ctx, cx, cy, z) => {
      const ox = side * 8;
      const armor = z % 2 ? '#94a3b8' : '#64748b';
      const neonRed = '#ef4444';
      if (z <= 2) {
        // Flared triangular foot pad
        const fw = 7 - z;
        const fh = 8 - z;
        rect(ctx, armor, cx + ox - fw / 2, cy - fh / 2, fw, fh);
        rect(ctx, neonRed, cx + ox - fw / 2, cy - fh / 2, fw, 1);
        rect(ctx, neonRed, cx + ox - fw / 2, cy + fh / 2 - 1, fw, 1);
      } else {
        // Tall vertical strut column
        rect(ctx, armor, cx + ox - 2.5, cy - 3, 5, 6);
        rect(ctx, neonRed, cx + ox - 2.5, cy - 3, 5, 1);
        rect(ctx, '#cbd5e1', cx + ox - 1, cy - 2, 2, 4);
      }
    });

  const legs = [buildLeg(-1), buildLeg(1)];

  const head = layers(10, (ctx, cx, cy, z) => {
    const armor = z % 2 ? '#94a3b8' : '#64748b';
    const light = '#cbd5e1';
    const neonRed = '#ef4444';
    if (z <= 3) {
      // Wide horizontal arch crossbar spanning both legs with geometric cutouts
      rect(ctx, armor, cx - 11, cy - 4, 22, 8);
      rect(ctx, neonRed, cx - 11, cy - 4, 22, 1);
      rect(ctx, neonRed, cx - 11, cy + 3, 22, 1);
      // Geometric cutouts along the crossbar
      if (z === 1 || z === 2) {
        ctx.clearRect(cx - 5, cy - 2, 3, 4);
        ctx.clearRect(cx + 2, cy - 2, 3, 4);
      }
    } else {
      // Sloped triangular cockpit head narrowing upward
      const taper = z - 4;
      const w = Math.max(6, 14 - taper * 2);
      const h = Math.max(5, 10 - taper);
      rect(ctx, light, cx - w / 2, cy - h / 2, w, h);
      rect(ctx, neonRed, cx - w / 2, cy - h / 2, w, 1);
      if (z === 4 || z === 5) {
        // Lower cockpit intake grille on front face
        rect(ctx, '#0f172a', cx - 4, cy - h / 2 - 1, 8, 2);
        rect(ctx, '#94a3b8', cx - 3, cy - h / 2 - 1, 6, 1);
      } else if (z >= 6 && z <= 8) {
        // Glowing red cockpit viewport / core on front face
        rect(ctx, '#0f172a', cx - 4, cy - h / 2 - 1, 8, 3);
        rect(ctx, '#ff2a55', cx - 3, cy - h / 2 - 1, 6, 3);
        rect(ctx, '#fef08a', cx - 1, cy - h / 2 - 1, 2, 2);
      }
    }
  });

  return { legs, head };
}

const OTTO_PALETTE: Record<OttoVariant, { body: string; glow: string; size: number }> = {
  classic: { body: '#64748b', glow: '#fde047', size: 12 },
  volt: { body: '#475569', glow: '#facc15', size: 14 },
  cryo: { body: '#0284c7', glow: '#a5f3fc', size: 16 },
  vortex: { body: '#7e22ce', glow: '#e879f9', size: 18 },
};

export function buildEvilOtto(): Record<OttoVariant, Slice[]> {
  const out = {} as Record<OttoVariant, Slice[]>;
  (Object.keys(OTTO_PALETTE) as OttoVariant[]).forEach((v) => {
    const p = OTTO_PALETTE[v];
    out[v] = layers(10, (ctx, cx, cy, z) => {
      const w = Math.min(22, z === 0 || z === 9 ? p.size - 4 : p.size);
      rect(ctx, p.body, cx - w / 2, cy - w / 2, w, w);
      rect(ctx, p.glow, cx - w / 2, cy - w / 2, w, 1);
      // Iconic Evil Otto face in 3/4 view: wide sinister grin (z=2..3), glowing angry eyes (z=6..7), brow (z=8)
      if (z === 2 || z === 3) {
        rect(ctx, '#090d16', cx - w / 2 + 2, cy - w / 2 - 1, w - 4, 3);
        rect(ctx, p.glow, cx - w / 2 + 3, cy - w / 2 - 1, w - 6, 2);
        if (z === 3) {
          rect(ctx, '#090d16', cx - 1, cy - w / 2 - 1, 2, 2);
        }
      } else if (z === 6 || z === 7) {
        rect(ctx, '#090d16', cx - w / 2 + 1, cy - w / 2 - 1, 4, 3);
        rect(ctx, '#090d16', cx + w / 2 - 5, cy - w / 2 - 1, 4, 3);
        rect(ctx, p.glow, cx - w / 2 + 2, cy - w / 2 - 1, 3, 2);
        rect(ctx, p.glow, cx + w / 2 - 5, cy - w / 2 - 1, 3, 2);
        rect(ctx, '#ffffff', cx - w / 2 + 3, cy - w / 2 - 1, 1, 1);
        rect(ctx, '#ffffff', cx + w / 2 - 4, cy - w / 2 - 1, 1, 1);
      } else if (z === 8) {
        rect(ctx, p.glow, cx - w / 2 + 2, cy - w / 2 - 1, w - 4, 1);
      }
    });
  });
  return out;
}

// ---------------- Four New Boss Models (Milestone 4.11) ----------------

/** ABB — Another Boss Bot: light-grey armored tank-mech on dual treads, dome turret, stub cannon, twin sensors, dual antennae. */
export function buildAbb(): Slice[] {
  return layers(14, (ctx, cx, cy, z) => {
    const lightGrey = '#cbd5e1';
    const medGrey = '#94a3b8';
    const darkGrey = '#64748b';
    const orange = '#f97316';
    if (z <= 3) {
      // Heavy dual treads
      rect(ctx, darkGrey, cx - 10, cy - 8, 5, 16);
      rect(ctx, darkGrey, cx + 5, cy - 8, 5, 16);
      rect(ctx, medGrey, cx - 6, cy - 6, 12, 12);
      if (z === 1 || z === 3) {
        rect(ctx, orange, cx - 10, cy - 7, 5, 2);
        rect(ctx, orange, cx + 5, cy - 7, 5, 2);
      }
    } else if (z <= 8) {
      // Wide armored tank hull + heavy stub cannon
      rect(ctx, lightGrey, cx - 9, cy - 7, 18, 14);
      rect(ctx, medGrey, cx - 7, cy - 5, 14, 10);
      if (z >= 6 && z <= 8) {
        rect(ctx, darkGrey, cx - 2, cy - 12, 4, 7);
        rect(ctx, orange, cx - 2, cy - 12, 4, 2);
      }
    } else if (z <= 11) {
      // Swiveling dome turret: lower armored grille (z=9), twin optical eyes (z=10), forehead crest (z=11)
      const w = z === 11 ? 10 : 14;
      rect(ctx, lightGrey, cx - w / 2, cy - w / 2, w, w);
      if (z === 9) {
        rect(ctx, '#1e293b', cx - 4, cy - w / 2 - 1, 8, 2);
        rect(ctx, orange, cx - 3, cy - w / 2 - 1, 6, 1);
      } else if (z === 10) {
        rect(ctx, '#0f172a', cx - 5, cy - w / 2 - 1, 10, 2);
        rect(ctx, '#ef4444', cx - 4, cy - w / 2 - 1, 3, 2);
        rect(ctx, '#ef4444', cx + 1, cy - w / 2 - 1, 3, 2);
        rect(ctx, '#fef08a', cx - 3, cy - w / 2 - 1, 1, 1);
        rect(ctx, '#fef08a', cx + 2, cy - w / 2 - 1, 1, 1);
      } else {
        rect(ctx, '#f8fafc', cx - 3, cy - w / 2 - 1, 6, 1);
      }
    } else {
      // Dual antennae on top
      rect(ctx, '#e2e8f0', cx - 4, cy + 1, 2, 2);
      rect(ctx, '#e2e8f0', cx + 2, cy + 1, 2, 2);
      if (z === 13) {
        rect(ctx, '#22d3ee', cx - 4, cy + 1, 2, 2);
        rect(ctx, '#22d3ee', cx + 2, cy + 1, 2, 2);
      }
    }
  });
}

/** Floating Skullhead: sculpted ivory/light-grey skull cranium, dark eye sockets with glowing orange/red laser eyes, nasal cavity, metallic jaw/teeth grille, and tiny spinning propeller hat on top. */
export interface SkullheadModel {
  body: Slice[];
  halo: Slice[];
}

export function buildSkullhead(): SkullheadModel {
  const body = layers(14, (ctx, cx, cy, z) => {
    const ivory = '#f1f5f9';
    const boneLight = '#e2e8f0';
    const boneShade = '#94a3b8';
    const steelDark = '#1e293b';
    const socket = '#090d16';
    const eyeGlow = '#ff3b00';
    const eyeCore = '#fef08a';
    const gold = '#facc15';
    const teal = '#14b8a6';

    if (z <= 2) {
      // Compact underslung mechanical tendrils & thruster base
      rect(ctx, '#475569', cx - 6, cy - 4, 2, 3);
      rect(ctx, '#475569', cx + 4, cy - 4, 2, 3);
      rect(ctx, '#475569', cx - 5, cy + 3, 2, 3);
      rect(ctx, '#475569', cx + 3, cy + 3, 2, 3);
      rect(ctx, steelDark, cx - 4, cy - 3, 8, 6);
      rect(ctx, teal, cx - 2, cy - 1, 4, 2);
    } else if (z <= 4) {
      // Metallic jaw & high-contrast teeth grille on the front (-Y)
      rect(ctx, boneShade, cx - 6, cy - 5, 12, 11);
      rect(ctx, steelDark, cx - 5, cy - 7, 10, 3);
      // Alternating bright teeth bars along the front jaw (-Y)
      rect(ctx, ivory, cx - 4, cy - 7, 2, 2);
      rect(ctx, ivory, cx - 1, cy - 7, 2, 2);
      rect(ctx, ivory, cx + 2, cy - 7, 2, 2);
      rect(ctx, gold, cx - 6, cy + 4, 12, 2);
    } else if (z <= 6) {
      // Cheekbones + dark recessed nasal cavity on front (-Y)
      rect(ctx, boneLight, cx - 8, cy - 6, 16, 13);
      rect(ctx, ivory, cx - 7, cy - 7, 14, 3);
      // Nasal cavity (dark recessed notch at front center)
      rect(ctx, socket, cx - 2, cy - 8, 4, 3);
      // Subtle cybernetic side plates
      rect(ctx, boneShade, cx - 8, cy + 4, 16, 3);
      rect(ctx, teal, cx - 5, cy + 6, 10, 1);
    } else if (z <= 9) {
      // Main skull face: sculpted cranium + deep dark eye sockets + glowing orange/red laser eyes
      rect(ctx, ivory, cx - 8, cy - 7, 16, 14);
      rect(ctx, boneLight, cx - 7, cy - 8, 14, 2);
      // Deep dark recessed eye sockets on the front (-Y)
      rect(ctx, socket, cx - 6, cy - 9, 5, 4);
      rect(ctx, socket, cx + 1, cy - 9, 5, 4);
      if (z === 7 || z === 8) {
        // Bright glowing orange/red laser-shooting eyes with white-hot core
        rect(ctx, eyeGlow, cx - 5, cy - 9, 3, 3);
        rect(ctx, eyeGlow, cx + 2, cy - 9, 3, 3);
        rect(ctx, eyeCore, cx - 4, cy - 9, 1, 2);
        rect(ctx, eyeCore, cx + 3, cy - 9, 1, 2);
      }
      // Subtle temple accents on back/sides
      rect(ctx, boneShade, cx - 8, cy + 5, 16, 2);
    } else {
      // Rounded sculpted ivory/light-grey forehead brow ridge & cranium dome tapering to top
      const r = z === 10 ? 7 : z === 11 ? 6 : z === 12 ? 5 : 3;
      rect(ctx, z % 2 === 0 ? ivory : boneLight, cx - r, cy - r, r * 2, r * 2);
      if (z === 10) {
        // Pronounced sculpted ivory brow ridge overhanging the recessed eye sockets
        rect(ctx, '#ffffff', cx - 6, cy - r - 1, 12, 2);
      }
      if (z === 11 || z === 12) {
        rect(ctx, gold, cx - 1, cy + r - 2, 2, 2);
      }
    }
  });

  // Tiny spinning propeller hat perched cleanly on the very top of the dome
  const halo = layers(3, (ctx, cx, cy, z) => {
    if (z === 0) {
      // Tiny beanie cap hub
      rect(ctx, '#14b8a6', cx - 2, cy - 2, 4, 4);
      rect(ctx, '#facc15', cx - 1, cy - 1, 2, 2);
    } else if (z === 1) {
      // Short rotor spindle
      rect(ctx, '#cbd5e1', cx - 1, cy - 1, 2, 2);
    } else {
      // Tiny spinning propeller blades (compact 8px span, never covers face)
      rect(ctx, '#facc15', cx - 4, cy - 1, 8, 2);
      rect(ctx, '#2dd4bf', cx - 1, cy - 4, 2, 8);
      rect(ctx, '#ffffff', cx - 1, cy - 1, 2, 2);
    }
  });

  return { body, halo };
}

/** Floating Tech Hive & Flying Bug Bot models. */
export interface BugHiveModel {
  hive: Slice[];
  bugBot: Slice[];
}

export function buildBugHive(): BugHiveModel {
  const hive = layers(14, (ctx, cx, cy, z) => {
    const light = '#cbd5e1';
    const med = '#94a3b8';
    const gold = '#facc15';
    const cyan = '#22d3ee';
    const w = z <= 2 || z >= 11 ? 12 : 18;
    const h = z <= 2 || z >= 11 ? 10 : 14;
    rect(ctx, z % 2 ? light : med, cx - w / 2, cy - h / 2, w, h);
    rect(ctx, gold, cx - w / 2, cy - h / 2, w, 2);
    rect(ctx, gold, cx - w / 2, cy + h / 2 - 2, w, 2);
    if (z >= 4 && z <= 9) {
      // Glowing cyan hexagonal hive ports
      rect(ctx, cyan, cx - 3, cy - h / 2 - 1, 6, 2);
      rect(ctx, cyan, cx - w / 2 - 1, cy - 2, 2, 4);
      rect(ctx, cyan, cx + w / 2 - 1, cy - 2, 2, 4);
    }
  });

  const bugBot = layers(6, (ctx, cx, cy, z) => {
    const metal = '#94a3b8';
    const light = '#cbd5e1';
    const cyan = '#22d3ee';
    if (z <= 2) {
      rect(ctx, '#64748b', cx - 4, cy - 4, 8, 8);
    } else if (z <= 4) {
      rect(ctx, metal, cx - 4, cy - 5, 8, 10);
      // Buzzing wings
      rect(ctx, '#e0f2fe', cx - 10, cy - 1, 6, 3);
      rect(ctx, '#e0f2fe', cx + 4, cy - 1, 6, 3);
      rect(ctx, cyan, cx - 2, cy - 6, 4, 2);
    } else {
      rect(ctx, light, cx - 3, cy - 3, 6, 6);
    }
  });

  return { hive, bugBot };
}

/** Rolling Brainbot: translucent glass-domed biomechanical brain-in-a-jar mech, glowing green eye, warm orange neural core, rolling limbs. */
export function buildBrainbot(): Slice[] {
  return layers(14, (ctx, cx, cy, z) => {
    const metal = '#94a3b8';
    const light = '#cbd5e1';
    const glass = '#67e8f9';
    const orangeBrain = '#fb923c';
    const greenEye = '#4ade80';
    if (z <= 3) {
      // Stubby rolling/walker chassis + lower speaker/jaw grille on front
      rect(ctx, '#64748b', cx - 8, cy - 6, 16, 12);
      rect(ctx, metal, cx - 10, cy - 3, 4, 6);
      rect(ctx, metal, cx + 6, cy - 3, 4, 6);
      rect(ctx, '#1e293b', cx - 4, cy - 7, 8, 2);
      rect(ctx, orangeBrain, cx - 3, cy - 7, 6, 1);
    } else if (z <= 7) {
      // Collar ring + prominent glowing green central eye spanning z=5..7
      rect(ctx, light, cx - 8, cy - 7, 16, 14);
      rect(ctx, '#0f172a', cx - 5, cy - 8, 10, 3);
      rect(ctx, greenEye, cx - 3, cy - 8, 6, 2);
      rect(ctx, '#ffffff', cx - 1, cy - 8, 2, 1);
    } else {
      // Translucent glass dome + warm orange biomechanical brain core inside
      const r = z >= 12 ? 5 : 7;
      ctx.globalAlpha = 0.45;
      rect(ctx, glass, cx - r, cy - r, r * 2, r * 2);
      ctx.globalAlpha = 1;
      const br = Math.max(3, r - 2);
      rect(ctx, z % 2 ? orangeBrain : '#f97316', cx - br, cy - br, br * 2, br * 2);
      if (z === 9 || z === 10) {
        rect(ctx, greenEye, cx - 2, cy - 2, 4, 4);
      }
    }
  });
}

// ---------------- Props & orbitals ----------------

export function buildCrate(): Slice[] {
  return layers(6, (ctx, cx, cy, z) => {
    rect(ctx, z % 2 ? '#64748b' : '#475569', cx - 8, cy - 8, 16, 16);
    rect(ctx, '#22d3ee', cx - 8, cy - 8, 16, 1);
    rect(ctx, '#22d3ee', cx - 8, cy + 7, 16, 1);
    if (z === 5) rect(ctx, '#0ea5e9', cx - 4, cy - 4, 8, 8);
  });
}

export function buildOrbitalStacks(): Record<OrbitalType, Slice[]> {
  return {
    shooter_drone: layers(3, (ctx, cx, cy, z) => {
      rect(ctx, '#64748b', cx - 3, cy - 3, 6, 6);
      if (z === 2) rect(ctx, '#22d3ee', cx - 1, cy - 4, 2, 2);
    }),
    lightsaber: layers(3, (ctx, cx, cy, z) => {
      rect(ctx, z === 1 ? '#e0f2fe' : '#38bdf8', cx - 1, cy - 8, 2, 16);
      rect(ctx, '#94a3b8', cx - 2, cy + 6, 4, 3);
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
  vBotMelee: Slice[][];
  vBotLaser: Slice[][];
  laserShooter: Slice[][];
  grenadier: Slice[][];
  maximilian: MaximilianModel;
  recogniser: RecogniserModel;
  evilOtto: Record<OttoVariant, Slice[]>;
  abb: Slice[];
  skullhead: SkullheadModel;
  bugHive: BugHiveModel;
  brainbot: Slice[];
  crate: Slice[];
  orbitals: Record<OrbitalType, Slice[]>;
}

export function buildAllModels(): ModelSet {
  return {
    hero: buildHeroModel(),
    enforcer: buildEnforcerFrames(),
    vBotMelee: buildVBotMeleeFrames(),
    vBotLaser: buildVBotLaserFrames(),
    laserShooter: buildLaserShooterFrames(),
    grenadier: buildGrenadierFrames(),
    maximilian: buildMaximilian(),
    recogniser: buildRecogniser(),
    evilOtto: buildEvilOtto(),
    abb: buildAbb(),
    skullhead: buildSkullhead(),
    bugHive: buildBugHive(),
    brainbot: buildBrainbot(),
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
  bakeFrames('v_bot_melee', models.vBotMelee);
  bakeFrames('v_bot_laser', models.vBotLaser);
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
