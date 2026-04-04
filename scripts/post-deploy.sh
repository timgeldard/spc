#!/usr/bin/env bash
# post-deploy.sh
#
# Re-applies user_api_scopes: ["sql"] to the Databricks App after every bundle
# deploy. This is necessary because `databricks bundle deploy` resets the OAuth
# scopes to their default (empty), which breaks the x-forwarded-access-token
# passthrough that the backend relies on for Unity Catalog SQL queries.
#
# Usage (called automatically by `make deploy`):
#   bash scripts/post-deploy.sh [--profile <profile>]
#
# Requires: Databricks CLI >= 0.220 authenticated via `databricks configure`

set -euo pipefail

PROFILE="${DATABRICKS_PROFILE:-uat}"
APP_NAME="spc"

# Allow --profile flag to override the default
while [[ $# -gt 0 ]]; do
  case "$1" in
    --profile) PROFILE="$2"; shift 2 ;;
    *) echo "Unknown argument: $1" >&2; exit 1 ;;
  esac
done

BUNDLE_PATH="/Workspace/Shared/.bundle/spc/${PROFILE}/files"

echo "→ Deploying app '${APP_NAME}' from ${BUNDLE_PATH}..."

databricks apps deploy "${APP_NAME}" \
  --profile "${PROFILE}" \
  --json "{\"source_code_path\": \"${BUNDLE_PATH}\", \"mode\": \"SNAPSHOT\"}"

echo "→ Applying user_api_scopes: [\"sql\"] to app '${APP_NAME}' (profile: ${PROFILE})..."

databricks apps update "${APP_NAME}" \
  --profile "${PROFILE}" \
  --json '{"user_api_scopes": ["sql"]}'

echo "✓ OAuth scope applied. The Databricks Apps proxy will now forward"
echo "  the user's OIDC token via x-forwarded-access-token on every request."
