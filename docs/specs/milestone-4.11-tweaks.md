# Milestone 4.11 Specification — Sample-Art Visual Overhaul, Maze Rooms, Rez-In Spawning & New Bosses (`BERZERK³`)

## Goal
Transform `BERZERK³`'s visual identity and combat spectacle using the reference art in `sample/`, eliminating dark/unreadable black enemy silhouettes, fixing the 1-legged Recogniser, adding randomized Berzerk-style maze walls, enforcing Rez-In / door-entry spawning (zero pop-in), adding enemy firing animations, scaling bosses 2–3× with higher-level toughness & rampage invulnerability, and introducing 4 new bosses + V-shaped attack robots.

Follow all Software Factory rules in [`AGENTS.md`](../../AGENTS.md) and contracts in [`docs/SHARED_CONTRACTS.md`](../SHARED_CONTRACTS.md).

---

## 1. Global Visual Palette & Enemy Firing Animations
- **No Black Enemy Bodies**: Replace black/near-black enemy chassis fills with **light-to-medium metallic grey** (`#64748b`, `#94a3b8`, `#cbd5e1`) as the darkest structural tone, paired with high-contrast bright red, yellow, orange, gold, and cyan accents so every silhouette reads clearly against the dark cyber-circuit floor.
- **Enemy Firing Animations**:
  - Add a `fireAnimTimer` (e.g., `0.22s`) on `EnemyState` (and bosses) triggered whenever a ranged enemy fires.
  - Render visible **barrel recoil / glowing muzzle flash** (and dedicated firing frame / weapon glow) at the enemy's actual weapon barrel or eye emitter so shots clearly originate from the robot.
- **Update Model Gallery (`?gallery=1`)**: Include all redesigned enemies, V-bots, 2-legged Recogniser, and all 4 new bosses on the rotating turntable showcase.

---

## 2. Redesigned Enemies & New V-Shaped Attack Robots (Grounded in `sample/`)
All swarm enemies remain baked into `SpriteStackCache` (24-angle offscreen tiles) so 200+ enemies stay 60 FPS:

1. **Basic Red Robot (`enforcer_melee`)** — *Ref: `sample/ARC_Berzerk_maze_red_robot_shape.png`*:
   - Classic arcade *Berzerk* red robot silhouette in Approach B 3D voxels: bright crimson-red armor over medium-grey joints, rounded dome head with scanning cyclops eye, wide boxy shoulders, hanging articulated arms, and clearly separated striding legs.
2. **V-Shaped Attack Robots (`v_bot_melee` & `v_bot_laser`)** — *Ref: `sample/v-shaped-attack_robot.jpg`*:
   - Inverted trapezoid (**V-shaped tapered body**) riding on a single central rolling wheel, prominent single glowing central optical eye, side claw-arms, and top antenna.
   - **Red V-Bot (`v_bot_melee`)**: Aggressive fast melee rusher.
   - **Yellow V-Bot (`v_bot_laser`)**: Mid-range laser shooter with yellow/white stripe chassis, firing glowing bolts from its central eye/arm emitter with firing flash.
3. **Laser Shooter (`laser_shooter`)** — *Ref: `sample/lazer.webp`*:
   - Wide angular **yellow & light-grey** industrial torso with a glowing **red triangular chest core**, twin articulated legs, and **dual underslung heavy laser rifles** that flash/recoil when firing.
4. **Grenadier (`grenadier`)** — *Ref: `sample/grenadier.webp`*:
   - Tall **yellow & medium-grey** bipedal artillery walker with **fanning multi-barrel shoulder/back mortar cannons** (4–6 angled barrels) that flash when lobbing Z-arc grenades.

---

## 3. Randomized *Berzerk*-Style Maze Rooms (`src/world/levelData.ts`)
- *Ref: `sample/ARC_Berzerk_maze_red_robot_shape.png`*
- Upgrade `createSectorIsland(sectorIndex, seed?)` to generate **classic *Berzerk*-style randomized corridor mazes**:
  - Perimeter walls with 2–4 cardinal **doorways / energy gates** (north, south, east, west).
  - Randomized internal orthogonal maze partitions (L-walls, T-junctions, and pillar rooms) generated from a grid/partition algorithm that guarantees **full connectivity** (every room cell and doorway is reachable from the hero spawn, with wide enough corridors for 2–3× larger bosses to navigate).
  - Rendered with the true vertical Approach B stacked 3D neon walls from Milestone 4.1.

---

## 4. Zero Pop-In Spawning: Door Entry or TRON "REZ-In" Materialization
- **Rule**: No robot (enemy or boss) may ever instantaneously pop into existence on the floor.
- Every spawned enemy/boss enters via one of two mechanisms:
  1. **Door / Bridge Entry**: Walks onto the island from an open doorway/sliding door or active temporary bridge.
  2. **TRON "REZ-In" Teleport Materialization**: Spawns with `rezTimer` (e.g., `1.0s`, counting down to `0`). During `rezTimer > 0`:
     - The robot is **non-colliding, invulnerable, stationary, and cannot attack**.
     - Rendered with a striking **vertical scanline / wireframe-to-solid materialization beam**: glowing neon grid pillar + rising horizontal scan ring that progressively reveals the voxel sprite stack from bottom to top (`0% → 100%`) with digital rez sparks and a synth rez-in SFX!

