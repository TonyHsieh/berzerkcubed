# Agent Work Log (`docs/AGENT_LOG.md`)

Every agent appends a short entry here when completing a milestone, feature, or fix.

---

## Milestone 0 — Judge / Orchestrator (`main`)
- **Files created**:
  - `package.json`, `tsconfig.json`, `vite.config.ts`, `.gitignore`, `index.html`, `src/main.ts`
  - `src/engine/types.ts` (core shared types)
  - `src/config/difficulty.ts`, `src/config/difficulty.test.ts`
  - `plan.md`, `AGENTS.md`, `CLAUDE.md`
  - `docs/SHARED_CONTRACTS.md`, `docs/AGENT_LOG.md`, `docs/QUESTIONS.md`
- **Status**: Scaffold ready for parallel `herdr` worktrees (`feat/engine-render`, `feat/world-player`, `feat/enemies-bosses`).

---

## Worktree 1 (`feat/engine-render`) — Render + Audio modules
- **Setup**: merged `main` (scaffold commit 46631d9) into this branch to obtain `docs/SHARED_CONTRACTS.md` and `src/engine/types.ts`.
- **Files created**:
  - `src/render/spriteStack.ts`, `src/render/models.ts`, `src/render/circuitBg.ts`, `src/render/vfx.ts`
  - `src/render/testCanvas.ts` (headless fake canvas helper for tests only)
  - `src/audio/soundEngine.ts`, `src/audio/voiceTaunts.ts`
  - Tests: `src/render/spriteStack.test.ts`, `src/render/vfx.test.ts`, `src/render/circuitBg.test.ts`, `src/audio/audio.test.ts`
- **Exports**:
  - `spriteStack`: `makeSlice`, `drawStack`, `SpriteStackCache` (`bake`, `drawCached`, `has`, `getTile`, `angleSteps`, `stats`, `clear`), `setCanvasFactory`/`createCanvas` (injectable, headless), `quantizeAngleIndex`, `normalizeDeg`
  - `models`: `buildHeroModel`, `buildEnforcerFrames` (3 frames), `buildLaserShooterFrames`, `buildGrenadierFrames`, `buildMaximilian`, `buildRecogniser`, `buildEvilOtto` (classic/volt/cryo/vortex), `buildCrate`, `buildOrbitalStacks`, `buildAllModels`, `bakeSwarmCaches`, `enemyCacheKey`
  - `circuitBg`: `CircuitBackground` (`update`, `render`)
  - `vfx`: `VfxSystem` (fixed-capacity free-list pool; `explode`, `muzzleFlash`, `shellCasing`, `lightningArc`, `freezeShatter`, `afterimage`, `handleEvent`, `update`, `render`, `renderCrt`, `crtEnabled`), type `WorldToScreenFn`
  - `soundEngine`: `SoundEngine` (`init`, `play`, `handleEvent`, `toggleBass`/`setBassEnabled`, `muted`), `isSoundName`
  - `voiceTaunts`: `VoiceTauntEngine` (`init`, `speak`, `handleEvent`), `VOICE_PRESETS`, `resolveTauntParams`, `normalizeSpeaker`
- **Notes**: Tone.js is lazy-imported inside `init()` so modules load in Node; `init()` must be called from a user gesture. Swarm enemies use cache keys `"<kind>#<frame>"` (`enemyCacheKey`); crates use `"crate"`. Audio/Tone behaviour itself is not unit-tested (needs a real AudioContext) — only guard/no-op paths, event routing and voice parameter logic are.
- **Regression proof**: `pnpm run build` passes (tsc + vite build). `pnpm test` (full suite): 5 files, **26 tests passed** (2 prior config tests + 24 new: spriteStack 8, vfx 7, circuitBg 2, audio 7).

---

## Worktree 2 — `feat/world-player` (`src/engine/**`, `src/world/**`, `src/entities/**`)
- **Files created**:
  - `src/engine/input.ts` — `createInputController`, `createDefaultInputState`
  - `src/engine/camera.ts` — `createCameraState`, `updateCamera`, `worldToScreen`, `screenToWorld`, `triggerCameraShake`, `setCameraTargetAngle`
  - `src/engine/spatialGrid.ts` — `SpatialGrid`
  - `src/world/levelData.ts` — `createSectorIsland`
  - `src/world/worldSim.ts` — `updateWorld`, `resolveEntityAgainstWorld`, `isPointOnWalkableSurface`, `setBridgeActive`, `pointHitsSolidWall`
  - `src/world/crate.ts` — `createCrate`, `damageCrate`
  - `src/entities/weapons.ts` — `MAX_WEAPON_LEVEL`, `getWeaponSpec`, `createStarterWeapon`, `applyWeaponPickup`, `applyModifierPickup`, `fireWeapon`
  - `src/entities/orbitals.ts` — `addOrbital`, `getOrbitalWorldPos`, `updateOrbitals`
  - `src/entities/player.ts` — `createPlayer`, `isPlayerInvulnerable`, `damagePlayer`, `applyDodgeShove`, `applyPowerUp`, `updatePlayer`
  - `src/engine/spatialGrid.test.ts` (4 tests)
  - `src/world/worldSim.test.ts` (5 tests)
  - `src/entities/weapons.test.ts` (5 tests)
- **Regression Proof**:
  - `pnpm run build` (`tsc --noEmit && vite build`): **PASSED** (0 errors)
  - `pnpm test` (`vitest run`): **PASSED** — **4 test files passed (4), 16 tests passed (16)** (2 baseline `difficulty.test.ts` + 14 new tests across `spatialGrid.test.ts`, `worldSim.test.ts`, `weapons.test.ts`).

---

