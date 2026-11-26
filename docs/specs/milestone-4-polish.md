# Milestone 4 polish: final delivery report

This document records what Milestone 4 actually delivered for BERZERK³, how each plan requirement was met, and the evidence behind it. It replaces the original plan-only spec; the requirement numbering below follows that plan so it can still be used as a coverage checklist. The implementation comes from the verified worker handoff (`t_1b9985b0`) and the verifier pass (`t_fdd515ad`, gate `pass`). Both posted structured notes to the swarm blackboard on `t_5690fe24` (comments 10 and 11). All work follows the rules in [AGENTS.md](../../AGENTS.md) and the contracts in [SHARED_CONTRACTS.md](../SHARED_CONTRACTS.md).

Status: **delivered, gate passed**. The build has 0 TypeScript errors across 995 modules, and 73 of 73 tests pass in 13 files: 61 prior tests plus 12 new ones. The verifier re-ran the gate independently and got the same numbers, then ran a clean static scan for hardcoded secrets, shell injection, eval/exec, unsafe deserialization, string-built SQL, stray console/debugger calls, and TODO/FIXME markers in the changed source.

## Delivered implementation

| File | What it contains |
| --- | --- |
| `src/game/renderer.ts` | `drawWall3D` extruded walls in the depth-sorted queue, animated electrified plasma arcs, 3D sliding-door panels, `drawPickupIcon` with per-type icons plus hovering labels and `[F]` prompts, pulsing exposed core for Maximilian in `recover`, and `RendererOptions` that accept pre-baked `models`/`cache`. |
| `src/render/models.ts` | Humanoid Tron Enforcer, Laser Shooter, and Grenadier sprite stacks, plus `BakeTask`/`getBakeTasks` shared by the sync and async bake paths. |
| `src/entities/weapons.ts` | `WEAPON_SLOT_COUNT`, `WEAPON_PICKUP_LABELS`, `pickupLabel`, slot helpers (`ensureWeaponSlots`, `selectWeaponSlot`, `cycleWeaponSlot`), `applyWeaponPickupToSlots`, and `createDroppedWeaponPickup`. |
| `src/engine/input.ts` | Pure `parseGamepadSnapshot`, `GAMEPAD_DEADZONE` (0.18), `navigator.getGamepads()` polling, and keyboard `1`/`2`/`3`, `F`, and wheel handling. |
| `src/engine/types.ts` | `InputState` gained `aimX`/`aimY`, `swapPressed`, `slotSelect`, `slotCycle`; `PlayerState` gained `weaponSlots` and `activeSlot`. |
| `src/entities/player.ts` | `createPlayer` seeds `[weapon, null, null]`; `updatePlayer` aims from the analog right stick when deflected. |
| `src/game/gameState.ts` | `GameState.nearbyWeaponPickup` and `toast`, per-tick slot selection, F-to-swap with a dropped replacement weapon, and toasts for auto-collected pickups. |
| `src/game/hud.ts` | Three weapon slots with the active one highlighted, `[F] EQUIP/UPGRADE/SWAP` prompt, control hints, and a center-bottom pickup toast. |
| `src/game/loading.ts` | New file. `LOAD_STAGES`, `bootstrapAssets(onProgress)`, and `createLoadingScreen()`. |
| `src/main.ts` | Boots through the loading screen and `bootstrapAssets()`, then builds the renderer from the pre-baked assets and starts the fixed-timestep loop. |
| `src/bosses/maximilian.ts` | `projectileBypassesBlades` and `inFrontalBladeArc`; phase-aware blade shredding. |
| Tests | `src/engine/input.test.ts` and `src/game/loading.test.ts` added; `bosses.test.ts`, `weapons.test.ts`, and `gameState.test.ts` extended. |
| Docs | `docs/AGENT_LOG.md`, `docs/QUESTIONS.md`, and `docs/SHARED_CONTRACTS.md` updated. |

## Requirement coverage

### 1. True 3D walls and sliding doors

`drawWall3D` in `src/game/renderer.ts` (line 253) replaces flat outlines with extruded blocks. It draws left and right side faces, a neon-outlined front face, and a glowing top face with a rim, all rotated by the camera angle and lifted by `wall.heightZ * zScale` with a fake-isometric top offset. Each wall is enqueued in the depth-sorted `renderQueue` with `sortY = s.y + wall.h * 0.5`, so it interleaves with the Hero, enemies, and projectiles instead of always sitting behind them. Electrified walls get animated vertical plasma arcs whose flicker and jitter come from `elapsedTime` plus the wall index, along with energy bars on the top rim.

