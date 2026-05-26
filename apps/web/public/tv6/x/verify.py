#!/usr/bin/env python3
import json, sys
from pathlib import Path
root = Path(sys.argv[1]) if len(sys.argv) > 1 else Path(__file__).resolve().parents[1]
def ok(rel):
    p = root / rel
    if not p.exists(): raise SystemExit(f"missing: {rel}")
    return p
ok('t/plate.png'); ok('p/o.png'); ok('p/s.png'); ok('p/r.png'); ok('p/a.json')
a = json.loads(ok('p/a.json').read_text())['anchors']
if len(a) != 12: raise SystemExit(f"expected 12 anchors, got {len(a)}")
by = {x['id']: x for x in a}
expected = {
  'north_pass_left':'left','north_pass_across':'south','north_pass_right':'right',
  'south_pass_left':'left','south_pass_across':'north','south_pass_right':'right',
  'east_pass_north':'north','east_pass_across':'west','east_pass_south':'south',
  'west_pass_north':'north','west_pass_across':'east','west_pass_south':'south',
}
for id_, direction in expected.items():
    if id_ not in by: raise SystemExit(f"missing anchor: {id_}")
    if by[id_]['arrow_direction'] != direction: raise SystemExit(f"bad direction {id_}: {by[id_]['arrow_direction']} != {direction}")
side = {
  'east_pass_north':('portrait',-90), 'east_pass_across':('landscape',90), 'east_pass_south':('portrait',90),
  'west_pass_north':('portrait',-90), 'west_pass_across':('landscape',90), 'west_pass_south':('portrait',90),
}
for id_, (ori, rot) in side.items():
    if by[id_]['slot_orientation'] != ori: raise SystemExit(f"bad orientation {id_}: {by[id_]['slot_orientation']} != {ori}")
    if by[id_]['slot_rotation_deg'] != rot: raise SystemExit(f"bad rotation {id_}: {by[id_]['slot_rotation_deg']} != {rot}")
for idx in range(1,13): ok(f'p/i/{idx:02d}.png'); ok(f'p/m/{idx:02d}.png')
for suit in ['sw','pg','jd','st']:
    for rank in ['A','K','Q','J','10','9','8','7','6','5','4','3','2']:
        ok(f'c/std/{suit}_{rank}.png')
for sp in ['mahjong','dog','phoenix','dragon']: ok(f'c/sp/{sp}.png')
for back in ['blue','green']: ok(f'c/back/{back}.png')
print('OK tichu_v6')
