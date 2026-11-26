# Milestone 4.14 Specification — Explosive Grenades, Boss Combat Upgrades & Elemental Weapon Overhaul (`BERZERK³`)

## Goal
Make grenades truly explosive, upgrade Maximilian, ABB (RoboTank), and Floating Skullhead with signature high-impact combat mechanics, and give the Hero's Flamethrower, Freeze Gun, and Lightning Gun unmistakable visual & mechanical elemental identities.

Follow all Software Factory rules in [`AGENTS.md`](../../AGENTS.md) and contracts in [`docs/SHARED_CONTRACTS.md`](../SHARED_CONTRACTS.md).

---

## 1. Explosive Grenades (Player & Grenadier)
- **Fix (`src/game/gameState.ts`, `src/game/renderer.ts`, `src/render/vfx.ts`)**:
  - Ensure **every grenade** (both player `grenade` projectiles and enemy grenadier `grenade` projectiles) **detonates on landing (`z <= 0`), on enemy/wall/crate impact, or on fuse expiry (`life <= 0`)**—never silently vanishing!
  - On detonation:
    - Deal **radial AoE splash damage** (e.g., `blastRadius = 85–110px`) to all enemies/crates/bosses (for player grenades) or player (for enemy grenades, respecting i-frames/shields).
    - Emit a dramatic **expanding fiery shockwave ring + bright explosion flash + voxel spark burst (`vfx_explosion`) + `camera_shake` + `explosion` SFX**.

---

