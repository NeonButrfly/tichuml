# LOCAL-003

Legacy local issue note archived after migration to GitHub.

- GitHub issue: [#3](https://github.com/NeonButrfly/tichuml/issues/3)
- GitHub state: `Closed`
- GitHub milestone: `6.1.3`
- Fix evidence: commit `a77c557` (`[MILESTONE 6.1.3] Fix straight-response regression and gameplay play-area shadow (LOCAL-003)`)

The remainder of this file is the original local note and is kept only for historical context.

## Title

[BUG] Straight-response regression and gameplay play-area shadow

## Historical Local Status

- `Resolved in working tree`
- Created: `2026-04-06`
- Priority: `Critical`
- Historical milestone target: `6.1.3`

## Summary

This regression appeared after the earlier trick-surface cleanup and combo-legality hardening work:

- gameplay still showed the center play-area shadow/glow even though that visual should be editor-only
- a live straight response turn could stall because the active responder did not reliably resolve to a play or a pass

## Observed Behavior

- In normal gameplay, the center play area still rendered the blurred felt/shadow layer.
- In a reproduced straight sequence, North led a straight and West became the active responder.
- West could remain stuck because optional `call_tichu` handling and response-action selection did not guarantee immediate progression to a legal play or pass.

## Acceptance Criteria

- Gameplay mode shows no play-area shadow, inset glow, or felt overlay
- Editor mode keeps the play-area shadow/felt overlay
- A straight led by any seat never stalls the next responder
- If a higher straight exists, the responder plays it
- If no legal straight response exists, the responder passes
- Active response turns always resolve to a progression action instead of stopping on optional Tichu handling
- No regression to combo normalization, trick flow, or responsive layout

## Test Coverage Added

- gameplay shadow gating helper returns no shadow/felt in gameplay and enabled shadow/felt in editor
- active straight with no legal response resolves to pass
- active straight with a legal higher response resolves to play
- unordered straight response selection still matches the canonical legal response
- local optional Tichu no longer pauses another seat's live response turn

## Notes

- This is a regression after the earlier `LOCAL-001` combo-response fix and `LOCAL-002` trick-surface cleanup.
- The active-turn invariant remains: during trick play, the current responder must always progress through a legal play or a legal pass.
