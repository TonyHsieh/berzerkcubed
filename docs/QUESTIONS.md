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
