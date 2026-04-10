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
WAREHOUSE_ID ?= e76480b94bea6ed5
TRACE_CATALOG_DEFAULT ?= connected_plant_uat
TRACE_SCHEMA_DEFAULT ?= gold
LOCKED_LIMITS_MIGRATION ?= $(MIGRATIONS_DIR)/000_setup_locked_limits.sql
EXCLUSIONS_MIGRATION ?= $(MIGRATIONS_DIR)/001_create_spc_exclusions.sql
QUERY_AUDIT_MIGRATION ?= $(MIGRATIONS_DIR)/002_create_query_audit.sql
ADD_OPERATION_ID_LOCKED_LIMITS_MIGRATION ?= $(MIGRATIONS_DIR)/003_add_operation_id_to_locked_limits.sql
ADD_OPERATION_ID_EXCLUSIONS_MIGRATION ?= $(MIGRATIONS_DIR)/004_add_operation_id_to_spc_exclusions.sql

.PHONY: apply-migration build check-env deploy render-app-config setup-locked-limits setup-exclusions setup-query-audit setup-operation-id-locked-limits setup-operation-id-exclusions

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
	 MSYS_NO_PATHCONV=1 envsubst '$$DATABRICKS_WAREHOUSE_HTTP_PATH $$TRACE_CATALOG $$TRACE_SCHEMA' < $(APP_CONFIG_TEMPLATE) > $(APP_CONFIG_OUTPUT)
	@echo "✓ $(APP_CONFIG_OUTPUT) rendered"

deploy: check-env build render-app-config
	databricks bundle deploy --profile $(PROFILE)
	APP_NAME=$(APP_NAME) BUNDLE_NAME=$(BUNDLE_NAME) bash scripts/post-deploy.sh --profile $(PROFILE)
	$(MAKE) setup-locked-limits PROFILE=$(PROFILE)
	$(MAKE) setup-exclusions PROFILE=$(PROFILE)
	$(MAKE) setup-query-audit PROFILE=$(PROFILE)
	$(MAKE) setup-operation-id-locked-limits PROFILE=$(PROFILE)
	$(MAKE) setup-operation-id-exclusions PROFILE=$(PROFILE)

apply-migration: check-env
	@echo "Applying $(NAME) migration from $(FILE)..."
	@export TRACE_CATALOG="$${TRACE_CATALOG:-$(TRACE_CATALOG_DEFAULT)}" && \
	 export TRACE_SCHEMA="$${TRACE_SCHEMA:-$(TRACE_SCHEMA_DEFAULT)}" && \
	 SQL=$$(envsubst '$$TRACE_CATALOG $$TRACE_SCHEMA' < $(FILE)) && \
	 TMPFILE=$$(mktemp /tmp/spc_mig_XXXXXX.json) && \
	 python3 -c "import json,sys; print(json.dumps({'warehouse_id':sys.argv[1],'statement':sys.argv[2],'wait_timeout':'30s'}))" \
	   "$(WAREHOUSE_ID)" "$$SQL" > "$$TMPFILE" && \
	 MSYS_NO_PATHCONV=1 databricks api post /api/2.0/sql/statements --profile $(PROFILE) --json "@$$TMPFILE" && \
	 rm -f "$$TMPFILE"
	@echo "✓ $(NAME) table ready"

setup-locked-limits:
	@$(MAKE) apply-migration NAME=spc_locked_limits FILE=$(LOCKED_LIMITS_MIGRATION) PROFILE=$(PROFILE)

setup-exclusions:
	@$(MAKE) apply-migration NAME=spc_exclusions FILE=$(EXCLUSIONS_MIGRATION) PROFILE=$(PROFILE)
	@export TRACE_CATALOG="$${TRACE_CATALOG:-$(TRACE_CATALOG_DEFAULT)}" && \
	 export TRACE_SCHEMA="$${TRACE_SCHEMA:-$(TRACE_SCHEMA_DEFAULT)}" && \
	 TMPFILE=$$(mktemp /tmp/spc_col_XXXXXX.json) && \
	 python3 -c "import json,sys; print(json.dumps({'warehouse_id':sys.argv[1],'statement':sys.argv[2],'wait_timeout':'30s'}))" \
	   "$(WAREHOUSE_ID)" "SELECT column_name FROM system.information_schema.columns WHERE table_catalog='$$TRACE_CATALOG' AND table_schema='$$TRACE_SCHEMA' AND table_name='spc_exclusions' AND column_name='stratify_by'" > "$$TMPFILE" && \
	 RESULT=$$(MSYS_NO_PATHCONV=1 databricks api post /api/2.0/sql/statements --profile $(PROFILE) --json "@$$TMPFILE" -o json) && \
	 rm -f "$$TMPFILE" && \
	 if ! printf '%s\n' "$$RESULT" | python3 -c "import json,sys; d=json.load(sys.stdin); exit(0 if d.get('result',{}).get('data_array') else 1)" 2>/dev/null; then \
	   echo "Adding missing stratify_by column to $$TRACE_CATALOG.$$TRACE_SCHEMA.spc_exclusions..."; \
	   TMPFILE2=$$(mktemp /tmp/spc_alt_XXXXXX.json) && \
	   python3 -c "import json,sys; print(json.dumps({'warehouse_id':sys.argv[1],'statement':sys.argv[2],'wait_timeout':'30s'}))" \
	     "$(WAREHOUSE_ID)" "ALTER TABLE \`$$TRACE_CATALOG\`.\`$$TRACE_SCHEMA\`.\`spc_exclusions\` ADD COLUMNS (stratify_by STRING)" > "$$TMPFILE2" && \
	   MSYS_NO_PATHCONV=1 databricks api post /api/2.0/sql/statements --profile $(PROFILE) --json "@$$TMPFILE2" && \
	   rm -f "$$TMPFILE2"; \
	 fi

setup-query-audit:
	@$(MAKE) apply-migration NAME=spc_query_audit FILE=$(QUERY_AUDIT_MIGRATION) PROFILE=$(PROFILE)

setup-operation-id-locked-limits:
	@$(MAKE) apply-migration NAME=spc_locked_limits_operation_id FILE=$(ADD_OPERATION_ID_LOCKED_LIMITS_MIGRATION) PROFILE=$(PROFILE)

setup-operation-id-exclusions:
	@$(MAKE) apply-migration NAME=spc_exclusions_operation_id FILE=$(ADD_OPERATION_ID_EXCLUSIONS_MIGRATION) PROFILE=$(PROFILE)
