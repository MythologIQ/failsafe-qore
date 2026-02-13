#!/usr/bin/env bash
set -euo pipefail

REPO_URL="${REPO_URL:-https://github.com/MythologIQ/failsafe-qore.git}"
BRANCH="${BRANCH:-main}"
INSTALL_DIR="${INSTALL_DIR:-/home/workspace/MythologIQ/FailSafe-Qore}"
WORKDIR="${WORKDIR:-}"

RUNTIME_LABEL="${RUNTIME_LABEL:-qore-runtime}"
UI_LABEL="${UI_LABEL:-qore-ui}"
RUNTIME_PORT="${RUNTIME_PORT:-7777}"
UI_PORT="${UI_PORT:-9380}"
RUNTIME_HOST="${RUNTIME_HOST:-0.0.0.0}"
UI_HOST="${UI_HOST:-0.0.0.0}"

QORE_UI_BASIC_AUTH_USER="${QORE_UI_BASIC_AUTH_USER:-admin}"

NON_INTERACTIVE=false
FORCE_RECONFIGURE=false
UNINSTALL=false
CLEANUP_LEGACY_TEST=false
CONFIG_FILE=""
WRITE_CONFIG_FILE=""

log() {
  printf '[failsafe-qore-zo-install] %s\n' "$*"
}

mask_secret() {
  local value="$1"
  local keep="${2:-4}"
  local len="${#value}"
  if [[ "$len" -le "$keep" ]]; then
    printf '%s' "$value"
    return
  fi
  local tail="${value: -$keep}"
  printf '[redacted:%s]' "$tail"
}

die() {
  log "ERROR: $*"
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    die "missing required command: $1"
  fi
}

usage() {
  cat <<EOF
FailSafe-Qore complete Zo installer

Usage:
  bash deploy/zo/install-zo-full.sh [options]

Options:
  --non-interactive         Use env/config only, no prompts.
  --force-reconfigure       If service labels already exist, attempt removal then recreate.
  --uninstall               Remove Zo-Qore services and local install path, then exit.
  --cleanup-legacy-test     Also remove legacy test bootstrap artifacts (/opt and /etc failsafe-qore-test paths).
  --config <path>           Source configuration env file before install.
  --write-config <path>     Write resolved config to file.
  --help                    Show this help.

Environment override examples:
  REPO_URL, BRANCH, INSTALL_DIR, WORKDIR,
  RUNTIME_LABEL, UI_LABEL, RUNTIME_PORT, UI_PORT,
  QORE_API_KEY, QORE_UI_BASIC_AUTH_USER, QORE_UI_BASIC_AUTH_PASS, QORE_UI_TOTP_SECRET, QORE_UI_ADMIN_TOKEN
EOF
}

prompt_default() {
  local var_name="$1"
  local prompt_text="$2"
  local default_value="$3"
  if [[ "${NON_INTERACTIVE}" == "true" ]]; then
    printf -v "$var_name" '%s' "$default_value"
    return
  fi

  local input
  read -r -p "$prompt_text [$default_value]: " input
  if [[ -z "$input" ]]; then
    input="$default_value"
  fi
  printf -v "$var_name" '%s' "$input"
}

confirm_yes_no() {
  local prompt_text="$1"
  local default_yes="$2"
  if [[ "${NON_INTERACTIVE}" == "true" ]]; then
    [[ "$default_yes" == "true" ]]
    return
  fi

  local hint="y/N"
  if [[ "$default_yes" == "true" ]]; then
    hint="Y/n"
  fi
  local answer
  read -r -p "$prompt_text [$hint]: " answer
  answer="${answer,,}"
  if [[ -z "$answer" ]]; then
    [[ "$default_yes" == "true" ]]
    return
  fi
  [[ "$answer" == "y" || "$answer" == "yes" ]]
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --non-interactive)
        NON_INTERACTIVE=true
        shift
        ;;
      --force-reconfigure)
        FORCE_RECONFIGURE=true
        shift
        ;;
      --uninstall)
        UNINSTALL=true
        shift
        ;;
      --cleanup-legacy-test)
        CLEANUP_LEGACY_TEST=true
        shift
        ;;
      --config)
        [[ $# -ge 2 ]] || die "--config requires a file path"
        CONFIG_FILE="$2"
        shift 2
        ;;
      --write-config)
        [[ $# -ge 2 ]] || die "--write-config requires a file path"
        WRITE_CONFIG_FILE="$2"
        shift 2
        ;;
      --help|-h)
        usage
        exit 0
        ;;
      *)
        die "unknown option: $1"
        ;;
    esac
  done
}

