# Prompts And Workflow Notes

Use milestone-bounded prompts and implementation plans. The repository is no longer in a bootstrap-only state, so prompts should reflect the current milestone stream rather than assuming everything still starts from Milestone 0.

## Prompt Capture System

All gameplay-changing prompts must be captured in GitHub and mirrored here as prompt context only.

- GitHub issue state is authoritative.
- Milestone state is authoritative.
- `docs/prompts/*.md` preserves prompt intent, affected systems, and issue links.
- `docs/prompts/*.md` must not carry separate completion status or shadow backlog state.

Prompt logs:

- [./gameplay.md](./gameplay.md)
- [./ui.md](./ui.md)
- [./ai.md](./ai.md)
- [./rules.md](./rules.md)

Each prompt entry should record:

- date
- prompt signal
- interpreted requirement
- affected systems
- linked GitHub issue
- milestone
- note that status lives in GitHub

## Working Pattern

1. Inspect the repository and summarize the files that matter.
2. Create or update the GitHub issue that will track the prompt-driven change.
3. Identify the active milestone or intentionally document why none applies.
4. Capture the prompt in the relevant `docs/prompts/*.md` file.
5. Make bounded changes with tests.
6. Update docs when the milestone scope or contributor workflow changes.
7. Summarize files changed, validation, and remaining risks.

## Prompt Hygiene

- say which files you expect to change before coding when the task is broad
- keep engine legality changes separate from UI-only changes unless the task truly spans both
- prefer one milestone stream per task
- preserve deterministic behavior and replay safety
- when a prompt changes gameplay, rules, UI meaning, or AI behavior, add or update a prompt entry before calling the work complete
- never use prompt docs as a second issue tracker; link to GitHub instead

## Commit Guidance

When a task results in a milestone commit, follow the naming guidance in [../milestones/README.md](../milestones/README.md):

- `Milestone <id>: <short scope summary>`

Keep the body short and explicit:

- `Why`
- `Changes`
- `Tests`

## Historical Note

The bootstrap prompt in [SPEC](../../spec.md) still captures the original staged-build philosophy. It should now be read as historical scaffolding guidance, not as a command to reset ongoing work back to Milestone 0.
