# TichuML Specification (`SPEC.md`)

## 1. Project Overview

TichuML is a production-leaning Tichu platform that combines:

- a correct, deterministic Tichu rules engine
- a mature, responsive game interface
- smart AI/heuristic players with team-aware behavior
- canonical telemetry for replay, debugging, and ML/simulation
- simulation tooling for large-scale policy evaluation

This project is not just a card game UI. It is a full system composed of:

- game engine
- match orchestration
- reactive frontend
- telemetry pipeline
- replay/debug tooling
- simulation harness

The goal is to build a modern, internal-alpha-quality Tichu platform that is testable, extensible, and usable for both live play and AI experimentation.

---

## 2. Product Goals

### Primary goals

1. Build a correct Tichu engine with deterministic, serializable state transitions.
2. Build a mature React/Vite/TypeScript UI that feels like a modern digital tabletop client.
3. Build smart AI players using layered heuristics rather than primitive random or naive play.
4. Capture canonical append-only telemetry for every decision point.
5. Support deterministic replay and AI decision inspection.
6. Support high-volume simulations for policy evaluation and future ML work.

### Definition of success

The project succeeds when it can:

- run full legal games of Tichu without soft locks
- support human + AI or AI-only matches
- expose a polished interface with responsive layout
- replay prior games from telemetry
- explain AI decisions in debug mode
- run large simulation batches with queryable results

---

## 3. Non-Negotiable Constraints

These are hard requirements.

### Gameplay correctness

- The rules engine must be authoritative for legality and trick resolution.
- The frontend must never invent legal actions on its own.
- Every legal move shown in the UI must come from the engine.
- All round transitions and trick outcomes must be deterministic and test-covered.

### Partner logic

- Partners must not call Tichu or Grand Tichu if their partner has already made that call.
- Partners should avoid unnecessarily overtaking or stealing tricks from each other.
- AI policy should optimize for team outcome, not just local selfish value.

### UI maturity

- The interface must not be primitive or rigidly hardcoded.
- The table must scale responsively to the browser viewport.
- The trick area must be visually readable and preserve play order.
- Action controls must reflect phase-specific legality exactly.

### Telemetry

- Telemetry must be append-only and versioned.
- Decision points must be replayable from recorded data.
- Telemetry must support both debugging and training/simulation workflows.

### Engineering discipline

- Milestone-based implementation only.
- Every milestone should end in a runnable state.
- All bug fixes involving game logic or phase flow must include tests.
- Avoid giant uncontrolled rewrites.

---

## 4. Target Architecture

### 4.1 Monorepo structure

```text
tichuml/
  apps/
    web/                      # React/Vite frontend
    server/                   # API and websocket match host
    sim-runner/               # simulation runner / bulk jobs
  packages/
    engine/                   # deterministic rules engine
    ai-heuristics/            # AI policy layer
    telemetry/                # schemas, emitters, replay helpers
    ui-kit/                   # reusable UI components
    shared/                   # shared types, enums, helpers
  infra/
    db/                       # migrations, seeds, SQL views
    docker/                   # docker compose and local infra
  docs/
    architecture/
    product/
    telemetry/
    ui/
    prompts/
  tests/
    integration/
    replay/
    e2e/
```

### 4.2 Preferred stack

#### Frontend
- React
- Vite
- TypeScript
- Tailwind CSS
- Pixi for high-performance table/card rendering if needed
- Zustand or Redux Toolkit for deterministic UI state slices

#### Backend
- Node.js
- TypeScript
- Fastify or Express
- WebSockets for real-time match updates

#### Data/infrastructure
- Postgres
- Docker / Docker Compose

#### Quality/tooling
- Vitest or Jest
- Playwright for E2E
- ESLint
- Prettier
- strict TypeScript

---

## 5. Core Domain Model

### 5.1 Primary entities

- `Match`
- `Round`
- `Seat`
- `Player`
- `Card`
- `Hand`
- `Trick`
- `PassState`
- `CallState`
- `WishState`
- `ScoringState`
- `DecisionContext`
- `ReplayFrame`

### 5.2 Card model

Standard Tichu deck with:

- four suits / standard rank structure
- special cards:
  - Mahjong
  - Dog
  - Phoenix
  - Dragon

The engine must treat specials as first-class rules objects, not hacks layered on top later.

