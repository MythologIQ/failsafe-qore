# Private Workspace Policy

Zo-Qore workspace rule (`implemented`):

- Always create a top-level `PRIVATE/` folder in the workspace.
- Keep isolated content under:
  - `PRIVATE/docs`
  - `PRIVATE/scripts`
  - `PRIVATE/tests`

Use `PRIVATE/` for anything not required by contributors or end users, including:

- incident feedback containing environment-specific details
- security assessments with sensitive operational context
- local deployment status snapshots
- temporary postmortems, run logs, and ad hoc test artifacts
- one-off hardening scripts or reproduction scripts

`PRIVATE/` is gitignored and must not be committed.

Legacy compatibility:

- `docs-private/` remains ignored for local backward compatibility.
- New isolated content should use `PRIVATE/`.

Keep contributor and user documentation in `docs/` and reference only those files from `README.md` and `docs/README.md`.
