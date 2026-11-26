# Milestone 4.15 Specification — Projectile End VFX, Early Evil Otto Alarm, Tesla Orientation, Dynamic Music Crossfade, Pause Menu & Title Screen (`BERZERK³`)

## Goal
Polish combat feedback, audio atmosphere, and full arcade flow: give every projectile a crisp hit explosion or timeout implosion, trigger Evil Otto's visual/sonic alarm 3–5 seconds after boss defeat, orient Tesla/lightning projectiles along travel with real electric explosions, add level music fades + pulse-pounding Boss Danger crossfade music, add an `Escape` Pause Menu, and open with an arcade Title Screen ("PRESS ANY BUTTON TO START").

Follow all Software Factory rules in [`AGENTS.md`](../../AGENTS.md) and contracts in [`docs/SHARED_CONTRACTS.md`](../SHARED_CONTRACTS.md).

---

## 1. Universal Projectile End Animations (Hit Explosion vs. Timeout Implosion)
- **Fix (`src/game/gameState.ts`, `src/render/vfx.ts`, `src/engine/types.ts`)**:
  - **No projectile may ever vanish silently!**
  - **On Collision / Hit** (wall, closed door, crate, enemy, boss, shield, or hero): emit a crisp **impact explosion / spark burst** scaled to the projectile kind (matching the projectile's neon color, with larger blasts for grenades/ICBMs/sky-bombs and electric bursts for Tesla bolts).
  - **On Timeout (`life <= 0` without hitting anything)**: emit a **smaller, distinct implosion / dissipation animation** (e.g., shrinking neon ring + inward-collapsing particles via `vfx.implode(x, y, z, color)` or `vfx_implosion` event) so every shot ends cleanly on screen.

---

## 2. Early Evil Otto Countdown (3–5s After Boss Death Explosion)
- **Fix (`src/config/difficulty.ts`, `src/game/gameState.ts`, `src/game/hud.ts`, `src/game/renderer.ts`)**:
  - Once the sector boss finishes exploding and dying, wait **3–5 seconds** (e.g., `ottoAlarmStartDelaySec = 4.0`, tunable in `DifficultyConfig`) and then immediately begin the **Evil Otto Alarm Countdown**:
    - **Visual Alarm**: Flashing crimson/amber border pulse + HUD warning banner (`⚠ EVIL OTTO APPROACHING — EXIT NOW!`) with a live countdown bar/timer.
    - **Sonic Taunts**: Emit Sinistar-style distorted robotic `voice_taunt` callouts at the start of the alarm and mid-countdown (**`"BEWARE!"`**, **`"I SENSE YOU!"`**, **`"THE HUMANOID MUST NOT ESCAPE!"`**) paired with an urgent klaxon/alarm synth pulse (`sfx: 'otto_alarm'`).
  - Exiting through an open door cancels the alarm cleanly.

---

## 3. Tesla / Lightning Projectile Orientation & Electric Explosion
- **Fix (`src/game/renderer.ts`, `src/render/vfx.ts`, `src/game/gameState.ts`)**:
  - **Travel-Aligned Orientation**: Rotate every Tesla / `lightning` projectile explicitly along its travel heading (`Math.atan2(p.vy, p.vx)` transformed by camera angle), drawing a jagged, crackling directional electric bolt/arc spear instead of an unrotated dot or blob.
  - **Electric Explosion on Impact / Timeout**: When a Tesla/lightning projectile hits a target/wall or expires, trigger a vivid **electric detonation** (bright white/cyan core flash + 5–8 radiating jagged micro-lightning tendrils + blue/white spark particles + `electric_zap` SFX).

---

## 4. Dynamic Music Fades & Pulse-Pounding Boss Danger Crossfade
- **Fix (`src/audio/soundEngine.ts`, `src/game/gameState.ts`, `src/main.ts`)**:
  - **Level Music Fade-In / Fade-Out**:
    - Smoothly **fade in** the sector synthwave action music (`~1.0–1.5s` Tone.js gain ramp) when starting or entering a new sector.
    - Smoothly **fade out** (`~0.5–0.7s` ramp) when exiting a sector through an open door or quitting to Title Screen.
  - **Boss Danger Music Crossfade**:
    - Compose a dedicated, high-BPM, **pulse-pounding Boss Danger track** (driving octave bassline, aggressive synth arpeggio/stab, urgent percussion pulse in Tone.js).
    - When a sector boss spawns/appears, smoothly **crossfade** (`~1.0s`) from standard level music into the Boss Danger track.
    - When the boss is defeated, smoothly **crossfade/fade down** out of the Boss Danger track so the victory moment (and subsequent Evil Otto alarm) breathes clearly.
  - Expose headless-testable state transitions (`getMusicMode(): 'silent' | 'level' | 'boss'`) in `SoundEngine` for Vitest verification.

---

## 5. `Escape` Pause Menu
- **Fix (`src/main.ts`, `src/game/hud.ts`, `src/game/gameState.ts`)**:
  - Pressing **`Escape`** (or gamepad `Start` button) toggles **Paused** state—freezing the simulation loop (`stepGameState` skipped, audio dimmed/paused) and displaying a sleek neon **PAUSED** modal overlay with clickable & keyboard-navigable buttons:
    1. **Resume** (`Escape` again also resumes)
    2. **Restart Run** (resets to Sector 1 cleanly)
    3. **Model Gallery** (opens the `?gallery=1` rotating 3D sprite showcase overlay, with a back-to-pause button)
    4. **Quit to Title Screen** (fades music out and returns to the Title Screen)

---

## 6. Arcade Title Screen ("Press Any Button to Start")
- **Fix (`src/main.ts`, `src/game/hud.ts`, `src/game/renderer.ts`)**:
  - After the instant loading thermometer completes (unless `?gallery=1` is active), show a full-screen neon **BERZERK³ Title Screen** rendered over the live animated parallax cyber-circuit board background:
    - Large glowing **`BERZERK³`** cyber-arcade title logo + subtitle.
    - Compact control legend (`WASD` / Left Stick Move · `Mouse` / Right Stick Aim & Shoot · `SPACE` / `LT` Dodge-Roll · `1–3` / `LB/RB` Weapons · `Q`/`E` Swivel · `ESC` Pause).
    - Pulsing **`PRESS ANY BUTTON TO START`** prompt.
  - Pressing **any keyboard key, mouse click, or gamepad button** unlocks Web Audio / Tone.js, fades in the Sector 1 music, and launches directly into Sector 1!

---

## Verification Gate
- Add Vitest unit & integration tests covering:
  - Projectile impact explosion events AND timeout implosion events (`vfx_implosion` / `vfx.implode`).
  - Evil Otto alarm starts 3–5 seconds after boss death, emitting visual alarm state + `"BEWARE!"` / `"I SENSE YOU!"` voice taunts.
  - Tesla projectile orientation helper & electric explosion VFX on hit/timeout.
  - `SoundEngine` music state transitions (`silent` → `level` fade-in → `boss` crossfade → fade-out).
  - Pause toggle (`Escape`) freezing simulation ticks + Title Screen → Playing → Quit to Title state machine transitions.
- Run inside Nix devShell (`nix develop --impure --command sh -c "pnpm run build && pnpm test"`).
- All 122+ prior tests plus new Milestone 4.15 tests MUST pass with zero TypeScript errors.
