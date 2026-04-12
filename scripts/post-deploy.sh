#!/usr/bin/env bash
# post-deploy.sh
#
# Fallback helper for older Databricks CLI / bundle versions that cannot declare
# `user_api_scopes: ["sql"]` directly in databricks.yml. The main deploy path
# no longer depends on this script now that the bundle schema supports app
# scopes declaratively.
#
# Usage (called automatically by `make deploy`):
#   bash scripts/post-deploy.sh [--profile <profile>]
#
# Requires: Databricks CLI >= 0.220 authenticated via `databricks configure`

set -euo pipefail

PROFILE="${DATABRICKS_PROFILE:-uat}"
APP_NAME="${APP_NAME:-spc-tim}"
BUNDLE_NAME="${BUNDLE_NAME:-spc-tim}"

# Allow --profile flag to override the default
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

BUNDLE_PATH="/Workspace/Shared/.bundle/${BUNDLE_NAME}/${PROFILE}/files"

echo "→ Deploying app '${APP_NAME}' from ${BUNDLE_PATH} as a compatibility fallback..."

MSYS_NO_PATHCONV=1 databricks apps deploy "${APP_NAME}" \
  --profile "${PROFILE}" \
  --json "{\"source_code_path\": \"${BUNDLE_PATH}\", \"mode\": \"SNAPSHOT\"}"

echo "→ Applying user_api_scopes: [\"sql\"] to app '${APP_NAME}' (profile: ${PROFILE})..."

databricks apps update "${APP_NAME}" \
  --profile "${PROFILE}" \
  --json '{"user_api_scopes": ["sql"]}'

echo "✓ Compatibility fallback complete. Prefer declarative app scopes in"
echo "  databricks.yml and reserve this script for manual recovery only."
