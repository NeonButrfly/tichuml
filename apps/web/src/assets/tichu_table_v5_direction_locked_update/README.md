# Tichu Table v5 Direction-Locked Passing Phase Patch

This patch fixes the passing-lane direction map exactly as specified.

## Production files

- `passing_phase/v5_direction_locked/overlays/passing_lanes_v5_slots_only_gold_1536x1024.png`
- `passing_phase/v5_direction_locked/overlays/passing_lanes_v5_slots_with_direction_arrows_gold_1536x1024.png`
- `passing_phase/v5_direction_locked/anchors/passing_phase_v5_direction_locked_card_sized_anchors_1536x1024.json`
- `table_plate/table_plate_no_red_sample_guides_1536x1024.png`

## Direction map locked in JSON

North: left→left, across→south, right→right.
South: left→left, across→north, right→right.
East: north→north, across→west, south→south.
West: north→north, across→east, south→south.

The red boxes from the user sketch are not included in production overlays.

## Card assets

Individual wuxia card PNGs are under `cards/wuxia_imagegen_v5/`.
They are based on image-generated wuxia art sources and exported as separate images.
