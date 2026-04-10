# LOCAL-001

Legacy local issue note archived after migration to GitHub.

- GitHub issue: [#1](https://github.com/NeonButrfly/tichuml/issues/1)
- GitHub state: `Closed`
- GitHub milestone: `6.1.1`
- Fix evidence: commit `2e93f9a` (`Milestone 6.1.1: audit combo response legality`)

The remainder of this file is the original local note and is kept only for historical context.

## Title

[BUG] Response legality deadlock on combo turns; straights confirmed, audit all combo types

## Historical Local Status

- `Resolved in working tree`
- Created: `2026-04-06`
- Priority: `Critical`
- Historical milestone target: `6.1.1`

## Summary

Confirmed bug:

- Engine deadlocks on straight response turns
- Active player or bot can fail to play or pass
- Straights and combo ordering appear non-canonical in some cases

Suspected broader issue:

- This may affect other combo response types, not only straights
- Need a full audit of response legality, comparison, normalization, and pass/play action availability across all combo classes

## Required Work

1. Create or fix a single authoritative legality pipeline used by engine, bot turns, human UI state, and selection matching.
2. Audit all combo response types for deadlock risk:
   - single
   - pair
   - trips
   - full house
   - straight
   - pair sequence
   - bombs
   - special-card edge cases such as Mahjong wish, Phoenix interactions, and Dragon flow where relevant
3. Add regression tests that verify:
   - if a legal response exists, it is generated and playable
   - if no legal response exists, the pass path resolves correctly
   - no active turn can deadlock
4. Canonicalize combo normalization and ordering by rank, not suit.
5. Update documentation with combo normalization and anti-deadlock invariants.
6. Historical local workflow note: reference `LOCAL-001` in the commit message and PR description for the fix.

## Acceptance Criteria

- No active player turn deadlocks on any combo response type
- Human and AI share the same legality pipeline
- Play and Pass availability matches actual legal responses
- Combo normalization is canonical and rank-first
- Regression tests cover all combo response categories

## Notes

- Confirmed screenshot/context: active straight response turn where the hand can become trapped with no valid non-Tichu progression.
- This issue should be treated as an engine plus shared-action-availability audit, not a UI-only button patch.
- Fix implementation now uses one shared canonical rank-first combo-card ordering helper in the engine, and both engine action validation and web turn-action matching read from that same normalization path.
- Regression coverage now audits response legality across single, pair, trio, full house, straight, pair sequence, and bomb response families.
