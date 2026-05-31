# ML Evaluation Report

- Generated: 2026-05-31T16:39:21.528Z
- Base seed: evaluation
- Backend URL: http://127.0.0.1:4310
- Telemetry enabled: false
- Mirror seats: true
- Git commit: 355b6199f54dfd5ef68057e331b194dee5462bd2
- Model file: C:\tichu\tichuml\ml\model_registry\lightgbm_action_model.txt
- Model version: lightgbm-action-model-20260530101110

## Heuristic Sanity Baseline

- Games: 4, hands: 57, fallbacks: 0, invalid decisions: 0
- Win rates: {"team-0":0,"team-1":1,"tie":0}
- Hand win rates: {"team-0":0.386,"team-1":0.5965,"tie":0.0175}
- Average latency by provider: {"server_heuristic":1.77,"system_local":0.06}

## Comparison Runs

### primary

- Providers: NS=lightgbm_model, EW=server_heuristic, games=4, hands=54
- Win rates: {"team-0":0.25,"team-1":0.75,"tie":0}
- Hand win rates: {"team-0":0.3704,"team-1":0.5926,"tie":0.037}
- Total score by team: {"team-0":2645,"team-1":3955}
- Tichu call/success: 0.1111 / 0.3333
- Grand Tichu call/success: 0.0556 / 0.3333
- Double victory rate: 0.2963, fallbacks: 0, invalid decisions: 0
- Average latency by provider: {"server_heuristic":6.29,"system_local":0.05,"lightgbm_model":10.75}

### mirror

- Providers: NS=server_heuristic, EW=lightgbm_model, games=4, hands=54
- Win rates: {"team-0":0.5,"team-1":0.5,"tie":0}
- Hand win rates: {"team-0":0.5556,"team-1":0.4074,"tie":0.037}
- Total score by team: {"team-0":3455,"team-1":3145}
- Tichu call/success: 0.2593 / 0.5714
- Grand Tichu call/success: 0.0741 / 0.5
- Double victory rate: 0.1852, fallbacks: 0, invalid decisions: 0
- Average latency by provider: {"server_heuristic":6.05,"system_local":0.03,"lightgbm_model":10.88}

## Combined Comparison

- lightgbm_model win rate: 0.375 (95% CI [0.1368,0.6943])
- server_heuristic win rate: 0.625 (95% CI [0.3057,0.8632])
- Average score delta (lightgbm_model minus server_heuristic): -202.5
- Average latency: lightgbm_model=10.81 ms, server_heuristic=6.17 ms

## Improvement Gate

- Applied: true, passed: false, challenger: lightgbm_model, baseline: server_heuristic
- sample_size: pass (games=8, required=4)
- beats_baseline: fail (win_rate=0.375, average_score_delta=-202.5)
- illegal_actions: pass (comparison_invalid=0, baseline_invalid=0)
- fallbacks: pass (comparison_fallbacks=0, baseline_fallbacks=0)
- latency: pass (challenger_average_latency_ms=10.81, max=250)

- Latency p95 is currently reported as unavailable because the batch summary keeps provider means, not raw per-decision latency samples.
