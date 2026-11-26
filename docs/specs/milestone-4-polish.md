# Milestone 4 Specification — Visual Polish & Playtest Fixes (`BERZERK³`)

## Goal
Address playtest feedback from Milestone 3 integration (`7f0c761`), upgrading visual depth, enemy readability, and game feel while preserving 60 FPS performance and full Vitest regression coverage.

Follow all Software Factory rules in [`AGENTS.md`](../../AGENTS.md) and contracts in [`docs/SHARED_CONTRACTS.md`](../SHARED_CONTRACTS.md).

---

## Visual & Gameplay Upgrades (In Progress)

### 1. True 3D Walls (Replace Flat Vector Walls)
- Upgrade safe walls, electrified walls, and synchronized sliding doors in `src/game/renderer.ts` from flat 2D outlines/rects into **extruded 3D / Approach B Z-stacked neon blocks** with visible side faces, glowing top/edge rims, and proper depth-sorting (`sortY`) against the Hero, enemies, and projectiles.
- Electrified walls should animate 3D vertical plasma arcs / neon energy bars along their extruded faces so they pop visually and match the 2.5D voxel aesthetic.

### 2. Distinctive Humanoid Silhouettes for Red Enemies
- Upgrade the red melee Tron Enforcers (and ranged variants) in `src/render/models.ts` from plain red cubes into **recognizable humanoid robot silhouettes** (distinct legs/stride, armored shoulders/torso, head/visor with crimson Tron-Enforcer neon accents on black chassis).
- Keep them pre-baked in `SpriteStackCache` (24-angle offscreen tiles × 3–4 gait frames) so rendering **200+ humanoid swarmers** stays a single `ctx.drawImage()` per enemy at 60 FPS.

### 3. Distinctive Power-Up Visuals, Labels & Discard/Swap UX
- Replace generic colored power-up markers with **distinct, immediately recognizable icons/3D silhouettes** per pickup type (e.g., grenade shape for `grenade`, twin-barrel/drum icon for `machine_gun`, 3-way fan for `spread`, shotgun shell/barrel for `shotgun`, laser emitter for `beam`/`wide_beam`, flame for `flamethrower`, lightning bolt for `bouncing_lightning`, mine disc for `mine`, cryo crystal for `freeze`, and distinct orbital/shield/1-UP icons).
- Add a crisp **hovering short label** under/above ground pickups (e.g., `GRENADE`, `MGUN`, `SPREAD`, `SABER`) and a brief floating **pickup toast** when collected so players always know what they grabbed.
- Add a **3-slot physical weapon inventory & `F`-to-swap system** (distinguishing actual dropped weapons from modifiers/orbitals/shields):
  - The hero can carry up to **3 weapons** (starting with Pulse Rifle in Slot 1), switchable via keys **`1` / `2` / `3`** or **mouse scroll wheel**, with all 3 slots displayed cleanly in the HUD.
  - Dropped weapon pickups render as actual 3D/iconographic weapon models on the ground with a hovering name label and `[F] EQUIP` / `[F] SWAP` / `[F] UPGRADE` prompt when the hero stands near them.
  - Pressing **`F`** near a dropped weapon:
    - Levels it up if the hero already carries that weapon type.
    - Equips it into an empty slot if fewer than 3 weapons are held.
    - Swaps it with the currently active slot if all 3 slots are full (dropping the replaced weapon onto the floor so it can be retrieved).
  - Modifiers (`freeze`, `lightning_chain`, `pierce`, `ricochet`), orbitals, shield boosts, and extra lives continue to **auto-collect** on walk-over.

### 4. Startup Loading Progress Thermometer Screen
- Break startup initialization (`buildAllModels()` + `bakeSwarmCaches()` 24-angle baking) into **asynchronous frame-yielded chunks** (`requestAnimationFrame` / micro-batches) so the browser never appears frozen during pre-baking.
- Display a styled neon **loading progress thermometer / progress bar** on startup showing real percentage progress and current stage label (e.g., `BUILDING HERO & BOSS VOXEL STACKS`, `BAKING 24-ANGLE SWARM CACHES`, `INITIALIZING CIRCUIT GRID`), transitioning cleanly into the live game once 100% complete.

### 5. Bugfix: Maximilian Unkillable (360° Blade Shredding Blocks All Projectiles)
- **Root Cause**: In `src/bosses/maximilian.ts` (lines 182–201), `updateMaximilian()` shreds every player projectile within `boss.bladeRadius` across **all 4 phases** (`stalk`, `charge`, `whirlwind`, `recover`) before projectiles can reach Maximilian's inner core hitbox (`boss.radius`).
- **Fix**:
  - **Directional Blade Arc (`stalk` & `charge`)**: Blades only shred projectiles hitting Maximilian's frontal blade arc (±75° of his facing angle), rewarding the player for dodge-rolling past him and shooting his exposed flanks/rear.
  - **Whirlwind Phase (`whirlwind`)**: Full 360° blade spin shreds standard bolts, but **beams (`beam_segment`), `lightning`, `grenade` explosions, and `pierce` projectiles** bypass the blades and damage him.
  - **Vulnerable Recovery (`recover`)**: Blades slow/retract and do **not** shred projectiles, leaving Maximilian fully vulnerable from all angles with a clear visual telegraph (pulsing exposed core).
  - Add Vitest coverage in `src/bosses/bosses.test.ts` verifying Maximilian takes damage in `recover`, from flanks/rear in `stalk`, and from piercing/beam/grenade attacks.

### 6. Native Twin-Stick Gamepad / Joystick Support (Browser Gamepad API)
- Add zero-dependency **W3C Gamepad API** (`navigator.getGamepads()`) polling to `src/engine/input.ts` with analog deadzone filtering (~`0.18`), seamlessly coexisting with WASD + Mouse (automatically switching aim source when the right stick or mouse moves).
- **Twin-Stick Layout (Standard Mapping — Xbox / PlayStation / 8BitDo)**:
  - **Left Stick**: 360° analog movement (rotated by `cameraAngle`).
  - **Right Stick**: 360° twin-stick aiming (fires automatically when deflected past threshold, or via **RT / R2**).
  - **LT / L2 or A / Cross**: Dodge-roll.
  - **X / Square**: Equip / swap nearby dropped weapon (`F` equivalent).
  - **LB / RB (L1 / R1)**: Cycle through the 3 weapon slots.
  - **D-Pad Left / Right**: Camera swivel (`Q` / `E` equivalent).
  - Optional **dual-rumble haptics** (`vibrationActuator.playEffect`) on explosions and boss slams when supported.
- Export pure `parseGamepadSnapshot(pad, deadzone)` helper so Vitest can test deadzones, stick aiming, and button mapping headlessly in Node.

---

## Verification Gate
- Run inside Nix devShell (`nix develop --impure --command sh -c "pnpm run build && pnpm test"`).
- All 61+ existing tests plus new Milestone 4 tests must pass with zero TypeScript errors.
