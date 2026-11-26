# Milestone 4.16 Specification — Boss Music Tempo Ramp, Dalek Otto, Universal Boss Shields, Taller 3D Proportions, Gamepad Pause & Interactive Gallery Tuner (`BERZERK³`)

## Goal
Elevate boss tension, silhouette readability, missile dodge feel, controller UX, and live visual tuning: ramp Boss Danger music BPM as boss HP approaches zero, give Evil Otto a 10-second countdown + screechy Dalek voice, ensure every boss has a shield, extend Maximilian's blades outward for melee reach, make non-Recogniser characters taller (with clearer Skullhead face and round glass-domed Brainbot), tune ABB's missile salvo to 3→scaling with faster dodgeable arcs, wire full Gamepad navigation into the Pause Menu, and add live `WASD`/Arrow rotation + stack-spacing controls with numeric readout to the Model Gallery.

Follow all Software Factory rules in [`AGENTS.md`](../../AGENTS.md) and contracts in [`docs/SHARED_CONTRACTS.md`](../SHARED_CONTRACTS.md).

---

## 1. Boss Music Proportional Tempo Speedup (`src/audio/soundEngine.ts`, `src/game/renderer.ts`)
- Add `setBossHpRatio(ratio: number)` (clamped `0..1`) on `SoundEngine`.
- While Boss Danger music is active, smoothly scale the Tone.js Transport / boss sequence tempo proportionally as the active boss's HP drops from `1.0 → 0.0` (e.g., base boss BPM `148` ramping up to **`~210 BPM` / `1.42×`** as HP approaches `0%`).
- Reset BPM back to base tempo when the boss dies or when returning to level music / Title Screen.
- Expose `getBossTempoBpm()` (or `getTempoMultiplier()`) for headless Vitest verification.

---

## 2. Evil Otto: 10-Second Countdown & Screechy Dalek-Style Voice
- **Countdown (`src/config/difficulty.ts`, `src/game/gameState.ts`)**:
  - Set Evil Otto's alarm countdown to **10 seconds** (`ottoCountdownSec = 10.0`, triggered after the 3–5s post-boss explosion delay), clearly displayed in the flashing HUD alarm bar/timer.
- **Dalek-Style Voice (`src/audio/voiceTaunts.ts`)**:
  - Retune Evil Otto's voice preset to a **higher-pitched, screechy, clipped metallic Dalek-style voice** (`pitch: 1.7–1.9`, `rate: 1.15–1.25`, plus Tone.js ring-modulator / metallic bitcrush synth accompaniment when available) for `"BEWARE!"`, `"I SENSE YOU!"`, `"EXTERMINATE THE HUMANOID!"`.

---

## 3. Universal Boss Shields (All 7 Bosses)
- **Fix (`src/bosses/*`, `src/game/gameState.ts`, `src/game/renderer.ts`, `src/game/hud.ts`)**:
  - Ensure **every boss** (`maximilian`, `recogniser`, `evil_otto`, `abb`, `skullhead`, `bug_hive`, `brainbot`) spawns with **at least 1 active shield layer (`shieldLayers >= 1`, `shieldHp > 0`) even in Sector 1**, scaling up in HP and layer count on higher sectors.
  - Render a visible neon shield aura/barrier around every shielded boss and show the segmented shield bar cleanly in the Boss HUD until broken.

---

## 4. Maximilian: Extending Spinning Blades (Melee Reach)
- **Fix (`src/bosses/maximilian.ts`, `src/game/renderer.ts`)**:
  - Track a smooth `bladeExtend` factor (`0..1`, or derive smoothly from phase/bladeRadius) so whenever Maximilian spins up (`charge` and especially `whirlwind`), his **whirling voxel sawblade arms visibly extend outward** to match his full melee `bladeRadius`, giving unmistakable visual telegraphing as he slashes/melees the hero!

---

