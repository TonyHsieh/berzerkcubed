# Berzerk Cubed — Agent Instructions (`AGENTS.md`)

## Project Overview
- **Game**: Berzerk Cubed (`BERZERK³`), a neon cyber-arcade twin-stick shooter built with **Vite + TypeScript + HTML5 Canvas 2D + Tone.js + Vitest**.
- **Rendering Method**: Approach B Modular Sprite-Stacking (see `approach_b_demo_modular_sprite_stacked_humanoid.html`), using pre-baked 24-angle offscreen caches for 200+ swarm enemies and dynamic Z-interleaved rendering for the Hero and Bosses.
- **Full Spec & Roadmap**: See `plan.md` and `docs/SHARED_CONTRACTS.md`.

## Worktree & Module Boundaries
To prevent merge conflicts across parallel `herdr` worktrees, **only edit files within your assigned module**:
- **Worktree 1 (`feat/engine-render`)**: `src/render/**`, `src/audio/**`, and their `*.test.ts` files.
- **Worktree 2 (`feat/world-player`)**: `src/engine/**`, `src/world/**`, `src/entities/**`, and their `*.test.ts` files.
- **Worktree 3 (`feat/enemies-bosses`)**: `src/enemies/**`, `src/bosses/**`, and their `*.test.ts` files.
- **Judge / Orchestrator (`main`)**: `package.json`, `vite.config.ts`, `src/config/**`, `src/game/**`, `src/main.ts`, `docs/SHARED_CONTRACTS.md`, and resolving `docs/QUESTIONS.md`.

## Cross-Agent Communication Protocol
1. **Shared Contracts First**: Always import shared types and interfaces from `src/engine/types.ts` and follow `docs/SHARED_CONTRACTS.md`.
2. **Never Edit Another Agent's Module**: If you need a new field, event, or helper from another module, **do not** modify their files. Instead, append a question/request to `docs/QUESTIONS.md` with your worktree name and escalate to the Orchestrator/Judge.
3. **Document Your Work**: Whenever you complete a feature or fix, append a concise entry to `docs/AGENT_LOG.md` listing:
   - Files created/modified
   - Exported functions/classes
   - New tests added & full regression proof (`pnpm run build` and `pnpm test` pass counts)

## Software Factory Rules (Mandatory Quality Gates)
1. **Tests at Every Feature Step**: Every new feature, mechanic, or bug fix MUST include automated Vitest tests in the same commit/step. No feature is considered complete without tests verifying its behavior.
2. **Prove Zero Regression**: Before reporting any step complete or handing off to the Orchestrator/Judge, you MUST run the **entire test suite** (`pnpm test`) and full TypeScript/Vite build (`pnpm run build`) against all previous tests and record the passing results in `docs/AGENT_LOG.md`.
3. **Escalation Hierarchy (Worker → Orchestrator → Human)**:
   - **Workers** escalate technical contract questions and completed work (with test/regression proof) up to the **Orchestrator/Judge (`main`)** via `docs/QUESTIONS.md` and `docs/AGENT_LOG.md`.
   - **Orchestrator/Judge** resolves purely technical/internal contract details within `plan.md`, reviews regression proof, and merges verified worktrees.
4. **STOP for Unspecified Design Decisions (Human-in-the-Loop)**:
   - If any design, gameplay, UX, or architectural decision is **not explicitly specified in `plan.md` or `docs/SHARED_CONTRACTS.md`**, **DO NOT GUESS OR INVENT IT**.
   - **STOP immediately** on that decision, log a `[HUMAN_DECISION_REQUIRED]` entry in `docs/QUESTIONS.md` with options and tradeoffs, and surface it to the human via a **Git Pull Request / review branch** (or `herdr` notification/blocked prompt) and wait for explicit human approval before implementing.

## Verification Rules
- This repo uses a Nix flake (`flake.nix` + `devenv.nix`) providing Node 22, `pnpm`, `biome`, and `tsx`. Run commands inside the Nix devShell (`nix develop --impure --command ...` or via `direnv`).
- Always run `pnpm run build` and `pnpm test` (full suite, not just a single file) before reporting a task complete.
- Keep simulation logic decoupled from DOM/Canvas globals so Vitest can test game mechanics headlessly in Node.
