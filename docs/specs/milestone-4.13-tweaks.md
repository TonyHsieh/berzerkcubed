# Milestone 4.13 Specification — Boss Hit-Flash, Classic Door-Walk Push-Slide Room Transitions & 3/4 Face-Forward Sprite Perspective (`BERZERK³`)

## Goal
Deliver three high-impact arcade polish upgrades: unmistakable boss hit-flash feedback, seamless classic *Berzerk*/*Zelda* door-walk room push-slide transitions (replacing the manual `"NEXT SECTOR"` button), and a 3/4 "leaning back" front-facing sprite perspective inspired by `sample/view-perspective-of-characters.webp` so characters clearly show their full faces (forehead, eyes, nose, mouth).

Follow all Software Factory rules in [`AGENTS.md`](../../AGENTS.md) and contracts in [`docs/SHARED_CONTRACTS.md`](../SHARED_CONTRACTS.md).

---

## 1. Boss Hit-Flash Feedback When Damaged
- **Requirement**: Whenever any player projectile, beam, grenade, mine, orbital, or lightsaber deals damage to a boss (or a boss part like Recogniser legs/head, Maximilian core/shield, ABB, Skullhead, Bug Hive, Brainbot, Evil Otto), the boss must **visibly flash**!
- **Implementation (`src/game/renderer.ts`, `src/bosses/*`, `src/game/gameState.ts`)**:
  - Ensure every boss damage path sets `boss.hitFlash = 0.12` (and decays `boss.hitFlash = Math.max(0, boss.hitFlash - dt)` every tick across all boss types).
  - When `boss.hitFlash > 0`, render a crisp **bright white / hot-cyan flash overlay** directly over the boss sprite stack (e.g., via `ctx.filter = 'brightness(3.5) contrast(1.4)'` or an offscreen `'source-atop'` white silhouette pass / bright pulsing rim + hit-spark burst) so every hit feels punchy and unmistakable—and differentiate shield-hit flashes (bright cyan/amber) from core-HP flashes (bright white/red).

---

## 2. Classic Door-Walk Push-Slide Room Transitions (Replaces `"NEXT SECTOR"` Button)
- **Requirement**: Remove the manual `"NEXT SECTOR"` HUD button flow. Instead, mirror classic *Berzerk* / top-down action-adventure room transitions:
  1. **Unlock Exit Doors on Boss Defeat**:
     - While the sector boss is alive (or wave is active), cardinal exit doors remain closed/locked (or cycle as horde gates).
     - The moment the **sector boss is defeated**, all cardinal exit doors (`north`, `south`, `east`, `west`) **slide fully open** and glow with a bright inviting neon exit pulse (plus subtle directional chevrons `>>>` pointing out of each open doorway so the player immediately sees they can walk out!).
     - Evil Otto's linger timer still ticks if the player stalls in the cleared room.
  2. **Walk Through Any Open Exit Door → Push-Slide + Cross-Fade Transition**:
     - When the hero walks past the threshold of an open cardinal exit door (`east`, `west`, `north`, or `south`), trigger a smooth **room transition** (`roomTransition`, duration `~0.55s–0.7s`):
       - **Push-Slide + Fade Direction**:
         - Exit **East** → previous room and new next room **push-slide to the Left** (`-X`), and the hero **walks in from the West doorway** of the new room.
         - Exit **West** → rooms **push-slide to the Right** (`+X`), hero walks in from the **East doorway**.
         - Exit **North** → rooms **push-slide Down** (`+Y`), hero walks in from the **South doorway**.
         - Exit **South** → rooms **push-slide Up** (`-Y`), hero walks in from the **North doorway**.
       - During the transition (`progress: 0 → 1`, eased cubic), render the **outgoing room snapshot/state sliding out + fading** while the **incoming new sector slides in + fades in**, with the hero visibly **auto-walking cleanly through the opposite entrance doorway** into the safe entry zone (invulnerable until the walk-in finishes).
       - Note: `src/game/hud.ts` should remove the `"NEXT SECTOR"` button (or replace it with a subtle status hint `"EXIT DOORS OPEN — WALK THROUGH ANY DOOR"` when the boss is cleared).

---

## 3. 3/4 "Leaning Back" Face-Forward Sprite Perspective
- *Ref: `sample/view-perspective-of-characters.webp` (classic 3/4 arcade perspective)*
- **Root Cause**: Standard top-down sprite stacking (`scaleY = 1.0`, `spacingPx = 2.0`) looks almost straight down (~80° pitch), showing mostly the tops of heads/helmets instead of faces and chests.
- **Fix (`src/render/spriteStack.ts`, `src/render/models.ts`, `src/game/renderer.ts`, `src/game/gallery.ts`)**:
  - Upgrade Approach B stack rendering (`drawStack` and `SpriteStackCache.bake`) to a **3/4 arcade camera pitch**:
    - Compress each horizontal slice slightly along screen-Y (`slicePitchY ≈ 0.64`, i.e., `ctx.scale(scale, scale * 0.64)` in screen space *before* rotating the slice in local space—or apply `ctx.scale(1, 0.64)` before `ctx.rotate(totalAngleRad)` so every slice becomes a foreshortened 3/4 oval/plate!) combined with taller vertical Z-spacing (`spacingPx ≈ 2.6–3.0`).
    - Because each slice is foreshortened vertically while stacked higher in `-Y`, the **entire front vertical facade** of every character leans back toward the camera—immediately revealing full faces, torsos, and legs!
  - **Sculpt Expressive Front Faces Across Z-Layers (`src/render/models.ts`)**:
    - **Floating Skullhead**: Arrange facial anatomy clearly from bottom-to-top Z-layers on the front facade so all features are unmistakable in 3/4 view: **jaw & teeth grille** (lower Z) → **nasal cavity & cheekbones** (mid Z) → **dark recessed eye sockets with glowing orange/red laser eyes** (upper-mid Z) → **sculpted ivory forehead/brow ridge** (upper Z) → **tiny spinning propeller hat** (top Z).
    - **Hero, Basic Red Berzerk Robot, V-Bots, Laser Shooter, Grenadier, Maximilian, Recogniser, Evil Otto, ABB, Brainbot**: Ensure front visors, eyes, chest cores, and mouths/grilles span clear vertical Z-bands on the front face so every character reads with rich 3/4 arcade personality (matching the readability of `sample/view-perspective-of-characters.webp`).
  - Update `?gallery=1` Model Gallery to use the exact same 3/4 pitch so you can inspect every face up close!

---

## Verification Gate
- Add Vitest unit & integration tests covering:
  - Boss `hitFlash` triggers (> 0) when damaged by player projectiles/beams/orbitals and decays back to `0` over time.
  - Boss defeat unlocks cardinal exit doors; walking through East/West/North/South exit triggers `roomTransition` with the exact opposite entrance doorway (`east → west`, `west → east`, `north → south`, `south → north`) and push-slide vector (`east → (-1, 0)`, etc.), advancing `sectorIndex` and placing the hero cleanly inside the opposite doorway.
  - `SpriteStackCache` / `drawStack` 3/4 pitch foreshortening (`slicePitchY`) renders cleanly without breaking headless tests or 24-angle caching.
- Run inside Nix devShell (`nix develop --impure --command sh -c "pnpm run build && pnpm test"`).
- All 108+ prior tests plus new Milestone 4.13 tests MUST pass with zero TypeScript errors.