## 5. Taller Character Proportions, Clearer Skullhead Face & Round Glass-Domed Brainbot
- **Taller Silhouettes (`src/render/spriteStack.ts`, `src/render/models.ts`, `src/game/renderer.ts`)**:
  - All characters **except the Recogniser** (keep Recogniser's proportions untouched—it already looks great!) are currently too squat.
  - Increase vertical presence by adding vertical Z-layers / taller per-entity vertical `spacingMultiplier` (e.g., `~1.35×–1.5×` taller vertical stack separation for Hero, Enforcers, V-Bots, Laser Shooter, Grenadier, Maximilian, Evil Otto, ABB, Skullhead, Bug Hive, and Brainbot—while keeping Recogniser at `1.0×`).
- **Floating Skullhead (`src/render/models.ts`)**:
  - Expose even more of the sculpted **Skull Face** vertically across the front facade (tall ivory cranium/forehead, deep dark eye sockets with blazing orange/red laser eyes, prominent nasal cavity, and clear jaw/teeth grille) under the tiny top propeller hat.
- **Rolling Brainbot (`src/render/models.ts`, `src/game/renderer.ts`)**:
  - Rebuild Brainbot's upper body into a **smooth, round translucent glass dome** (spherical dome silhouette with glossy cyan/white glass rim & specular highlight arcs) enclosing a **clearly visible, glowing convoluted brain** (pink/coral/orange neural folds + glowing green central optic) inside!

---

## 6. ABB (RoboTank): 3-Missile Opening Salvo & Faster, Dodgeable Guided Arcs
- **Fix (`src/bosses/abb.ts`, `src/game/gameState.ts`)**:
  - **Sector-Scaled Salvo Count**: Fire **3 missiles** per salvo in Sector 1, ramping up in higher sectors (e.g., `Math.min(8, 2 + sectorIndex)` → 3 in S1, 4 in S2, 5 in S3, up to 8 in late sectors).
  - **High-Speed, Wide-Turn Guided Steering**: Increase ICBM forward speed (`~360–420 px/s`) while capping angular turn rate tightly (`~1.1–1.4 rad/s`) so missiles **cannot turn sharply enough to stay glued to the hero**—rewarding a crisp **perpendicular dodge-roll** as the missile overshoots into a wall with a world-shaking blast!

---

## 7. Full Gamepad Navigation in the Pause Menu
- **Fix (`src/engine/input.ts`, `src/game/hud.ts`, `src/main.ts`)**:
  - While the Pause Menu is open, poll `navigator.getGamepads()` each frame (with edge-trigger / repeat debounce):
    - **D-Pad Up/Down** or **Left Stick Up/Down**: Move selection highlight across `Resume`, `Restart Run`, `Model Gallery`, `Quit to Title Screen`.
    - **`A` (button 0) / Cross**: Activate the highlighted menu option.
    - **`Start` (button 9)** or **`B` (button 1) / Circle**: Immediately exit/resume from Pause (or exit Model Gallery back to Pause).
  - Export a headless-testable pause menu navigation controller (`createPauseMenuNav` / pure reducer) for Vitest coverage.

---

## 8. Interactive Model Gallery Controls (`WASD` / Arrows + Live Stack Spacing Readout)
- **Fix (`src/game/gallery.ts`)**:
  - **`A` / `D` or `Left` / `Right` Arrow**: Manually rotate all gallery models left/right smoothly (pauses auto-spin on manual input; include a button/`Space` to toggle auto-spin back on).
  - **`W` / `S` or `Up` / `Down` Arrow**: Live-adjust the **vertical stack layer separation** (`spacingPx`, e.g., `1.0` to `8.0` in `0.1px` increments) in real time across the gallery turntables!
  - Display a crisp, prominent **live numeric telemetry badge** at the top of the gallery (e.g., **`STACK SPACING: 3.4px  |  PITCH Y: 0.64  |  ANGLE: 180°`**) so you can tune the exact vertical separation visually and report the number straight back.

---

## Verification Gate
- Add Vitest unit & integration tests covering:
  - `SoundEngine.setBossHpRatio(1.0 → 0.0)` monotonically increases Boss Danger tempo BPM and resets on boss death.
  - Evil Otto countdown equals `10s` and uses high-pitched Dalek-style voice preset (`pitch >= 1.5`).
  - All 7 boss constructors spawn with active shields (`shieldLayers >= 1` / `shieldHp > 0`) in Sector 1.
  - Maximilian extends blade reach during `charge`/`whirlwind`.
  - ABB fires 3 missiles in Sector 1, ramps up in higher sectors, and enforces high speed / tight turn-rate cap.
  - Gamepad Pause Menu navigation (Up/Down wraps cleanly, `A` activates selected action, `Start` resumes).
  - Gallery spacing/rotation state helper clamps `spacingPx` and updates angle on `A`/`D`/`W`/`S` and Arrow keys.
- Run inside Nix devShell (`nix develop --impure --command sh -c "pnpm run build && pnpm test"`).
- All 141+ prior tests plus new Milestone 4.16 tests MUST pass with zero TypeScript errors.