## Worktree 3 — `feat/enemies-bosses` (`src/enemies/**` & `src/bosses/**`)
- **Files created**:
  - `src/enemies/enemyUtils.ts` — shared Approach B degree conversion, deterministic FNV-1a hashing, and circle-vs-island (walls, closed doors, crates, perimeter) collision resolution.
  - `src/enemies/enforcer.ts` — `SpatialQueryGrid<T>`, `createEnforcer`, `updateEnforcers` (200+ melee Tron Enforcers with player-chasing flank steering, spatial separation via `SpatialGrid`, freeze slow, and world collision).
  - `src/enemies/shooter.ts` — `createLaserShooter`, `createGrenadier`, `updateRangedEnemies` (50–100 mid-range Laser Shooters with red laser sight telegraph + plasma bolts; Grenadiers lobbing high-arcing Z-altitude plasma grenades with `targetX`/`targetY` warning targets).
  - `src/enemies/spawner.ts` — `spawnHordeWave`, `resetSpawnerCounter` (bridge/gate horde spawner from active `spawnsHorde` bridges & open sliding doors, strictly enforcing `maxMeleeEnforcers` and `maxShootersAndGrenadiers` caps).
  - `src/bosses/bossUtils.ts` — shared boss projectile ID sequence and player contact/shockwave damage helper (shield-first absorption, dodge-roll i-frame & `invulnTimer` handling, knockback).
  - `src/bosses/maximilian.ts` — `createMaximilian`, `updateMaximilian` (`stalk` → `charge` → `whirlwind` → `recover` state machine; whirling blades shred player projectiles, destructible tech crates, and player on contact while leaving permanent safe walls intact).
  - `src/bosses/recogniser.ts` — `createRecogniser`, `updateRecogniser`, `damageBossPart` (destructible `left_leg`/`right_leg` unlock `head_core` vulnerability; `hover_barrage` geometric bullet curtains + homing drones, `sky_slam_ascend`/`sky_slam_drop` with growing `slamProgress` ground shadow + shockwave, `sky_bomb_run` carpet bombing, `recover`).
  - `src/bosses/evilOtto.ts` — `createEvilOtto`, `updateEvilOtto` (Sinistar-style reconstruction with omnibus voice taunt while invulnerable, followed by bouncing pursuit and Mega Man-style returning variants `classic`, `volt`, `cryo`, `vortex` with progressive size/HP scaling and unique variant attacks).
  - `src/enemies/enemies.test.ts` — 8 Vitest tests covering 220+ enforcer spatial separation, freeze slow/wall blocking, shooter telegraph/fire, grenadier Z-arc lob, 75+ ranged batch update, and spawner caps/bridge-gate gating.
  - `src/bosses/bosses.test.ts` — 8 Vitest tests covering Maximilian state machine & blade shredding, Recogniser multi-part leg→head damage gating & full sky-slam/sky-bomb/homing-drone state machine, and Evil Otto reconstruction taunt + returning Mega Man variants.
- **Verification & Regression Proof**:
  - `pnpm run build` (`tsc --noEmit && vite build`): **PASSED** (0 errors).
  - `pnpm test` (`vitest run`): **PASSED** — **3 test files, 18/18 tests passed** (`difficulty.test.ts`: 2, `enemies.test.ts`: 8, `bosses.test.ts`: 8).

---

## Milestone 3 — Judge / Orchestrator (`main`) — Full Integration, Renderer, HUD & Tuning
- **Files created/modified**:
  - `src/game/gameState.ts` — `FIXED_DT`, `GameState`, `createGameState`, `createGameStateForSector`, `stepGameState`, `spawnBoss`, `advanceToNextSector` (pure headless 60 Hz simulation orchestrating `worldSim`, `SpatialGrid`, `player`, `orbitals`, `enforcer`, `shooter`, `spawner`, `maximilian`, `recogniser`/`damageBossPart`, `evilOtto`, projectile physics & collisions, pickup collection, wave/sector progression, and Evil Otto lingering trigger).
  - `src/game/renderer.ts` — `createRenderer`, `GameRenderer`, `RendererOptions` (initializes `buildAllModels()` and `bakeSwarmCaches`, renders `CircuitBackground`, camera-rotated floating platform island/doors/bridges/electrified walls/warning rings, Y-depth-sorted renderQueue with cached swarm enemies, Z-interleaved Hero + orbitals, multi-part bosses, projectiles, pickups, `VfxSystem.render` + `renderCrt`, and routes all `GameEvent`s to VFX, `SoundEngine`, `VoiceTauntEngine`, and `triggerCameraShake`).
  - `src/game/hud.ts` — `createHud`, `HudController`, `HudCallbacks` (headless-safe neon cyber-arcade HUD mounted in `#hud-root` with HP/Shield/Lives/Dodge indicators, weapon/level/modifiers/orbitals, sector/score/hostiles, Boss HP & Recogniser multi-part status, and collapsible `Tab`-toggleable Designer Tuning Panel with live sliders for `maxMeleeEnforcers` & `maxShootersAndGrenadiers`, CRT/audio/bass toggles, and quick boss-spawn buttons).
  - `src/main.ts` — wired `createInputController`, fixed-timestep 60 Hz accumulator loop (`requestAnimationFrame`), user-gesture audio initialization (`initAudio()`), viewport resize handling, renderer, and HUD.
  - `src/game/gameState.test.ts` — 5 headless Vitest integration tests (300-unit swarm stress loop with 225 Enforcers + 50 Shooters + 25 Grenadiers, crate -> power-up -> weapon level/combine flow, Recogniser leg destruction unlocking head damage inside `stepGameState`, Evil Otto trigger after `ottoWarningSec` emitting `voice_taunt`, and player dodge-roll i-frames + shield-first damage).
- **Documented Defaults (for human review)**:
  - Sector progression uses 0-based `sectorIndex` (displayed as `SECTOR N+1` in HUD): Sector 1 (`0`) spawns Maximilian on a perimeter-walled island, Sector 2 (`1`) spawns Recogniser on an open-edge island, and Sector 3+ (`2+`) alternates bosses with +25% HP scaling per sector. After defeating the sector boss, a `NEXT SECTOR` HUD button appears so the player can advance or linger to trigger Evil Otto past `ottoWarningSec`.
