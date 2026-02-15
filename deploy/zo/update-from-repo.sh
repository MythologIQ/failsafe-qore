#!/usr/bin/env bash
set -euo pipefail

WORKDIR="${WORKDIR:-$(pwd)}"
REMOTE="${REMOTE:-origin}"
BRANCH="${BRANCH:-main}"
CONFIG_FILE="${CONFIG_FILE:-}"
VERIFY="${VERIFY:-true}"
REDEPLOY="${REDEPLOY:-true}"
DRY_RUN="${DRY_RUN:-false}"
ALLOW_DIRTY="${ALLOW_DIRTY:-false}"

PREV_COMMIT=""
BACKUP_DIR=""
UPDATE_APPLIED="false"

log() {
  printf '[failsafe-qore-update] %s\n' "$*"
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
Safe update-from-repo flow for Zo/Linux installs.

Usage:
  bash deploy/zo/update-from-repo.sh [options]

Options:
  --workdir <path>       Repo working directory (default: current directory)
  --remote <name>        Git remote name (default: origin)
  --branch <name>        Branch to track (default: main)
  --config <path>        Installer config file for service re-registration
  --skip-verify          Skip typecheck/test/lint/build verification
  --skip-redeploy        Skip service re-registration step
  --dry-run              Print update plan without applying
  --allow-dirty          Allow local working tree changes
  --help                 Show this help

Environment equivalents:
  WORKDIR, REMOTE, BRANCH, CONFIG_FILE, VERIFY, REDEPLOY, DRY_RUN, ALLOW_DIRTY
EOF
}

