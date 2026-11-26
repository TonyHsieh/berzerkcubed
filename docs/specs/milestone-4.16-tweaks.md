# Milestone 4.16 tweaks: final delivery report

This document records what Milestone 4.16 actually delivered for BERZERK³, how each of the eight spec sections was implemented, and the evidence behind it. It replaces the plan-only spec, but the numbering below still follows the plan so the document doubles as a coverage checklist.

One thing to get out of the way first: the implementation was already at HEAD when the swarm started. Commit `e7bb5ae` landed at 15:09:25 -0800, roughly five minutes before the swarm card was created, so no new source edits came out of this run. What the swarm did instead was verify that commit end to end. The worker handoff is `t_485c55fd` (blackboard comment 34 on `t_c4eaeaa3`), the verifier pass is `t_ef2bd014` with gate `pass` (comment 35), and I read the diff myself and reran the gate. Work follows the rules in [AGENTS.md](../../AGENTS.md) and the contracts in [SHARED_CONTRACTS.md](../SHARED_CONTRACTS.md).

Status: delivered, gate passed. The build reports 0 TypeScript errors across 1000 modules and finishes the Vite bundle in 1.54s. All 153 tests pass in 18 files: 141 prior tests plus 12 new ones in `src/game/milestone416.test.ts`. The verifier reproduced the gate independently and got the same numbers, then ran a static scan for hardcoded secrets, shell injection, eval/exec, unsafe deserialization, and stray debug calls. I ran the exact command from the plan before writing this and got the same result.

## Delivered implementation

| File | What it contains |
| --- | --- |
| `src/audio/soundEngine.ts` | Exports `LEVEL_BASE_BPM` (118), `BOSS_BASE_BPM` (148), and `BOSS_MAX_BPM` (210). Adds `setBossHpRatio(ratio)` (clamped `0..1`), `getBossTempoBpm()`, and `getTempoMultiplier()`, scaling Boss Danger BPM from 148 to 210 as HP drops from `1.0` to `0.0`. The live transport ramps over 0.2s. |
| `src/audio/voiceTaunts.ts` | Retunes `VOICE_PRESETS.evil_otto` to a screechy Dalek voice (`pitchMul: 1.8`, `rateMul: 1.2`, `ringModHz: 55`) with a headless-safe FM/BitCrusher metallic ring-modulator accompaniment. |
| `src/config/difficulty.ts`, `src/engine/types.ts` | Adds `ottoCountdownSec: 10.0` alongside `ottoWarningSec: 14.0` and `ottoAlarmStartDelaySec: 4.0`, plus `BossState.bladeExtend` and `BossState.sectorIndex`. |
| `src/bosses/bossUtils.ts` | Exports `computeBossShieldConfig` and `getMaximilianTargetBladeExtend`. Every boss constructor now derives its shield layers and HP from the sector-scaled config. |
| `src/bosses/maximilian.ts` | Smooths `bladeExtend` from `0..1` so the spinning sawblade arms grow toward full melee reach during `charge` and `whirlwind`. |
| `src/bosses/abb.ts` | Exports `getAbbSalvoCount`, `ABB_ICBM_SPEED` (390), and `ABB_ICBM_TURN_RATE` (1.25). Salvo count scales from 3 in Sector 1 up to 8. |
| `src/bosses/recogniser.ts`, `evilOtto.ts`, `skullhead.ts`, `bugHive.ts`, `brainbot.ts` | Remaining boss constructors wired to the universal shield config, so all seven bosses start with at least one layer in Sector 1. |
| `src/render/spriteStack.ts` | Exports `CHARACTER_HEIGHT_MULTIPLIER` (1.42), `RECOGNISER_HEIGHT_MULTIPLIER` (1.0), and `getEntitySpacingMultiplier(kind)`. Recogniser is deliberately left at 1.0. |
| `src/render/models.ts` | Expands Skullhead to 16 vertical layers with a taller ivory cranium, and rebuilds Brainbot's upper body as a 16-layer translucent glass dome over a glowing convoluted brain and green optic. |
| `src/engine/input.ts` | Exports `PAUSE_MENU_ITEMS`, `parseGamepadSnapshot`, `gamepadSnapshotToPauseNavInput`, and `createPauseMenuNav` with edge debounce and wrap-around navigation. |
| `src/game/hud.ts` | Segmented boss shield bar with one cell per layer, hidden once the shield breaks. |
| `src/main.ts` | Polls `navigator.getGamepads()` each frame and dispatches resume, restart, gallery, and quit actions from the pause menu. |
| `src/game/gallery.ts` | Exports the spacing constants (`1.0` to `8.0`, step `0.1`), `clampGallerySpacing`, `createGalleryControlState`, `stepGalleryControls`, `applyGalleryKeyPress`, and `formatGalleryTelemetry`. Adds live rotation, spacing controls, an auto-spin toggle, and a numeric badge. |
| `src/game/gameState.ts` | Wires the Otto alarm evaluator and its three Dalek taunts, sector-scaled ABB salvos with guided steering, and boss HP into the sound engine. |
| `src/game/renderer.ts` | Pushes live boss HP to `setBossHpRatio`, draws the neon shield aura for every shielded boss, consumes `bladeExtend` for Maximilian's arms, applies the taller per-entity spacing, and renders the Brainbot dome arcs. |
| `src/game/milestone416.test.ts` | Twelve headless Vitest tests, one or more per spec section. New file. |
| `src/audio/audio.test.ts`, `src/bosses/bosses.test.ts`, `src/game/gameState.test.ts`, `src/game/milestone414.test.ts`, `src/game/milestone415.test.ts`, `src/game/renderer.test.ts` | Superseded assertions updated for the new defaults and exports. |
| `docs/AGENT_LOG.md` | Milestone 4.16 entry with the file list and regression proof. |

