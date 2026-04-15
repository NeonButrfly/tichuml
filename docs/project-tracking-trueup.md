# Project Tracking True-Up

Date: `2026-04-10`

This report records the repository-wide reconciliation pass across GitHub issues, GitHub milestones, commit history, and local tracking docs.

This file is historical audit evidence, not the live backlog. The active forward backlog now lives in GitHub milestone [`6.4 – Gameplay & UX Stabilization`](https://github.com/NeonButrfly/tichuml/milestone/23), and the standing governance audit issue is [#26](https://github.com/NeonButrfly/tichuml/issues/26).

## Milestones Kept

- Historical imported release buckets retained for commit-history continuity:
  - `0`
  - `1`
  - `2`
  - `3`
  - `4`
  - `4.5`
  - `4.5.3`
  - `4.5.4`
  - `4.6`
  - `4.6.1`
  - `4.6.2`
  - `5.1.3`
- Historical checkpoint milestone retained:
  - `5.9`
- Historical verified milestones with explicit GitHub issue coverage:
  - `6.0`
  - `6.1`
  - `6.1.1`
  - `6.1.2`
  - `6.1.3`
  - `6.1.4`
  - `6.1.5`
  - `6.2`
  - `6.3`

## Milestones Corrected Or Added

- Updated milestone descriptions for:
  - `5.9`
  - `6.0`
  - `6.1`
  - `6.1.1`
  - `6.1.2`
  - `6.1.3`
- Created missing milestone buckets and descriptions for:
  - `6.1.4`
  - `6.1.5`
  - `6.2`
  - `6.3`
- No milestones were deleted.

## Issues Closed As Duplicates

- Closed issue [#4](https://github.com/NeonButrfly/tichuml/issues/4) as a duplicate of [#1](https://github.com/NeonButrfly/tichuml/issues/1)
- Closed issue [#5](https://github.com/NeonButrfly/tichuml/issues/5) as a duplicate of [#2](https://github.com/NeonButrfly/tichuml/issues/2)
- Closed issue [#6](https://github.com/NeonButrfly/tichuml/issues/6) as a duplicate of [#3](https://github.com/NeonButrfly/tichuml/issues/3)

## Issues Closed As Verified Fixed

- Closed issue [#1](https://github.com/NeonButrfly/tichuml/issues/1)
  - Evidence: commit `2e93f9a` (`Milestone 6.1.1: audit combo response legality`)
- Closed issue [#2](https://github.com/NeonButrfly/tichuml/issues/2)
  - Evidence: commit `c48c7da` (`[MILESTONE 6.1.2] Clean up trick UI and play area visuals (LOCAL-002)`)
- Closed issue [#3](https://github.com/NeonButrfly/tichuml/issues/3)
  - Evidence: commit `a77c557` (`[MILESTONE 6.1.3] Fix straight-response regression and gameplay play-area shadow (LOCAL-003)`)
- Closed issue [#7](https://github.com/NeonButrfly/tichuml/issues/7)
  - Evidence: commit `c999747` (`Milestone 6.0: developer inspection and gameplay hardening`)
- Closed issue [#8](https://github.com/NeonButrfly/tichuml/issues/8)
  - Evidence: commit `c999747` (`Milestone 6.0: developer inspection and gameplay hardening`)
- Closed issue [#9](https://github.com/NeonButrfly/tichuml/issues/9)
  - Evidence: commit `c999747` (`Milestone 6.0: developer inspection and gameplay hardening`)
- Closed issue [#10](https://github.com/NeonButrfly/tichuml/issues/10)
  - Evidence: commit `36416e3` (`Milestone 6.1: fix turn action deadlock`)
- Closed issue [#11](https://github.com/NeonButrfly/tichuml/issues/11)
  - Evidence: commit `ec001c3` (`Milestone 6.1.4: render seat-local trick staging and pickup visibility`) and follow-up `7cdeb10`
- Closed issue [#12](https://github.com/NeonButrfly/tichuml/issues/12)
  - Evidence: commit `954dc7b` (`Milestone 6.1.5: harden pass staging and AI hand evaluation`)
- Closed issue [#13](https://github.com/NeonButrfly/tichuml/issues/13)
  - Evidence: commit `190f677` (`Milestone 6.2: port deterministic heuristics brain`)
- Closed issue [#14](https://github.com/NeonButrfly/tichuml/issues/14)
  - Evidence: commit `8a97de0` (`Milestone 6.3: stabilize canonical table layout schema`)

## Issues Created As Historical Backfill

- [#7](https://github.com/NeonButrfly/tichuml/issues/7) `Multi-source entropy pipeline and Random Sources inspection UI`
- [#8](https://github.com/NeonButrfly/tichuml/issues/8) `Exchange pickup flow, cumulative scoring, and score history hardening`
- [#9](https://github.com/NeonButrfly/tichuml/issues/9) `Enforce Mahjong wish legality and no-stall turn resolution`
- [#10](https://github.com/NeonButrfly/tichuml/issues/10) `Centralize turn action availability and block Tichu-only deadlocks`
- [#11](https://github.com/NeonButrfly/tichuml/issues/11) `Seat-local trick staging, pickup visibility, and Dog lead transfer`
- [#12](https://github.com/NeonButrfly/tichuml/issues/12) `Pass staging state isolation and AI hand-evaluation hardening`
- [#13](https://github.com/NeonButrfly/tichuml/issues/13) `Port deterministic heuristics brain as the shared bot policy`
- [#14](https://github.com/NeonButrfly/tichuml/issues/14) `Stabilize canonical table layout schema and Tichu-call gating`

## Issues Open At Reconciliation Time

- None. The reconciliation pass ended with no open issues.
- Forward backlog creation resumed later with milestone `6.4 – Gameplay & UX Stabilization`; see GitHub for live state.

## Documentation Fixes Performed

- Updated [README.md](../README.md) to point milestone scope bullets at the corresponding GitHub issues instead of `LOCAL-*` placeholders.
- Updated [docs/README.md](./README.md) so it no longer describes `docs/issues` as a live local issue tracker.
- Updated [docs/issues/README.md](./issues/README.md) with the canonical GitHub mappings for `LOCAL-001` through `LOCAL-003`.
- Added [docs/issues-archived/README.md](./issues-archived/README.md) to explain that archived local issue markdown is legacy migration evidence only.
- Updated archived local issue files to map each one to its GitHub issue, milestone, and fix commit.
- Updated [docs/milestones/README.md](./milestones/README.md) with the authoritative GitHub milestone set and recent milestone-to-issue mapping.

## Forward Backlog After Reconciliation

- Open stabilization milestone: [`6.4 – Gameplay & UX Stabilization`](https://github.com/NeonButrfly/tichuml/milestone/23)
- Standing governance audit issue: [#26](https://github.com/NeonButrfly/tichuml/issues/26)
- Prompt capture now lives in [docs/prompts](./prompts/README.md) and links back to GitHub issues instead of tracking separate status locally.

## PR And Commit Reality Check

- GitHub currently shows no pull requests for this repository.
- Commit history remains the evidence source for the historically backfilled issues.
- No commit history was rewritten in this pass.

## Remaining Ambiguities

- Milestones `0` through `5.1.3` and checkpoint `5.9` predate the GitHub issue migration and do not have fully backfilled issue granularity. They are retained as historical release buckets rather than deleted, because they correspond to real shipped commit history.
- Issue coverage is now complete for the recent, behaviorally described milestones `6.0` through `6.3`.