- **Verification & Regression Proof**:
  - `pnpm run build` (`tsc --noEmit && vite build`): **PASSED** (0 TypeScript errors, 994 modules transformed, built in 1.78s).
  - `pnpm test` (`vitest run`): **PASSED** — **11 test files passed (11), 61 tests passed (61)** (all 56 prior tests + 5 new Milestone 3 integration tests).
- **Verifier follow-up (`t_47f758eb`, per human decision 2026-11-25)**:
  - Recorded the three Milestone 3 design defaults (Otto timer after boss defeat, manual `NEXT SECTOR` button, Sector 3+ alternating bosses +25% HP) as human-approved `[RESOLVED]` entries in `docs/QUESTIONS.md`.
  - Restored `approach_b_demo_modular_sprite_stacked_humanoid.html` to the repo root (it had been moved to `docs/` without a log entry, breaking links in `AGENTS.md` and `plan.md`). Content is byte-identical to `HEAD`.

---

## Milestone 4 — Visual Polish & Playtest Fixes (`t_1b9985b0`, `main`)
- **Files created**:
  - `src/engine/input.test.ts` — 4 headless Vitest tests for gamepad deadzone, standard button mapping and twin-stick hero aiming.
  - `src/game/loading.ts` — `LOAD_STAGES`, `bootstrapAssets(onProgress)`, `createLoadingScreen()`: frame-yielded chunked model build + 24-angle cache baking behind a neon progress thermometer; headless no-op screen.
  - `src/game/loading.test.ts` — 1 Vitest test proving monotonic progress, named stages and all 8×24 angle bakes.
- **Files modified**:
  - `src/engine/types.ts` — `InputState` gained `aimX`/`aimY`, `swapPressed`, `slotSelect`, `slotCycle`; `PlayerState` gained optional `weaponSlots` (3 slots, `null` = empty) and `activeSlot`.
  - `src/engine/input.ts` — exported `GamepadLike`, `GamepadSnapshot`, `GAMEPAD_DEADZONE` (0.18) and pure `parseGamepadSnapshot(pad, deadzone)`; `createInputController` now polls `navigator.getGamepads()`, merges twin-stick movement/aim with WASD+mouse, maps A/LT=dodge, X=swap, LB/RB=cycle, RT/right-stick=fire, D-pad=swivel; `1`/`2`/`3` select slots, `F` swaps, mouse wheel cycles.
  - `src/entities/player.ts` — `createPlayer` seeds `[weapon, null, null]` slots; `updatePlayer` aims from the analog right stick when deflected.
  - `src/entities/weapons.ts` — `WEAPON_SLOT_COUNT`, `WEAPON_PICKUP_LABELS`, `weaponPickupLabel`, `pickupLabel`, `ensureWeaponSlots`, `getActiveSlot`, `selectWeaponSlot`, `cycleWeaponSlot`, `applyWeaponPickupToSlots`, `createDroppedWeaponPickup`.
  - `src/entities/weapons.test.ts` — 3 new tests for slots/1-2-3/cycling, upgrade/equip/swap outcomes and pickup labels.
  - `src/game/gameState.ts` — `GameState.nearbyWeaponPickup` + `toast`; slot selection applied per tick; weapon pickups no longer auto-collect (must press `F`), F swaps a full inventory and drops the replaced weapon on the floor; modifiers/orbitals/boosts still auto-collect and raise a toast.
  - `src/game/gameState.test.ts` — updated the pickup flow test for F-to-equip, added a full F-swap/drop integration test.
  - `src/game/hud.ts` — HUD shows 3 weapon slots (active highlighted), `[F] EQUIP/UPGRADE/SWAP` prompt, control hints and a center-bottom pickup toast.
  - `src/game/renderer.ts` — depth-sorted extruded 3D walls (`drawWall3D`) with animated electrified plasma arcs and top rims, 3D sliding-door panels, distinct per-type pickup icons with hovering labels and `[F]` prompts, pulsing exposed Maximilian core in `recover`, `RendererOptions` accepts pre-baked `models`/`cache`.
  - `src/render/models.ts` — humanoid Tron Enforcer / Laser Shooter / Grenadier stacks (separate legs and stride, armored shoulders/torso, crimson visor), still 24-angle cached; exported `BakeTask`/`getBakeTasks` shared by sync and async bake paths.
  - `src/bosses/maximilian.ts` — bugfix: `projectileBypassesBlades`, `inFrontalBladeArc`; stalk/charge only block the frontal ±75° arc, whirlwind lets beam/lightning/grenade/pierce through, recover fully exposes the core with retracted blades.
  - `src/bosses/bosses.test.ts` — 3 new tests for flank/rear shots, recover vulnerability and whirlwind bypasses.
  - `src/main.ts` — boots through `createLoadingScreen()` + `bootstrapAssets()`, then creates the renderer from the pre-baked assets and starts the fixed-timestep loop.
  - `docs/SHARED_CONTRACTS.md`, `docs/QUESTIONS.md` — new contracts and recorded design defaults.
- **Verification & Regression Proof** (Nix devShell, `nix develop --impure --command sh -c 'pnpm run build && pnpm test'`):
  - `pnpm run build` (`tsc --noEmit && vite build`): **PASSED** (0 TypeScript errors, 995 modules transformed).
  - `pnpm test` (`vitest run`): **PASSED** — **13 test files, 73/73 tests** (61 prior + 12 new: +3 Maximilian, +4 gamepad, +4 weapon slots, +1 loading).

---

## Milestone 4.1 — Playtest Fixes (`t_2408d038`, `main`)

Spec: `docs/specs/milestone-4.1-fixes.md` (plan-only; synthesizer will replace with the as-built report).