The tracked diff at `e7bb5ae` is 28 files, +1494/−214. The worker left the spec file alone; this report is the only edit to it, made after the gate passed.

## Requirement coverage

### 1. Boss music proportional tempo ramp

`SoundEngine.setBossHpRatio` clamps its input to `0..1` (non-finite values fall back to 1) and stores the ratio. `getBossTempoBpm` returns `BOSS_BASE_BPM + (1 - ratio) * (BOSS_MAX_BPM - BOSS_BASE_BPM)` while boss music is active, and the base 148 outside boss mode. That gives a straight climb from 148 to 210 BPM, about 1.42×, with `getTempoMultiplier` returning the ratio against the base. The live Tone.js transport follows through a 0.2s ramp, so the tempo change reads as a slide rather than a jump. Switching back to level or silent music drops the computed tempo to the base automatically, which covers the reset on boss death and on returning to the title screen.

`renderer.ts` calls `sound.setBossHpRatio(state.boss.hp / state.boss.maxHp)` on the frame the boss is active and passes 1 when it is gone. The tempo tests walk the ratio from 1.0 to 0.0, assert the BPM climbs monotonically, and check the reset.

### 2. Evil Otto: 10-second countdown and Dalek voice

The runtime countdown comes from `computeOttoAlarmTiming`: `ottoWarningSec` (14.0) minus `ottoAlarmStartDelaySec` (4.0) is 10.0 seconds of active alarm after the post-boss explosion delay. `ottoCountdownSec: 10.0` is also stored on the difficulty config and asserted by the tests, so the two agree by construction. `evaluateOttoAlarm` returns inactive before the delay, flips active at 4.0s, reports a remaining time that counts down from 10.0, and fires the spawn at the 14.0s mark.

`gameState.ts` emits three `voice_taunt` events with `speaker: 'evil_otto'`: "BEWARE!" when the alarm opens, "I SENSE YOU!" at half progress, and "EXTERMINATE THE HUMANOID!" at 80 percent. Each is paired with the `otto_alarm` SFX, pulsing every 2.5s between taunts. The preset pushes pitch by 1.8× and rate by 1.2×, both inside the 1.7 to 1.9 and 1.15 to 1.25 bands the plan asked for, and adds a 55 Hz ring modulator with FM and bitcrush for the metallic edge. Voice construction is guarded so the tests can call it with no Web Audio context.

### 3. Universal boss shields

`computeBossShieldConfig(maxHp, sectorIndex)` returns one layer in Sector 1, two in Sectors 2 and 3, three in Sectors 4 and 5, and four from Sector 6 up, using `Math.min(4, 1 + floor((sector + 1) / 2))`. Layer HP is `max(120, round(maxHp * 0.14))` scaled by `1 + sector * 0.1`, so both layer count and durability grow with the run. All seven boss constructors call it, which closes the gap that left some bosses shieldless in Sector 1.

