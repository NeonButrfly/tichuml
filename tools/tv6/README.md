# v6 guard

Pair these files with `tichu_v6.zip`.

1. Extract `tichu_v6.zip` to the repo as `assets/tichu_v6/`.
2. Copy `lock.json` and `check.mjs` into the repo root, or keep them beside the asset folder.
3. Run:

```bash
node check.mjs assets/tichu_v6 --lock lock.json
```

Codex should also generate a runtime snapshot JSON and run:

```bash
node check.mjs assets/tichu_v6 --lock lock.json --snap alt_table_snapshot.json
```

If either command fails, stop. Do not continue to UI work.
