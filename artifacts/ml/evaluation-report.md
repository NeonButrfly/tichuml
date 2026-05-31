# ML Evaluation Report

- Generated: 2026-05-31T15:57:37.201Z
- Base seed: evaluation
- Backend URL: http://127.0.0.1:4311
- Telemetry enabled: false
- Mirror seats: true
- Git commit: 07dda4c5644574354b7803a281d89750fb8563a4
- Model file: C:\tichu\tichuml\ml\model_registry\lightgbm_action_model.txt
- Model version: lightgbm-action-model-20260530101110

## Heuristic Sanity Baseline

- Games: 2, hands: 30, fallbacks: 0, invalid decisions: 0
- Win rates: {"team-0":0,"team-1":1,"tie":0}
- Hand win rates: {"team-0":0.3667,"team-1":0.6,"tie":0.0333}
- Average latency by provider: {"server_heuristic":1.29,"system_local":0.1}

## Comparison Runs

### primary

- Providers: NS=lightgbm_model, EW=server_heuristic, games=2, hands=26
- Win rates: {"team-0":0,"team-1":1,"tie":0}
- Hand win rates: {"team-0":0.3846,"team-1":0.6154,"tie":0}
- Total score by team: {"team-0":1180,"team-1":2220}
- Tichu call/success: 0.1538 / 0.5
- Grand Tichu call/success: 0.0385 / 1
- Double victory rate: 0.2308, fallbacks: 0, invalid decisions: 0
- Average latency by provider: {"server_heuristic":1.54,"system_local":0.01,"lightgbm_model":8.87}

### mirror

- Providers: NS=server_heuristic, EW=lightgbm_model, games=2, hands=24
- Win rates: {"team-0":0.5,"team-1":0.5,"tie":0}
- Hand win rates: {"team-0":0.5833,"team-1":0.3333,"tie":0.0833}
- Total score by team: {"team-0":1975,"team-1":1225}
- Tichu call/success: 0.125 / 0.3333
- Grand Tichu call/success: 0.0833 / 0.5
- Double victory rate: 0.375, fallbacks: 0, invalid decisions: 0
- Average latency by provider: {"server_heuristic":4.19,"system_local":0.04,"lightgbm_model":10.01}

## Combined Comparison

- lightgbm_model win rate: 0.25 (95% CI [0.0456,0.6994])
- server_heuristic win rate: 0.75 (95% CI [0.3006,0.9544])
- Average score delta (lightgbm_model minus server_heuristic): -447.5
- Average latency: lightgbm_model=9.39 ms, server_heuristic=2.79 ms

## Improvement Gate

- Applied: true, passed: false, challenger: lightgbm_model, baseline: server_heuristic
- sample_size: pass (games=4, required=2)
- beats_baseline: fail (win_rate=0.25, average_score_delta=-447.5)
- illegal_actions: pass (comparison_invalid=0, baseline_invalid=0)
- fallbacks: pass (comparison_fallbacks=0, baseline_fallbacks=0)
- latency: pass (challenger_average_latency_ms=9.39, max=250)

- Latency p95 is currently reported as unavailable because the batch summary keeps provider means, not raw per-decision latency samples.