Sliding doors (lines 154 to 199) are now extruded panels with side faces and glowing top rims. `openFraction` controls how far the two panels have retracted and switches their fill and edge colors once the door is mostly open.

This is canvas-2D fake-isometric extrusion in the Approach B style, not a WebGL mesh pipeline. It delivers the visible depth and Z-sorting the plan asked for without adding a 3D dependency.

### 2. Humanoid silhouettes for red enemies

`buildEnforcerFrames()` now builds a five-layer humanoid with separated legs and opposing stride, glowing boots, an armored torso with pauldrons and swinging arms, a reactor core, and a head with a crimson visor and antenna. It has three gait frames. `buildLaserShooterFrames()` keeps the same silhouette family with slimmer legs and a rifle barrel (two frames). `buildGrenadierFrames()` is a heavier six-layer stack with a shoulder launcher tube (two frames). Chassis colors stay black with crimson or orange accents.

The models are still pre-baked into `SpriteStackCache` through `getBakeTasks`, so each enemy costs one `ctx.drawImage()` at render time. Bake tasks cover three Enforcer frames, two Shooter frames, two Grenadier frames, and the crate, which is eight tasks of 24 angles each.

### 3. Distinct pickup icons, labels, and the 3-slot weapon inventory

`drawPickupIcon` in `src/game/renderer.ts` draws a different shape for each pickup: a three-way fan for `spread`, twin barrels for `machine_gun`, double barrels for `shotgun`, a wide or narrow emitter for beams, a flame for `flamethrower`, a lightning bolt for `bouncing_lightning`, a grenade with a pin, a spiked mine disc, a rifle for the default, plus distinct diamond, orbital, shield, and plus shapes for modifiers, orbitals, shield boosts, and extra lives.

`pickupLabel` in `src/entities/weapons.ts` supplies short names such as `PULSE`, `MGUN`, `TESLA`, `GRENADE`, `SHIELD`, and `1-UP`. The renderer paints that label on a dark plaque under each ground pickup, and an `[F]` prompt above it when the hero is close. `GameState.toast` drives a center-bottom HUD toast: 1.6 seconds for walk-over pickups and 2.2 seconds for weapon swaps.

The inventory is three slots. `createPlayer` starts with the Pulse Rifle in slot 1 and two empty slots. Keys `1`/`2`/`3` select a slot directly; the mouse wheel and LB/RB cycle through filled slots. The HUD renders all three slots with the active one highlighted in yellow, plus the `[F] EQUIP`, `[F] UPGRADE`, or `[F] SWAP` prompt according to the nearby pickup and whether the hero already carries that weapon.

Pressing `F` near a dropped weapon runs `applyWeaponPickupToSlots`:

- If the hero already carries that weapon type, level it up and make it active.
- If a slot is empty, equip it there and inherit the previously active weapon's modifiers.
- If all three slots are full, replace the active slot and drop the old weapon on the floor as a retrieveable pickup with a 30-second lifetime.

Weapon drops stay on the floor until `F` is pressed. Modifiers, orbitals, shield boosts, and extra lives still auto-collect on walk-over and raise a toast.

### 4. Startup loading thermometer

`src/game/loading.ts` is new. `bootstrapAssets()` builds models, obtains the shared `getBakeTasks` list, and runs one bake task per animation frame via `requestAnimationFrame` (falling back to `setTimeout` in non-browser environments). It reports progress from 0.02 through named stages to 1, yielding after each step so the browser can repaint. `LOAD_STAGES` supplies `BUILDING HERO & BOSS VOXEL STACKS`, `BAKING 24-ANGLE SWARM CACHES`, and `INITIALIZING CIRCUIT GRID`.

`createLoadingScreen()` mounts a neon thermometer with a vertical fill bar, percentage readout, and stage label. It returns an inert no-op controller in headless callers. `src/main.ts` boots through it, then passes the pre-baked `models` and `cache` into `createRenderer`, so the renderer no longer rebuilds and re-bakes at startup. Because the async and sync paths both call `getBakeTasks`, there is one source of truth for what a bake task is.

### 5. Maximilian unkillable bugfix

The plan traced the bug to `updateMaximilian()` shredding every player projectile inside the blade radius in every phase. The fix makes blade shredding phase- and attack-aware:

