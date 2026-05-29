# ML Evaluation Report

- Generated: 2026-05-29T22:53:47.025Z
- Base seed: evaluation
- Backend URL: http://127.0.0.1:4311
- Telemetry enabled: false
- Mirror seats: false
- Git commit: b993a200535c13860ef584535e3ca4af163bb30b
- Model file: C:\tichu\tichuml\ml\model_registry\lightgbm_action_model.txt
- Model version: lightgbm-action-model-20260529224550

## Heuristic Sanity Baseline

- Games: 1, hands: 16, fallbacks: 0, invalid decisions: 0
- Win rates: {"team-0":0,"team-1":1,"tie":0}
- Hand win rates: {"team-0":0.25,"team-1":0.6875,"tie":0.0625}
- Average latency by provider: {"server_heuristic":2.7,"system_local":0.06}

## Comparison Runs

### primary

- Providers: NS=lightgbm_model, EW=server_heuristic, games=1, hands=9
- Win rates: {"team-0":0,"team-1":1,"tie":0}
- Hand win rates: {"team-0":0.2222,"team-1":0.7778,"tie":0}
- Total score by team: {"team-0":-5,"team-1":1205}
- Tichu call/success: 0.5556 / 0.4
- Grand Tichu call/success: 0 / n/a
- Double victory rate: 0.4444, fallbacks: 0, invalid decisions: 0
- Average latency by provider: {"server_heuristic":8.26,"system_local":0.04,"lightgbm_model":14.75}

## Combined Comparison

- lightgbm_model win rate: 0 (95% CI [0,0.7935])
- server_heuristic win rate: 1 (95% CI [0.2065,1])
- Average score delta (lightgbm_model minus server_heuristic): -1210
- Average latency: lightgbm_model=14.75 ms, server_heuristic=8.26 ms

## Improvement Gate

- Applied: true, passed: false, challenger: lightgbm_model, baseline: server_heuristic
- sample_size: pass (games=1, required=1)
- beats_baseline: fail (win_rate=0, average_score_delta=-1210)
- illegal_actions: pass (comparison_invalid=0, baseline_invalid=0)
- fallbacks: pass (comparison_fallbacks=0, baseline_fallbacks=0)
- latency: pass (challenger_average_latency_ms=14.75, max=250)

- Latency p95 is currently reported as unavailable because the batch summary keeps provider means, not raw per-decision latency samples.
