# spc - build & deploy
#
# Always use `make deploy` instead of `databricks bundle deploy` directly.
# The deploy target:
#   1. Verifies Databricks CLI auth
#   2. Builds the frontend (ensures dist is fresh before upload)
#   3. Runs databricks bundle deploy
#   4. Explicitly triggers a new app deployment (bundle deploy alone does not
#      always snapshot untracked files such as frontend/dist)
#   5. Re-applies user_api_scopes: ["sql"] (reset by every bundle deploy)

PROFILE ?= uat
APP_NAME ?= spc
BUNDLE_NAME ?= spc
MIGRATIONS_DIR ?= scripts/migrations
LOCKED_LIMITS_MIGRATION ?= $(MIGRATIONS_DIR)/000_setup_locked_limits.sql
QUERY_AUDIT_MIGRATION ?= $(MIGRATIONS_DIR)/002_create_query_audit.sql

.PHONY: build check-env deploy setup-locked-limits setup-query-audit

check-env:
	@databricks current-user me --profile $(PROFILE) -o json > /dev/null 2>&1 || \
	  (echo "ERROR: Cannot authenticate with Databricks. Run: databricks configure --profile $(PROFILE)" && exit 1)
	@echo "✓ Databricks auth OK (profile: $(PROFILE))"

build:
	cd frontend && npm run build

deploy: check-env build
	databricks bundle deploy --profile $(PROFILE)
	APP_NAME=$(APP_NAME) BUNDLE_NAME=$(BUNDLE_NAME) bash scripts/post-deploy.sh --profile $(PROFILE)
	$(MAKE) setup-locked-limits PROFILE=$(PROFILE)
	$(MAKE) setup-query-audit PROFILE=$(PROFILE)

setup-locked-limits: check-env
	@echo "Applying locked-limits migration from $(LOCKED_LIMITS_MIGRATION)..."
	@export TRACE_CATALOG=$${TRACE_CATALOG:-connected_plant_uat} && \
	 export TRACE_SCHEMA=$${TRACE_SCHEMA:-gold} && \
	 envsubst '$$TRACE_CATALOG $$TRACE_SCHEMA' < $(LOCKED_LIMITS_MIGRATION) | \
	 databricks sql execute --profile $(PROFILE) --wait-timeout 60s --statement "$$(cat -)"
	@echo "✓ spc_locked_limits table ready"

setup-query-audit: check-env
	@echo "Applying query-audit migration from $(QUERY_AUDIT_MIGRATION)..."
	@export TRACE_CATALOG=$${TRACE_CATALOG:-connected_plant_uat} && \
	 export TRACE_SCHEMA=$${TRACE_SCHEMA:-gold} && \
	 envsubst '$$TRACE_CATALOG $$TRACE_SCHEMA' < $(QUERY_AUDIT_MIGRATION) | \
	 databricks sql execute --profile $(PROFILE) --wait-timeout 60s --statement "$$(cat -)"
	@echo "✓ spc_query_audit table ready"
