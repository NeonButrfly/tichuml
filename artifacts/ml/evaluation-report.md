# ML Evaluation Report

- Generated: 2026-05-30T12:52:15.718Z
- Base seed: evaluation
- Backend URL: http://127.0.0.1:4311
- Telemetry enabled: false
- Mirror seats: true
- Git commit: 57e7c2cbcb917c4da8534a6373d682e769e729e2
- Model file: C:\tichu\tichuml\ml\model_registry\lightgbm_action_model.txt
- Model version: lightgbm-action-model-20260530101110

## Heuristic Sanity Baseline

- Games: 4, hands: 57, fallbacks: 0, invalid decisions: 0
- Win rates: {"team-0":0,"team-1":1,"tie":0}
- Hand win rates: {"team-0":0.386,"team-1":0.5965,"tie":0.0175}
- Average latency by provider: {"server_heuristic":1.77,"system_local":0.08}

## Comparison Runs

### primary

- Providers: NS=lightgbm_model, EW=server_heuristic, games=4, hands=37
- Win rates: {"team-0":0,"team-1":1,"tie":0}
- Hand win rates: {"team-0":0.1351,"team-1":0.8378,"tie":0.027}
- Total score by team: {"team-0":185,"team-1":4315}
- Tichu call/success: 0.4054 / 0.3333
- Grand Tichu call/success: 0.0811 / 0.3333
- Double victory rate: 0.4054, fallbacks: 0, invalid decisions: 0
- Average latency by provider: {"server_heuristic":6.4,"system_local":0.06,"lightgbm_model":9.9}

### mirror

- Providers: NS=server_heuristic, EW=lightgbm_model, games=4, hands=42
- Win rates: {"team-0":1,"team-1":0,"tie":0}
- Hand win rates: {"team-0":0.6429,"team-1":0.3333,"tie":0.0238}
- Total score by team: {"team-0":4410,"team-1":1190}
- Tichu call/success: 0.3571 / 0.4
- Grand Tichu call/success: 0.0952 / 0.5
- Double victory rate: 0.4048, fallbacks: 0, invalid decisions: 0
- Average latency by provider: {"server_heuristic":6.1,"system_local":0.02,"lightgbm_model":8.86}

## Combined Comparison

- lightgbm_model win rate: 0 (95% CI [0,0.3244])
- server_heuristic win rate: 1 (95% CI [0.6756,1])
- Average score delta (lightgbm_model minus server_heuristic): -918.75
- Average latency: lightgbm_model=9.35 ms, server_heuristic=6.24 ms

## Improvement Gate

- Applied: true, passed: false, challenger: lightgbm_model, baseline: server_heuristic
- sample_size: pass (games=8, required=4)
- beats_baseline: fail (win_rate=0, average_score_delta=-918.75)
- illegal_actions: pass (comparison_invalid=0, baseline_invalid=0)
- fallbacks: pass (comparison_fallbacks=0, baseline_fallbacks=0)
- latency: pass (challenger_average_latency_ms=9.35, max=250)

- Latency p95 is currently reported as unavailable because the batch summary keeps provider means, not raw per-decision latency samples.