- **Files created**:
  - `src/world/levelData.test.ts` — 4 tests: seed reproducibility, seed variation, 300px spawn clearance from walls/crates, gate/door/electrified-wall invariants.
  - `src/game/gallery.ts` — `isGalleryEnabled(search)`, `createModelGallery({models, cache})`: `?gallery=1` modal with 5× rotating turntables of all nine Approach B model groups, [G]/Esc toggle.
- **Files modified**:
  - `index.html` — inline `#loading-screen` neon thermometer painted at t=0ms (0% — LOADING ENGINE MODULES...) with animated shimmer; Bootstrap CSS and markup require zero JS.
  - `src/main.ts` — dynamic `import()` of loading/difficulty/input/gameState/hud/renderer *after* first paint; staged 0→25→92→100% progress; gallery opt-in wiring.
  - `src/game/loading.ts` — 4 named `LOAD_STAGES`; `createLoadingScreen()` now reuses the inline DOM element (backfills it for headless/minimal hosts) instead of creating a blank flash.
  - `src/world/levelData.ts` — `createSectorIsland(sectorIndex, seed?)` with mulberry32 PRNG; seeded wall baffles/pylons, door offsets, crate clusters, bridge activation; `SPAWN_CLEAR_RADIUS = 300` keeps the hero spawn area clear.
  - `src/enemies/spawner.ts` — `SAFE_SPAWN_CLEARANCE = 260`, `HordeSpawnOptions`, `safeSpawnPoint()` pushes gate spawns outside the hero bubble, `vanguard` option spawns a 5–8 far-away opening squad.
  - `src/game/gameState.ts` — sector start spawns the vanguard; wave spawns pass hero clearance + gate telegraph; weapon pickups auto-collect into open slots / auto-upgrade duplicates, [F] only for a full 3-slot distinct inventory.
  - `src/entities/weapons.ts` — exported `shouldAutoCollectWeapon(player, type)`.
  - `src/game/renderer.ts` — `drawWall3D()` and sliding doors rebuilt as true vertical Approach B Z-stacks (no lateral `ex` skew), 10 crisp layers, bright top caps and climbing plasma arcs; Maximilian shield ring + floating VULNERABLE! indicator.
  - `src/render/models.ts` — distinct 12-layer Enforcer (lean soldier + batons), Laser Shooter (tripod/amber barrel/crest), Grenadier (squat twin mortars); rebuilt Maximilian as a floating horned killer robot with twin sawblade arms.
  - `src/bosses/maximilian.ts` — `isMaximilianVulnerable`, 1200 HP / 260 regenerating blade-shield meter, deflect sparks + SFX, heavy/piercing meter drain, shield-break → recover window, `CORE EXPOSED!` taunt.
  - `src/engine/types.ts` — `BossState` gained optional `shieldHp`, `shieldMaxHp`, `vulnerable`.
  - `src/game/hud.ts` — secondary cyan/orange blade-shield bar and `VULNERABLE!` boss status.
  - Tests updated: `src/game/gameState.test.ts`, `src/entities/weapons.test.ts`, `src/bosses/bosses.test.ts`, `src/game/loading.test.ts`, `src/world/worldSim.test.ts`.
- **Verification & Regression Proof**:
  - `pnpm run build`: **PASSED** — 0 TypeScript errors, 996 modules, inline boot screen + 12 dynamic chunks.
  - `pnpm test`: **PASSED** — **14 test files, 88/88 tests** (73 prior + 15 new).
  - HTTP smoke test: `vite preview` served the built `index.html` with all inline boot markers and all 13 JS chunks at HTTP 200. (Real-browser CDP navigation was unavailable in this runner, so no in-browser console assertion is claimed.)

---

## Milestone 4.11 — Sample-Art Visual Overhaul, Maze Rooms, Rez-In Spawning & New Bosses

Spec: `docs/specs/milestone-4.11-tweaks.md`.

- **Files created**:
  - `src/bosses/abb.ts` — `createAbb`, `updateAbb` (ABB Tank-Mech: dodge-dash repositioning + 360° ring of guided homing missiles).
  - `src/bosses/skullhead.ts` — `createSkullhead`, `updateSkullhead` (Floating Skullhead: telegraphed twin sweeping eye-laser beams).
  - `src/bosses/bugHive.ts` — `createBugHive`, `updateBugHive`, `interceptProjectileWithOrbitingBugs` (Tech Hive + whirling Flying Bug Bot shield that intercepts player shots, peels off in swooping attacks, and replenishes).
  - `src/bosses/brainbot.ts` — `createBrainbot`, `updateBrainbot` (Rolling Brainbot: rapid rolling movement + crackling ground-hugging `electric_wave` fans).
