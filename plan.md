# Berzerk Cubed (`BERZERK³`) — Game Design Spec & Herdr Multi-Agent Roadmap

## 1. Vision & Reference

**Berzerk Cubed** is a neon cyber-arcade twin-stick action shooter inspired by *Berzerk*, *TRON*, *The Black Hole*, *Robotron*, and *Sinistar*, built using the **Approach B Modular Sprite-Stacking** rendering method demonstrated in [`approach_b_demo_modular_sprite_stacked_humanoid.html`](./approach_b_demo_modular_sprite_stacked_humanoid.html).

- **Stack**: Vite + TypeScript + HTML5 Canvas 2D + Tone.js + Vitest
- **Target Performance**: 60 FPS on integrated / low-VRAM GPUs with **200+ melee enemies + 50–100 shooters/grenadiers** on screen simultaneously.

---

## 2. Core Gameplay & Controls

### 2.1 Controls & Camera
- **Movement (`WASD` / Arrow Keys)**: 8-directional movement rotated by `cameraAngle` so screen-up is always `W`.
- **Aiming & Firing (`Mouse` + `Left Click`)**: 360° independent upper-torso and weapon aiming with Z-interleaved torso/weapon slice rendering (`rifleScreenRelY` depth check).
- **Dodge-Roll (`SPACE`)**:
  - Replaces jumping. Performs a fast directional roll along the current `WASD` vector (or facing direction if idle).
  - Grants **invulnerability frames (i-frames)**, brief speed burst, and **radial knockback/shove** against nearby enemies.
  - Visualized with a tucked Approach B roll animation, afterimage trail, and cooldown ring.
- **Camera**:
  - Defaults to **0° rotation** (classic top-down angled view).
  - Supports **smooth swivel** (`Q`/`E` or level/boss events) + **dynamic tilt** (subtle `layerSpacing` modulation and velocity lean) + **screen-shake** on slams/explosions.

### 2.2 World, Islands & Hazards
- **Cyber-Circuit Void Background**:
  - Deep obsidian background (`#05070d`) with multi-plane parallax PCB traces, vias, logic pads, and **moving electric blips** racing along traces.
- **Floating Platform Islands**:
  - Larger than a single screen (scrolling camera with mouse look-ahead).
  - Black platforms with crisp neon **blue/cyan or red/crimson** outlines and subtle surface grids.
- **Walls, Doors & Bridges**:
  - **Safe Walls**: Solid neon-outlined voxel barriers blocking movement and shots.
  - **Electrified Walls**: Overtly animated with crackling arcs and warning strobes; contact deals shock damage + knockback.
  - **Synchronized Sliding Doors**: Timed, rhythmically opening/closing energy gates synchronized across a sector.
  - **Temporary Bridges & Horde Gates**: Bridges/gates that extend or unlock to let waves of robots spill onto the main island.
  - **Open-Edge Islands (Dangerous Levels)**: Islands lacking perimeter barriers where knockback or missteps drop the player into the circuit void—losing 1 life before **resurrecting near the edge** they fell from with brief spawn-shielding.
- **Destructible Tech Crates**: Voxel crates providing temporary cover and dropping power-ups; shreddable by Maximilian's blades and heavy explosions.

### 2.3 Hero, Survivability & Shoot-'em-Up Arsenal
- **HP + Regenerating Energy Shield + Lives**:
  - Shield absorbs incoming damage first and regenerates after a short delay out of combat.
  - Extra lives handle chasm falls and lethal bursts.
- **Weapon Power-Ups, Leveling & Combining**:
  - Collecting duplicate pickups **levels up** the active weapon; collecting compatible modifiers **combines** effects (e.g., *Spread + Bouncing Lightning*, *Wide-Beam + Cryo Freeze*).
  - **Weapons & Modifiers**:
    - Pulse Rifle (starter), Spread Shot, Machine Gun, Shotgun, Laser Beam, Wide-Beam, Flamethrower, Bouncing Lightning, Lobbed Grenades (Z-arc), Drop Mines, Cryo/Freeze.
