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

.PHONY: build check-env deploy setup-locked-limits

check-env:
	@databricks current-user me --profile $(PROFILE) -o json > /dev/null 2>&1 || \
	  (echo "ERROR: Cannot authenticate with Databricks. Run: databricks configure --profile $(PROFILE)" && exit 1)
	@echo "✓ Databricks auth OK (profile: $(PROFILE))"

build:
	cd frontend && npm run build

deploy: check-env build
	databricks bundle deploy --profile $(PROFILE)
	bash scripts/post-deploy.sh --profile $(PROFILE)

setup-locked-limits: check-env
	@echo "Creating spc_locked_limits Delta table..."
	@export TRACE_CATALOG=$${TRACE_CATALOG:-connected_plant_uat} && \
	 export TRACE_SCHEMA=$${TRACE_SCHEMA:-gold} && \
	 envsubst '$$TRACE_CATALOG $$TRACE_SCHEMA' < scripts/setup_locked_limits.sql | \
	 databricks sql execute --profile $(PROFILE) --wait-timeout 60s --statement "$$(cat -)"
	@echo "✓ spc_locked_limits table ready"