The renderer draws a pulsing neon aura around any boss with `shieldLayers > 0` and `shieldHp > 0`, with the outer radius stepping out per layer and the intensity following remaining shield HP. `hud.ts` renders a segmented bar with one cell per max layer and hides the whole row once the shield is broken. The tests instantiate all seven bosses in Sector 1 and assert `shieldLayers >= 1` and `shieldHp > 0` on each.

### 4. Maximilian's extending blades

`BossState` carries a `bladeExtend` value from 0 to 1. `getMaximilianTargetBladeExtend` and the smoothing in `maximilian.ts` drive it up while Maximilian spins into `charge` and especially `whirlwind`, then ease it back down. The renderer multiplies the arm reach by `boss.bladeExtend`, so the sawblades visibly slide outward to match the melee radius instead of snapping there. The tests step the boss through both phases and check that the extension climbs and that the melee reach follows.

### 5. Taller proportions, Skullhead face, glass-domed Brainbot

`getEntitySpacingMultiplier(kind)` returns 1.42 for every character except the Recogniser, which stays at 1.0 as the plan required. The renderer applies it to hero spacing and boss spacing, and `models.ts` folds it into the per-entity vertical separation used when stacking sprites. The result is a taller silhouette across the board without touching the Recogniser's proportions.

Skullhead grew to 16 vertical layers. The extra height exposes more of the sculpted ivory cranium, deep sockets with orange and red laser eyes, the nasal cavity, and the jaw grille under the propeller hat. Brainbot's upper body became a 16-layer round translucent dome with a cyan and white rim and specular highlight arcs, enclosing a pink, coral, and orange convoluted brain with a green central optic. The tests check the multipliers, that the Recogniser is unchanged, and that the new face and dome layers are present.

### 6. ABB salvo and dodgeable guided arcs

`getAbbSalvoCount(sectorIndex = 0)` converts the zero-based sector to a 1-based number and returns `Math.min(8, 2 + sectorNum)`, giving 3 missiles in Sector 1, 4 in Sector 2, 5 in Sector 3, and capping at 8. The ICBMs fly at 390 px/s, inside the 360 to 420 band, while `ABB_ICBM_TURN_RATE` clamps them to 1.25 rad/s, inside the 1.1 to 1.4 band. `steerGuidedIcbm` computes the shortest angle to the player and clamps the step to `turnRate * dt`, then rebuilds the velocity at the same speed. The combination keeps them moving fast forward while turning slowly, which produces the wide arcs a perpendicular dodge-roll can beat. `gameState.ts` calls the steering helper on each guided projectile every tick. The tests verify the salvo counts across sectors, the speed and turn-rate constants, and that a missile pointed away from its target cannot snap around in one step.

### 7. Full gamepad navigation in the pause menu

`PAUSE_MENU_ITEMS` lists resume, restart, gallery, and quit in that order. `parseGamepadSnapshot` and `gamepadSnapshotToPauseNavInput` turn raw button and axis state into nav input, and `createPauseMenuNav` holds the selected index with edge detection and repeat debounce so holding a direction does not fly through the list. Up and down move the highlight and wrap at the ends; A activates the selected action; Start or B resumes, and backs out of the gallery to the pause menu first when it is open. `main.ts` polls `navigator.getGamepads()` once per frame and dispatches all four actions. The tests cover wrap-around, A confirming the highlighted item, and Start resuming.

### 8. Interactive model gallery controls

Spacing runs from `GALLERY_MIN_SPACING` (1.0) to `GALLERY_MAX_SPACING` (8.0) in `GALLERY_SPACING_STEP` (0.1) increments. A and D or the left and right arrows rotate the models and pause auto-spin, W and S or the up and down arrows adjust layer separation live, and Space toggles auto-spin back on. `formatGalleryTelemetry` returns the badge string in the exact form `STACK SPACING: 3.4px  |  PITCH Y: 0.64  |  ANGLE: 180°`, written through `textContent` so it stays inert. The tests clamp spacing at both ends and check that each key updates angle, pitch, or spacing as expected.

