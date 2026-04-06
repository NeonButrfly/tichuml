# Prompts And Workflow Notes

Use milestone-bounded prompts and implementation plans. The repository is no longer in a bootstrap-only state, so prompts should reflect the current milestone stream rather than assuming everything still starts from Milestone 0.

## Working Pattern

1. Inspect the repository and summarize the files that matter.
2. Identify the active milestone or sub-milestone.
3. Make bounded changes with tests.
4. Update docs when the milestone scope or contributor workflow changes.
5. Summarize files changed, validation, and remaining risks.

## Prompt Hygiene

- say which files you expect to change before coding when the task is broad
- keep engine legality changes separate from UI-only changes unless the task truly spans both
- prefer one milestone stream per task
- preserve deterministic behavior and replay safety

## Commit Guidance

When a task results in a milestone commit, follow the naming guidance in [../milestones/README.md](../milestones/README.md):

- `Milestone <id>: <short scope summary>`

Keep the body short and explicit:

- `Why`
- `Changes`
- `Tests`

## Historical Note

The bootstrap prompt in [SPEC](../../spec.md) still captures the original staged-build philosophy. It should now be read as historical scaffolding guidance, not as a command to reset ongoing work back to Milestone 0.
