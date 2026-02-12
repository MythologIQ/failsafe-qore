# ZoQore Adversarial Review: Sprint 4

## Scope

- Repository updater in `deploy/zo/update-from-repo.sh`
- Package command wiring in `package.json`
- Operator guidance updates in `README.md` and `deploy/zo/TAKE_THIS_AND_GO.md`

## Findings

1. `high`: Automatic update can leave host in partial state if verification fails after pull.
- Remediation: update flow stores pre-update commit and rollback snapshot, then performs code and state rollback on failure.
- Status: `closed`

2. `medium`: Updating with local uncommitted changes can produce ambiguous merge or rollback behavior.
- Remediation: updater blocks dirty working tree by default; explicit override requires `--allow-dirty`.
- Status: `closed`

3. `medium`: Missing installer config can block deterministic service re-registration during update.
- Remediation: updater prefers `.failsafe/zo-installer.env` or explicit `--config`; otherwise falls back to one-click service registration when supported.
- Status: `closed`

## Validation Evidence

- `bash -n deploy/zo/update-from-repo.sh`: pass
- `npm run typecheck`: pass
- `npm test -- --run tests/zo.resilience.test.ts tests/zo.ui.shell.test.ts tests/zo.ui.mfa.test.ts`: pass
- `npm run lint`: pass
- `npm run build`: pass

## Pass State

- Open `high` findings: `0`
- Open `medium` findings: `0`
- Gate decision: `PASS`
