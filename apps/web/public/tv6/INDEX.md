# tichu_v6

Flat zip root. There is **no nested `tichu_v6/` folder inside the archive**. Put these files under your repo asset path as `tichu_v6/`.

## Short paths

| Path | Use |
|---|---|
| `t/plate.png` | table plate |
| `p/a.json` | passing anchors |
| `p/o.png` | production slots + arrows |
| `p/s.png` | slots only |
| `p/r.png` | arrows only |
| `p/d.png` | debug only |
| `c/map.json` | card paths |
| `codex.md` | single Codex prompt |
| `x/verify.py` | asset verifier |

## Passing lanes

| # | id | arrow | orient | rot | slot |
|---:|---|---|---|---:|---|
| 01 | `north_pass_left` | left | landscape | 0 | `p/i/01.png` |
| 02 | `north_pass_across` | south | portrait | 0 | `p/i/02.png` |
| 03 | `north_pass_right` | right | landscape | 0 | `p/i/03.png` |
| 04 | `south_pass_left` | left | landscape | 0 | `p/i/04.png` |
| 05 | `south_pass_across` | north | portrait | 0 | `p/i/05.png` |
| 06 | `south_pass_right` | right | landscape | 0 | `p/i/06.png` |
| 07 | `west_pass_north` | north | portrait | -90 | `p/i/07.png` |
| 08 | `west_pass_across` | east | landscape | 90 | `p/i/08.png` |
| 09 | `west_pass_south` | south | portrait | 90 | `p/i/09.png` |
| 10 | `east_pass_north` | north | portrait | -90 | `p/i/10.png` |
| 11 | `east_pass_across` | west | landscape | 90 | `p/i/11.png` |
| 12 | `east_pass_south` | south | portrait | 90 | `p/i/12.png` |

## Side-seat correction

- East north/south: vertical. East across: horizontal.
- West north/south: vertical. West across: horizontal.
- `east_pass_north=-90`, `east_pass_across=+90`, `east_pass_south=+90`.
- `west_pass_north=-90`, `west_pass_across=+90`, `west_pass_south=+90`.