## 2. Maximilian: Thrown Spinning Sawblades (Wall Sparks) + Layered Ablative Shields
- **Fix (`src/bosses/maximilian.ts`, `src/game/gameState.ts`, `src/game/renderer.ts`)**:
  - **Thrown Spinning Sawblades**: Periodically during `stalk` / `charge` / `whirlwind`, Maximilian hurls **spinning voxel sawblade projectiles** (`kind: 'sawblade'` or tagged boss projectile) toward the hero.
    - When a thrown sawblade hits a **wall, door, or crate/object**, it erupts in a **bright metallic spark shower** (`vfx_explosion` with white/amber/orange sparks + metallic spark/clang SFX), shreds destructible crates, and either bounces once or shatters in sparks.
  - **Multi-Layer Orbiting Ablative Shields**: Give Maximilian **multiple layers of rotating ablative shield plates** orbiting his chassis (scaling with sector level, e.g., 2 concentric/layered rings of armored plates—similar to the hero's rotating ablative shields!).
    - Each ablative shield plate has its own HP, visibly glows/flashes when struck, absorbs incoming player shots until shattered (exploding into cyan/crimson voxel shards), and opens clear firing lanes into Maximilian's core.

---

## 3. ABB (RoboTank): Guided ICBM Missiles with World-Shaking Explosions
- **Fix (`src/bosses/abb.ts`, `src/game/gameState.ts`, `src/game/renderer.ts`, `src/render/vfx.ts`)**:
  - **ICBM Missile Visuals**: Render ABB's missiles as unmistakable **ICBM-style rockets** (elongated light-grey/white warhead fuselage, red nosecone, tail fins, bright orange-yellow thruster flame, and trailing smoke puffs—rotated along their velocity heading).
  - **Radial Multi-Direction Launch & True Guided Steering**:
    - Launch missiles radially outward in **different directions from ABB's center** (360° spread).
    - Missiles accelerate forward **much faster than their angular turn rate** (e.g., high forward speed `260–320 px/s` with capped turn rate `~1.8–2.4 rad/s`), carving sweeping, dodgeable guided pursuit arcs toward the hero instead of snapping instantly!
  - **Massive World-Shaking Explosions**:
    - Whenever an ICBM hits a **wall, closed door, crate, or the hero**, trigger a **huge world-shaking blast**: large AoE blast radius (`~110px`), multi-ring fiery shockwave, dense fiery + smoke debris burst, **heavy `camera_shake` (magnitude `14–18`, duration `0.35s`)**, and booming explosion SFX!

---

## 4. Floating Skullhead: Wall-Blocked Eye Lasers & Sizzle Explosions
- **Fix (`src/bosses/skullhead.ts`, `src/game/gameState.ts`, `src/game/renderer.ts`, `src/world/worldSim.ts`)**:
  - **Wall-Blocked Raycast**: Raycast both twin eye-laser beams against all **solid walls and closed sliding doors** (`pointHitsSolidWall` / segment-vs-AABB intersection) so **Skullhead's laser beams NEVER penetrate walls**.
  - **Sizzle Explosion at Impact Point**:
    - Terminate each drawn beam cleanly at the exact wall/door hit point or hero hit point.
    - At every wall or hero impact point, emit continuous **sizzle-explosion sparks** (glowing orange/white molten flash + spitting sparks + `electric_zap` / sizzle SFX).

---

## 5. Hero Elemental Weapon Overhaul (`flamethrower`, `freeze`, `bouncing_lightning`)
- **Flamethrower — Fireballs & Burning Status (`src/entities/weapons.ts`, `src/game/gameState.ts`, `src/game/renderer.ts`, `src/render/vfx.ts`)**:
  - **Fireball Visuals**: Render flamethrower projectiles as **animated flickering fireballs** (white-hot core → bright yellow → orange → jagged flickering crimson flame corona + trailing embers), NOT plain red circles!
  - **Burning Victims**: Enemies hit by the flamethrower ignite (`burnTimer`, taking periodic fire DOT) and continuously emit **flickering red/orange flame particles + rising grey smoke puffs** while burning!
- **Freeze Gun — Blue Tint & Cumulative 2% Slow / 1% Recovery (`src/engine/types.ts`, `src/enemies/*`, `src/game/gameState.ts`, `src/game/renderer.ts`)**:
  - Add `chillSlow` (`0..0.85` fraction) on `EnemyState` (and bosses if applicable).
  - **Exact Slow & Recovery Math**:
    - Each freeze hit adds **`+0.02` (2% cumulative speed loss)** to `chillSlow` (clamped at e.g. `0.85` max slow so enemies crawl to a near-halt without dividing by zero).
    - Every second, `chillSlow` recovers by **`-0.01 * dt` (1% speed recovered per second)** until back to `0`.
    - Movement speed scales by `(1 - chillSlow)`.
  - **Visual Blue Tint**: Render chilled enemies with a clear **icy-blue tint / frosted glow** whose intensity scales with `chillSlow`.
- **Lightning Gun — White/Blue Flash & Level-Scaled Chain Lightning (`src/engine/types.ts`, `src/game/gameState.ts`, `src/game/renderer.ts`, `src/render/vfx.ts`)**:
  - Add `lightningFlashTimer` on `EnemyState`.
  - When a Lightning Gun shot hits an enemy:
    - Trigger a bright **white & electric-blue flash** (`lightningFlashTimer = 0.16s`) on the victim.
    - **Chain Hit Nearby Enemies**: Automatically chain-jump to up to **`2 * player.weapon.level`** very nearby enemies (within short chain radius, e.g., `~130px`, greedy nearest-neighbor without repeating targets), dealing chain damage, flashing every chained victim **white & blue**, and drawing jagged **white/cyan lightning arcs** (`vfx.lightningArc`) linking each hop!

---

## Verification Gate
- Add Vitest unit & integration tests covering:
  - Grenade detonation emits AoE damage + explosion event on landing/impact/expiry.
  - Maximilian throws spinning sawblade projectiles that spark on wall impact, and has layered ablative shields that absorb shots before core damage.
  - ABB ICBM missiles launch radially, steer with capped angular turn rate (moving forward faster than turning), and trigger heavy `camera_shake` + AoE explosion on wall/hero impact.
  - Skullhead eye lasers clip at solid walls (no wall penetration) and emit sizzle impact events at the wall contact point.
  - Flamethrower sets `burnTimer` (fire DOT + burning status), Freeze applies exact cumulative `-2%` per hit and `+1%/sec` recovery, and Lightning chains to `2 * weapon.level` nearby enemies with `lightningFlashTimer > 0`.
- Run inside Nix devShell (`nix develop --impure --command sh -c "pnpm run build && pnpm test"`).
- All 111+ prior tests plus new Milestone 4.14 tests MUST pass with zero TypeScript errors.
