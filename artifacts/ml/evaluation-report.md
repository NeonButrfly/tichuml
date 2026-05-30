# ML Evaluation Report

- Generated: 2026-05-30T08:24:46.527Z
- Base seed: evaluation
- Backend URL: http://127.0.0.1:4310
- Telemetry enabled: false
- Mirror seats: true
- Git commit: b062f51de3e4a4ceab93d4544c55ff733ce92325
- Model file: C:\tichu\tichuml\ml\model_registry\lightgbm_action_model.txt
- Model version: lightgbm-action-model-20260530081415

## Heuristic Sanity Baseline

- Games: 2, hands: 30, fallbacks: 0, invalid decisions: 0
- Win rates: {"team-0":0,"team-1":1,"tie":0}
- Hand win rates: {"team-0":0.3667,"team-1":0.6,"tie":0.0333}
- Average latency by provider: {"server_heuristic":1.92,"system_local":0.09}

## Comparison Runs

### primary

- Providers: NS=lightgbm_model, EW=server_heuristic, games=2, hands=17
- Win rates: {"team-0":0,"team-1":1,"tie":0}
- Hand win rates: {"team-0":0.1176,"team-1":0.8824,"tie":0}
- Total score by team: {"team-0":-55,"team-1":2255}
- Tichu call/success: 0.1765 / 0
- Grand Tichu call/success: 0.0588 / 0
- Double victory rate: 0.5882, fallbacks: 0, invalid decisions: 0
- Average latency by provider: {"server_heuristic":7.1,"system_local":0.06,"lightgbm_model":12.08}

### mirror

- Providers: NS=server_heuristic, EW=lightgbm_model, games=2, hands=15
- Win rates: {"team-0":1,"team-1":0,"tie":0}
- Hand win rates: {"team-0":0.7333,"team-1":0.1333,"tie":0.1333}
- Total score by team: {"team-0":2030,"team-1":170}
- Tichu call/success: 0.2667 / 0.5
- Grand Tichu call/success: 0.1333 / 0
- Double victory rate: 0.7333, fallbacks: 0, invalid decisions: 0
- Average latency by provider: {"server_heuristic":6.82,"system_local":0.02,"lightgbm_model":9.61}

## Combined Comparison

- lightgbm_model win rate: 0 (95% CI [0,0.4899])
- server_heuristic win rate: 1 (95% CI [0.5101,1])
- Average score delta (lightgbm_model minus server_heuristic): -1042.5
- Average latency: lightgbm_model=10.95 ms, server_heuristic=6.97 ms

## Improvement Gate

- Applied: true, passed: false, challenger: lightgbm_model, baseline: server_heuristic
- sample_size: pass (games=4, required=2)
- beats_baseline: fail (win_rate=0, average_score_delta=-1042.5)
- illegal_actions: pass (comparison_invalid=0, baseline_invalid=0)
- fallbacks: pass (comparison_fallbacks=0, baseline_fallbacks=0)
- latency: pass (challenger_average_latency_ms=10.95, max=250)

- Latency p95 is currently reported as unavailable because the batch summary keeps provider means, not raw per-decision latency samples.
