# Renderer and print-project prompts

## Issue #136 — Angel Dust Bambu X2D project optimization

- Original request: optimize `Meshy_AI_multi_color (1).3mf` for Bambu X2D, reduce color-change tower and wasted filament, optimize supports, and map AMS 1 to white, AMS 2 to hot pink, AMS 3 to magenta, and AMS 4 to black.
- Follow-up requirement: add the external right extruder as gold.
- Interpreted requirement: preserve the five painted mesh groups and use five active filament slots in the order white, hot pink, magenta, black, and external-right gold.
- Implemented artifact: `C:\Users\Keifm\Downloads\Angel_Dust_Bambu_X2D_Optimized_Final.3mf`.
- Optimization settings: 16 mm prime tower, 15 mm prime volume, flush into infill and support, organic/tree support, build-plate-only support, 50° support threshold, and 0.2 mm top Z distance.
- Validation status: ZIP/XML integrity and exact preservation of the source model and paint groups were verified locally. Native Bambu Studio slicing, purge amount, support volume, and physical print quality remain unverified in this run.
