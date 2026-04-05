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
APP_CONFIG_TEMPLATE ?= app.template.yaml
APP_CONFIG_OUTPUT ?= app.yaml
WAREHOUSE_HTTP_PATH_DEFAULT ?= /sql/1.0/warehouses/e76480b94bea6ed5
TRACE_CATALOG_DEFAULT ?= connected_plant_uat
TRACE_SCHEMA_DEFAULT ?= gold
LOCKED_LIMITS_MIGRATION ?= $(MIGRATIONS_DIR)/000_setup_locked_limits.sql
EXCLUSIONS_MIGRATION ?= $(MIGRATIONS_DIR)/001_create_spc_exclusions.sql
QUERY_AUDIT_MIGRATION ?= $(MIGRATIONS_DIR)/002_create_query_audit.sql

.PHONY: apply-migration build check-env deploy render-app-config setup-locked-limits setup-exclusions setup-query-audit

check-env:
	@databricks current-user me --profile $(PROFILE) -o json > /dev/null 2>&1 || \
	  (echo "ERROR: Cannot authenticate with Databricks. Run: databricks configure --profile $(PROFILE)" && exit 1)
	@echo "✓ Databricks auth OK (profile: $(PROFILE))"

build:
	cd frontend && npm run build

render-app-config:
	@echo "Rendering $(APP_CONFIG_OUTPUT) from $(APP_CONFIG_TEMPLATE)..."
	@export DATABRICKS_WAREHOUSE_HTTP_PATH="$${DATABRICKS_WAREHOUSE_HTTP_PATH:-$(WAREHOUSE_HTTP_PATH_DEFAULT)}" && \
	 export TRACE_CATALOG="$${TRACE_CATALOG:-$(TRACE_CATALOG_DEFAULT)}" && \
	 export TRACE_SCHEMA="$${TRACE_SCHEMA:-$(TRACE_SCHEMA_DEFAULT)}" && \
	 envsubst '$$DATABRICKS_WAREHOUSE_HTTP_PATH $$TRACE_CATALOG $$TRACE_SCHEMA' < $(APP_CONFIG_TEMPLATE) > $(APP_CONFIG_OUTPUT)
	@echo "✓ $(APP_CONFIG_OUTPUT) rendered"

deploy: check-env build render-app-config
	databricks bundle deploy --profile $(PROFILE)
	APP_NAME=$(APP_NAME) BUNDLE_NAME=$(BUNDLE_NAME) bash scripts/post-deploy.sh --profile $(PROFILE)
	$(MAKE) setup-locked-limits PROFILE=$(PROFILE)
	$(MAKE) setup-exclusions PROFILE=$(PROFILE)
	$(MAKE) setup-query-audit PROFILE=$(PROFILE)

apply-migration: check-env
	@echo "Applying $(NAME) migration from $(FILE)..."
	@export TRACE_CATALOG="$${TRACE_CATALOG:-$(TRACE_CATALOG_DEFAULT)}" && \
	 export TRACE_SCHEMA="$${TRACE_SCHEMA:-$(TRACE_SCHEMA_DEFAULT)}" && \
	 envsubst '$$TRACE_CATALOG $$TRACE_SCHEMA' < $(FILE) | \
	 databricks sql execute --profile $(PROFILE) --wait-timeout 60s --statement "$$(cat)"
	@echo "✓ $(NAME) table ready"

setup-locked-limits:
	@$(MAKE) apply-migration NAME=spc_locked_limits FILE=$(LOCKED_LIMITS_MIGRATION) PROFILE=$(PROFILE)

setup-exclusions:
	@$(MAKE) apply-migration NAME=spc_exclusions FILE=$(EXCLUSIONS_MIGRATION) PROFILE=$(PROFILE)

setup-query-audit:
	@$(MAKE) apply-migration NAME=spc_query_audit FILE=$(QUERY_AUDIT_MIGRATION) PROFILE=$(PROFILE)