parse_args() {
  while [[ $# -gt 0 ]]; do
    case "$1" in
      --workdir)
        [[ $# -ge 2 ]] || die "--workdir requires a path"
        WORKDIR="$2"
        shift 2
        ;;
      --remote)
        [[ $# -ge 2 ]] || die "--remote requires a value"
        REMOTE="$2"
        shift 2
        ;;
      --branch)
        [[ $# -ge 2 ]] || die "--branch requires a value"
        BRANCH="$2"
        shift 2
        ;;
      --config)
        [[ $# -ge 2 ]] || die "--config requires a path"
        CONFIG_FILE="$2"
        shift 2
        ;;
      --skip-verify)
        VERIFY="false"
        shift
        ;;
      --skip-redeploy)
        REDEPLOY="false"
        shift
        ;;
      --dry-run)
        DRY_RUN="true"
        shift
        ;;
      --allow-dirty)
        ALLOW_DIRTY="true"
        shift
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

resolve_config() {
  if [[ -n "${CONFIG_FILE}" ]]; then
    [[ -f "${CONFIG_FILE}" ]] || die "config file not found: ${CONFIG_FILE}"
    return
  fi
  local local_config="${WORKDIR}/.failsafe/zo-installer.env"
  if [[ -f "${local_config}" ]]; then
    CONFIG_FILE="${local_config}"
  fi
}

ensure_clean_tree() {
  if [[ "${ALLOW_DIRTY}" == "true" ]]; then
    return
  fi
  
  local dirty_files
  dirty_files="$(git status --porcelain)"
  
  if [[ -z "${dirty_files}" ]]; then
    return
  fi
  
  # Check if dirty files are only secret files that should be ignored
  local only_secrets=true
  while IFS= read -r line; do
    local file
    file="${line#?? }"  # Remove status prefix (e.g., "M ", "?? ")
    
    # Check if file is a secret file that should be ignored
    if [[ ! "${file}" =~ ^\.failsafe/.*\.env$ ]] && [[ ! "${file}" =~ ^\.env$ ]] && [[ ! "${file}" =~ ^\.env\..*$ ]]; then
      only_secrets=false
      break
    fi
  done <<< "${dirty_files}"
  
  if [[ "${only_secrets}" == "true" ]]; then
    log "WARNING: working tree has secret files that should not be tracked by git"
    log "Secret files detected:"
    echo "${dirty_files}" | sed 's/^/  /'
    log ""
    log "Recommendation: Untrack these files with:"
    log "  git rm --cached \$(git ls-files .failsafe/*.env .env .env.*)"
    log "  git commit -m 'stop tracking secret files'"
    log ""
    log "Proceeding with update (secret files will be preserved locally)"
    return
  fi
  
  die "working tree is dirty; commit/stash first or rerun with --allow-dirty"
}

create_backup() {
  local backup_json
  backup_json="$(node scripts/zo-resilience.mjs backup --workspace "${WORKDIR}")"
  BACKUP_DIR="$(node -e 'const o=JSON.parse(process.argv[1]); process.stdout.write(String(o.backupDir||""));' "${backup_json}")"
  [[ -n "${BACKUP_DIR}" ]] || die "failed to capture backup directory"
  log "state backup created: ${BACKUP_DIR}"
}

run_verify() {
  if [[ "${VERIFY}" != "true" ]]; then
    log "verification skipped"
    return
  fi
  log "running verification gates"
  npm run typecheck
  npm test
  npm run lint
  npm run build
}

run_redeploy() {
  if [[ "${REDEPLOY}" != "true" ]]; then
    log "service redeploy skipped"
    return
  fi
  if [[ -n "${CONFIG_FILE}" ]]; then
    log "re-registering services via installer config"
    WORKDIR="${WORKDIR}" bash deploy/zo/install-zo-full.sh --non-interactive --config "${CONFIG_FILE}" --force-reconfigure
    return
  fi

  if command -v register_user_service >/dev/null 2>&1; then
    log "installer config not found; attempting one-click service registration"
    bash deploy/zo/one-click-services.sh
    return
  fi

  log "installer config and register_user_service not available; skipping service redeploy"
}

rollback() {
  if [[ "${UPDATE_APPLIED}" != "true" ]]; then
    return
  fi
  log "rolling back to commit ${PREV_COMMIT}"
  git checkout "${PREV_COMMIT}"
  npm ci
  npm run ui:sync
  npm run build
  if [[ -n "${BACKUP_DIR}" ]]; then
    node scripts/zo-resilience.mjs restore --workspace "${WORKDIR}" --from "${BACKUP_DIR}" --confirm RESTORE
  fi
  if [[ -n "${CONFIG_FILE}" ]]; then
    WORKDIR="${WORKDIR}" bash deploy/zo/install-zo-full.sh --non-interactive --config "${CONFIG_FILE}" --force-reconfigure || true
  fi
  log "rollback complete"
}

main() {
  parse_args "$@"

  require_cmd git
  require_cmd node
  require_cmd npm
  require_cmd bash

  WORKDIR="$(cd "${WORKDIR}" && pwd)"
  cd "${WORKDIR}"
  [[ -f package.json ]] || die "not a repository root: missing package.json"

  resolve_config
  ensure_clean_tree

  PREV_COMMIT="$(git rev-parse HEAD)"
  local current_head="${PREV_COMMIT}"
  local remote_head
  remote_head="$(git rev-parse "${REMOTE}/${BRANCH}" 2>/dev/null || true)"

  log "current commit: ${current_head}"
  if [[ -n "${remote_head}" ]]; then
    log "known remote commit: ${remote_head}"
  fi

  log "fetching ${REMOTE}/${BRANCH}"
  git fetch "${REMOTE}" "${BRANCH}"
  remote_head="$(git rev-parse "${REMOTE}/${BRANCH}")"
  log "latest remote commit: ${remote_head}"

  if [[ "${current_head}" == "${remote_head}" ]]; then
    log "already up to date"
    exit 0
  fi

  if [[ "${DRY_RUN}" == "true" ]]; then
    log "dry run: update available ${current_head} -> ${remote_head}"
    exit 0
  fi

  create_backup

  log "checking out ${BRANCH}"
  git checkout "${BRANCH}"
  log "fast-forward pull from ${REMOTE}/${BRANCH}"
  git pull --ff-only "${REMOTE}" "${BRANCH}"
  UPDATE_APPLIED="true"

  log "installing dependencies and syncing UI"
  npm ci
  npm run ui:sync

  run_verify
  run_redeploy

  if npm run qorectl:doctor >/dev/null 2>&1; then
    log "post-update doctor: pass"
  else
    log "post-update doctor: warning (check runtime/UI env and credentials)"
  fi

  log "update complete: ${PREV_COMMIT} -> $(git rev-parse HEAD)"
  if [[ -n "${BACKUP_DIR}" ]]; then
    log "rollback backup: ${BACKUP_DIR}"
  fi
}

if ! main "$@"; then
  log "update failed"
  rollback
  exit 1
fi
