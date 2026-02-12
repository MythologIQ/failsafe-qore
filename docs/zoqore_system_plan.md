# ZoQore System Plan

## Purpose

Define ZoQore as the system-level product layer built on FailSafe-Qore runtime roots.

Status:
- Product-system planning baseline: `implemented`
- Runtime-root continuity (`FailSafe-Qore`): `locked`
- Functional-first execution posture: `locked`

## Boundary Model

1. Runtime roots remain in this repository under existing core domains:
- `policy/`
- `risk/`
- `ledger/`
- `runtime/`
- `zo/`

2. Product layer (`ZoQore`) is established as system behavior and operational surfaces:
- Control plane (`qorectl`, setup/install flows)
- Operations console and admin controls
- Release and migration lifecycle

3. Branding is secondary for this execution track.
- Functional correctness, hardening, and operability remain priority.

## System Objectives

1. Deliver one-command, production-safe Zo installation and operation. `in_progress`
2. Provide control-plane commands for install, doctor, and security operations. `implemented` 
3. Enforce hardened access controls for public UI surfaces. `implemented`
4. Establish adversarial iteration loop with explicit pass/fail state. `in_progress`
5. Preserve core governance behavior and runtime contract stability. `locked`

## Phase Plan

### Phase A: Planning and Gates

Deliverables:
- System plan and acceptance gates
- Initial Sprint-1 implementation scope and checkpoints

Status: `implemented`

### Phase B: Control Plane Baseline

Deliverables:
- `qorectl doctor` for runtime/UI/service posture checks
- `qorectl revoke-sessions` for security response operations
- installer integration guidance

Status: `implemented`

### Phase C: Security and Admin Operations

Deliverables:
- session/device trust management controls
- MFA recovery and re-enrollment path
- hardened admin endpoint coverage

Status: `implemented`

### Phase D: Operational Resilience

Deliverables:
- backup/restore lifecycle commands
- rollback-safe upgrade path
- migration hooks and release integrity checks

Status: `in_progress`

### Phase E: Substantiation

Deliverables:
- release-grade substantiation artifact
- adversarial loop pass-state evidence
- handoff-ready operator runbook

Status: `planned`

## Sprint 3 Scope (Current)

1. Implement backup lifecycle for ledger/replay/auth installer state. `implemented`
2. Implement restore path with checksum verification and explicit confirmation. `implemented`
3. Add operator commands and docs for resilience workflows. `implemented`
4. Validate via typecheck, tests, lint, and build. `pending`
5. Record adversarial findings against Sprint 3 resilience surfaces. `pending`

## Out of Scope (Sprint 3)

- visual rebrand sweep
- multi-node distributed session store
- backup/restore implementation
- upgrade migration orchestration

## Success Criteria (Sprint 3)

1. Resilience backup/restore commands are available and documented.
2. Restore flow rejects missing manifest, missing files, and checksum mismatches.
3. Backup assets are isolated under `.failsafe/backups` and do not include build artifacts.
4. Typecheck/tests/lint/build pass after changes.

## Sprint 4 Scope (Current)

1. Implement rollback-safe repo auto-update flow for Zo deployments. `implemented`
2. Integrate update flow with existing backup/restore and installer reconfigure path. `implemented`
3. Add operator docs for update dry-run and execution mode. `implemented`
4. Validate via typecheck/tests/lint/build and script syntax checks. `pending`
5. Record adversarial findings against updater safety model. `pending`