load_config_file() {
  if [[ -z "${CONFIG_FILE}" ]]; then
    return
  fi
  [[ -f "${CONFIG_FILE}" ]] || die "config file not found: ${CONFIG_FILE}"
  # shellcheck disable=SC1090
  source "${CONFIG_FILE}"
}

service_exists() {
  local label="$1"
  if ! command -v list_user_services >/dev/null 2>&1; then
    return 1
  fi
  list_user_services 2>/dev/null | grep -E "(^|\s)${label}(\s|$)" >/dev/null 2>&1
}

remove_service_if_supported() {
  local label="$1"
  if command -v unregister_user_service >/dev/null 2>&1; then
    unregister_user_service --label "$label" >/dev/null 2>&1 || true
    return 0
  fi
  if command -v remove_user_service >/dev/null 2>&1; then
    remove_user_service --label "$label" >/dev/null 2>&1 || true
    return 0
  fi
  if command -v delete_user_service >/dev/null 2>&1; then
    delete_user_service --label "$label" >/dev/null 2>&1 || true
    return 0
  fi
  return 1
}

is_protected_path() {
  local path="$1"
  case "$path" in
    ""|"/"|"/home"|"/home/"|"/opt"|"/opt/"|"/etc"|"/etc/"|"/usr"|"/usr/"|"/var"|"/var/"|".")
      return 0
      ;;
    *)
      return 1
      ;;
  esac
}

remove_path_if_present() {
  local path="$1"
  local label="$2"
  if [[ -z "$path" ]]; then
    return
  fi
  if is_protected_path "$path"; then
    log "skipping protected path for ${label}: ${path}"
    return
  fi
  if [[ ! -e "$path" ]]; then
    return
  fi
  rm -rf -- "$path" || log "warning: failed to remove ${label}: ${path}"
  if [[ ! -e "$path" ]]; then
    log "removed ${label}: ${path}"
  fi
}