### 5.3 Explicit game phases

The engine should use explicit phase boundaries. Suggested phases:

- `lobby`
- `seating`
- `shuffle`
- `deal8`
- `grand_tichu_window`
- `complete_deal`
- `pass_select`
- `pass_reveal`
- `exchange_complete`
- `trick_play`
- `round_scoring`
- `match_scoring`
- `finished`

Internal naming can vary slightly, but the phase model must remain explicit and serializable.

### 5.4 Engine transition contract

Each engine decision/application step should produce something like:

```ts
type EngineResult = {
  nextState: GameState;
  events: GameEvent[];
  legalActions: LegalActionMap;
  derivedView: PublicDerivedState;
};
```

The engine is the source of truth for:

- next state
- emitted events
- legal action set
- public derived state

---

## 6. Mature Interface Specification

### 6.1 UX goals

The UI should feel like a finished digital tabletop client, not a prototype.

The interface should prioritize:

- clarity of turn state
- readability of trick progression
- easy hand interaction
- clear phase/action affordances
- responsive layout
- optional but clean debug/replay surfaces

### 6.2 Main layout regions

#### App shell
- top bar with match info, team scores, connection state, settings/debug toggle
- center game surface sized to viewport
- optional left/right drawers or tabs for debug/history/replay
- bottom action rail for current-player decisions

#### Table
- centered oval or rounded-rectangle table
- 4 seats positioned around it
- local player at bottom
- opponents/partner scale responsively with viewport
- central space reserved for current trick and trick resolution feedback

#### Local hand area
- local hand displayed at bottom
- cards can be clicked and/or dragged
- legal cards clearly highlighted
- illegal cards visibly muted
- support sorting/grouping modes:
  - by suit
  - by rank
  - by combo potential

#### Trick area
- current trick displayed in center
- cards/groups stack in play order
- winning play visually emphasized
- completed trick animates or resolves to winner seat
- special effects are readable but restrained

#### Per-seat status
Each seat should show:
- player/AI label
- partner/opponent identity
- cards remaining
- Tichu / Grand Tichu status
- current turn indicator
- thinking indicator for AI
- exchange/pass status during pass phase

#### Action rail
Bottom action rail must be phase-aware.

Examples:
- `Grand Tichu`, `Continue`
- `Confirm Pass`
- `Play`
- `Pass`
- `Tichu`
- `Prev`, `Next`, `Autoplay` in replay mode

All enable/disable logic must come from the engine.

### 6.3 Responsive behavior

- Layout must scale to available browser size.
- Table and cards must clamp to readable min/max sizes.
- Side panels collapse into drawers/tabs on tighter screens.
- Seat relationships must remain visually coherent.
- Avoid brittle absolute-position-only layouts.

### 6.4 Visual direction

Target feel:
- polished dark tabletop
- strong contrast
- restrained accent colors
- crisp readable cards
- elegant but minimal motion
- modern game-client quality, not casino clutter

### 6.5 Debug and replay UX

Optional but important:
- debug mode toggle
- AI reasoning panel
- replay scrubber
- decision list
- legal actions viewer
- telemetry inspector
- hand/state snapshots

---

## 7. Gameplay and UX Rules Learned So Far

These are specific lessons that must be encoded in the build plan.

### Required fixes and behaviors

- AI players must auto-advance through AI-only or auto-run phases.
- The game must not stall waiting for manual confirmation during AI-only flow.
- The central trick area must stack cards/groups clearly in play order.
- Partners must not call Tichu/Grand Tichu if their partner already has that call active.
- Partners should avoid stealing tricks from each other when a safer partner-preserving option exists.
- Passing lanes must be visually clear: left, partner, right.
- Debug controls should be available but not clutter the main table.
- The UI must feel mature and reactive, not primitive.

### Action availability examples

- `Grand Tichu` only during valid early call window
- `Tichu` only while still legal under engine rules
- `Pass` only when legal
- Mahjong wish constraints surfaced clearly
- special-card consequences shown clearly
- endgame state visible as card counts shrink

---

## 8. AI / Heuristics System

### 8.1 Heuristic policy contract

AI decisions should be implemented through explicit policy modules.

```ts
type HeuristicPolicy = {
  name: string;
  chooseAction(ctx: DecisionContext): ChosenAction;
  explain?(ctx: DecisionContext): PolicyExplanation;
};
```