- **Files modified**:
  - `src/engine/types.ts` — added `v_bot_melee`/`v_bot_laser` to `EnemyKind`, `fireAnimTimer`/`rezTimer`/`rezDuration` to `EnemyState` & `BossState`, `electric_wave` to `Projectile['kind']`, `abb`/`skullhead`/`bug_hive`/`brainbot` to `BossKind`, `OrbitingBugBot`, and higher-sector `shieldLayers`/`maxShieldLayers`/`shieldLayerHp`/`shieldRegenDelay`/`rampageTimer`/`rampageCooldown` + new boss state fields.
  - `src/audio/soundEngine.ts` — added `'rez_in'` synth SFX.
  - `src/world/levelData.ts` — upgraded `createSectorIsland(sectorIndex, seed?)` to generate Berzerk-style randomized orthogonal corridor mazes (2–4 wide cardinal doorways, L-walls, T-junctions, pillars) with BFS-verified connectivity (`isMazeFullyConnected`, `getDoorwayAnchors`).
  - `src/enemies/enforcer.ts` — added `createVBotMelee`, `isMeleeEnemyKind`, rez-in materialization pause, and faster Red V-Bot rushing.
  - `src/enemies/shooter.ts` — added `createVBotLaser`, `isRangedEnemyKind`, `ENEMY_FIRE_ANIM_SEC`, `fireAnimTimer` trigger/decay on firing, and rez-in pause.
  - `src/enemies/spawner.ts` — added `DEFAULT_REZ_DURATION = 1.0` (zero pop-in spawning) and `includeVBots` wave/vanguard mixing while keeping legacy cap behavior backward-compatible.
  - `src/bosses/bossUtils.ts` — added `BOSS_REZ_DURATION`, `BOSS_FIRE_ANIM_SEC`, `RAMPAGE_DURATION_SEC`, `RAMPAGE_COOLDOWN_SEC`, `applyHigherSectorBossScaling`, `stepBossCommonTimers`.
  - `src/bosses/maximilian.ts`, `src/bosses/recogniser.ts`, `src/bosses/evilOtto.ts` — scaled hitboxes, wired `stepBossCommonTimers` & `fireAnimTimer`, updated `damageBossPart` for rez-in invulnerability, rampage invulnerability, and multi-layer regenerating shields.
  - `src/render/models.ts` — replaced black/near-black enemy silhouettes with light/medium metallic greys (`#64748b`, `#94a3b8`, `#cbd5e1`) + high-contrast accents; redesigned `enforcer_melee`, `laser_shooter`, `grenadier`, and 2-legged `recogniser` (`legs: [left, right]`); added `buildVBotMeleeFrames`, `buildVBotLaserFrames`, `buildAbb`, `buildSkullhead`, `buildBugHive`, `buildBrainbot`; updated `getBakeTasks` (12×24 angles).
  - `src/game/gameState.ts` — wired V-bots, rez-in invulnerability/non-collision, all 4 new bosses (plus Bug Hive shot interception), higher-sector scaling, and 6-boss sector rotation.
  - `src/game/renderer.ts` — added TRON rez-in vertical scan beam + bottom-to-top clip reveal, enemy/boss firing recoil & muzzle flash, 2–3× boss render scale (`4.5×–5.0×`), 2-legged Recogniser + sparking sockets, multi-layer shield rings, Rampage golden/crimson aura + banner, all 4 new bosses (ABB afterimages, Skullhead twin targeting/eye-lasers, Bug Hive orbiting bugs, Brainbot glass dome), and `electric_wave` crackling floor arcs.
  - `src/game/hud.ts` — segmented multi-layer boss shield bars, `RAMPAGE — INVULNERABLE!` banner, and quick-spawn buttons for all 7 bosses.
  - `src/game/gallery.ts` — added all redesigned enemies, V-bots, 2-legged Recogniser, and all 4 new bosses (+ Flying Bug Bot).
  - `src/main.ts` — HUD quick-spawn passes `{ rezDuration: 1.0 }`.
  - Tests updated/added: `src/world/levelData.test.ts` (+2), `src/enemies/enemies.test.ts` (+4), `src/bosses/bosses.test.ts` (+6), `src/game/gameState.test.ts` (+2), `src/render/spriteStack.test.ts` (expanded assertions), `src/game/loading.test.ts` (updated to 12×24 bake tasks).
- **Verification & Regression Proof** (`nix develop --impure --command sh -c "pnpm run build && pnpm test"`):
  - `pnpm run build` (`tsc --noEmit && vite build`): **PASSED** (0 TypeScript errors, 1000 modules transformed).
  - `pnpm test` (`vitest run`): **PASSED** — **14 test files passed (14), 102 tests passed (102)** (all 88 prior tests + 14 new Milestone 4.11 tests).

---

## Milestone 4.12 — Rotation Depth-Sorting Fix, Rez-In Flash, Skullhead Face & Hero Death/Telefrag Respawn

Spec: `docs/specs/milestone-4.12-tweaks.md`.

- **Files created**:
  - `src/game/renderer.test.ts` — 4 Vitest unit tests covering 3D wall chunking across `0°/90°/180°/270°`, retracting 3D sliding door chunks, two-stage `rezFlashPhase` (`0..0.80` beam, `0.80..1.0` opaque flash, `0.15s` post-rez halo), and Skullhead model geometry.
- **Files modified**:
  - `src/engine/types.ts` — added `deathTimer`, `rezTimer`, `rezDuration`, `rezHaloTimer`, `deathX`, `deathY` to `PlayerState`, and `rezHaloTimer` to `EnemyState` & `BossState`.
  - `src/entities/player.ts` — exported `HERO_DEATH_DURATION` (`0.85`), `HERO_REZ_DURATION` (`1.0`), `HERO_POST_REZ_INVULN` (`0.5`), `HERO_TELEFRAG_RADIUS` (`64`), `HERO_DEATH_PARTICLE_COUNT` (`54`), `clampToSafeIslandFloor`, `resetPlayerLoadout`, `triggerHeroDeath`; updated `isPlayerInvulnerable`, `damagePlayer`, and `updatePlayer` (input freeze while dying/rezzing, red-dot death explosion, safe-floor edge-fall respawn).
  - `src/bosses/bossUtils.ts` — updated `applyBossDamageToPlayer` to respect `deathTimer > 0` and `rezTimer > 0` invulnerability.
  - `src/game/gameState.ts` — exported `TelefragResult`, `telefragTargets`, and `stepHeroDeath`; wired death explosion → full loadout reset at clamped death location → invulnerable Rez-In → `64px` telefrag (destroying overlapping enemies/projectiles & knocking back/damaging overlapping bosses) + `0.15s` post-rez halo tracking for hero, enemies, and bosses.
  - `src/game/renderer.ts` — exported `DEFAULT_WALL_CHUNK_SIZE`, `WallChunk`, `chunkWallForDepthSort`, `chunkSlidingDoorForDepthSort`, `REZ_POST_HALO_SEC`, `RezFlashPhase`, `rezFlashPhase`; subdivided walls and 3D Approach-B sliding doors (`drawDoor3D`) into ~56px depth-sorted chunks; upgraded `drawRezInBeam` + `drawPostRezHalo` with two-stage beam → opaque flash silhouette climax; hid hero during `deathTimer > 0` and rendered hero Rez-In + post-rez halo; perched Skullhead's tiny spinning propeller hat on top of its dome.
  - `src/render/models.ts` — redesigned `buildSkullhead()` with sculpted ivory/light-grey skull cranium, deep dark eye sockets, glowing orange/red laser eyes, nasal cavity, metallic jaw/teeth grille on `-Y` front, and a tiny 8px spinning propeller hat.
  - `src/game/gameState.test.ts` — added 2 Milestone 4.12 integration tests (full hero death → `deathTimer` → full loadout reset → `rezTimer` invulnerability → telefrag flow, and final-life `lives === 1` death explosion before Game Over).
