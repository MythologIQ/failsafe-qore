# Take This and Go

This bundle installs `FailSafe-Qore` on a Zo Linux host.

For Zo workspaces, use Zo user service mode (recommended). Systemd mode is only for non-Zo Linux hosts that run systemd as PID 1.

## Option 1 (Recommended): Zo User Service

```bash
git clone https://github.com/MythologIQ/failsafe-qore.git FailSafe-Qore
cd FailSafe-Qore
export QORE_UI_BASIC_AUTH_USER="admin"
export QORE_UI_BASIC_AUTH_PASS="change-this-password"
eval "$(npm run -s ui:mfa:secret | grep '^QORE_UI_TOTP_SECRET=')"
bash deploy/zo/one-click-services.sh
```

`one-click-services.sh` syncs the canonical full UI from `MythologIQ/failsafe` before building and registering services.

## Option 0 (Preferred for handoff): Full Installer File

```bash
git clone https://github.com/MythologIQ/failsafe-qore.git FailSafe-Qore
cd FailSafe-Qore
bash deploy/zo/install-zo-full.sh
```

This performs complete Zo install and service registration with:
- interactive config wizard
- full runtime/UI build
- Basic Auth + MFA + admin-token generation (if not provided)
- health check
- optional persisted config file (`.failsafe/zo-installer.env`)

Automation mode:

```bash
bash deploy/zo/install-zo-full.sh --non-interactive --config /path/to/zo-installer.env
```

Reconfigure existing service labels:

```bash
bash deploy/zo/install-zo-full.sh --force-reconfigure
```

Manual equivalent:

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

MFA note:
- Use `npm run ui:mfa:secret` and enroll `OTPAuthURL` in your authenticator app.
- First load prompts Basic Auth, then redirects to `/mfa` for 6-digit TOTP verification.
- Optional hardening env vars:
  - `QORE_UI_ALLOWED_IPS=203.0.113.10,198.51.100.14`
  - `QORE_UI_TRUST_PROXY_HEADERS=false` (set true only behind trusted proxy)
  - `QORE_UI_AUTH_MAX_FAILURES=6`, `QORE_UI_AUTH_LOCKOUT_MS=900000`
  - `QORE_UI_MFA_MAX_FAILURES=6`, `QORE_UI_MFA_LOCKOUT_MS=900000`
  - `QORE_UI_ADMIN_TOKEN=<hex-token>` for control-plane admin automation

Control-plane commands:

```bash
npm run qorectl:doctor
QORE_UI_ADMIN_TOKEN="<admin-token>" npm run qorectl:sessions
QORE_UI_ADMIN_TOKEN="<admin-token>" npm run qorectl:devices
QORE_UI_ADMIN_TOKEN="<admin-token>" npm run qorectl:revoke-all-sessions
QORE_UI_ADMIN_TOKEN="<admin-token>" npm run qorectl:mfa-reset
```

Admin endpoints:
- `GET /api/admin/security`
- `GET /api/admin/sessions`
- `GET /api/admin/devices`
- `POST /api/admin/sessions/revoke` with `all`, `sessionId`, or `deviceId`
- `POST /api/admin/mfa/recovery/reset` with `confirm=RESET_MFA`

Resilience commands:

```bash
npm run zo:backup
npm run zo:backups
npm run zo:restore:dry-run -- --from /path/to/.failsafe/backups/<timestamp>
node scripts/zo-resilience.mjs restore --from /path/to/.failsafe/backups/<timestamp> --confirm RESTORE
```

Auto-update commands:

```bash
npm run zo:update:dry-run
npm run zo:update
```

`zo:update` runs backup, repo fast-forward, verification, service re-registration, and rollback on failure.

## Option 2: Process Mode (No Service)

```bash
cd /home/workspace/MythologIQ/FailSafe-Qore
export QORE_API_KEY="<your-key>"
bash deploy/zo/one-click-standalone.sh
```

`one-click-standalone.sh` also syncs the full UI automatically.

Stop:

```bash
bash deploy/zo/stop-standalone.sh
```

Standalone UI (process mode):

```bash
# included in one-click-standalone.sh
```

## Option 3: Systemd Bootstrap (Non-Zo Linux Only)

Use only when `cat /proc/1/comm` returns `systemd`.

```bash
sudo bash deploy/zo/take-this-and-go.sh
```

## Optional: Upload Bundle Flow

From Windows:

```powershell
npm run zo:bundle
```

Upload `dist/failsafe-qore-zo-bundle.tgz` to Zo host, extract, then run:

```bash
cd /home/workspace/MythologIQ/FailSafe-Qore
bash deploy/zo/register-user-service.sh
```

## After Install

Set secrets and verify health:

- `QORE_API_KEY`

Then:

```bash
service_doctor qore-runtime
curl -H "x-qore-api-key: $QORE_API_KEY" http://127.0.0.1:7777/health
service_doctor qore-ui
```
