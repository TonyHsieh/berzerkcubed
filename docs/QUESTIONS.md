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
