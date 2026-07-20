# Luxury Table Archive

Archived on 2026-07-08 under GitHub issue [#128](https://github.com/NeonButrfly/tichuml/issues/128).

Why archived:
- the live luxury/ALT table runtime had become too unstable to keep iterating safely
- the standalone luxury-table editor was coupled to that runtime surface
- the active product was reset to the normal table only

Archived contents:
- `apps/web/src/alt-table-3d/`
- `apps/web/src/altTableFresh/`
- `apps/web/src/altTable/`
- `apps/web/src/alternate-table/`
- `apps/web/public/tv7/`
- `apps/web/public/table/`
- `apps/table-editor/`
- luxury-table verification script and integration tests

Archive contract:
- code stays in-repo for reference only
- archived files are outside active runtime/workspace entry points
- the active app should not import, bundle, or route into this archive