- **Stackable Orbital Companions**:
  - **Rotating Shooter Drones** (auto-target nearby enemies).
  - **Rotating Lightsabers** (slice melee swarmers & intercept weak bolts).
  - **Rotating Ablative Shields** (orbiting voxel plates that absorb projectiles).

### 2.4 Enemies & Designer Tuning
All swarm counts, HP, speeds, and wave curves live in `src/config/difficulty.ts` (and are live-tunable via an in-game Designer Tuning Panel):
- **Melee Tron Enforcers (200+ simultaneous)**:
  - Cubic black-and-red voxel robots (minimal sprite layers, 2–4 animation frames for efficiency) that relentlessly chase and flank.
- **Laser Shooters & Grenadiers (50–100 simultaneous)**:
  - *Laser Shooters*: Maintain mid-range, telegraph with a red laser sight, fire dodgeable plasma bolts.
  - *Grenadiers*: Lob high-arcing Z-altitude plasma grenades with a growing ground warning ring.

### 2.5 Bosses & Returning Pursuer
1. **Maximilian (Whirling Blades Boss)**:
   - Black/crimson chassis with a glowing red eye and dual/quad whirling voxel sawblades.
   - Blades **destroy projectiles, destructible tech crates/cover, and the player** on contact (permanent safe walls remain intact).
2. **Recogniser (Hovering Spawner & Sky-Slam Boss)**:
   - Hovers just above the ground; **destructible leg struts must be destroyed first** before the **top-head core** can take damage.
   - **Attacks**:
     - *Zoom-Up & Sky-Slam*: Ascends high in Z-altitude with a **growing ground shadow** warning before slamming down with a shockwave.
     - *Sky-Bombing Run*: Zooms up and carpets the island with timed bombs.
     - *Homing Drones & Bullet Patterns*: Spawns slow homing drones and fires dodgeable geometric bullet curtains.
3. **Evil Otto ("Sinistar"-style Returning Pursuer)**:
   - Forewarned by an **omnibus distorted robotic voice taunt** while reconstructing on-screen.
   - Returns in later levels in **progressively larger, differently powered bodies** with **Mega Man-style boss abilities** (e.g., *Volt-Otto*, *Cryo-Otto*, *Vortex-Otto*).

### 2.6 VFX & Audio
- **VFX**: Voxel debris explosions with Z-gravity, neon glow/additive bloom, optional CRT scanlines, muzzle flashes, shell casings, dodge-roll afterimages, lightning arcs, and freeze-shatter crystals.
- **Audio**: Tone.js procedural arcade SFX & synthwave bassline + **variable-pitch robotic speech taunts** giving distinct personalities to Enforcers, Maximilian, Recognisers, and Evil Otto.

---

## 3. Performance Architecture (Canvas 2D @ 60 FPS)

1. **Angle-Quantized Offscreen Sprite Cache (`SpriteStackCache`)**:
   - Pre-bake each enemy/prop voxel stack at **24 discrete angles (15° steps)** × **2–4 frames** onto offscreen `<canvas>` tiles at startup.
   - Each of the 200+ Enforcers renders via a **single `ctx.drawImage()`** call instead of per-layer `save/rotate/drawImage/restore` loops.
   - Keep full dynamic per-layer Z-interleaved rendering (`drawStack`) for the **Hero**, **Bosses**, and **rotating pickups**.
2. **Uniform Spatial Hash Grid (`SpatialGrid`)**:
   - `O(1)` cell-based neighbor queries for 300+ enemy separation, projectile hits, and dodge-roll knockback.
3. **Object Pooling**:
   - Pre-allocated pools for projectiles, particles, voxel debris, and floating popups.

---

## 4. Directory Structure & Module Ownership

