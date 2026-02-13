# Zo Agent Prompt: Install FailSafe-Qore For Me

Copy and paste this into your Zo in-app agent:

```text
You are my Zo setup operator. Perform a full installation of FailSafe-Qore in this workspace and do not stop until verification is complete.

Repository:
https://github.com/MythologIQ/failsafe-qore

Install target:
/home/workspace/MythologIQ/Zo-Qore

Required behavior:
1) Clone repository into the target path.
2) Run the full installer:
   bash deploy/zo/install-zo-full.sh
3) If prompted for config values, use secure random values and print them in a final summary block.
4) Ensure both services are registered and healthy:
   - qore-runtime
   - qore-ui
5) Validate runtime health with:
   curl -H "x-qore-api-key: <value>" http://127.0.0.1:7777/health
6) Print final URLs for:
   - /ui/console
   - /ui/monitor
7) If any step fails, diagnose and remediate automatically. Retry until success.

Troubleshooting rules:
- If systemd errors appear, do not use systemd flow. Continue with Zo user services only.
- If UI assets are missing, run:
  npm run ui:sync
  npm run build
  then restart qore-ui service.
- If runtime is unreachable, inspect runtime service logs and fix env/config.
- If MFA enrollment fails, rotate secret with:
  npm run ui:mfa:secret

Final output format:
- Installation Status: SUCCESS or FAILED
- Runtime Service: status + URL
- UI Service: status + URL
- API Key generated:
- Basic Auth user/pass generated:
- MFA configured: yes/no
- Admin token generated:
- Remaining manual steps (if any):
```

Notes:
- Review generated secrets before storing them in shared notes.
- Rotate all generated credentials before production use.