### 8.2 Policy layers

#### Layer 1: legality and hard constraints
- never return illegal actions
- obey phase constraints
- obey wish constraints
- obey special-card forced behavior

#### Layer 2: combo recognition
Recognize and evaluate:
- singles
- pairs
- trips
- full houses
- straights
- pair sequences
- bombs
- phoenix-adjusted structures

#### Layer 3: tactical value
- preserve hand flexibility
- avoid wasting bombs
- consider initiative/control
- improve exit potential
- reduce stranded fragments

#### Layer 4: team-aware play
- avoid overtaking partner unnecessarily
- help partner maintain winning lines where useful
- avoid breaking team tempo
- respond to opponent low-card danger

#### Layer 5: call logic
- evaluate Grand Tichu during early call window
- evaluate Tichu after broader hand context is known
- suppress partner-duplicate calls

#### Layer 6: endgame logic
- stronger logic when any player is low on cards
- prioritize getting out
- deny opponent outs
- conserve or deploy bombs based on immediate swing value

### 8.3 Explanation output

AI should emit structured rationale information, not just a chosen action.

Example:

```ts
type PolicyExplanation = {
  policy: string;
  candidateScores: Array<{
    action: LegalAction;
    score: number;
    reasons: string[];
  }>;
  selectedReasonSummary: string[];
};
```

This must be compatible with telemetry and replay/debug displays.

---

## 9. Telemetry Contract

### 9.1 Goals

Telemetry must support:

- replay
- debugging
- simulation analysis
- policy comparisons
- future ML/training data preparation

### 9.2 Principles

- append-only
- schema-versioned
- engine-versioned
- sim-versioned
- decision-centric
- serializable
- queryable

### 9.3 Required fields

Each decision record should include at minimum:

- `schema_version`
- `engine_version`
- `sim_version`
- `match_id`
- `round_index`
- `decision_index`
- `phase`
- `seat`
- `actor_type`
- `legal_actions`
- `selected_action`
- `state_raw`
- `state_norm`
- `policy_name`
- `policy_explanation`
- `latency_ms`
- `created_at`

### 9.4 Record types

#### DecisionRecord
Used for:
- Grand Tichu decision
- Tichu decision
- pass selection
- trick play / pass / bomb decision
- special-case choice events such as dragon recipient if modeled as decision

#### EventRecord
Optional but useful for:
- deal complete
- exchange complete
- trick resolved
- round scored
- match finished

### 9.5 Telemetry outcome requirements

Telemetry must make it possible to:

- replay any round
- compare policy variants
- inspect anti-patterns
- analyze endgame decisions
- inspect AI candidate scoring
- validate state/action legality post hoc

---

## 10. Replay System

Replay is a core product feature, not just a dev tool.

### Replay requirements

- reconstruct full round from telemetry or snapshots
- step forward/backward by decision
- show legal actions available at each step
- show selected action
- show AI explanation if available
- jump to specific decision indices
- preserve deterministic state reconstruction

### Replay UI

- play/pause
- prev/next decision
- scrubber/timeline
- phase jump filter
- decision list
- side panel for "why did the AI do this?"
- optional candidate action comparison in debug mode

---

## 11. Backend / API Plan

### 11.1 Core services

#### Match service
- create new match
- support AI-only or human + AI matches
- load completed match for replay

#### Engine service
- apply authoritative transitions
- compute legal actions
- return public derived state

#### Telemetry service
- record decisions/events
- support batch writes where appropriate
- query by match, round, seat, policy, version

#### Simulation service
- run high-volume game batches
- configure policy versions
- capture metrics and summaries

### 11.2 API surface (suggested)

```text
POST /matches
GET  /matches/:id
POST /matches/:id/action
GET  /matches/:id/state
GET  /matches/:id/replay
GET  /matches/:id/telemetry
POST /simulations
GET  /simulations/:id
```

### 11.3 Realtime sync

- websocket channel for authoritative match updates
- client subscribes to match state updates
- reconnect should be supported cleanly
- replay can operate from persisted state, telemetry, or both

---

## 12. Database Plan

### 12.1 Core tables

- `matches`
- `rounds`
- `decisions`
- `events`
- `simulation_runs`
- `simulation_run_games`
- `policy_versions`
- `replay_snapshots` (optional)
- `ui_layout_presets` (optional)