```text
berzerkcubed/
├── AGENTS.md                   # Shared agent rules, worktree boundaries & herdr protocol
├── CLAUDE.md                   # Imports @AGENTS.md for Claude Code panes
├── index.html
├── package.json
├── tsconfig.json
├── vite.config.ts
├── docs/
│   ├── SHARED_CONTRACTS.md     # Interfaces & types agreed by all agents
│   ├── AGENT_LOG.md            # Progress & handoff notes per agent
│   └── QUESTIONS.md            # Cross-agent Q&A resolved by Judge
└── src/
    ├── main.ts                 # Entry point & game loop bootstrap
    ├── config/
    │   └── difficulty.ts       # Tunable swarm counts, HP, speeds, wave curves
    ├── engine/
    │   ├── types.ts            # Core math, entity, input, and event types
    │   ├── input.ts            # WASD + mouse + Spacebar roll + Q/E swivel
    │   ├── camera.ts           # Follow, look-ahead, swivel, tilt, shake
    │   └── spatialGrid.ts      # Spatial hash for 300+ entities
    ├── render/
    │   ├── spriteStack.ts      # Approach B slice builder + angle-quantized cache
    │   ├── models.ts           # Hero, Enforcers, Maximilian, Recogniser, Otto, Crates
    │   ├── circuitBg.ts        # Parallax cyber-circuit board + electric blips
    │   └── vfx.ts              # Pooled voxel debris, lightning, glow, CRT
    ├── audio/
    │   ├── soundEngine.ts      # Tone.js procedural arcade SFX & music
    │   └── voiceTaunts.ts      # Variable-pitch robotic speech synthesizer
    ├── world/
    │   ├── levelData.ts        # Floating island layouts, doors, bridges, chasms
    │   ├── worldSim.ts         # Wall/electrified collision, door sync, edge-fall
    │   └── crate.ts            # Destructible tech crates & power-up drops
    ├── entities/
    │   ├── player.ts           # Hero HP/shield, dodge-roll, resurrection
    │   ├── weapons.ts          # Weapon types, leveling, combining, projectiles
    │   └── orbitals.ts         # Rotating drones, lightsabers, ablative shields
    ├── enemies/
    │   ├── enforcer.ts         # 200+ melee swarmers + steering/separation
    │   ├── shooter.ts          # Laser shooters & grenadiers
    │   └── spawner.ts          # Wave/bridge horde spawner
    ├── bosses/
    │   ├── maximilian.ts       # Whirling blades + crate/projectile destruction
    │   ├── recogniser.ts       # Destructible legs -> head, sky-slam, sky-bombs
    │   └── evilOtto.ts         # Sinistar-style taunt + Mega Man-style variants
    └── game/
        ├── gameState.ts        # Orchestrates world, entities, waves, score
        └── hud.ts              # HP/shield, weapon combo, boss bars, tuning UI
```

---

## 5. `herdr` Multi-Agent Workflow & Playbook

### Roles & Model Assignment
- **Judge / Orchestrator** (Main repo pane): **Argon** (fallback: **Neon**) — owns Milestone 0, resolves `docs/QUESTIONS.md`, reviews & merges worktrees, runs final integration.
- **Worktree 1 (`feat/engine-render`)**: **Hydrogen-medium** — owns `src/render/*` and `src/audio/*` + tests.
- **Worktree 2 (`feat/world-player`)**: **Hydrogen-medium** — owns `src/engine/*`, `src/world/*`, and `src/entities/*` + tests.
- **Worktree 3 (`feat/enemies-bosses`)**: **Hydrogen-medium** — owns `src/enemies/*` and `src/bosses/*` + tests.

### Step-by-Step `herdr` Setup
```bash
# 1. Initialize git & commit Milestone 0 scaffold on main
git init
git add .
git commit -m "chore: milestone 0 scaffold, contracts, and AGENTS.md"

# 2. Create 3 isolated worktrees in herdr (each returns its new workspace/pane ID in JSON)
herdr worktree create --branch feat/engine-render --base main --label "engine-render"
herdr worktree create --branch feat/world-player --base main --label "world-player"
herdr worktree create --branch feat/enemies-bosses --base main --label "enemies-bosses"

# 3. Inspect pane IDs and start an agent (claude or agy) in each worktree pane
herdr pane list
herdr agent start engine-render --kind claude --pane <PANE_ID_1>
herdr agent start world-player --kind agy --pane <PANE_ID_2>
herdr agent start enemies-bosses --kind claude --pane <PANE_ID_3>
herdr agent list

# 4. Send a prompt to a named agent and wait for completion
herdr agent prompt engine-render "<PROMPT>" --wait
```

