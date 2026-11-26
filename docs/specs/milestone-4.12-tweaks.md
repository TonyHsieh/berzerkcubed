# Milestone 4.12 Specification — Rotation Depth-Sorting Fix, Rez-In Flash, Skullhead Face & Hero Death/Telefrag Respawn (`BERZERK³`)

## Goal
Fix camera-rotation visual glitches on 3D walls, doors, and rez-in beams, improve the Rez-In climax with an opaque materialization flash, make the Floating Skullhead's face clearly visible under a tiny top propeller hat, and add a dramatic Hero death explosion + full-reset telefrag Rez-In respawn.

Follow all Software Factory rules in [`AGENTS.md`](../../AGENTS.md) and contracts in [`docs/SHARED_CONTRACTS.md`](../SHARED_CONTRACTS.md).

---

## 1. Fix Reversed / Broken 3D Walls & Doors Under `Q`/`E` Camera Rotation
- **Root Cause**:
  1. In `src/game/renderer.ts` (lines 1257–1275), long wall segments (`wall.w` or `wall.h` up to 400–600px) are submitted as a single `renderQueue` item sorted by `s.y + wall.h * 0.5` (using unrotated `wall.h`!). When the camera rotates with `Q`/`E`, a long wall spans hundreds of pixels in screen-Y, causing walls, corners, and entities to depth-sort backwards/inverted.
  2. Sliding doors are drawn flat in `renderIslandWorld` instead of as depth-sorted 3D stacked blocks matching the walls.
- **Fix**:
  - **Subdivide long walls and closed/partial sliding doors into ~48px–64px Approach B chunks** during rendering, projecting each chunk's center with `worldToScreen(...)` and sorting every chunk individually by its exact projected `s.y`.
  - Render **sliding doors** as true vertical Approach B 3D stacked energy-gate blocks in `renderQueue` (retracting smoothly into their doorframes as `openFraction` goes `0 → 1`) so doors align seamlessly with walls at every rotation angle `0°–360°`.
  - Verify walls, doors, crates, hero, and enemies depth-sort accurately at `0°`, `90°`, `180°`, and `270°` camera angles.

---

## 2. Rez-In Teleport Effect Fix + Opaque Flash Climax
- **Fix (`src/game/renderer.ts`)**:
  - Ensure `drawRezInBeam()` projects cleanly at any `Q`/`E` camera rotation angle (upright screen-space vertical beam anchored to the entity's exact `worldToScreen(x, y)` base).
  - **Two-Stage Materialization**:
    - `0% → 80%` progress: Rising neon wireframe/scanline beam & converging energy rings (enemy remains hidden/ghosted inside the beam).
    - `80% → 100%` progress: Rapidly brightens into a **solid, fully opaque white/neon flash silhouette** covering the robot's footprint.
    - At `100%` (`rezTimer === 0`): The **solid robot snaps in cleanly replacing the opaque flash**, followed by a brief `0.15s` fading flash halo so the transition feels crisp and unmistakable.

---

## 3. Floating Skullhead Redesign — Tiny Propeller Hat & Clear Skull Face
- **Fix (`src/render/models.ts` + `src/game/renderer.ts`)**:
  - Shrink the Skullhead's rotor/propeller dramatically into a **tiny spinning propeller hat** perched cleanly on the very top of its dome (so it never covers or distracts from the face).
  - Make the **Skull Face** bold, high-contrast, and immediately readable: sculpted light-grey/ivory cranium dome, dark recessed eye sockets with **bright glowing orange/red laser-shooting eyes**, nasal cavity, and metallic jaw/teeth grille on the front (`-Y` facing direction).
  - Verify the updated Skullhead in the `?gallery=1` Model Gallery turntable.

---

## 4. Hero Death Explosion (Shower of Red Dots) & Full-Reset Telefrag Rez-In Respawn
- **Gameplay & Visual Flow (`src/engine/types.ts`, `src/game/gameState.ts`, `src/game/renderer.ts`)**:
  - Add `deathTimer` (e.g., `0.85s`) and `rezTimer` (e.g., `1.0s`) state on `PlayerState` (or `GameState`).
  - **When Hero HP reaches `0` (with `lives > 1`)**:
    1. **Death Explosion (`deathTimer = 0.85s`)**: Hide the hero sprite and trigger a dramatic **explosion into a dense shower of bright red dots / crimson voxel particles** (`45–60` red particles bursting outward with Z-gravity + camera shake + explosion SFX). Player cannot move or shoot during `deathTimer > 0`.
    2. **Reset & Rez-In at Death Location (`rezTimer = 1.0s`)**: When `deathTimer` finishes, decrement `lives` by 1 and **reset the hero completely back to default loadout** (full `maxHp`, full `maxShield`, starter `pulse_rifle` Lv1 in Slot 1, clear Slots 2–3, clear all modifiers and orbitals) at the **exact `(x, y)` where they died** (clamped onto safe walkable island floor if they fell off an edge).
    3. **Invulnerability + Telefrag**: During the entire `rezTimer > 0` teleport-in animation (using the same Rez-In beam + opaque flash climax) plus `0.5s` post-rez grace, the hero is **100% invulnerable**. When the opaque flash completes and the hero materializes, **instantly destroy ("telefrag") every non-boss enemy and enemy/boss projectile overlapping the hero's telefrag radius** (`~64px`) in a burst of sparks (and knock back/damage any overlapping boss) so the hero never respawns trapped!
  - **When `lives === 1` and HP reaches `0`**: Still play the red-dot death explosion before transitioning to the Game Over screen.

---

## Verification Gate
- Add Vitest unit & integration tests covering:
  - Wall chunking / depth-sorting helper across rotated camera angles (`0°`, `90°`, `180°`, `270°`).
  - Hero death → `deathTimer` → full loadout reset (starter Pulse Rifle, 0 modifiers, 0 orbitals, full HP/shield) → `rezTimer` invulnerability → telefragging overlapping enemies & projectiles at the death position.
  - Rez-in opaque flash phase (`0.80..1.0`) and post-rez materialization.
- Run inside Nix devShell (`nix develop --impure --command sh -c "pnpm run build && pnpm test"`).
- All 102+ prior tests plus new Milestone 4.12 tests MUST pass with zero TypeScript errors.
