# Documentation Index

Use this folder as the canonical human-facing map of the project.

## Core References

- [../spec.md](../spec.md) - master specification, architecture goals, and milestone plan
- [./milestones/README.md](./milestones/README.md) - normalized milestone history and commit-subject guidance
- [./issues/README.md](./issues/README.md) - GitHub issue tracking entrypoint and legacy local-issue archive map
- [./issues-archived/README.md](./issues-archived/README.md) - archived pre-GitHub local issue notes kept only as historical migration context
- [./architecture/README.md](./architecture/README.md) - package boundaries, authoritative systems, and runtime data flow
- [./product/README.md](./product/README.md) - gameplay surfaces and user-facing flows
- [./ui/README.md](./ui/README.md) - table layout, interaction, dialog, and responsiveness guidance
- [./telemetry/README.md](./telemetry/README.md) - telemetry, replay, and seed provenance notes
- [./runtime_control_panel.md](./runtime_control_panel.md) - Linux backend lifecycle scripts, runtime control panel, and config apply flow
- [./prompts/README.md](./prompts/README.md) - prompt capture workflow, prompt logs, and GitHub-linked implementation guidance
- [./prompts/backend.md](./prompts/backend.md) - backend/platform prompt capture linked to issue [#30](https://github.com/NeonButrfly/tichuml/issues/30)
- [./project-tracking-trueup.md](./project-tracking-trueup.md) - historical reconciliation audit; live backlog state remains in GitHub

## How To Use These Docs

- Start with [SPEC](../spec.md) when you need the full product contract.
- Use [Milestones](./milestones/README.md) when planning or naming milestone work.
- Treat GitHub Issues and GitHub Milestones as the source of truth for tracking state.
- Capture gameplay-changing prompts in [./prompts/README.md](./prompts/README.md) and the appropriate `docs/prompts/*.md` file, but keep issue status and milestone state in GitHub only.
- Use the discipline-specific docs before touching the engine, UI, or telemetry pipeline.
- Keep docs synchronized with behavior when milestone scope or contributor workflow changes.