> **Tip — Unblocking New Worktree Trust Prompts**: When starting agents in brand-new worktrees, `herdr agent list` may show `"agent_status": "blocked"` while the CLI asks to trust the folder. Always inspect with `herdr agent read <NAME>` before sending keys:
> - **Claude Code (`--kind claude`)** defaults to `No, exit` — send `herdr agent send-keys <NAME> Down` then `Enter` (or focus the pane and select `Yes, I trust this folder`).
> - **AntiGravity CLI (`--kind agy`)** — inspect with `herdr agent read <NAME>` first to verify which option is highlighted before sending keys.

### Software Factory Governance & Quality Gates
All agents in `herdr` operate under the strict software-factory rules defined in [`AGENTS.md`](./AGENTS.md):
1. **Tests Every Step**: Every feature step must ship with Vitest tests covering the new behavior.
2. **Zero-Regression Proof**: Agents must run the full build (`pnpm run build`) and full test suite (`pnpm test`) against all prior tests and log pass counts in `docs/AGENT_LOG.md` before handing off to the Orchestrator/Judge.
3. **Orchestrator Review**: Workers pass completed work and technical contract questions up to the Orchestrator/Judge (`main`) for decision-making and merge gating.
4. **Human-in-the-Loop Halt**: If any design decision is **not explicitly covered in `plan.md` or `docs/SHARED_CONTRACTS.md`**, the Orchestrator **must stop** and include the human via a **Git Pull Request** or a `[HUMAN_DECISION_REQUIRED]` entry in `docs/QUESTIONS.md` (with `herdr` notification) before proceeding.

### Copy-Pasteable Worktree Prompts
- **Worktree 1 (`feat/engine-render`)**:
  > Read `AGENTS.md` and `docs/SHARED_CONTRACTS.md`. Implement `src/render/spriteStack.ts` (including 24-angle offscreen cache), `src/render/models.ts` (Hero, black/red cubic Enforcers, Maximilian, Recogniser, Evil Otto, tech crates), `src/render/circuitBg.ts`, `src/render/vfx.ts`, `src/audio/soundEngine.ts`, and `src/audio/voiceTaunts.ts`. Add Vitest tests for `spriteStack` caching and `vfx` pooling. Log progress in `docs/AGENT_LOG.md` and any contract questions in `docs/QUESTIONS.md`.

- **Worktree 2 (`feat/world-player`)**:
  > Read `AGENTS.md` and `docs/SHARED_CONTRACTS.md`. Implement `src/engine/input.ts`, `src/engine/camera.ts` (0° default, Q/E swivel, dynamic tilt, shake), `src/engine/spatialGrid.ts`, `src/world/*` (floating islands, electrified walls, synchronized sliding doors, temporary bridges, open-edge chasm fall + resurrection, destructible crates), and `src/entities/*` (Hero HP/shield, Spacebar dodge-roll with i-frames + shove, combinable/levelable weapons, rotating drones/lightsabers/ablative shields). Add Vitest suites for `spatialGrid`, `worldSim`, and `weapons`. Log progress in `docs/AGENT_LOG.md`.

- **Worktree 3 (`feat/enemies-bosses`)**:
  > Read `AGENTS.md` and `docs/SHARED_CONTRACTS.md`. Implement `src/enemies/*` (200+ melee Enforcers with spatial separation, 50–100 Laser Shooters & Grenadiers, bridge/gate spawner) and `src/bosses/*` (Maximilian with projectile/crate-shredding blades, Recogniser with destructible legs -> vulnerable head + sky-slam shadow + sky-bombs + homing drones, Evil Otto with Sinistar-style taunt + Mega Man-style returning variants). Add Vitest suites for boss state machines and spawner caps. Log progress in `docs/AGENT_LOG.md`.
