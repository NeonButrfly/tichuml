# Milestones

This document is the canonical reference for milestone naming, milestone history, and future commit-subject formatting.

## Why This Exists

The repository started with clean milestone labels, but later commit subjects drifted into mixed formats such as `Milestone 5.9`, `4.6 addition of table editor`, and `ms 4.61 small gui fixes`. The current branch history has now been normalized so planning, documentation, and future commits stay aligned.

## Canonical Milestone Plan

These milestone bands remain the source-of-truth plan from [SPEC](../../spec.md):

- `0` - foundation and monorepo scaffold
- `1` - deterministic engine core
- `2` - headless playable game and telemetry baseline
- `3` - heuristics v1
- `4` - mature web UI
- `5` - match orchestration and gameplay hardening
- `6` - replay, debug, and developer inspection tools
- `7` - simulation harness and bulk analysis
- `8` - polish and production-readiness

Sub-milestones such as `4.5`, `4.6`, `5.1.3`, and `5.9` are acceptable when a bounded stream needs more than one commit or iteration. Bugfix follow-ups may use a third revision segment such as `6.1.1` when they are clearly scoped corrective work on top of an already-cut milestone.

## Normalized Repository History

The table below reflects the normalized git history up through the Milestone `5.9` checkpoint. The current repository head is Milestone `6.1.1`, described in the snapshot section below.

| Commit | Normalized subject |
| --- | --- |
| `1c86753` | `Milestone 0: foundation scaffold` |
| `321afd0` | `Milestone 1: engine core` |
| `0bfc917` | `Milestone 1: engine core follow-up` |
| `c1115e6` | `Milestone 2: headless AI flow` |
| `c5e5690` | `Milestone 3: heuristics v1` |
| `ce19720` | `Milestone 4: mature web UI baseline` |
| `e51ee67` | `Milestone 4.5: table layout refinement` |
| `4cba36d` | `Milestone 4.5.3: visual layout refinement` |
| `957010f` | `Milestone 4.5.4: anchor pass staging and rotate side hands` |
| `e9b0373` | `Milestone 4.6: add table editor` |
| `52f442a` | `Milestone 4.6.1: persist updated layout to layout.xml` |
| `a559d25` | `Milestone 4.6.2: small UI fixes` |
| `fd334e9` | `Milestone 5.1.3: gameplay-flow corrections` |
| `aab58a8` | `Milestone 5.9: entropy and runtime hardening checkpoint` |

## Current Milestone Head

Milestone `6.1.1` is the current repository-head milestone. Its scope is:

- `LOCAL-001` combo-response legality deadlock audit and fix
- shared rank-first combo normalization across engine legality, selection matching, and concrete play validation
- regression coverage across single, pair, trio, full house, straight, pair sequence, and bomb response families

Milestone `6.1` remains the prior repository-head milestone. Its scope was:

- centralized turn-action availability for the local player UI
- protection against the illegal Tichu-only progression state
- regression coverage for straight-response and wish-fallback pass/play legality

Milestone `6.0` remains the earlier repository-head milestone. Its scope was:

- production-ready entropy orchestration with deterministic shuffle integration
- Random Sources inspection UI and related seed provenance/debug surfaces
- exchange/pickup and cumulative-score flow corrections
- Mahjong wish hard-rule enforcement plus engine no-stall safeguards

When a future milestone supersedes `6.1.1`, append its normalized subject to the history table and move the scope summary forward.

## Commit Subject Convention

Use a single subject style for new milestone commits:

```text
Milestone <id>: <short scope summary>
```

Examples:

- `Milestone 5.1.5: fix pickup flow and cumulative scoring`
- `Milestone 6.0: add multi-source entropy inspection dialog`
- `Milestone 6.1.1: audit combo response legality`

Avoid:

- bare milestone numbers with no scope
- inconsistent shorthand such as `ms 4.61`
- commit subjects that hide milestone ownership entirely

## Commit Body Convention

For milestone commits, prefer a short body with:

1. `Why` - the regression, capability gap, or milestone goal
2. `Changes` - the main engine/UI/server/doc updates
3. `Tests` - the validation commands or suites that passed

Example:

```text
Milestone 6.0: add multi-source entropy inspection dialog

Why:
- make entropy provenance inspectable without weakening deterministic shuffle

Changes:
- move live entropy collection to the server
- add normalized source combining and audit hashes
- add Random Sources menu item and modal

Tests:
- npx vitest run tests/integration/seed-orchestrator.test.ts tests/integration/entropy-dialog.test.ts
- npm run build:web
- npm run build:server
```

## Contributor Rules

- Do not rewrite old milestone commits unless the branch is explicitly being history-cleaned.
- Keep one milestone or one tightly-related sub-milestone per commit where practical.
- If a task spans multiple subsystems, keep the milestone id stable across the branch, PR title, and commit subject.
- Update the relevant docs when a milestone materially changes scope.
