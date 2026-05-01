# ML Evaluation Report

- Generated: 2026-05-01T20:00:27.468Z
- Base seed: evaluation
- Backend URL: http://127.0.0.1:4310
- Telemetry enabled: false
- Mirror seats: false
- Git commit: 69e0b6d3545fcd0803f3995e45755c7f6af70a3c
- Model file: C:\tichu\tichuml\ml\model_registry\lightgbm_action_model.txt
- Model version: 2026-04-20T04:00:59.835356+00:00

## Heuristic Sanity Baseline

- Games: 1, hands: 1, fallbacks: 2, invalid decisions: 0
- Win rates: {"team-0":0,"team-1":1,"tie":0}
- Hand win rates: {"team-0":0,"team-1":1,"tie":0}
- Average latency by provider: {"local_heuristic":354,"server_heuristic":5.73,"system_local":0.33}

## Comparison Runs

### primary

- Providers: NS=lightgbm_model, EW=server_heuristic, games=1, hands=1
- Win rates: {"team-0":0,"team-1":1,"tie":0}
- Hand win rates: {"team-0":0,"team-1":1,"tie":0}
- Total score by team: {"team-0":0,"team-1":300}
- Tichu call/success: 1 / 1
- Grand Tichu call/success: 0 / n/a
- Double victory rate: 1, fallbacks: 52, invalid decisions: 0
- Average latency by provider: {"local_heuristic":951.83,"server_heuristic":4.86,"system_local":0}

## Combined Comparison

- lightgbm_model win rate: 0 (95% CI [0,0.7935])
- server_heuristic win rate: 1 (95% CI [0.2065,1])
- Average score delta (lightgbm_model minus server_heuristic): -300
- Average latency: lightgbm_model=n/a ms, server_heuristic=4.86 ms

## Improvement Gate

- Applied: true, passed: false, challenger: lightgbm_model, baseline: server_heuristic
- sample_size: pass (games=1, required=1)
- beats_baseline: fail (win_rate=0, average_score_delta=-300)
- illegal_actions: pass (comparison_invalid=0, baseline_invalid=0)
- fallbacks: fail (comparison_fallbacks=52, baseline_fallbacks=2)
- latency: fail (challenger_average_latency_ms=n/a, max=250)

- Latency p95 is currently reported as unavailable because the batch summary keeps provider means, not raw per-decision latency samples.