- **Verification & Regression Proof** (`nix develop --impure --command sh -c "pnpm run build && pnpm test"`):
  - `pnpm run build` (`tsc --noEmit && vite build`): **PASSED** (0 TypeScript errors, 1000 modules transformed, built in 2.27s).
  - `pnpm test` (`vitest run`): **PASSED** — **15 test files passed (15), 108 tests passed (108)** (all 102 prior tests + 6 new Milestone 4.12 tests).

---

## Milestone 4.13 — Boss Hit-Flash, Classic Door-Walk Push-Slide Room Transitions & 3/4 Face-Forward Sprite Perspective

Spec: `docs/specs/milestone-4.13-tweaks.md`.

- **Files modified**:
  - `src/engine/types.ts` — added `CardinalDirection`, `SlidingDoor.cardinal`, `RoomTransitionState`, and `BossState.hitFlashKind` (`'core' | 'shield'`).
  - `src/bosses/recogniser.ts`, `src/bosses/maximilian.ts`, `src/bosses/bugHive.ts` — set `boss.hitFlash = 0.12` and `boss.hitFlashKind` (`'core'` vs `'shield'`) across all boss core/part/shield/bug-intercept damage paths with hit sparks.
  - `src/entities/orbitals.ts` — updated `updateOrbitals(..., boss?)` so orbiting `shooter_drone` orbitals also target active bosses.
  - `src/world/levelData.ts` — ensured all 4 cardinal doorways (`north`/`south`/`east`/`west`) exist and are tagged with `cardinal` on every sector; exported `getDoorwayEntryPosition(island, enterDir, inset?)`.
  - `src/world/worldSim.ts` — exported `unlockCardinalExitDoors(island)` and extended `updateWorld(island, timeSec, dt, exitsUnlocked?)` to keep cardinal exit doors open (`openFraction = 1`) and bridges active once the sector boss is defeated.
  - `src/game/gameState.ts` — added `GameState.roomTransition`, exported `ROOM_TRANSITION_DURATION` (`0.62`), `getRoomTransitionMapping`, `detectOpenExitDoorWalk`, and `startRoomTransition`; wired boss defeat door unlocking, door-walk push-slide transitions (`east->west (-1,0)`, `west->east (1,0)`, `north->south (0,1)`, `south->north (0,-1)`) with invulnerable auto-walk-in, `updateOrbitals(..., state.boss)`, and lightsaber-vs-boss damage triggering `boss.hitFlash`.
  - `src/game/hud.ts` — removed the manual `"NEXT SECTOR"` button and replaced it with the `"EXIT DOORS OPEN — WALK THROUGH ANY DOOR"` status hint shown after boss defeat.
  - `src/game/renderer.ts` — rendered boss hit-flash overlays (`ctx.filter` brightness/contrast flash + pulsing core white/red or shield cyan/amber rim & radial sparks), glowing open cardinal exit doors with outward directional chevrons (`>>>`), cubic-eased push-slide + cross-fade room transitions, and 3/4 vertical Z-spacing (`BASE_LAYER_SPACING = 2.8`, `PITCH_Z_MULTIPLIER = 1.4`).
  - `src/render/spriteStack.ts` — exported `DEFAULT_SLICE_PITCH_Y = 0.64`; upgraded `drawStack` and `SpriteStackCache.bake` to apply `ctx.scale(1, slicePitchY)` before `ctx.rotate(rad)` while preserving 24-angle caching and headless compatibility.
  - `src/render/models.ts` — sculpted expressive 3/4 front faces across clear vertical Z-bands (mouths/grilles, eyes/visors, chest cores, foreheads/brows) for Skullhead, Hero, Enforcer, V-Bots, Laser Shooter, Grenadier, Maximilian, Recogniser, Evil Otto (added sinister grin + angry eyes), ABB, and Brainbot.
  - `src/game/loading.ts` & `src/game/gallery.ts` — synced `BASE_LAYER_SPACING = 2.8` and `DEFAULT_SLICE_PITCH_Y = 0.64` so the `?gallery=1` Model Gallery renders with the exact same 3/4 pitch.
  - `src/game/gameState.test.ts` (+2) & `src/render/spriteStack.test.ts` (+1) — added 3 Milestone 4.13 Vitest tests covering boss `hitFlash` trigger/shield-vs-core/decay, boss defeat door unlock + all 4 cardinal door-walk push-slide transitions, and 3/4 `slicePitchY` foreshortening before `rotate` with 24-angle caching.
- **Verification & Regression Proof** (`nix develop --impure --command sh -c "pnpm run build && pnpm test"`):
  - `pnpm run build` (`tsc --noEmit && vite build`): **PASSED** (0 TypeScript errors, 1000 modules transformed, built in 2.41s).
  - `pnpm test` (`vitest run`): **PASSED** — **15 test files passed (15), 111 tests passed (111)** (all 108 prior tests + 3 new Milestone 4.13 tests).

