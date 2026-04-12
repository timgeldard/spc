# SPC Release 1 Implementation

Release 1 moves reusable SPC and quality metrics into Databricks semantic assets.
It deliberately excludes new security policies and curated `consumption` views,
which are deferred to Release 2.

## Scope

Release 1 includes:

- quantitative SPC subgroup source view
- quantitative SPC metric view for dashboards and Genie
- attribute-quality source and metric views
- process-flow health source and metric views
- shared correlation source view
- optional normal-CDF UDF
- app-side feature flag and migration support plumbing

Release 1 excludes:

- Unity Catalog row filters
- dynamic views for browse security
- curated `consumption` schema views
- dashboard cutover to secured wrappers

## Release 1 phases

### 0. Guardrails

- [ ] Freeze current KPI definitions from [spc_analysis_dal.py](/Users/timgeldard/spc-1/backend/dal/spc_analysis_dal.py:182) and [spc_metadata_dal.py](/Users/timgeldard/spc-1/backend/dal/spc_metadata_dal.py:59).
- [ ] Treat `cp`, `cpk`, `pp`, `ppk`, `sigma_within`, `z_score`, `dpmo`, `accepted_batches`, `rejected_batches`, and `ooc_rate` as parity-critical.
- [ ] Block cutover if any parity-critical metric differs from the legacy path by more than `0.001`.

### 1. Support scaffolding

- [x] Add migration slots `005` through `012`.
- [x] Add [scripts/check_metric_view_support.py](/Users/timgeldard/spc-1/scripts/check_metric_view_support.py).
- [x] Add `GENIE_METADATA`, `check-metric-view-support`, and `setup-metric-views` to [Makefile](/Users/timgeldard/spc-1/Makefile).
- [ ] Validate the canary against a real warehouse.
- [ ] Confirm the canary reports unsupported-feature vs permission failures clearly.

### 2. Quantitative SPC source layer

- [x] Create [005_create_spc_quality_metric_subgroup_v.sql](/Users/timgeldard/spc-1/scripts/migrations/005_create_spc_quality_metric_subgroup_v.sql).
- [x] Preserve sample-grain values alongside subgroup rollups so percentile-based governed performance remains possible in the metric view.
- [x] Add `normality_type`, `normality_method`, and `normality_signature` columns for governed long-term performance switching.
- [ ] Validate subgroup row counts against the legacy scorecard query.
- [ ] Validate reconstructed `stddev_overall` against `STDDEV_SAMP(value)` on raw results.
- [ ] Validate `batch_range`, `avg_n`, and mixed-spec detection against the legacy path.

### 3. Quantitative SPC metric layer

- [x] Create [006_create_spc_quality_metrics_mv.sql](/Users/timgeldard/spc-1/scripts/migrations/006_create_spc_quality_metrics_mv.sql).
- [x] Include Genie-friendly semantic metadata and explicit off-target measures.
- [x] Expose `pp_gaussian`, `ppk_gaussian`, `pp_non_parametric`, `ppk_non_parametric`, and governed `pp` / `ppk`.
- [x] Null governed long-term performance when normality is mixed or unknown rather than silently assuming Gaussian behavior.
- [ ] Validate `MEASURE(ppk)`, `MEASURE(cpk)`, `MEASURE(ooc_rate)`, and `MEASURE(rejected_batches)` against `/api/spc/scorecard`.
- [ ] Confirm mixed-spec groups return `NULL` capability metrics and a `distinct_spec_count > 1`.

### 4. Attribute quality layer

- [x] Create [007_create_spc_attribute_metric_source_v.sql](/Users/timgeldard/spc-1/scripts/migrations/007_create_spc_attribute_metric_source_v.sql).
- [x] Create [008_create_spc_attribute_quality_metrics_mv.sql](/Users/timgeldard/spc-1/scripts/migrations/008_create_spc_attribute_quality_metrics_mv.sql).
- [ ] Validate `p_bar` and `defect_rate_pct` against the current attribute DAL.

### 5. Process health and correlation

- [x] Create [009_create_spc_process_flow_source_v.sql](/Users/timgeldard/spc-1/scripts/migrations/009_create_spc_process_flow_source_v.sql).
- [x] Create [010_create_spc_process_flow_metrics_mv.sql](/Users/timgeldard/spc-1/scripts/migrations/010_create_spc_process_flow_metrics_mv.sql).
- [x] Create [011_create_spc_correlation_source_v.sql](/Users/timgeldard/spc-1/scripts/migrations/011_create_spc_correlation_source_v.sql).
- [ ] Validate process-flow date slicing and plant-name semantics against the legacy health query.
- [ ] Validate correlation source output against the existing `batch_avgs` CTE behavior.

### 6. Optional DPMO helper

- [x] Create [012_create_spc_normal_cdf_udf.sql](/Users/timgeldard/spc-1/scripts/migrations/012_create_spc_normal_cdf_udf.sql).
- [ ] Decide whether the inline ERF expression is good enough or the UDF should be applied.

### 7. Backend dual-path refactor

- [x] Add `USE_METRIC_VIEWS` config flag in [db.py](/Users/timgeldard/spc-1/backend/utils/db.py:69).
- [ ] Refactor `fetch_scorecard()` to support legacy and metric-view paths side by side.
- [ ] Refactor `fetch_attribute_characteristics()` to use `spc_attribute_quality_metrics`.
- [ ] Keep `fetch_characteristics()` on raw SQL.
- [ ] Refactor process-flow health aggregation only; keep recursive lineage raw.
- [ ] Refactor correlation queries to use `spc_correlation_source_v`.

### 8. Shadow validation

- [ ] Run legacy and metric-view code paths in parallel for identical inputs.
- [ ] Compare all parity-critical metrics.
- [ ] Add automated fixtures for mixed-spec, unilateral-spec, and multi-plant edge cases.
- [ ] Block cutover if any parity-critical difference exceeds `0.001`.

### 9. Genie enablement

- [ ] Publish `spc_quality_metrics` and `spc_attribute_quality_metrics` to Genie.
- [ ] Add sample questions for capability, off-target drift, rejection trends, and plant comparison.
- [ ] Verify Genie distinguishes:
  - `off_nominal`
  - `out_of_spec`
  - `out_of_control`
  - `rejected`

### 10. Release 1 cutover

- [ ] Enable `USE_METRIC_VIEWS=true` in UAT.
- [ ] Run smoke tests for scorecard, overview, process flow, compare, and export.
- [ ] Benchmark latency and payload size before and after.
- [ ] Promote to prod only after parity validation passes.

## Release 2 boundary

Security and curated consumption assets are intentionally deferred.

Release 2 will cover:

- row filters / dynamic views / hybrid browse policy
- persona-based access validation
- curated `consumption` schema views
- dashboard cutover to secured downstream assets
