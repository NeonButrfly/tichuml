# LOCAL-002

## Title

[BUG] Trick display cleanup and play-area visual polish

## Status

- `Resolved in working tree`
- Created: `2026-04-06`
- Priority: `High`
- Milestone target: `6.1.2`

## Summary

The live gameplay surface needed a narrow UI-only cleanup pass:

- directional indicators on trick lanes were adding clutter around played combinations
- the north trick stage was sitting low enough to overlap the north label region
- the current trick had no visible running point total in the center of the table
- the play-area inset shadow was reducing clarity during gameplay, while remaining useful in editor mode

## Before

- trick lanes rendered directional labels for north, east, south, and west
- the north trick stage could visually crowd score and seat labels
- players could not see the current trick point total at a glance
- the center play area always carried the same inset shadow in gameplay and editor mode

## After

- trick-lane directional indicators are removed from gameplay and debug trick rendering
- the north stage anchor is shifted upward using the normalized table layout config
- the center trick surface shows `Trick: XX pts` while a trick is active
- gameplay removes the play-area shadow, while editor mode keeps it for layout inspection

## Acceptance Criteria

- No direction indicators are visible on any player trick area
- The north trick no longer overlaps the north label or score badge
- The current trick point total is shown centrally and updates with the displayed trick cards
- The trick-point value is hidden when there is no active trick
- Gameplay mode has no play-area shadow
- Editor mode still shows the play-area shadow
- No gameplay rules, input behavior, or responsive table sizing logic change as part of this fix