---

## 5. Boss Overhaul: 2–3× Larger, Two-Legged Recogniser, Higher-Level Toughness & Rampage Invulnerability
- **2–3× Larger Boss Scale**:
  - Increase visual sprite-stack scale (`4.5×–6×`) and physical hitboxes of all bosses so they tower menacingly over the hero and standard robots.
- **Recogniser Fix — TWO Legs** — *Ref: `sample/Reconiser.jpg`*:
  - Fix the 1-leg rendering bug! Build the Recogniser with **two clearly separated vertical leg columns** (left leg & right leg with flared triangular feet), a wide horizontal arch crossbar with geometric cutouts, and a sloped triangular cockpit head on top — in **medium-grey armor with blazing neon red outlines**.
  - Destroying `left_leg` and `right_leg` visually removes/sparks each respective leg before unlocking the top `head_core`.
- **Escalating Sector Toughness & Rampage Invulnerability**:
  - On higher sectors (`sectorIndex >= 2`), bosses gain:
    - Higher HP scaling + **multiple regenerating shield layers** (`shieldLayers`, shown as segmented shield bars in the Boss HUD).
    - **Periodic Rampage Invulnerability** (`rampageTimer > 0`): brief 2.5–3.5s unstoppable berserk bursts with a bright pulsing golden/crimson aura, `RAMPAGE — INVULNERABLE!` HUD banner, and accelerated attacks before returning to normal vulnerability.

---

## 6. Four New Bosses (Grounded in `sample/`)
Register all 4 in `BossKind`, `src/bosses/`, `src/render/models.ts`, `src/game/gameState.ts`, `src/game/hud.ts` (including quick-spawn buttons in the Designer Tuning Panel), and `?gallery=1`:

1. **ABB — Another Boss Bot (`abb`)** — *Ref: `sample/AnotherBossRobot.avif`*:
   - **Visual**: Large **light-grey armored tank-mech** on dual treads, heavy swiveling dome turret with stub cannon, twin optical sensor pod and dual antennae on top.
   - **Behavior**: Uses rapid **dodge-dash repositioning** (burst speed + afterimage trail, just like the hero's dodge-dash!) to zip to a vantage point, then halts briefly and launches a **360° ring of guided homing missiles**!
2. **Floating Skullhead (`skullhead`)** — *Ref: `sample/Floating-skullhead.avif`*:
   - **Visual**: Large **floating white/gold/teal spherical skull-drone** with **twin glowing amber/orange eyes**, wide translucent spinning halo/rotor wings on its sides, and dangling spider-like mechanical legs below.
   - **Behavior**: Hovers over the maze while firing **twin sweeping eye-laser beams** (telegraphed by twin targeting lines before firing!).
3. **Floating Tech Hive & Flying Bug Bots (`bug_hive`)** — *Ref: `sample/Flying-bugbot.webp`*:
   - **Visual**: A hovering hexagonal **tech hive core** (light-grey/gold/cyan) surrounded by a **whirling protective shield of Flying Bug Bots** (segmented metallic beetle-drones with glowing cyan eyes and buzzing wings).
   - **Behavior**: Spawns Flying Bug Bots that **orbit the hive in a tight whirling shield** (intercepting incoming player shots!) and periodically peel off in swooping attack flights toward the hero. Thinning the orbiting bug shield opens clear firing lanes to damage the hive core!
4. **Rolling Brainbot (`brainbot`)** — *Ref: `sample/Rolling-brainbot.avif`*:
   - **Visual**: Large **translucent glass-domed biomechanical brain-in-a-jar mech** with glowing green central eye, warm orange neural core, and stubby rolling/walker limbs.
   - **Behavior**: Rolls rapidly across corridors while firing **crackling ground-hugging brain-electricity waves** (jagged cyan/green electric bolts & arcs traveling along the floor that the hero must dodge-roll over or sidestep).

---

## Verification Gate
- Add Vitest unit & integration tests covering:
  - Randomized Berzerk maze connectivity (hero spawn reaches all doorways & open corridors).
  - Rez-in spawn state (`rezTimer > 0` blocks damage/attacks until fully materialized).
  - New `v_bot_melee` / `v_bot_laser` enemy behavior & `fireAnimTimer` firing animation state.
  - 2-legged Recogniser geometry/parts, higher-sector multi-layer boss shields & rampage invulnerability.
  - All 4 new bosses (`abb` dash + 360° homing missiles, `skullhead` twin eye-lasers, `bug_hive` orbiting bug-bot shield + spawning, `brainbot` ground electricity waves).
- Run inside Nix devShell (`nix develop --impure --command sh -c "pnpm run build && pnpm test"`).
- All 88+ prior tests plus new Milestone 4.11 tests MUST pass with zero TypeScript errors.
