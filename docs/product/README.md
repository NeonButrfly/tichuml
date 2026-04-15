# Product Docs

This project is a playable digital Tichu client and experimentation platform, not just a card-layout demo.

## Current Product Surfaces

- a live four-seat Tichu table with deterministic engine-backed gameplay
- AI-supported seats and headless simulation coverage
- explicit exchange, pickup, trick-play, and scoring phases
- a table editor for pass-lane and surface layout tuning
- a hamburger menu for operational tools such as editor access, hotkeys, help, debug toggles, and random-source inspection
- dialogs for rules/help, hotkeys, and entropy/debug inspection

## Gameplay UX Principles

- every phase should have dedicated UI, not a blurred mixture of unrelated prompts
- the local player should see only the actions that are currently legal
- exchange/pass flows should stay separate from trick-play flows
- exchange resolution should stop at an explicit local Pickup step before trick play begins
- clicking the score should expose cumulative hand history without disturbing active gameplay
- score, history, and debug surfaces should be inspectable without disturbing the game state
- AI automation should advance AI-only work without forcing unnecessary clicks

## Product Boundaries

- game legality lives in the engine
- responsive table fit lives in the web client
- external entropy collection lives on the server
- telemetry and replay support remain append-only and deterministic

Gameplay-changing prompts should be captured in [../prompts/gameplay.md](../prompts/gameplay.md) or [../prompts/rules.md](../prompts/rules.md) and linked to GitHub issues before implementation.

Use this document as the short product-facing summary. Use [SPEC](../../spec.md) for the full contract.
