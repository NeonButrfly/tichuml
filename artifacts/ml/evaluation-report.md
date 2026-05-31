# ML Evaluation Report

- Generated: 2026-05-31T17:18:05.882Z
- Base seed: evaluation
- Backend URL: http://127.0.0.1:4310
- Telemetry enabled: false
- Mirror seats: true
- Git commit: e8c4709b2352b92db04945943b22fe91b6a66ce1
- Model file: C:\tichu\tichuml\ml\model_registry\lightgbm_action_model.txt
- Model version: lightgbm-action-model-20260530101110

## Heuristic Sanity Baseline

- Games: 4, hands: 57, fallbacks: 0, invalid decisions: 0
- Win rates: {"team-0":0,"team-1":1,"tie":0}
- Hand win rates: {"team-0":0.386,"team-1":0.5965,"tie":0.0175}
- Average latency by provider: {"server_heuristic":1.41,"system_local":0.04}

## Comparison Runs

### primary

- Providers: NS=lightgbm_model, EW=server_heuristic, games=4, hands=61
- Win rates: {"team-0":0.75,"team-1":0.25,"tie":0}
- Hand win rates: {"team-0":0.4918,"team-1":0.4426,"tie":0.0656}
- Total score by team: {"team-0":4380,"team-1":2720}
- Tichu call/success: 0.1148 / 0
- Grand Tichu call/success: 0.0492 / 0.3333
- Double victory rate: 0.3115, fallbacks: 0, invalid decisions: 0
- Average latency by provider: {"server_heuristic":6.34,"system_local":0.04,"lightgbm_model":10.6}

### mirror

- Providers: NS=server_heuristic, EW=lightgbm_model, games=4, hands=53
- Win rates: {"team-0":0.25,"team-1":0.75,"tie":0}
- Hand win rates: {"team-0":0.3774,"team-1":0.5849,"tie":0.0377}
- Total score by team: {"team-0":2340,"team-1":4260}
- Tichu call/success: 0.2642 / 0.5714
- Grand Tichu call/success: 0.0943 / 0.4
- Double victory rate: 0.2453, fallbacks: 0, invalid decisions: 0
- Average latency by provider: {"server_heuristic":5.7,"system_local":0.02,"lightgbm_model":8.99}

## Combined Comparison

- lightgbm_model win rate: 0.75 (95% CI [0.4093,0.9285])
- server_heuristic win rate: 0.25 (95% CI [0.0715,0.5907])
- Average score delta (lightgbm_model minus server_heuristic): 447.5
- Average latency: lightgbm_model=9.87 ms, server_heuristic=6.05 ms

## Improvement Gate

- Applied: true, passed: true, challenger: lightgbm_model, baseline: server_heuristic
- sample_size: pass (games=8, required=4)
- beats_baseline: pass (win_rate=0.75, average_score_delta=447.5)
- illegal_actions: pass (comparison_invalid=0, baseline_invalid=0)
- fallbacks: pass (comparison_fallbacks=0, baseline_fallbacks=0)
- latency: pass (challenger_average_latency_ms=9.87, max=250)

- Latency p95 is currently reported as unavailable because the batch summary keeps provider means, not raw per-decision latency samples.
