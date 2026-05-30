# ML Evaluation Report

- Generated: 2026-05-30T10:17:09.136Z
- Base seed: evaluation
- Backend URL: http://127.0.0.1:4310
- Telemetry enabled: false
- Mirror seats: true
- Git commit: 935eed7130ed748a6a8cad7ad7ab7ceef5116530
- Model file: C:\tichu\tichuml\ml\model_registry\lightgbm_action_model.txt
- Model version: lightgbm-action-model-20260530101110

## Heuristic Sanity Baseline

- Games: 4, hands: 57, fallbacks: 0, invalid decisions: 0
- Win rates: {"team-0":0,"team-1":1,"tie":0}
- Hand win rates: {"team-0":0.386,"team-1":0.5965,"tie":0.0175}
- Average latency by provider: {"server_heuristic":1.78,"system_local":0.08}

## Comparison Runs

### primary

- Providers: NS=lightgbm_model, EW=server_heuristic, games=4, hands=48
- Win rates: {"team-0":0.5,"team-1":0.5,"tie":0}
- Hand win rates: {"team-0":0.3125,"team-1":0.6458,"tie":0.0417}
- Total score by team: {"team-0":2355,"team-1":3745}
- Tichu call/success: 0.2083 / 0.3
- Grand Tichu call/success: 0.0625 / 0.6667
- Double victory rate: 0.3125, fallbacks: 0, invalid decisions: 0
- Average latency by provider: {"server_heuristic":6.39,"system_local":0.04,"lightgbm_model":9.91}

### mirror

- Providers: NS=server_heuristic, EW=lightgbm_model, games=4, hands=40
- Win rates: {"team-0":1,"team-1":0,"tie":0}
- Hand win rates: {"team-0":0.75,"team-1":0.25,"tie":0}
- Total score by team: {"team-0":4395,"team-1":905}
- Tichu call/success: 0.325 / 0.1538
- Grand Tichu call/success: 0.1 / 1
- Double victory rate: 0.35, fallbacks: 0, invalid decisions: 0
- Average latency by provider: {"server_heuristic":6.11,"system_local":0.03,"lightgbm_model":9.06}

## Combined Comparison

- lightgbm_model win rate: 0.25 (95% CI [0.0715,0.5907])
- server_heuristic win rate: 0.75 (95% CI [0.4093,0.9285])
- Average score delta (lightgbm_model minus server_heuristic): -610
- Average latency: lightgbm_model=9.53 ms, server_heuristic=6.26 ms

## Improvement Gate

- Applied: true, passed: false, challenger: lightgbm_model, baseline: server_heuristic
- sample_size: pass (games=8, required=4)
- beats_baseline: fail (win_rate=0.25, average_score_delta=-610)
- illegal_actions: pass (comparison_invalid=0, baseline_invalid=0)
- fallbacks: pass (comparison_fallbacks=0, baseline_fallbacks=0)
- latency: pass (challenger_average_latency_ms=9.53, max=250)

- Latency p95 is currently reported as unavailable because the batch summary keeps provider means, not raw per-decision latency samples.
