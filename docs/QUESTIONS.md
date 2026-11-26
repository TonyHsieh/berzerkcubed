# Cross-Agent Questions & Contract Requests (`docs/QUESTIONS.md`)

If your worktree needs a new field in `src/engine/types.ts`, a new `GameEvent` variant, or clarification on another module's API, append an entry below instead of editing another agent's files. The Judge (`main`) will resolve it and update `docs/SHARED_CONTRACTS.md`.

### Template — Technical Contract Request (Judge Resolves)
```markdown
## [OPEN] <Short Title>
- **From**: `feat/<worktree-name>`
- **Question / Request**: ...
- **Proposed Contract Change**: ...
- **Judge Resolution**: (pending)
```

### Template — Unspecified Design Decision (STOP & Escalate to Human)
```markdown
## [HUMAN_DECISION_REQUIRED] <Short Title>
- **From**: `feat/<worktree-name>` / `orchestrator`
- **Gap in Spec**: What is not specified in `plan.md` or `docs/SHARED_CONTRACTS.md`
- **Options & Tradeoffs**:
  1. Option A ...
  2. Option B ...
- **Escalation Channel**: Pull Request (`<branch>`) / `herdr` notification
- **Human Decision**: (pending — work paused on this item)
```

## [RESOLVED] `VfxSystem.render` worldToScreen signature
- **From**: `feat/engine-render`
- **Question / Request**: The contract gives `render(ctx, worldToScreen, camera)`, but `engine/camera.ts` exports `worldToScreen(wx, wy, camera, viewW, viewH)`.
- **Proposed Contract Change**: `VfxSystem.render` takes a pre-bound projector `(wx, wy) => Vec2` (exported as `WorldToScreenFn`); the Judge wires it as `(x, y) => worldToScreen(x, y, camera, w, h)`. Particle height uses `camera.layerSpacing * camera.tiltScale * 0.5` per z unit.
- **Judge Resolution**: Approved & synced to `docs/SHARED_CONTRACTS.md`.

## [RESOLVED] Additions to the render contract (for integration)
- **From**: `feat/engine-render`
- **Question / Request**: (1) `SpriteStackCache.bake` takes one stack, so animation frames are baked under separate keys `"<kind>#<frame>"`; Enforcer has 3 frames, shooter/grenadier 2. (2) `CircuitBackground.render` treats `camera.x/y` as world position and rotates by `camera.angleDeg` about screen center. (3) Extra non-contract APIs: `VfxSystem.renderCrt`, `SoundEngine.init()` / `VoiceTauntEngine.init()` (async, user-gesture) must be called before audio plays.
- **Proposed Contract Change**: Add the above to `docs/SHARED_CONTRACTS.md`.
- **Judge Resolution**: Approved & synced to `docs/SHARED_CONTRACTS.md`.

## [RESOLVED] Milestone 3 — Evil Otto linger timer start condition
- **From**: `orchestrator` (Milestone 3 integration, flagged by verifier `t_47f758eb`)
- **Gap in Spec**: `plan.md` / `docs/specs/milestone-3-integration.md` do not say when the Evil Otto linger timer (`ottoWarningSec`) starts.
- **Options & Tradeoffs**:
  1. Start only after the sector boss is defeated (implemented) — boss fight is never interrupted by Otto.
  2. Start at sector entry — harsher time pressure; Otto can overlap the boss fight.
- **Escalation Channel**: Kanban `t_47f758eb` (human comment 2026-11-25)
- **Human Decision**: APPROVED — Option 1. Timer starts only after boss defeat (`src/game/gameState.ts`, step 8).

## [RESOLVED] Milestone 3 — Sector advance via manual NEXT SECTOR button
- **From**: `orchestrator` (Milestone 3 integration, flagged by verifier `t_47f758eb`)
- **Gap in Spec**: How the player moves to the next sector after the boss is defeated.
- **Options & Tradeoffs**:
  1. Manual `NEXT SECTOR` HUD button (implemented) — player may linger (risking Evil Otto) for pickups/score.
  2. Automatic advance / exit door after a delay.
- **Escalation Channel**: Kanban `t_47f758eb` (human comment 2026-11-25)
- **Human Decision**: APPROVED — Option 1. Manual `NEXT SECTOR` button.

## [RESOLVED] Milestone 3 — Sector 3+ boss rotation and scaling
- **From**: `orchestrator` (Milestone 3 integration, flagged by verifier `t_47f758eb`)
- **Gap in Spec**: Boss selection and difficulty for sectors after Sector 2.
- **Options & Tradeoffs**:
  1. Alternate Maximilian / Recogniser with +25% boss HP per sector (implemented).
  2. A different rotation or scaling curve.
- **Escalation Channel**: Kanban `t_47f758eb` (human comment 2026-11-25)
- **Human Decision**: APPROVED — Option 1. Sector 3+ alternates bosses with +25% HP per sector.

## [RECORDED DEFAULT] Milestone 4 — Modifier carry-over when equipping/swapping weapons
- **From**: `orchestrator` (Milestone 4 implementation, `t_1b9985b0`)
- **Gap in Spec**: Milestone 4 adds a 3-slot weapon inventory and `[F]` equip/swap, while modifiers (`freeze`, `lightning_chain`, `pierce`, `ricochet`) remain walk-over auto-collect. The spec did not state whether collected modifiers stay with the weapon they were picked up on or follow the hero across slots.
- **Options & Tradeoffs**:
  1. Newly equipped/swapped weapons inherit the modifiers of the previously active weapon (implemented) — collected modifiers remain useful; `applyWeaponPickupToSlots` copies the active weapon's modifier list into the new slot.
  2. Modifiers stay strictly bound to the weapon that was active when collected — switching slots can silently drop an earned modifier.
  3. Store modifiers globally on `PlayerState` — cleanest long-term model but requires touching every fire/weapon consumer.
- **Decision**: Option 1 recorded as the implemented default for this milestone; flagged for human review rather than guessed silently. No user-facing UX change.