## Verification gate

The worker, the verifier, and I all ran the command from the plan:

```
nix develop --impure --command sh -c "pnpm run build && pnpm test"
```

My run exited 0. `pnpm run build` reported 0 TypeScript errors and 1000 modules transformed in 1.54s. `pnpm test` reported 18 test files and 153 of 153 tests passing in 1.05s. The 12 new tests split into three for Otto, two each for tempo, ABB, and the gallery, one each for shields, Maximilian, the taller sprites, and gamepad nav. The verifier reproduced the gate independently, confirmed the tracked diff matches the handoff at 28 files and +1494/−214, checked that the claimed helpers and constants exist with spec-matching values, and came back clean on the static scan.

## Known caveats

None of these blocked the gate. They are recorded so the next worker does not have to rediscover them.

- The implementation was already committed at `e7bb5ae` when the swarm began, about five minutes before the root card was created. This swarm verified that commit; it did not author the source changes. The verifier states this explicitly in its handoff.
- Unlike earlier milestones, these changes are committed on `main`. Nothing was pushed. The `sample/` reference art remains untracked as found, and the new test file is tracked in the implementation commit.
- No real-browser verification. The checks are headless Vitest plus the build. The boss aura, blade extension, taller sprites, Skullhead face, and glass dome were verified as code paths and emitted state, not compared against a screenshot.
- Numeric constants were picked inside the ranges the plan allowed: tempo 148 to 210 against roughly 210, pitch 1.8× against 1.7 to 1.9, rate 1.2× against 1.15 to 1.25, ICBM speed 390 against 360 to 420, turn rate 1.25 against 1.1 to 1.4, height 1.42× against 1.35 to 1.5, and spacing 1.0 to 8.0 in 0.1 steps. Salvo count uses the plan's `min(8, 2 + sector)` shape.
- `ottoCountdownSec` lives on the difficulty config and is asserted by tests, but the runtime 10-second window is computed as `ottoWarningSec - ottoAlarmStartDelaySec` (14.0 minus 4.0). The values agree; changing only `ottoCountdownSec` later would not move the alarm.
- `computeBossShieldConfig` sets `shieldRegenDelay` to 0, so the universal shield is a fixed layer pool that does not regenerate mid-fight. The HUD bar disappears entirely once the last layer breaks.
- The docstrings above `ABB_ICBM_SPEED` and `steerGuidedIcbm` still quote the Milestone 4.14 values (260 to 320 px/s, 1.8 to 2.4 rad/s). The constants and runtime behavior are the 4.16 values (390 and 1.25); only the comments are stale.
- The Recogniser keeps its original proportions on purpose. The plan singled it out as already looking good, so `getEntitySpacingMultiplier` returns 1.0 for that kind.
- The verifier split the plan's single `sh -c` gate into two identical `nix develop --command` steps because its tool blocked the combined form. My run used the exact plan command and exited 0, so the split was a tooling constraint rather than a gate difference.

## References

- [AGENTS.md](../../AGENTS.md): software factory rules, module boundaries, verification rules.
- [plan.md](../../plan.md): full roadmap and milestone context.
- [milestone-4.15-tweaks.md](milestone-4.15-tweaks.md): the previous milestone's spec.
- [milestone-4.14-tweaks.md](milestone-4.14-tweaks.md): the previous as-built report.
- [milestone-4.13-tweaks.md](milestone-4.13-tweaks.md): an earlier as-built report.
- [milestone-4.12-tweaks.md](milestone-4.12-tweaks.md): an earlier as-built report.
- [milestone-4.11-tweaks.md](milestone-4.11-tweaks.md): an earlier as-built report.
- [milestone-4.1-fixes.md](milestone-4.1-fixes.md): an earlier as-built report.
- [milestone-4-polish.md](milestone-4-polish.md): an earlier as-built report.
- [milestone-3-integration.md](milestone-3-integration.md): the first as-built report.
- [SHARED_CONTRACTS.md](../SHARED_CONTRACTS.md): cross-module API contracts.
- [QUESTIONS.md](../QUESTIONS.md): resolved decisions and recorded defaults.
- [AGENT_LOG.md](../AGENT_LOG.md): per-agent work entries and regression proof.