### 12.2 Storage guidance

- Use JSONB for raw state, normalized state, and policy explanations where helpful.
- Keep important query dimensions in indexed scalar columns.
- Use GIN indexes selectively for JSONB querying.
- Consider materialized views for simulation summaries.

### 12.3 Example analysis queries

- Tichu call success rate by policy version
- average point differential by team
- bomb usage frequency and outcome correlation
- partner-overtake anti-pattern rate
- endgame conversion rate
- decision latency percentiles

---

## 13. Testing Strategy

Testing is mandatory.

### 13.1 Unit tests

Must cover:
- legal move generation
- combo recognition
- trick winner resolution
- special card behavior
- call legality
- scoring rules

### 13.2 Property tests

Suggested invariants:
- no illegal action is ever emitted as legal
- deterministic replay reconstructs equivalent state
- scoring is deterministic

### 13.3 Integration tests

Must cover:
- full round from shuffle to score
- pass/exchange flow
- Tichu / Grand Tichu timing
- Dragon / Dog / Phoenix / Mahjong edge cases
- multi-bomb interaction cases

### 13.4 UI tests

Must cover:
- action button enable/disable correctness
- trick stack rendering
- responsive layout behavior
- replay controls
- debug panel behavior

### 13.5 E2E tests

Must cover:
- human seat can play through a legal round
- AI-only match completes automatically
- replay reconstructs completed round
- telemetry rows validate against schema expectations

---

## 14. Milestone Plan

Implementation should proceed in bounded milestones.

### Milestone 0 — Foundation
Deliver:
- monorepo scaffold
- shared TypeScript config
- lint/test setup
- Dockerized Postgres
- migration framework
- CI basics

Acceptance:
- clean install
- clean build
- clean test run
- local infra boots

### Milestone 1 — Engine Core
Deliver:
- card model
- phase model
- deterministic state transitions
- legal action generation
- trick resolution
- scoring logic

Acceptance:
- deterministic behavior from seed
- tests for special cards and legality

### Milestone 2 — Headless Playable Game
Deliver:
- AI-only round execution
- full phase transitions
- telemetry emission
- no UI dependency required

Acceptance:
- many rounds run without soft locks
- no illegal actions applied

### Milestone 3 — Heuristics v1
Deliver:
- baseline smart policy
- team-aware suppression of duplicate partner Tichu/GT calls
- reduction of unnecessary partner overtakes
- policy explanation output

Acceptance:
- AI is visibly smarter than naive legal play
- policy explanations are persisted

### Milestone 4 — Mature Web UI
Deliver:
- responsive table layout
- seat rendering
- local hand interaction
- center trick stack
- action rail
- status indicators

Acceptance:
- UI reads clearly at standard desktop sizes
- no primitive hardcoded layout feel
- phase-aware actions match engine legality

### Milestone 5 — Match Orchestration
Deliver:
- websocket sync
- server-authoritative match state
- human + AI match support
- reconnect-safe updates

Acceptance:
- local client can play against AI without divergence from engine state

### Milestone 6 — Replay and Debug Tools
Deliver:
- replay viewer
- decision inspector
- AI reasoning panel
- telemetry browser

Acceptance:
- saved rounds can be replayed deterministically
- AI reasoning is inspectable

### Milestone 7 — Simulation Harness
Deliver:
- config-driven bulk simulation runner
- database persistence for runs/results
- summary exports/queries

Acceptance:
- large runs complete stably
- outputs are queryable and comparable

### Milestone 8 — Polish and Production Readiness
Deliver:
- settings/preferences
- layout presets
- error handling
- performance tuning
- accessibility pass
- onboarding/help overlays

Acceptance:
- internal-alpha-quality finish
- stable, polished, usable experience

---

## 15. Codex Operating Rules

Codex should work in milestone-bounded tasks.

### Required working style

- Inspect repository state before making changes.
- Summarize affected files before implementation.
- Prefer additive, test-backed changes.
- Do not rewrite engine and UI together unless explicitly requested.
- Preserve deterministic engine behavior.
- Keep legality logic out of the frontend.
- Do not simplify special card logic for convenience.
- Add tests for every important bug fix involving rules, phases, or partner behavior.