- `inFrontalBladeArc()` limits `stalk` and `charge` shredding to a ±75° arc around Maximilian's facing angle. Shots to his flanks or rear reach the core, which rewards dodge-rolling past him.
- `projectileBypassesBlades()` lets `beam_segment`, `lightning`, `grenade`, `pierce`, and `lightning_chain` rounds through the 360° `whirlwind`. Standard bolts and ricochets are still shredded.
- `recover` skips projectile shredding entirely and retracts the blade radius from 58/70 to 34. The renderer adds a pulsing exposed core so the window is readable.

Blades still shred destructible crates and damage the player on contact in non-recovery phases. Permanent safe walls stay intact. Three new behavior tests in `bosses.test.ts` cover the frontal arc, full `recover` vulnerability, and whirlwind bypasses.

### 6. Twin-stick gamepad support

`parseGamepadSnapshot(pad, deadzone)` in `src/engine/input.ts` is pure and side-effect-free, so it can be tested in Node with a structural `GamepadLike` object. It applies a radial deadzone of 0.18 with rescaling above the threshold. The standard mapping is: left stick (axes 0/1) for movement, right stick (axes 2/3) for aiming and auto-fire, A or LT for dodge, X for weapon swap, LB/RB for previous/next slot, RT for fire, and D-pad left/right for camera swivel. Transient buttons use rising-edge tracking so a held dodge or swap fires only once.

`createInputController` polls `navigator.getGamepads()` and merges gamepad input with keyboard and mouse. Gamepad movement and aim override the keyboard/mouse values only when their sticks are deflected, so a player can switch between the two without a mode toggle. The existing keyboard controls remain: WASD to move, mouse to aim and fire, Space to dodge, `F` to swap, `1`/`2`/`3` to select, the wheel to cycle, and Q/E to swivel. Four new headless tests cover deadzone filtering, button mapping, LB/RB cancellation when both are held, and right-stick aiming without a mouse.

## Verification gate

Run inside the Nix devShell:

```
nix develop --impure --command sh -c 'pnpm run build && pnpm test'
```

Result: exit 0, 0 TypeScript errors, 995 modules transformed, 13 test files, 73 of 73 tests passing. The 12 new tests break down as three Maximilian behavior tests in `bosses.test.ts`, four gamepad tests in `input.test.ts`, three weapon-slot and label tests in `weapons.test.ts`, one full F-swap integration test in `gameState.test.ts`, and one loading-progress test in `loading.test.ts`. The worker ran the gate and the verifier re-ran it independently with identical results.

## Design decision recorded, not guessed

The plan did not say what happens to walk-over modifiers when a weapon is equipped or swapped. `docs/QUESTIONS.md` records `[RECORDED DEFAULT]` Milestone 4: a newly equipped or swapped weapon inherits the previously active weapon's modifiers, implemented by copying the modifier list in `applyWeaponPickupToSlots`. The alternative, binding modifiers to the weapon they were collected on, could silently drop an earned modifier when switching slots. This is flagged for human review and causes no user-facing UX change.

## Known caveats

These did not block the gate. They are recorded so the next worker does not have to rediscover them.

- All Milestone 4 changes are still uncommitted on `main`, as were the Milestone 3 changes.
- The spec listed dual-rumble haptics as optional. No `vibrationActuator` call was implemented.
- The walls and doors are canvas-2D fake-isometric extrusions, not true 3D geometry.
- `src/main.ts` calls `bootstrapAssets(...).then(...)` with `void` and no rejection handler, so a bootstrap failure would leave the loading screen up.
- The verifier's blackboard note describes "4 behavior tests" for the Maximilian fix. The actual diff adds three new `it()` blocks; the total of 12 new tests is unchanged.
- The F-swap integration test drives `input.swapPressed` directly rather than dispatching a DOM key event. Slot selection and cycling are covered headlessly in `weapons.test.ts`, and gamepad parsing is covered in `input.test.ts`.
- The audio-init caveat from Milestone 3 still applies: `renderer.initAudio()` marks audio ready before awaiting, so a rejected `init()` is not retried.

## References

- [AGENTS.md](../../AGENTS.md): software factory rules, module boundaries, verification rules.
- [plan.md](../../plan.md): full roadmap and milestone context.
- [milestone-3-integration.md](milestone-3-integration.md): the previous as-built report.
- [SHARED_CONTRACTS.md](../SHARED_CONTRACTS.md): cross-module API contracts.
- [QUESTIONS.md](../QUESTIONS.md): resolved decisions and recorded defaults.
- [AGENT_LOG.md](../AGENT_LOG.md): per-agent work entries and regression proof.
