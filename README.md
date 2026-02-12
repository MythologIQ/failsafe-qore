# FailSafe-Qore

FailSafe-Qore is MythologIQ's Zo-native governance runtime.

[![Node](https://img.shields.io/badge/node-20+-green.svg)](https://nodejs.org)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Status](https://img.shields.io/badge/status-active-2ea44f)](docs/plan_qore_zo_architecture.md)

## What This Repository Is

FailSafe started as extension-coupled governance logic. `FailSafe-Qore` is the extracted runtime that keeps policy, risk, ledger, and decision contracts independent from IDE hosting concerns.

Repository direction:
- Zo-native design: `implemented` for repository-local scope
- Zo-native implementation layers in this repository: `implemented`
- IDE adapter dependency for core runtime: `deferred`

Architecture source of truth: `docs/plan_qore_zo_architecture.md`

## Core Capabilities

- Runtime policy, risk, and ledger engine: `implemented`
- Decision contracts (`DecisionRequest` and `DecisionResponse`): `implemented`
- Local governance API (`/health`, `/policy/version`, `/evaluate`): `implemented`
- Zo MCP governance proxy: `implemented`
- Zo HTTP `/zo/ask` governance proxy: `implemented`
- Zo SSH fallback wrapper and watcher pipeline: `implemented`
- Zo direct model-policy enforcement (required model + allowlist controls): `implemented`
- Zo model recommendation modes (`manual`, `suggest`, `auto`): `implemented`
- Prompt transparency events for direct Zo dispatch (build and send stages): `implemented`
- Actor proof signing, nonce replay protection, and key rotation tooling: `implemented`
- Release gate and Zo assumption freshness checks: `implemented`

## Architecture at a Glance

```mermaid
graph TD
  A[Client or Agent] --> B[Zo MCP Proxy]
  A --> C[Zo HTTP Proxy]
  A --> D[SSH Fallback Wrapper]
  B --> E[Qore Runtime Service]
  C --> E
  D --> E
  E --> F[Policy Engine]
  E --> G[Risk Router]
  E --> H[Ledger Manager]
  B --> I[Zo MCP Upstream]
  C --> J[Zo HTTP Upstream]
```

Design guardrail: Zo-specific behavior stays in adapter layers under `zo/`. Core policy, risk, ledger, and contracts stay adapter-agnostic.

## Repository Layout

| Path | Purpose |
|---|---|
| `@mythologiq/qore-contracts` | Shared schemas, runtime interfaces, and action classification package |
| `policy/` | Policy engine and policy definitions |
| `risk/` | Evaluation routing, novelty, and cache instrumentation |
| `ledger/` | Append-only ledger and integrity verification |
| `runtime/` | Runtime orchestration and local API service |
| `zo/mcp-proxy/` | MCP governance adapter, forwarding, rate limiting, metrics |
| `zo/http-proxy/` | Zo HTTP governance adapter for `/zo/ask` |
| `zo/fallback/` | SSH fallback governance wrapper, identity, watcher pipeline |
| `deploy/systemd/` | Service templates for runtime and fallback watcher |
| `tests/` | Unit and integration validation |
| `docs/` | Phase plans, adversarial reviews, and substantiation artifacts |

## Quick Start

1. Install dependencies:
```bash
npm ci
```
2. Run baseline validation:
```bash
npm run typecheck
npm test
npm run lint
npm run build
```
3. Run full release gate:
```bash
npm run release:gate
```

## Run Local Runtime API

Build first, then start the runtime service:

```bash
npm run build
```

```powershell
$env:QORE_API_KEY="change-me"
node dist/runtime/service/start.js
```

Example evaluation call:

```bash
curl -X POST http://127.0.0.1:7777/evaluate \
  -H "content-type: application/json" \
  -H "x-qore-api-key: change-me" \
  -d '{
    "requestId":"req-1",
    "actorId":"did:myth:test:actor",
    "action":"read",
    "targetPath":"repo://docs/plan_qore_zo_architecture.md"
  }'
```

## Standalone UI (No IDE Required)

FailSafe-Qore serves the full FailSafe extension web UI in standalone mode, so Zo users get the same interface without maintaining a second UI codebase.

1. Start runtime API:
```bash
node dist/runtime/service/start.js
```

2. Sync canonical UI assets from `MythologIQ/failsafe`:
```bash
npm run ui:sync
```

3. Start standalone UI in another terminal:
```bash
node dist/zo/ui-shell/start.js
```

4. Open:
```text
http://127.0.0.1:9380
```

UI env controls:
- `QORE_UI_HOST` (default `127.0.0.1`)
- `QORE_UI_PORT` (default `9380`)
- `QORE_RUNTIME_BASE_URL` (default `http://127.0.0.1:${QORE_API_PORT|7777}`)
- `QORE_UI_TIMEOUT_MS` (default `5000`)
- `QORE_UI_ASSETS_DIR` (default auto-detect, prefers `zo/ui-shell/shared`)
- `QORE_UI_ALLOWED_IPS` (optional comma-separated IP allowlist)
- `QORE_UI_TRUST_PROXY_HEADERS` (default `false`; set `true` only behind trusted reverse proxy)
- `QORE_UI_AUTH_MAX_FAILURES` and `QORE_UI_AUTH_LOCKOUT_MS` (Basic Auth lockout controls)
- `QORE_UI_MFA_MAX_FAILURES` and `QORE_UI_MFA_LOCKOUT_MS` (MFA lockout controls)
- `QORE_UI_REQUIRE_ADMIN_TOKEN` (default `true` on public bind `0.0.0.0`)
- `QORE_UI_ADMIN_TOKEN` (required when admin token mode is enabled)

One-command local stack (runtime + UI):

```bash
npm run zo:one-click
```

By default, `/` serves the full extension UI. For the compact diagnostic shell, use `/?ui=compact`.

Stop:

```bash
npm run zo:stop
```

## Operational Tooling

- Rotate actor keys:
```bash
npm run keys:rotate
```
- Verify Zo assumption evidence freshness:
```bash
npm run assumptions:check
```
- Start fallback watcher from built output:
```bash
node dist/zo/fallback/start-watcher.js
```

## UI Transparency Contract

Your existing intent package output area is sufficient if it renders prompt-transparency payloads.
Use `runtime/api/PromptTransparencyView.ts` to map ledger payloads (`type: prompt_transparency`) into a stable UI view model.

Model selection behavior for Zo direct mode:
- `manual`: use provided model only.
- `suggest`: preserve provided model and emit recommendation metadata.
- `auto`: select model automatically from catalog and attach a warning banner.

Recommendation metadata includes token-efficiency and cost-savings signals:
- estimated input and output tokens
- estimated selected-model cost
- baseline-model cost
- projected cost saved (USD and percent)
- token utilization percent

These values are exposed for both Zo and extension surfaces through runtime API exports (`recommendModel`, `ZoModelSelectionResult`) and Zo response headers (`x-qore-model-*`).

## Zo Install and Bootstrap

Use one of these paths depending on host type:

- Zo workspace host (no systemd): use Zo user service registration.
- Standard Linux VM with systemd: use bootstrap service scripts.

Zo user service path (recommended on Zo):

```bash
export QORE_UI_BASIC_AUTH_USER="admin"
export QORE_UI_BASIC_AUTH_PASS="change-this-password"
eval "$(npm run -s ui:mfa:secret | grep '^QORE_UI_TOTP_SECRET=')"
npm ci
npm run build
bash deploy/zo/one-click-services.sh
```

Single-file Zo/Linux installer (recommended for distribution):

```bash
bash deploy/zo/install-zo-full.sh
```

This installer is Zo-specific and will:
- clone/update repository
- install dependencies
- sync full shared UI
- build runtime and UI host
- generate missing API/Auth/MFA/Admin secrets
- register `qore-runtime` and `qore-ui` user services

Installer options:
- `--non-interactive` for automation mode
- `--config <path>` to load predefined values
- `--write-config <path>` to persist resolved values
- `--force-reconfigure` to recreate existing service labels

Update path (after initial install):

```bash
npm run zo:update:dry-run
npm run zo:update
```

Updater behavior:
- fetches latest `origin/main`
- snapshots runtime state under `.failsafe/backups`
- applies fast-forward update
- runs verification gates (`typecheck`, `test`, `lint`, `build`)
- re-registers services
- rolls back to previous commit and state snapshot on failure

Manual Zo service registration equivalent:

```bash
register_user_service \
  --label "qore-runtime" \
  --protocol "http" \
  --local-port 7777 \
  --workdir "/home/workspace/MythologIQ/FailSafe-Qore" \
  --entrypoint "node dist/runtime/service/start.js" \
  --env-vars "QORE_API_HOST=0.0.0.0,QORE_API_PORT=7777"

register_user_service \
  --label "qore-ui" \
  --protocol "http" \
  --local-port 9380 \
  --workdir "/home/workspace/MythologIQ/FailSafe-Qore" \
  --entrypoint "node dist/zo/ui-shell/start.js" \
  --env-vars "QORE_UI_HOST=0.0.0.0,QORE_UI_PORT=9380,QORE_RUNTIME_BASE_URL=http://127.0.0.1:7777,QORE_UI_ASSETS_DIR=/home/workspace/MythologIQ/FailSafe-Qore/zo/ui-shell/shared,QORE_UI_REQUIRE_AUTH=true,QORE_UI_REQUIRE_MFA=true,QORE_UI_BASIC_AUTH_USER=admin,QORE_UI_BASIC_AUTH_PASS=change-this-password,QORE_UI_TOTP_SECRET=replace-with-base32-secret,QORE_UI_ADMIN_TOKEN=replace-with-admin-token"
```

MFA bootstrap:
- Run `npm run ui:mfa:secret` and copy `OTPAuthURL` into your authenticator app (1Password, Authy, Google Authenticator, iOS Passwords).
- Login flow becomes: Basic Auth (username/password), then TOTP step at `/mfa`.
- Security admin endpoints:
  - `GET /api/admin/security` (auth posture and active session count)
  - `GET /api/admin/sessions` (active MFA session inventory)
  - `GET /api/admin/devices` (grouped device/session inventory)
  - `POST /api/admin/sessions/revoke` with `{ "all": true }`, `{ "sessionId": "<tokenId>" }`, or `{ "deviceId": "<deviceId>" }`
  - `POST /api/admin/mfa/recovery/reset` with `{ "confirm": "RESET_MFA" }` (rotate TOTP secret and revoke all sessions)

Control-plane baseline (`qorectl`):
- `npm run qorectl:doctor`
- `npm run qorectl:sessions`
- `npm run qorectl:devices`
- `npm run qorectl:revoke-all-sessions`
- `npm run qorectl:mfa-reset`
- `QORE_UI_ADMIN_TOKEN` is required for session revocation automation.

Resilience operations:
- `npm run zo:backup` to snapshot ledger/replay/auth installer state under `.failsafe/backups/`
- `npm run zo:backups` to list available snapshots
- `npm run zo:restore:dry-run -- --from <backupDir>` to validate restore inputs
- `node scripts/zo-resilience.mjs restore --from <backupDir> --confirm RESTORE` to apply restore
- `npm run zo:update:dry-run` to check if upstream update is available
- `npm run zo:update` to apply rollback-safe repository update

Systemd bootstrap path (non-Zo Linux hosts):

```bash
sudo bash deploy/zo/take-this-and-go.sh
```

Bootstrap script:
- pulls repository from GitHub
- installs dependencies
- builds runtime
- installs and starts systemd services
- creates `/etc/failsafe-qore/env` from `deploy/zo/env.example`

Optional upload bundle path from Windows:

```powershell
npm run zo:bundle
```

Then upload `dist/failsafe-qore-zo-bundle.tgz` to Zo and extract under `/opt/failsafe-qore` before running `deploy/zo/bootstrap-zo.sh`.

Quick handoff doc: `deploy/zo/TAKE_THIS_AND_GO.md`.

## Controlled Release

Create versioned release artifacts locally:

```bash
npm run release:artifacts
```

Output:
- `dist/release/vX.Y.Z/failsafe-qore-zo-bundle-vX.Y.Z.tgz`
- `dist/release/vX.Y.Z/SHA256SUMS`
- `dist/release/vX.Y.Z/TAKE_THIS_AND_GO.md`
- `dist/release/vX.Y.Z/RELEASE_NOTES.md`

Verify before install:

```bash
sha256sum -c SHA256SUMS
```

Tag push (`v*`) also triggers GitHub release artifact publishing via `.github/workflows/release-artifacts.yml`.

## Documentation Map

- Architecture plan: `docs/plan_qore_zo_architecture.md`
- Assumption gates: `docs/ZO_ASSUMPTIONS_AND_GATES.md`
- Zo public skills policy: `docs/ZO_PUBLIC_SKILLS_REFERENCE.md`
- Documentation status map: `docs/DOCUMENTATION_STATUS.md`
- Bootstrap checks: `docs/BOOTSTRAP_CHECKLIST.md`
- Phase 4 substantiation: `docs/phase4_substantiation.md`
- Phase 5 substantiation: `docs/phase5_substantiation.md`
- Phases 6-9 adversarial record: `docs/adversarial_review_phase6_phase9.md`
- Full docs index: `docs/README.md`

## Claim-to-Source Map

| Claim | Status | Source |
|---|---|---|
| Runtime coordinator exists | `implemented` | `runtime/service/QoreRuntimeService.ts:23` |
| Local API enforces API key by default | `implemented` | `runtime/service/LocalApiServer.ts:25` |
| Contract package is externalized and consumed as dependency | `implemented` | `package.json:28` |
| Zo MCP proxy enforces signed actor context | `implemented` | `zo/mcp-proxy/server.ts:170` |
| Zo HTTP proxy implements policy preflight for `/zo/ask` | `implemented` | `zo/http-proxy/server.ts:62` |
| Zo direct adapters enforce model policy before dispatch | `implemented` | `zo/http-proxy/server.ts:317`, `zo/mcp-proxy/server.ts:566` |
| Prompt transparency events are emitted for build/dispatch stages | `implemented` | `zo/prompt-transparency.ts:1`, `zo/http-proxy/server.ts:342`, `zo/mcp-proxy/server.ts:591` |
| Replay protection supports SQLite shared strategy | `implemented` | `zo/security/replay-store.ts:70` |
| Release gate script runs typecheck, lint, test, build, assumptions check | `implemented` | `scripts/release-gate.mjs:4` |
| CI includes baseline checks and release-readiness workflow | `implemented` | `.github/workflows/ci.yml:1`, `.github/workflows/release-readiness.yml:1` |

## License

MIT. See `LICENSE`.
