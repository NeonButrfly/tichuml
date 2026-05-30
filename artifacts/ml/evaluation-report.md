# ML Evaluation Report

- Generated: 2026-05-30T12:24:19.245Z
- Base seed: evaluation
- Backend URL: http://127.0.0.1:4310
- Telemetry enabled: false
- Mirror seats: true
- Git commit: 140c8341fb9abb11b6e00b0bc624bf3338fb644e
- Model file: C:\tichu\tichuml\ml\model_registry\lightgbm_action_model.txt
- Model version: lightgbm-action-model-20260530121841

## Heuristic Sanity Baseline

- Games: 4, hands: 57, fallbacks: 0, invalid decisions: 0
- Win rates: {"team-0":0,"team-1":1,"tie":0}
- Hand win rates: {"team-0":0.386,"team-1":0.5965,"tie":0.0175}
- Average latency by provider: {"server_heuristic":1.74,"system_local":0.07}

## Comparison Runs

### primary

- Providers: NS=lightgbm_model, EW=server_heuristic, games=4, hands=43
- Win rates: {"team-0":0,"team-1":1,"tie":0}
- Hand win rates: {"team-0":0.2326,"team-1":0.6744,"tie":0.093}
- Total score by team: {"team-0":665,"team-1":4335}
- Tichu call/success: 0.093 / 0
- Grand Tichu call/success: 0.0698 / 0
- Double victory rate: 0.3953, fallbacks: 0, invalid decisions: 0
- Average latency by provider: {"server_heuristic":6.47,"system_local":0.05,"lightgbm_model":9.82}

### mirror

- Providers: NS=server_heuristic, EW=lightgbm_model, games=4, hands=33
- Win rates: {"team-0":1,"team-1":0,"tie":0}
- Hand win rates: {"team-0":0.697,"team-1":0.2424,"tie":0.0606}
- Total score by team: {"team-0":4410,"team-1":890}
- Tichu call/success: 0.1818 / 0.5
- Grand Tichu call/success: 0.0909 / 1
- Double victory rate: 0.4242, fallbacks: 0, invalid decisions: 0
- Average latency by provider: {"server_heuristic":6.28,"system_local":0.08,"lightgbm_model":8.91}

## Combined Comparison

- lightgbm_model win rate: 0 (95% CI [0,0.3244])
- server_heuristic win rate: 1 (95% CI [0.6756,1])
- Average score delta (lightgbm_model minus server_heuristic): -898.75
- Average latency: lightgbm_model=9.43 ms, server_heuristic=6.39 ms

## Improvement Gate

- Applied: true, passed: false, challenger: lightgbm_model, baseline: server_heuristic
- sample_size: pass (games=8, required=4)
- beats_baseline: fail (win_rate=0, average_score_delta=-898.75)
- illegal_actions: pass (comparison_invalid=0, baseline_invalid=0)
- fallbacks: pass (comparison_fallbacks=0, baseline_fallbacks=0)
- latency: pass (challenger_average_latency_ms=9.43, max=250)

- Latency p95 is currently reported as unavailable because the batch summary keeps provider means, not raw per-decision latency samples.
