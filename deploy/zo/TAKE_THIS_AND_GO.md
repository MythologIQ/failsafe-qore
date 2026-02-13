# Zo Install Guide (Zo-Qore 1.0)

Repository:

- `https://github.com/MythologIQ/failsafe-qore`

This document is the fastest path to a working Zo-Qore installation, with explicit troubleshooting.

## 1) Recommended Path: Full Zo Installer

Run these commands in Zo terminal:

```bash
git clone https://github.com/MythologIQ/failsafe-qore.git Zo-Qore
cd Zo-Qore
bash deploy/zo/install-zo-full.sh
```

Installer prompt behavior (`implemented`):

- The installer is interactive by default and prompts for values like `Repository URL`.
- Press `Enter` to accept the default shown in brackets (example: `Repository URL [https://github.com/MythologIQ/failsafe-qore.git]:`).
- Use `--non-interactive` to skip prompts entirely.
- In interactive mode, the installer rotates sensitive secrets by default and does not prompt to keep existing ones.
- Writing `zo-installer.env` is opt-in only via `--write-config` because it stores resolved secrets.

What this installer does:

- installs dependencies
- builds runtime and UI
- syncs UI assets
- configures auth, MFA, and admin token
- registers Zo user services (`qore-runtime`, `qore-ui`)
- performs health checks

## 2) One-Minute Verification

```bash
service_doctor qore-runtime
service_doctor qore-ui
curl -H "x-qore-api-key: $QORE_API_KEY" http://127.0.0.1:7777/health
```

Open:

- `https://<your-qore-ui-service>.zocomputer.io/ui/console`
- `https://<your-qore-ui-service>.zocomputer.io/ui/monitor`

## 3) Non-Interactive Install (Automation)

```bash
bash deploy/zo/install-zo-full.sh --non-interactive --config /path/to/zo-installer.env
```

Reconfigure existing service labels:

```bash
bash deploy/zo/install-zo-full.sh --force-reconfigure
```

## 4) If You Prefer Process Mode (No Zo Service Registration)

```bash
cd /home/workspace/MythologIQ/Zo-Qore
export QORE_API_KEY="<your-key>"
bash deploy/zo/one-click-standalone.sh
```

Stop:

```bash
bash deploy/zo/stop-standalone.sh
```

## 5) Troubleshooting

### Error: `missing required command: register_user_service`

Cause:

- Zo user service registration is not available in your environment.
- This can happen due to security restrictions, permission settings, or environment configuration.

Fix:

- The installer now provides a **Zo Native AI handoff prompt** when `register_user_service` is unavailable.
- Copy the prompt from the installer output and paste it into your Zo native AI.
- The Zo native AI will complete the service registration for you.

**Steps:**

1. Run the installer:

   ```bash
   bash deploy/zo/install-zo-full.sh
   ```

2. When the installer shows the "ZO NATIVE AI SETUP HANDOFF" message, copy the prompt

3. Paste the prompt into your Zo native AI

4. The Zo native AI will register the services and verify they are healthy

Security hardening for handoff (`implemented`):

- The installer writes handoff secrets to `./.failsafe/zo-native-ai.env` with `0600` permissions.
- The handoff prompt references `source ./.failsafe/zo-native-ai.env` instead of printing plaintext secrets.
- After service registration completes, remove the handoff file:

```bash
rm -f .failsafe/zo-native-ai.env
```

- If any terminal/log capture occurred during setup, rotate all generated secrets before enabling runtime.

**Alternative: Standalone Mode**

If you prefer not to use Zo native AI, you can run services in standalone mode:

```bash
cd /home/workspace/MythologIQ/Zo-Qore
export QORE_API_KEY="replace-with-strong-secret"
bash deploy/zo/one-click-standalone.sh
```

**Note:** In standalone mode, services do NOT auto-restart on Zo reboot. To restart services:

```bash
bash deploy/zo/one-click-standalone.sh
```

### Error: `System has not been booted with systemd as init system`

Cause:

- Zo environment uses non-systemd init.

Fix:

- Do not use systemd bootstrap in Zo.
- Use `deploy/zo/install-zo-full.sh` or `deploy/zo/one-click-services.sh`.

### Error: destination path exists and is not empty

Cause:

- install directory already contains files.

Fix:

```bash
rm -rf /home/workspace/MythologIQ/Zo-Qore
git clone https://github.com/MythologIQ/failsafe-qore.git Zo-Qore
cd Zo-Qore
bash deploy/zo/install-zo-full.sh
```

### UI route returns `{"error":"NOT_FOUND","message":"Asset not found"}`

Cause:

- UI assets were not synced or stale.

Fix:

```bash
cd /home/workspace/MythologIQ/Zo-Qore
npm run ui:sync
npm run build
```

Then restart the UI service.

### Runtime unreachable at `127.0.0.1:7777`

Cause:

- runtime service failed or missing API key.

Fix:

1. Confirm `QORE_API_KEY` is set in runtime service env.
2. Check logs:

```bash
service_logs qore-runtime --tail 200
```

3. Restart service and retest health.

### Login works but MFA fails

Cause:

- wrong TOTP secret enrollment or expired code.

Fix:

1. Rotate MFA secret:

```bash
npm run ui:mfa:secret
```

2. Re-enroll `OTPAuthURL` in authenticator app.
3. Retry with current 6-digit code.

### Locked out after repeated auth attempts

Cause:

- auth/MFA lockout thresholds reached.

Fix:

- wait lockout window, or adjust:
  - `QORE_UI_AUTH_MAX_FAILURES`
  - `QORE_UI_AUTH_LOCKOUT_MS`
  - `QORE_UI_MFA_MAX_FAILURES`
  - `QORE_UI_MFA_LOCKOUT_MS`

## 6) Security Hardening (Recommended)

- set strong `QORE_API_KEY`
- set strong `QORE_UI_BASIC_AUTH_USER` and `QORE_UI_BASIC_AUTH_PASS`
- require MFA (`QORE_UI_REQUIRE_MFA=true`)
- configure `QORE_UI_ADMIN_TOKEN`
- optionally restrict IPs with `QORE_UI_ALLOWED_IPS`

## 7) Update and Rollback-Safe Maintenance

```bash
npm run zo:update:dry-run
npm run zo:update
```

Backups and restore:

```bash
npm run zo:backup
npm run zo:backups
npm run zo:restore:dry-run -- --from /path/to/.failsafe/backups/<timestamp>
node scripts/zo-resilience.mjs restore --from /path/to/.failsafe/backups/<timestamp> --confirm RESTORE
```

## 8) Agent-Assisted Setup Prompt

If you want a Zo in-app agent to run setup for you, use:

- `deploy/zo/AGENT_SETUP_PROMPT.md`

## 9) Uninstall and Legacy Test Cleanup

Remove active Zo-Qore services plus current install directory:

```bash
cd /home/workspace/MythologIQ/Zo-Qore
bash deploy/zo/install-zo-full.sh --uninstall
```

Also remove first-test bootstrap artifacts (`/opt/failsafe-qore-test*` and `/etc/failsafe-qore-test`):

```bash
cd /home/workspace/MythologIQ/Zo-Qore
bash deploy/zo/install-zo-full.sh --uninstall --cleanup-legacy-test
```

Non-interactive mode:

```bash
bash deploy/zo/install-zo-full.sh --non-interactive --uninstall --cleanup-legacy-test
```