stop_standalone_processes() {
  local pid_file
  for pid_file in /tmp/qore-runtime.pid /tmp/qore-ui.pid; do
    if [[ -f "$pid_file" ]]; then
      local pid
      pid="$(cat "$pid_file" 2>/dev/null || true)"
      if [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1; then
        kill "$pid" >/dev/null 2>&1 || true
      fi
      rm -f "$pid_file" >/dev/null 2>&1 || true
    fi
  done
}

perform_uninstall() {
  if [[ "${NON_INTERACTIVE}" == "false" ]]; then
    confirm_yes_no "Proceed with uninstall for labels ${RUNTIME_LABEL}/${UI_LABEL} and INSTALL_DIR=${INSTALL_DIR}?" false || {
      log "uninstall cancelled"
      exit 0
    }
  fi

  log "removing Zo user services if present"
  if service_exists "${RUNTIME_LABEL}"; then
    remove_service_if_supported "${RUNTIME_LABEL}" || log "warning: could not remove ${RUNTIME_LABEL}; remove manually in Zo UI"
  fi
  if service_exists "${UI_LABEL}"; then
    remove_service_if_supported "${UI_LABEL}" || log "warning: could not remove ${UI_LABEL}; remove manually in Zo UI"
  fi

  # Legacy labels from early safe bootstrap experiments.
  local legacy_label
  for legacy_label in "failsafe-qore-test" "failsafe-fallback-watcher-test" "failsafe-qore-test.service" "failsafe-fallback-watcher-test.service"; do
    if service_exists "${legacy_label}"; then
      remove_service_if_supported "${legacy_label}" || true
    fi
  done

  stop_standalone_processes
  remove_path_if_present "/dev/shm/qore-runtime.log" "runtime log"
  remove_path_if_present "/dev/shm/qore-ui.log" "ui log"
  remove_path_if_present "${INSTALL_DIR}" "install directory"

  if [[ "${CLEANUP_LEGACY_TEST}" == "true" ]]; then
    log "cleaning legacy test bootstrap artifacts"
    remove_path_if_present "/opt/failsafe-qore-test" "legacy test install"
    remove_path_if_present "/opt/failsafe-qore-test2" "legacy test install"
    remove_path_if_present "/etc/failsafe-qore-test" "legacy test env directory"
  fi

  log "uninstall complete"
}

has_repo() {
  [[ -f "$1/package.json" && -f "$1/deploy/zo/one-click-services.sh" ]]
}

ensure_repo() {
  if [[ -n "${WORKDIR}" ]]; then
    has_repo "${WORKDIR}" || die "WORKDIR=${WORKDIR} does not look like FailSafe-Qore"
    printf '%s' "${WORKDIR}"
    return
  fi

  mkdir -p "$(dirname "${INSTALL_DIR}")"
  if [[ -d "${INSTALL_DIR}/.git" ]]; then
    log "updating repository in ${INSTALL_DIR}" >&2
    git -C "${INSTALL_DIR}" fetch --all --prune >&2
    git -C "${INSTALL_DIR}" checkout "${BRANCH}" >&2
    git -C "${INSTALL_DIR}" pull --ff-only origin "${BRANCH}" >&2
  elif [[ -d "${INSTALL_DIR}" && "$(ls -A "${INSTALL_DIR}" 2>/dev/null || true)" != "" ]]; then
    if has_repo "${INSTALL_DIR}"; then
      log "using existing repository content in ${INSTALL_DIR}" >&2
    else
      die "INSTALL_DIR exists and is not empty: ${INSTALL_DIR}; choose WORKDIR or clean path"
    fi
  else
    log "cloning ${REPO_URL} (${BRANCH}) into ${INSTALL_DIR}" >&2
    git clone --branch "${BRANCH}" "${REPO_URL}" "${INSTALL_DIR}" >&2
  fi

  printf '%s' "${INSTALL_DIR}"
}

generate_missing_secrets() {
  if [[ -z "${QORE_API_KEY:-}" ]]; then
    QORE_API_KEY="$(openssl rand -hex 32)"
    export QORE_API_KEY
    log "generated QORE_API_KEY"
  fi

  if [[ -z "${QORE_UI_BASIC_AUTH_PASS:-}" ]]; then
    QORE_UI_BASIC_AUTH_PASS="$(openssl rand -base64 24 | tr -d '\n')"
    export QORE_UI_BASIC_AUTH_PASS
    log "generated QORE_UI_BASIC_AUTH_PASS"
  fi

  if [[ -z "${QORE_UI_TOTP_SECRET:-}" ]]; then
    local mfa_line
    mfa_line="$(npm run -s ui:mfa:secret | grep '^QORE_UI_TOTP_SECRET=' | head -n 1 || true)"
    [[ -n "$mfa_line" ]] || die "failed to generate QORE_UI_TOTP_SECRET"
    QORE_UI_TOTP_SECRET="${mfa_line#QORE_UI_TOTP_SECRET=}"
    export QORE_UI_TOTP_SECRET
    log "generated QORE_UI_TOTP_SECRET"
  fi

  if [[ -z "${QORE_UI_ADMIN_TOKEN:-}" ]]; then
    QORE_UI_ADMIN_TOKEN="$(openssl rand -hex 32)"
    export QORE_UI_ADMIN_TOKEN
    log "generated QORE_UI_ADMIN_TOKEN"
  fi

  export QORE_UI_BASIC_AUTH_USER
}

interactive_config() {
  if [[ "${NON_INTERACTIVE}" == "true" ]]; then
    return
  fi

  log "configuration wizard"
  prompt_default REPO_URL "Repository URL" "${REPO_URL}"
  prompt_default BRANCH "Git branch" "${BRANCH}"
  prompt_default INSTALL_DIR "Install directory" "${INSTALL_DIR}"
  prompt_default RUNTIME_LABEL "Runtime service label" "${RUNTIME_LABEL}"
  prompt_default UI_LABEL "UI service label" "${UI_LABEL}"
  prompt_default RUNTIME_PORT "Runtime port" "${RUNTIME_PORT}"
  prompt_default UI_PORT "UI port" "${UI_PORT}"
  prompt_default QORE_UI_BASIC_AUTH_USER "UI Basic Auth username" "${QORE_UI_BASIC_AUTH_USER}"

  # Security-first interactive defaults:
  # - always rotate sensitive secrets during install
  # - never write plaintext secret config unless explicitly requested via --write-config
  unset QORE_API_KEY QORE_UI_BASIC_AUTH_PASS QORE_UI_TOTP_SECRET QORE_UI_ADMIN_TOKEN
}

write_config_file() {
  if [[ -z "${WRITE_CONFIG_FILE}" ]]; then
    return
  fi

  mkdir -p "$(dirname "${WRITE_CONFIG_FILE}")"
  {
    printf 'REPO_URL=%q\n' "${REPO_URL}"
    printf 'BRANCH=%q\n' "${BRANCH}"
    printf 'INSTALL_DIR=%q\n' "${INSTALL_DIR}"
    printf 'RUNTIME_LABEL=%q\n' "${RUNTIME_LABEL}"
    printf 'UI_LABEL=%q\n' "${UI_LABEL}"
    printf 'RUNTIME_PORT=%q\n' "${RUNTIME_PORT}"
    printf 'UI_PORT=%q\n' "${UI_PORT}"
    printf 'QORE_UI_BASIC_AUTH_USER=%q\n' "${QORE_UI_BASIC_AUTH_USER}"
    printf 'QORE_API_KEY=%q\n' "${QORE_API_KEY}"
    printf 'QORE_UI_BASIC_AUTH_PASS=%q\n' "${QORE_UI_BASIC_AUTH_PASS}"
    printf 'QORE_UI_TOTP_SECRET=%q\n' "${QORE_UI_TOTP_SECRET}"
    printf 'QORE_UI_ADMIN_TOKEN=%q\n' "${QORE_UI_ADMIN_TOKEN}"
  } > "${WRITE_CONFIG_FILE}"
  chmod 600 "${WRITE_CONFIG_FILE}" || true
  log "wrote config: ${WRITE_CONFIG_FILE}"
}

validate_or_prepare_services() {
  local runtime_exists=false
  local ui_exists=false

  if service_exists "${RUNTIME_LABEL}"; then runtime_exists=true; fi
  if service_exists "${UI_LABEL}"; then ui_exists=true; fi

  if [[ "$runtime_exists" == "false" && "$ui_exists" == "false" ]]; then
    return
  fi

  if [[ "${FORCE_RECONFIGURE}" == "false" ]]; then
    die "service labels already exist (${RUNTIME_LABEL} or ${UI_LABEL}); rerun with --force-reconfigure"
  fi

  log "existing services detected, attempting removal"
  if [[ "$runtime_exists" == "true" ]]; then
    remove_service_if_supported "${RUNTIME_LABEL}" || die "could not remove ${RUNTIME_LABEL}; remove manually in Zo UI"
  fi
  if [[ "$ui_exists" == "true" ]]; then
    remove_service_if_supported "${UI_LABEL}" || die "could not remove ${UI_LABEL}; remove manually in Zo UI"
  fi
}

wait_for_health() {
  if ! command -v curl >/dev/null 2>&1; then
    log "curl not found; skipping health check"
    return
  fi

  local url="http://127.0.0.1:${RUNTIME_PORT}/health"
  for _ in {1..20}; do
    if curl -fsS -H "x-qore-api-key: ${QORE_API_KEY}" "$url" >/dev/null 2>&1; then
      log "runtime health check passed"
      return
    fi
    sleep 1
  done
  log "runtime health check did not pass within timeout (service may still be starting)"
}

print_summary() {
  log "installation complete"
  log ""
  log "credentials configured (sensitive values redacted):"
  log "QORE_API_KEY=$(mask_secret "${QORE_API_KEY}")"
  log "QORE_UI_BASIC_AUTH_USER=${QORE_UI_BASIC_AUTH_USER}"
  log "QORE_UI_BASIC_AUTH_PASS=$(mask_secret "${QORE_UI_BASIC_AUTH_PASS}")"
  log "QORE_UI_TOTP_SECRET=$(mask_secret "${QORE_UI_TOTP_SECRET}" 6)"
  log "QORE_UI_ADMIN_TOKEN=$(mask_secret "${QORE_UI_ADMIN_TOKEN}")"
  log ""
  log "MFA enrollment:"
  log "  run: npm run -s ui:mfa:secret"
  log "  note: run only if rotating/replacing the existing secret"
  log ""
  log "service checks:"
  log "  service_doctor ${RUNTIME_LABEL}"
  log "  service_doctor ${UI_LABEL}"
}

print_zo_ai_handoff() {
  cat <<EOF

╔══════════════════════════════════════════════════════════════════════════════╗
║                     ZO NATIVE AI SETUP HANDOFF                              ║
╚══════════════════════════════════════════════════════════════════════════════╝

The installer has completed all preparation steps. Zo user service registration is not
available in this environment. Please copy the prompt below and paste it into your
Zo native AI to complete the service registration.

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Copy this prompt to your Zo native AI:

─────────────────────────────────────────────────────────────────────────────────────────────

Complete the FailSafe-Qore Zo service registration for me.

Repository: ${repo_dir}
Runtime Label: ${RUNTIME_LABEL}
UI Label: ${UI_LABEL}
Runtime Port: ${RUNTIME_PORT}
UI Port: ${UI_PORT}

Required environment variables (already generated):
- QORE_API_KEY=$(mask_secret "${QORE_API_KEY}")
- QORE_UI_BASIC_AUTH_USER=${QORE_UI_BASIC_AUTH_USER}
- QORE_UI_BASIC_AUTH_PASS=$(mask_secret "${QORE_UI_BASIC_AUTH_PASS}")
- QORE_UI_TOTP_SECRET=$(mask_secret "${QORE_UI_TOTP_SECRET}" 6)
- QORE_UI_ADMIN_TOKEN=$(mask_secret "${QORE_UI_ADMIN_TOKEN}")

Steps to complete:
1. Register runtime service with these commands:
   export SERVICE_LABEL="${RUNTIME_LABEL}"
   export SERVICE_PORT="${RUNTIME_PORT}"
   export QORE_API_HOST="${RUNTIME_HOST}"
   export QORE_API_PORT="${RUNTIME_PORT}"
   cd "${repo_dir}"
   bash deploy/zo/register-user-service.sh

2. Register UI service with these commands:
   export UI_LABEL="${UI_LABEL}"
   export UI_PORT="${UI_PORT}"
   export QORE_UI_HOST="${UI_HOST}"
   export RUNTIME_BASE_URL="http://127.0.0.1:${RUNTIME_PORT}"
   export QORE_UI_BASIC_AUTH_USER="<set-from-installer-generated-secret>"
   export QORE_UI_BASIC_AUTH_PASS="<set-from-installer-generated-secret>"
   export QORE_UI_TOTP_SECRET="<set-from-installer-generated-secret>"
   export QORE_UI_ADMIN_TOKEN="<set-from-installer-generated-secret>"
   cd "${repo_dir}"
   bash deploy/zo/register-ui-user-service.sh

3. Verify services are healthy:
   service_doctor ${RUNTIME_LABEL}
   service_doctor ${UI_LABEL}
   curl -H "x-qore-api-key: <set-from-installer-generated-secret>" http://127.0.0.1:${RUNTIME_PORT}/health

4. Print final URLs:
   echo "Runtime URL: https://${RUNTIME_LABEL}-<zo-host>.zocomputer.io"
   echo "UI URL: https://${UI_LABEL}-<zo-host>.zocomputer.io/ui/console"

Do not stop until both services are registered and healthy. If any step fails,
diagnose and remediate automatically. Retry until success.

─────────────────────────────────────────────────────────────────────────────────────────────

After Zo native AI completes the setup, you can access your services at:
- Runtime: http://${RUNTIME_HOST}:${RUNTIME_PORT}
- UI: http://${UI_HOST}:${UI_PORT}

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Installation preparation complete. Waiting for Zo native AI to complete service registration...

EOF
}

main() {
  parse_args "$@"
  load_config_file

  if [[ "${UNINSTALL}" == "true" ]]; then
    perform_uninstall
    return
  fi

  require_cmd git
  require_cmd node
  require_cmd npm
  require_cmd bash
  require_cmd openssl

  interactive_config

  local repo_dir
  repo_dir="$(ensure_repo)"
  cd "${repo_dir}"

  validate_or_prepare_services

  log "installing dependencies"
  npm ci

  log "syncing full FailSafe UI"
  npm run ui:sync

  log "building"
  npm run build

  generate_missing_secrets
  write_config_file

  # Check if Zo user service registration is available
  if command -v register_user_service >/dev/null 2>&1; then
    log "Zo user service registration available - registering Zo services"
    
    export SERVICE_LABEL="${RUNTIME_LABEL}"
    export SERVICE_PORT="${RUNTIME_PORT}"
    export QORE_API_HOST="${RUNTIME_HOST}"
    export QORE_API_PORT="${RUNTIME_PORT}"

    export UI_LABEL="${UI_LABEL}"
    export UI_PORT="${UI_PORT}"
    export QORE_UI_HOST="${UI_HOST}"
    export RUNTIME_BASE_URL="http://127.0.0.1:${RUNTIME_PORT}"

    log "registering runtime service"
    bash deploy/zo/register-user-service.sh

    log "registering ui service (Basic Auth + MFA)"
    bash deploy/zo/register-ui-user-service.sh

    wait_for_health
    print_summary
  else
    log "Zo user service registration not available"
    log "Installation preparation complete. Service registration requires Zo native AI."
    print_zo_ai_handoff
    log "Copy the prompt above and paste it into your Zo native AI to complete setup."
  fi
}

main "$@"