---

## Milestone 4.14 — Explosive Grenades, Boss Combat Upgrades & Elemental Weapon Overhaul (`main`)
- **Files modified**:
  - `src/engine/types.ts` — added `'sawblade'` projectile kind, ICBM fields (`icbm`, `turnRate`, `blastRadius`, `spinAngle`), `AblativeShieldPlate`, `SkullLaserBeam`, elemental status fields (`burnTimer`, `burnTickTimer`, `chillSlow`, `lightningFlashTimer`), and VFX event variants (`vfx_shockwave`, `vfx_lightning_arc`, `vfx_flame_smoke`, `vfx_sizzle`).
  - `src/world/worldSim.ts` — exported `raycastSolidWalls` and `RaycastHit` for exact ray-vs-AABB intersection against solid walls and closed sliding doors.
  - `src/enemies/enemyUtils.ts`, `src/enemies/enforcer.ts`, `src/enemies/shooter.ts` — exported `FREEZE_HIT_SLOW` (`0.02`), `FREEZE_MAX_SLOW` (`0.85`), `FREEZE_RECOVERY_PER_SEC` (`0.01`), `applyFreezeHit`, `recoverChillSlow`, `getChillSpeedMultiplier`; scaled enemy movement by `(1 - chillSlow)` and decayed `lightningFlashTimer`.
  - `src/bosses/bossUtils.ts` — stepped `chillSlow` recovery and `lightningFlashTimer` decay in `stepBossCommonTimers`.
  - `src/bosses/maximilian.ts` — exported `createMaximilianAblativePlates`, `interceptProjectileWithAblativeShields`; added sector-scaled concentric rotating ablative shield plates and periodic thrown spinning `'sawblade'` projectiles during `stalk`/`charge`/`whirlwind`.
  - `src/bosses/abb.ts` — exported `ABB_ICBM_SPEED` (`290`), `ABB_ICBM_TURN_RATE` (`2.0`), `ABB_ICBM_BLAST_RADIUS` (`112`), `steerGuidedIcbm`; radial 360° ICBM launches with capped angular turn rate.
  - `src/bosses/skullhead.ts` — exported `computeSkullheadEyeLasers`; raycasted twin eye lasers against solid walls, closed doors, and hero with continuous sizzle-explosion events at impact points.
  - `src/game/gameState.ts` — exported `GRENADE_BLAST_RADIUS` (`96`), `LIGHTNING_CHAIN_RADIUS` (`130`), `LIGHTNING_FLASH_SEC` (`0.16`), `BURN_DURATION_SEC` (`3.0`), `triggerLightningChain`; wired grenade detonation on landing/wall/enemy/crate/boss/expiry, Maximilian sawblade wall sparks/crate shredding + ablative shield interception, ABB ICBM steering + massive world-shaking explosions (shake mag 16, 0.36s, multi-ring shockwave), Skullhead wall-blocked lasers, and elemental Flamethrower DOT/Freeze slow/Lightning `2 * level` chain-jumping.
  - `src/render/vfx.ts` — added `shockwave`, `flameSmoke`, `sizzle` emitters and `'ring'`, `'flame'`, `'smoke'`, `'sizzle'` pooled particles plus white-core electric lightning arcs.
  - `src/game/renderer.ts` — rendered animated flickering fireballs, burning flame overlays, chilled icy-blue glow scaling with `chillSlow`, white/blue lightning flashes, Maximilian ablative shield plates + spinning sawblades, ABB ICBM rockets (fuselage/red nosecone/fins/thruster/smoke), and wall-clipped Skullhead eye beams with molten sizzle impact flares.
- **Files created**:
  - `src/game/milestone414.test.ts` — 11 headless Vitest unit & integration tests covering all 9 verification gate items plus VFX event rendering.
- **Verification & Regression Proof** (`nix develop --impure --command sh -c "pnpm run build && pnpm test"`):
  - `pnpm run build` (`tsc --noEmit && vite build`): **PASSED** (0 TypeScript errors, 1000 modules transformed).
  - `pnpm test` (`vitest run`): **PASSED** — **16 test files passed (16), 122 tests passed (122)** (111 prior + 11 new).

## Milestone 4.15 — Projectile End VFX, Early Otto Alarm, Tesla Orientation, Music Crossfade, Pause Menu & Title Screen

- **Files modified**:
  - `src/engine/types.ts` — added `GamePhase`, `vfx_implosion` / `vfx_electric_detonation` / `music_mode` events, `ottoAlarmStartDelaySec` config field.
  - `src/config/difficulty.ts` — `ottoAlarmStartDelaySec: 4.0` default.
  - `src/engine/input.ts` — gamepad Start/Menu button + `startPressed` / `anyPressed` snapshots.
  - `src/game/gameState.ts` — exported `transitionGamePhase`, `startFromTitle`, `togglePause`, `resumeGame`, `quitToTitle`, `computeOttoAlarmTiming`, `evaluateOttoAlarm`, `cancelOttoAlarm`, `emitElectricDetonation`, `emitProjectileImpactVfx`, `emitProjectileTimeoutVfx`; wired universal impact/implosion VFX, 4s-delayed Otto alarm with BEWARE!/I SENSE YOU!/HUMANOID taunts, boss/level music-mode events, and a `paused`/`title` simulation freeze.
  - `src/render/vfx.ts` — `VfxSystem.implode()` + `implode_ring`/`implode_spark` particles + electric-detonation tendrils; handles the new events.
  - `src/game/renderer.ts` — exported pure `projectileHeadingDeg()`; travel-aligned jagged electric arc spears; title screen drawn over the live circuit background.
  - `src/audio/soundEngine.ts` — dual-bus level/boss music rig with `getMusicMode()`, `setMusicMode()`, fade/crossfade helpers, `setPaused()`, and an `otto_alarm` synth voice.
  - `src/game/hud.ts` — Otto countdown banner and neon PAUSED modal (Resume / Restart / Model Gallery / Quit to Title) + arcade title overlay.
  - `src/main.ts` — explicit title→playing→paused arcade flow, any-button start, Escape/Start pause toggle, pause actions and music fades.
  - `src/game/gallery.ts` — back-to-pause integration.