### Output expectations for each milestone

For each Codex task, return:
- implementation summary
- files changed
- tests added/updated
- known gaps
- recommended next step

### Code quality requirements

- TypeScript strict mode
- avoid `any` except when justified
- shared types live in shared or engine packages
- minimize duplicated legality logic
- keep engine state and UI state separated
- document invariants near reducers or transition logic

---

## 16. Acceptance Criteria Summary

The system is considered on track only if the following stay true:

- engine remains authoritative
- frontend stays phase-aware but not rules-authoritative
- AI auto-advances correctly
- replay is deterministic
- partner-aware logic improves play quality
- telemetry remains versioned and replay-safe
- UI looks and behaves like a mature game client
- the project remains test-backed and milestone-driven

---

## 17. Initial Codex Prompt

Use this as the starting prompt for Codex:

```text
Build TichuML as a production-leaning monorepo for a fully playable, telemetry-rich Tichu platform.

Primary goals:
1. Correct Tichu rules engine with deterministic state transitions.
2. Mature responsive React/Vite/TypeScript frontend with a polished table interface.
3. Smart AI heuristics with team-aware strategy, not primitive random play.
4. Canonical append-only telemetry supporting replay, debugging, and future ML evaluation.
5. Replay system with step-through decision inspection and AI rationale visibility.
6. Bulk simulation runner for evaluating heuristics and collecting metrics.

Hard constraints:
- Engine is authoritative for legality and trick resolution.
- Frontend must never invent or guess legal actions.
- Partners must not call Tichu/Grand Tichu if their partner already has that call active.
- Partners should not unnecessarily steal tricks from each other.
- AI-only games must auto-advance without manual intervention.
- Trick area must visually stack cards in order and remain readable.
- UI must be mature and responsive, not primitive or hardcoded.
- Telemetry must include schema_version, engine_version, sim_version, phase, decision_index, legal_actions, selected_action, raw state, normalized state, policy_name, and policy explanation.
- All major game logic must be test-covered.

Architecture:
- apps/web
- apps/server
- apps/sim-runner
- packages/engine
- packages/ai-heuristics
- packages/telemetry
- packages/ui-kit
- packages/shared
- infra/db
- docs

Preferred stack:
- React + Vite + TypeScript
- Node.js + TypeScript
- WebSockets
- Postgres
- Docker
- Tailwind for shell styling
- Pixi only where helpful for performant game/table rendering

Implement in milestones:
0. repo scaffold + CI + Docker + DB migrations
1. engine core
2. playable headless AI-only game with telemetry
3. heuristics v1
4. mature web UI
5. real-time match orchestration
6. replay/debug tools
7. simulation harness
8. polish/performance/accessibility

For every milestone:
- inspect repo and propose exact file changes
- implement only that milestone
- run/update tests
- summarize what was done
- list follow-up tasks

UI requirements:
- centered responsive table layout
- local player hand at bottom
- 4 seat layout around table
- clear center trick stack
- per-seat indicators for cards remaining, team, Tichu/GT status, active turn
- phase-aware action rail
- collapsible side panels for replay/history/debug
- polished dark tabletop visual style
- clear pass lanes left/partner/right
- support replay controls and AI reasoning panel in debug mode

Engine requirements:
- explicit phases
- deterministic transitions
- serializable state
- special card handling for Mahjong, Dog, Phoenix, Dragon
- complete round scoring
- legal action generation per phase

AI requirements:
- layered heuristics:
  - legality filter
  - combo detection
  - tempo/control
  - partner-aware team logic
  - call logic
  - endgame logic
- structured rationale output for each decision

Testing requirements:
- unit, integration, replay, and E2E coverage
- verify deterministic replay
- verify no illegal actions
- verify partner call suppression and reduced partner trick stealing

Start with Milestone 0 only.
First inspect the repository, summarize the current state, identify the minimum changes required, then implement Milestone 0 in a clean, testable way.
```

---

## 18. Immediate Next Step

Start with Milestone 0 only.

Do not attempt the full build in one pass.

The right workflow is:
1. scaffold foundation
2. lock in deterministic engine core
3. add headless AI flow and telemetry
4. build mature UI on top of authoritative engine behavior
5. add replay/debug/simulation capabilities

That sequencing is part of the specification, not an implementation suggestion.