- **Files created**:
  - `src/game/milestone415.test.ts` — 19 headless Vitest tests across all 6 verification-gate features.
- **Verification & Regression Proof** (`nix develop --impure --command sh -c "pnpm run build && pnpm test"`):
  - `pnpm run build` (`tsc --noEmit && vite build`): **PASSED** (0 TypeScript errors, 1000 modules transformed).
  - `pnpm test` (`vitest run`): **PASSED** — **17 test files passed (17), 141 tests passed (141)** (122 prior + 19 new). A backward-compatible `computeOttoAlarmTiming()` preserves the old short-`ottoWarningSec` contract while defaulting to the spec's 4s delay / 45s warning.

---

## Milestone 4.16 — Boss Tempo Ramp, Dalek Otto, Universal Shields, Taller Sprites, ABB Salvo, Gamepad Pause & Gallery Tuner

- **Files modified**:
  - `src/audio/soundEngine.ts` — exported `LEVEL_BASE_BPM` (`118`), `BOSS_BASE_BPM` (`148`), `BOSS_MAX_BPM` (`210`); added `setBossHpRatio(ratio)`, `getBossTempoBpm()`, and `getTempoMultiplier()` scaling Boss Danger BPM `148 -> 210` (`~1.42x`) as boss HP drops `1.0 -> 0.0`, resetting cleanly on boss death or return to level/silent music.
  - `src/audio/voiceTaunts.ts` — retuned `VOICE_PRESETS.evil_otto` to screechy Dalek preset (`pitchMul: 1.8`, `rateMul: 1.2`, `ringModHz: 55`) with headless-safe Tone.js FM/BitCrusher metallic ring-modulator accompaniment.
  - `src/config/difficulty.ts` & `src/engine/types.ts` — added `ottoCountdownSec: 10.0` (`ottoWarningSec: 14.0` after 4.0s post-boss delay), `BossState.bladeExtend`, and `BossState.sectorIndex`.
  - `src/bosses/bossUtils.ts`, `maximilian.ts`, `recogniser.ts`, `evilOtto.ts`, `abb.ts`, `skullhead.ts`, `bugHive.ts`, `brainbot.ts` — exported `computeBossShieldConfig`, `getMaximilianTargetBladeExtend`, `getAbbSalvoCount`; gave all 7 bosses `shieldLayers >= 1` / `shieldHp > 0` in Sector 1 scaling upward in higher sectors; added Maximilian smooth `bladeExtend` (`0..1`) & melee reach extension during `charge`/`whirlwind`; tuned ABB salvo to `Math.min(8, 2 + sectorNum)` (3 in S1 -> 8) with `ABB_ICBM_SPEED = 390` and `ABB_ICBM_TURN_RATE = 1.25`.
  - `src/render/spriteStack.ts` & `src/render/models.ts` — exported `CHARACTER_HEIGHT_MULTIPLIER` (`1.42`), `RECOGNISER_HEIGHT_MULTIPLIER` (`1.0`), `getEntitySpacingMultiplier(kind)`; applied `1.42x` vertical height to all non-Recogniser characters; expanded Skullhead to 16 vertical layers exposing more sculpted skull face under the propeller hat; rebuilt Brainbot upper body into a 16-layer smooth round translucent glass dome enclosing a glowing convoluted pink/coral/orange brain + green optic.
  - `src/engine/input.ts`, `src/game/hud.ts`, `src/main.ts` — exported `PAUSE_MENU_ITEMS`, `createPauseMenuNav`, `gamepadSnapshotToPauseNavInput`; wired full Gamepad Pause Menu navigation (D-Pad/Left Stick Up/Down with wrap & repeat debounce, A confirm, Start/B resume or exit Model Gallery); hid Boss HUD shield bar once broken.
  - `src/game/gallery.ts` — exported `GALLERY_MIN_SPACING`, `GALLERY_MAX_SPACING`, `GALLERY_SPACING_STEP`, `createGalleryControlState`, `clampGallerySpacing`, `stepGalleryControls`, `applyGalleryKeyPress`, `formatGalleryTelemetry`; wired WASD/Arrow live rotation + 0.1px stack spacing controls, Space auto-spin toggle, and live numeric telemetry badge.
  - `src/game/renderer.ts` & `src/game/gameState.ts` — wired live boss HP ratio -> `sound.setBossHpRatio`, Maximilian extending sawblade arms, universal boss shield aura/barrier, taller non-Recogniser vertical spacing, glossy Brainbot glass dome arcs, Dalek Otto alarm taunts (`"BEWARE!"`, `"I SENSE YOU!"`, `"EXTERMINATE THE HUMANOID!"`), and ABB sector scaling.
  - Updated superseded assertions in `src/audio/audio.test.ts`, `src/bosses/bosses.test.ts`, `src/game/gameState.test.ts`, `src/game/milestone414.test.ts`, `src/game/milestone415.test.ts`, and `src/game/renderer.test.ts`.
- **Files created**:
  - `src/game/milestone416.test.ts` — 12 headless Vitest tests covering all 8 Milestone 4.16 acceptance criteria.
- **Verification & Regression Proof** (`nix develop --impure --command sh -c "pnpm run build && pnpm test"`):
  - `pnpm run build` (`tsc --noEmit && vite build`): **PASSED** (0 TypeScript errors, 1000 modules transformed, built in 1.54s).
  - `pnpm test` (`vitest run`): **PASSED** — **18 test files passed (18), 153 tests passed (153)** (141 prior + 12 new Milestone 4.16 tests), exit code 0.
