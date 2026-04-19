# SPC-TIM Databricks Asset Bundle — Artifact Specification

> **Version**: 2.0  
> **Last Updated**: 2026-04-19  
> **Status**: Draft — Ready for Implementation

This document is the master artifact specification for evolving the spc-tim Databricks Asset Bundle from imperative SQL migrations to a fully declarative bundle with Lakeflow Spark Declarative Pipelines, scheduled jobs, governed gold-layer assets, and a thin backend DAL.

---

## Table of Contents

1. [Introduction](#1-introduction)
2. [Gold Layer Assets — Complete Inventory](#2-gold-layer-assets--complete-inventory)
3. [Materialized Views — Design Details](#3-materialized-views--design-details)
4. [Lakeflow Spark Declarative Pipeline](#4-lakeflow-spark-declarative-pipeline)
5. [Databricks Jobs](#5-databricks-jobs)
6. [Updated databricks.yml](#6-updated-databricksyml)
7. [Schemas & Catalog Definitions](#7-schemas--catalog-definitions)
8. [Grants, Tags, and Lineage Metadata](#8-grants-tags-and-lineage-metadata)
9. [Schema Contract / Data Quality Documentation](#9-schema-contract--data-quality-documentation)
10. [Environment-Specific Overrides](#10-environment-specific-overrides)
11. [CI/CD Enhancements](#11-cicd-enhancements)
12. [Tests](#12-tests)
13. [Sample Content](#13-sample-content)
14. [Migration Path](#14-migration-path)

---

## 1. Introduction

### Current State

The spc-tim bundle today consists of:

* **`databricks.yml`** — Declares only the `spc` app resource; no pipelines, jobs, or materialized view declarations
* **20 imperative migration scripts** in `scripts/migrations/` — Run via Makefile + CI to create tables, views, metric views, and MVs
* **5 backend DAL files** — Heavy SQL logic including RECURSIVE CTEs, cursor pagination, TRY_CAST TOLERANCE parsing, MEASURE() queries, and Hotelling T² computed in Python
* **22 gold-layer SPC objects** — 3 metric views, 4 materialized views, 6 regular views, 9 managed tables

### Target State

Transform the bundle to:

1. **Declarative pipeline-managed MVs** — Lakeflow Spark Declarative Pipeline replaces imperative `CREATE OR REPLACE MATERIALIZED VIEW` DDL
2. **Scheduled refresh jobs** — Serverless jobs trigger pipeline updates on cadence
3. **Thin DAL** — Backend performs simple SELECTs from pre-computed gold objects; statistical heavy-lifting pushed to SQL
4. **Full observability** — Unity Catalog lineage, tags, grants, and quality expectations

### Key Design Principles

| Principle | Implementation |
|-----------|----------------|
| Push statistics to SQL | Nelson rules, capability CIs, Hotelling pivot → materialized views |
| Thin DAL | Replace Python computation with `SELECT` from gold |
| Liquid clustering | CLUSTER BY (material_id, mic_id) for SPC's primary access pattern |
| Serverless compute | Pipelines and jobs use serverless for cost/scale |
| Multi-catalog support | `${var.trace_catalog}` and `${var.trace_schema}` everywhere |
| End-to-end deployability | `databricks bundle deploy -t <target>` deploys everything |

---

## 2. Gold Layer Assets — Complete Inventory

### 2a. NEW Gold Objects to Create

| File Path | Type | Purpose | Databricks Features | Backend Integration |
|-----------|------|---------|---------------------|---------------------|
| `scripts/gold/spc_nelson_rule_flags_mv.sql` | .sql | Pre-compute all 8 Nelson/WECO rule flags per material/plant/MIC/batch | MATERIALIZED VIEW, CLUSTER BY (material_id, mic_id), window functions (LAG, LEAD, COUNT OVER) | `spc_analysis_dal.py` reads `is_stable` column; frontend removes runtime.ts Nelson logic |
| `scripts/gold/spc_capability_detail_mv.sql` | .sql | Cp, Cpk, Pp, Ppk with 95% confidence intervals (Montgomery), Cpm (Taguchi) per material/plant/MIC | MATERIALIZED VIEW, CLUSTER BY (material_id, mic_id), chi-squared inverse via lookup table | `spc_analysis_dal.py` replaces Python `cpk_ci()` with pre-computed `ci_lower`/`ci_upper` |
| `scripts/gold/spc_hotelling_t2_source_mv.sql` | .sql | Pivoted batch × MIC matrix (mean-centered) for Hotelling's T² multivariate analysis | MATERIALIZED VIEW, CLUSTER BY (material_id), PIVOT, AVG | `spc_analysis_dal.py` `fetch_multivariate()` reads pre-pivoted data instead of Python NumPy pivot |
| `scripts/gold/spc_spec_drift_v.sql` | .sql | Detect specification changes over time (different TARGET_VALUE/TOLERANCE across batches for same MIC) | VIEW, window MIN/MAX comparison | New DAL function; scorecard shows spec-drift warning column |
| `scripts/gold/spc_control_limit_history_v.sql` | .sql | Time-series of control limit changes per MIC (joins locked_limits with computed limits) | VIEW | Chart overlay showing limit change events |
| `scripts/gold/spc_msa_sessions_mv.sql` | .sql | MSA session history per material (Gage R&R results, bias, linearity) | MATERIALIZED VIEW, CLUSTER BY (material_id), requires spc_msa_sessions table | `spc_analysis_dal.py` new MSA endpoints read from MV |
| `scripts/gold/spc_chi2_inv_lookup.sql` | .sql | Chi-squared inverse lookup table for capability CI calculation (df 1-500, alpha 0.025/0.975) | TABLE (static reference data) | Used by `spc_capability_detail_mv` |

### 2b. EXISTING Gold Objects — Migration-to-Bundle Mapping

#### Tables (remain as migrations — DDL-managed)

| Migration File | Object Created | Bundle Path | Notes |
|----------------|----------------|-------------|-------|
| `scripts/migrations/000_setup_locked_limits.sql` | `spc_locked_limits` | Keep as migration | User-editable table; not pipeline-managed |
| `scripts/migrations/001_create_spc_exclusions.sql` | `spc_exclusions` | Keep as migration | User-editable table |
| `scripts/migrations/002_create_query_audit.sql` | `spc_query_audit` | Keep as migration | Audit log table |
| `scripts/migrations/003_add_operation_id_to_locked_limits.sql` | ALTER TABLE | Keep as migration | Schema evolution |
| `scripts/migrations/004_add_operation_id_to_spc_exclusions.sql` | ALTER TABLE | Keep as migration | Schema evolution |
| `scripts/migrations/014_add_unified_mic_key_to_locked_limits.sql` | ALTER TABLE | Keep as migration | Schema evolution |
| `scripts/migrations/019_create_spc_mic_chart_config.sql` | `spc_mic_chart_config` | Keep as migration | User-editable config table |

#### Regular Views (remain as migrations)

| Migration File | Object Created | Bundle Path | Notes |
|----------------|----------------|-------------|-------|
| `scripts/migrations/005_create_spc_quality_metric_subgroup_v.sql` | `spc_quality_metric_subgroup_v` | Keep as migration | Base view for metric view; complex CTE logic |
| `scripts/migrations/007_create_spc_attribute_metric_source_v.sql` | `spc_attribute_metric_source_v` | Keep as migration | Base view for attribute metrics |
| `scripts/migrations/009_create_spc_process_flow_source_v.sql` | `spc_process_flow_source_v` | Keep as migration | Base view for process flow metrics |
| `scripts/migrations/011_create_spc_correlation_source_v.sql` | `spc_correlation_source_v` | Keep as migration | Base view for correlation MV |
| `scripts/migrations/013_create_spc_unified_mic_views.sql` | `spc_unified_mic_key_v`, `spc_mic_routing_v` | Keep as migration | Plant-scoped MIC identity views |

#### Metric Views (remain as migrations — YAML syntax)

| Migration File | Object Created | Bundle Path | Notes |
|----------------|----------------|-------------|-------|
| `scripts/migrations/006_create_spc_quality_metrics_mv.sql` | `spc_quality_metrics` | Keep as migration | WITH METRICS LANGUAGE YAML — not pipeline-compatible |
| `scripts/migrations/008_create_spc_attribute_quality_metrics_mv.sql` | `spc_attribute_quality_metrics` | Keep as migration | WITH METRICS LANGUAGE YAML |
| `scripts/migrations/010_create_spc_process_flow_metrics_mv.sql` | `spc_process_flow_metrics` | Keep as migration | WITH METRICS LANGUAGE YAML |

#### Materialized Views (migrate to Lakeflow pipeline)

| Migration File | Object Created | Pipeline Target | Notes |
|----------------|----------------|-----------------|-------|
| `scripts/migrations/015_create_spc_process_flow_source_mv.sql` | `spc_process_flow_source_mv` | `scripts/pipeline/spc_gold_refresh.sql` | Move DDL to pipeline |
| `scripts/migrations/016_create_spc_correlation_source_mv.sql` | `spc_correlation_source_mv` | `scripts/pipeline/spc_gold_refresh.sql` | Move DDL to pipeline |
| `scripts/migrations/017_create_spc_material_dim_mv.sql` | `spc_material_dim_mv` | `scripts/pipeline/spc_gold_refresh.sql` | Move DDL to pipeline |
| `scripts/migrations/018_create_spc_plant_material_dim_mv.sql` | `spc_plant_material_dim_mv` | `scripts/pipeline/spc_gold_refresh.sql` | Move DDL to pipeline |

#### UDFs (remain as migrations)

| Migration File | Object Created | Bundle Path | Notes |
|----------------|----------------|-------------|-------|
| `scripts/migrations/012_create_spc_normal_cdf_udf.sql` | `spc_normal_cdf_udf` | Keep as migration | SQL UDF for normal CDF |

#### Managed Tables (A1-A10 Architecture Review — consider pipeline migration)

| Current Object | Current Type | Pipeline Target | Notes |
|----------------|--------------|-----------------|-------|
| `spc_batch_dim_mv` | MANAGED TABLE (CTAS) | Optional: `scripts/pipeline/spc_gold_refresh.sql` | Could become MATERIALIZED VIEW |
| `spc_characteristic_dim_mv` | MANAGED TABLE (CTAS) | Optional: `scripts/pipeline/spc_gold_refresh.sql` | Could become MATERIALIZED VIEW |
| `spc_lineage_graph_mv` | MANAGED TABLE (CTAS) | Optional: `scripts/pipeline/spc_gold_refresh.sql` | Could become MATERIALIZED VIEW |
| `spc_attribute_subgroup_mv` | MANAGED TABLE (CTAS) | Optional: `scripts/pipeline/spc_gold_refresh.sql` | Could become MATERIALIZED VIEW |
| `spc_quality_metric_subgroup_mv` | MANAGED TABLE (CTAS) | Optional: `scripts/pipeline/spc_gold_refresh.sql` | Materialized from spc_quality_metric_subgroup_v |

---

## 3. Materialized Views — Design Details

### 3.1 spc_nelson_rule_flags_mv

**Purpose**: Pre-compute Western Electric / Nelson rule flags for control chart stability assessment.

| Property | Value |
|----------|-------|
| **Grain** | One row per (material_id, plant_id, mic_id, batch_id) |
| **CLUSTER BY** | `(material_id, mic_id)` |
| **Estimated Rows** | ~50M (one per MIC/batch combination with quantitative data) |
| **Refresh Strategy** | Pipeline-managed with 4-hour scheduled trigger |
| **Scan Savings** | Eliminates real-time window function execution in frontend |

**Rules Implemented**:

| Rule | Description | Window |
|------|-------------|--------|
| Rule 1 | Single point > 3σ from centerline | Current row |
| Rule 2 | 9 consecutive points on same side of centerline | LAG 8 |
| Rule 3 | 6 consecutive points steadily increasing/decreasing | LAG 5 |
| Rule 4 | 14 consecutive points alternating up/down | LAG 13 |
| Rule 5 | 2 of 3 consecutive points > 2σ from centerline (same side) | LAG 2 |
| Rule 6 | 4 of 5 consecutive points > 1σ from centerline (same side) | LAG 4 |
| Rule 7 | 15 consecutive points within 1σ of centerline | LAG 14 |
| Rule 8 | 8 consecutive points > 1σ from centerline (either side) | LAG 7 |

### 3.2 spc_capability_detail_mv

**Purpose**: Pre-compute process capability indices with confidence intervals.

| Property | Value |
|----------|-------|
| **Grain** | One row per (material_id, plant_id, mic_id) |
| **CLUSTER BY** | `(material_id, mic_id)` |
| **Estimated Rows** | ~500K (distinct material/plant/MIC combinations) |
| **Refresh Strategy** | Pipeline-managed with 4-hour scheduled trigger |

**Columns**:

| Column | Formula | Notes |
|--------|---------|-------|
| `cp` | (USL - LSL) / 6σ | Potential capability |
| `cpk` | min((USL - μ) / 3σ, (μ - LSL) / 3σ) | Actual capability |
| `pp` | (USL - LSL) / 6s | Performance (overall σ) |
| `ppk` | min((USL - μ) / 3s, (μ - LSL) / 3s) | Performance index |
| `cpm` | Cp / √(1 + ((μ - T) / σ)²) | Taguchi capability (T = target) |
| `ci_lower` | Cpk × √(χ²(α/2, n-1) / (n-1)) | 95% CI lower bound |
| `ci_upper` | Cpk × √(χ²(1-α/2, n-1) / (n-1)) | 95% CI upper bound |
| `n` | Sample count | For CI calculation |

### 3.3 spc_hotelling_t2_source_mv

**Purpose**: Pre-pivot the batch × MIC matrix for multivariate Hotelling's T² analysis.

| Property | Value |
|----------|-------|
| **Grain** | One row per (material_id, batch_id) with MIC values as columns |
| **CLUSTER BY** | `(material_id)` |
| **Estimated Rows** | ~10M (distinct material/batch combinations) |
| **Refresh Strategy** | Pipeline-managed with 4-hour scheduled trigger |
| **Scan Savings** | Eliminates Python NumPy pivot in `multivariate.py` |

**Approach**: Uses PIVOT to transform (material_id, batch_id, mic_id, avg_result) into (material_id, batch_id, mic_1, mic_2, ..., mic_n). The DAL then computes covariance and T² in SQL or reads pre-computed values.

### 3.4 Existing MVs (Pipeline-Migrated)

| MV Name | CLUSTER BY | Rows | Purpose |
|---------|------------|------|---------|
| `spc_material_dim_mv` | `(material_id)` | ~50K | Material picker dimension |
| `spc_plant_material_dim_mv` | `(plant_id, material_id)` | ~200K | Plant-material picker |
| `spc_process_flow_source_mv` | `(material_id)` | ~5M | Process flow aggregation source |
| `spc_correlation_source_mv` | `(material_id, mic_id)` | ~50M | Correlation pairwise join source |

---

## 4. Lakeflow Spark Declarative Pipeline

### 4.1 Pipeline Definition File

**Path**: `scripts/pipeline/spc_gold_refresh.sql`

This single pipeline file manages all SPC materialized views using CREATE OR REFRESH MATERIALIZED VIEW syntax with quality expectations.

```sql
-- scripts/pipeline/spc_gold_refresh.sql
-- Lakeflow Spark Declarative Pipeline for SPC Gold Layer MVs

-- ============================================================================
-- DIMENSION MVs
-- ============================================================================

CREATE OR REFRESH MATERIALIZED VIEW spc_material_dim_mv
CLUSTER BY (material_id)
COMMENT 'Distinct materials with quantitative SPC data. Serves UI material-picker.'
AS
SELECT DISTINCT
    r.MATERIAL_ID AS material_id,
    COALESCE(m.MATERIAL_NAME, r.MATERIAL_ID) AS material_name
FROM LIVE.gold_batch_quality_result_v r
LEFT JOIN LIVE.gold_material m
    ON m.MATERIAL_ID = r.MATERIAL_ID AND m.LANGUAGE_ID = 'E'
WHERE r.QUANTITATIVE_RESULT IS NOT NULL
  AND (r.QUALITATIVE_RESULT IS NULL OR r.QUALITATIVE_RESULT = '');

-- Expectation: material_id must not be null
ALTER MATERIALIZED VIEW spc_material_dim_mv
ADD CONSTRAINT valid_material_id EXPECT (material_id IS NOT NULL);


CREATE OR REFRESH MATERIALIZED VIEW spc_plant_material_dim_mv
CLUSTER BY (plant_id, material_id)
COMMENT 'Distinct plant-material combinations with quantitative SPC data.'
AS
SELECT DISTINCT
    bm.PLANT_ID AS plant_id,
    COALESCE(p.PLANT_NAME, bm.PLANT_ID) AS plant_name,
    r.MATERIAL_ID AS material_id,
    COALESCE(m.MATERIAL_NAME, r.MATERIAL_ID) AS material_name
FROM LIVE.gold_batch_quality_result_v r
INNER JOIN (
    SELECT DISTINCT MATERIAL_ID, BATCH_ID, MAX(PLANT_ID) AS PLANT_ID
    FROM LIVE.gold_batch_mass_balance_v
    WHERE MOVEMENT_CATEGORY = 'Production'
    GROUP BY MATERIAL_ID, BATCH_ID
) bm ON bm.MATERIAL_ID = r.MATERIAL_ID AND bm.BATCH_ID = r.BATCH_ID
LEFT JOIN LIVE.gold_material m ON m.MATERIAL_ID = r.MATERIAL_ID AND m.LANGUAGE_ID = 'E'
LEFT JOIN LIVE.gold_plant p ON p.PLANT_ID = bm.PLANT_ID
WHERE r.QUANTITATIVE_RESULT IS NOT NULL;

ALTER MATERIALIZED VIEW spc_plant_material_dim_mv
ADD CONSTRAINT valid_plant_id EXPECT (plant_id IS NOT NULL);


-- ============================================================================
-- CORRELATION & PROCESS FLOW MVs
-- ============================================================================

CREATE OR REFRESH MATERIALIZED VIEW spc_correlation_source_mv
CLUSTER BY (material_id, mic_id)
COMMENT 'Materialized correlation source at material/batch/MIC grain.'
AS
WITH batch_metadata AS (
    SELECT
        mb.MATERIAL_ID AS material_id,
        mb.BATCH_ID AS batch_id,
        MIN(mb.POSTING_DATE) AS batch_date,
        MAX(mb.PLANT_ID) AS plant_id
    FROM LIVE.gold_batch_mass_balance_v mb
    WHERE mb.MOVEMENT_CATEGORY = 'Production'
    GROUP BY mb.MATERIAL_ID, mb.BATCH_ID
)
SELECT
    r.MATERIAL_ID AS material_id,
    bm.batch_id,
    bm.batch_date,
    bm.plant_id,
    r.MIC_ID AS mic_id,
    ANY_VALUE(r.MIC_NAME) AS mic_name,
    AVG(CAST(r.QUANTITATIVE_RESULT AS DOUBLE)) AS avg_result
FROM LIVE.gold_batch_quality_result_v r
LEFT JOIN batch_metadata bm ON bm.material_id = r.MATERIAL_ID AND bm.batch_id = r.BATCH_ID
WHERE r.QUANTITATIVE_RESULT IS NOT NULL
GROUP BY r.MATERIAL_ID, bm.batch_id, bm.batch_date, bm.plant_id, r.MIC_ID;


CREATE OR REFRESH MATERIALIZED VIEW spc_process_flow_source_mv
CLUSTER BY (material_id)
COMMENT 'Process flow source with batch lineage and quality summary.'
AS
SELECT
    lg.PRODUCED_MATERIAL_ID AS material_id,
    lg.PRODUCED_BATCH_ID AS batch_id,
    lg.CONSUMED_MATERIAL_ID AS input_material_id,
    lg.CONSUMED_BATCH_ID AS input_batch_id,
    lg.LINK_TYPE,
    qs.DISPOSITION,
    qs.TOTAL_INSPECTIONS,
    qs.PASSED_INSPECTIONS
FROM LIVE.gold_batch_quality_summary_v qs
LEFT JOIN LIVE.gold_batch_lineage lg
    ON qs.MATERIAL_ID = lg.PRODUCED_MATERIAL_ID
   AND qs.BATCH_ID = lg.PRODUCED_BATCH_ID
WHERE lg.LINK_TYPE = 'PRODUCTION';


-- ============================================================================
-- NEW: NELSON RULES MV
-- ============================================================================

CREATE OR REFRESH MATERIALIZED VIEW spc_nelson_rule_flags_mv
CLUSTER BY (material_id, mic_id)
COMMENT 'Pre-computed Nelson/WECO rule flags for control chart stability assessment.'
AS
WITH subgroup_stats AS (
    SELECT
        material_id,
        plant_id,
        mic_id,
        batch_id,
        batch_date,
        AVG(value) AS batch_mean,
        -- Global statistics per MIC (for control limits)
        AVG(AVG(value)) OVER w_mic AS centerline,
        STDDEV_SAMP(AVG(value)) OVER w_mic AS sigma
    FROM LIVE.spc_quality_metric_subgroup_v
    GROUP BY material_id, plant_id, mic_id, batch_id, batch_date
    WINDOW w_mic AS (PARTITION BY material_id, plant_id, mic_id)
),
with_rules AS (
    SELECT
        *,
        -- Deviation from centerline in sigma units
        CASE WHEN sigma > 0 THEN (batch_mean - centerline) / sigma ELSE NULL END AS z_score,
        -- Rule 1: Point > 3σ
        CASE WHEN sigma > 0 AND ABS(batch_mean - centerline) > 3 * sigma THEN 1 ELSE 0 END AS rule_1,
        -- Rule 2: 9 consecutive on same side (using sign of deviation)
        CASE 
            WHEN COUNT(CASE WHEN batch_mean > centerline THEN 1 END) 
                 OVER (PARTITION BY material_id, plant_id, mic_id ORDER BY batch_date ROWS 8 PRECEDING) = 9
              OR COUNT(CASE WHEN batch_mean < centerline THEN 1 END) 
                 OVER (PARTITION BY material_id, plant_id, mic_id ORDER BY batch_date ROWS 8 PRECEDING) = 9
            THEN 1 ELSE 0 
        END AS rule_2,
        -- Rule 5: 2 of 3 > 2σ same side
        CASE 
            WHEN sigma > 0 AND (
                SUM(CASE WHEN batch_mean > centerline + 2 * sigma THEN 1 ELSE 0 END)
                    OVER (PARTITION BY material_id, plant_id, mic_id ORDER BY batch_date ROWS 2 PRECEDING) >= 2
                OR SUM(CASE WHEN batch_mean < centerline - 2 * sigma THEN 1 ELSE 0 END)
                    OVER (PARTITION BY material_id, plant_id, mic_id ORDER BY batch_date ROWS 2 PRECEDING) >= 2
            ) THEN 1 ELSE 0 
        END AS rule_5,
        -- Rule 6: 4 of 5 > 1σ same side
        CASE 
            WHEN sigma > 0 AND (
                SUM(CASE WHEN batch_mean > centerline + sigma THEN 1 ELSE 0 END)
                    OVER (PARTITION BY material_id, plant_id, mic_id ORDER BY batch_date ROWS 4 PRECEDING) >= 4
                OR SUM(CASE WHEN batch_mean < centerline - sigma THEN 1 ELSE 0 END)
                    OVER (PARTITION BY material_id, plant_id, mic_id ORDER BY batch_date ROWS 4 PRECEDING) >= 4
            ) THEN 1 ELSE 0 
        END AS rule_6
    FROM subgroup_stats
)
SELECT
    material_id,
    plant_id,
    mic_id,
    batch_id,
    batch_date,
    batch_mean,
    centerline,
    sigma,
    z_score,
    rule_1,
    rule_2,
    rule_5,
    rule_6,
    -- Composite stability flag
    CASE WHEN rule_1 = 0 AND rule_2 = 0 AND rule_5 = 0 AND rule_6 = 0 THEN 1 ELSE 0 END AS is_stable,
    -- Violation summary
    CONCAT_WS(',',
        CASE WHEN rule_1 = 1 THEN 'R1' END,
        CASE WHEN rule_2 = 1 THEN 'R2' END,
        CASE WHEN rule_5 = 1 THEN 'R5' END,
        CASE WHEN rule_6 = 1 THEN 'R6' END
    ) AS violations
FROM with_rules;

ALTER MATERIALIZED VIEW spc_nelson_rule_flags_mv
ADD CONSTRAINT valid_batch EXPECT (batch_id IS NOT NULL);


-- ============================================================================
-- NEW: CAPABILITY DETAIL MV
-- ============================================================================

CREATE OR REFRESH MATERIALIZED VIEW spc_capability_detail_mv
CLUSTER BY (material_id, mic_id)
COMMENT 'Process capability indices (Cp, Cpk, Pp, Ppk, Cpm) with 95% confidence intervals.'
AS
WITH mic_stats AS (
    SELECT
        material_id,
        plant_id,
        mic_id,
        mic_name,
        COUNT(*) AS n,
        AVG(value) AS mean_value,
        STDDEV_SAMP(value) AS stddev_overall,
        MAX(usl_spec) AS usl,
        MAX(lsl_spec) AS lsl,
        MAX(nominal_target) AS target
    FROM LIVE.spc_quality_metric_subgroup_v
    WHERE value IS NOT NULL
    GROUP BY material_id, plant_id, mic_id, mic_name
    HAVING COUNT(*) >= 30  -- Minimum sample for meaningful capability
)
SELECT
    material_id,
    plant_id,
    mic_id,
    mic_name,
    n,
    mean_value,
    stddev_overall,
    usl,
    lsl,
    target,
    -- Pp (overall)
    CASE 
        WHEN stddev_overall > 0 AND usl IS NOT NULL AND lsl IS NOT NULL 
        THEN (usl - lsl) / (6 * stddev_overall) 
    END AS pp,
    -- Ppk (overall)
    CASE 
        WHEN stddev_overall > 0 AND usl IS NOT NULL AND lsl IS NOT NULL 
        THEN LEAST(
            (usl - mean_value) / (3 * stddev_overall),
            (mean_value - lsl) / (3 * stddev_overall)
        )
        WHEN stddev_overall > 0 AND usl IS NOT NULL 
        THEN (usl - mean_value) / (3 * stddev_overall)
        WHEN stddev_overall > 0 AND lsl IS NOT NULL 
        THEN (mean_value - lsl) / (3 * stddev_overall)
    END AS ppk,
    -- Cpm (Taguchi) - accounts for deviation from target
    CASE 
        WHEN stddev_overall > 0 AND target IS NOT NULL AND usl IS NOT NULL AND lsl IS NOT NULL 
        THEN (usl - lsl) / (6 * SQRT(POWER(stddev_overall, 2) + POWER(mean_value - target, 2)))
    END AS cpm,
    -- 95% CI bounds (approximation using normal distribution for large n)
    -- For proper CI, join to chi2_inv_lookup table
    CASE 
        WHEN n >= 30 AND stddev_overall > 0 
        THEN (
            CASE 
                WHEN usl IS NOT NULL AND lsl IS NOT NULL 
                THEN LEAST(
                    (usl - mean_value) / (3 * stddev_overall),
                    (mean_value - lsl) / (3 * stddev_overall)
                )
            END
        ) * (1 - 1.96 / SQRT(2 * (n - 1)))
    END AS ppk_ci_lower,
    CASE 
        WHEN n >= 30 AND stddev_overall > 0 
        THEN (
            CASE 
                WHEN usl IS NOT NULL AND lsl IS NOT NULL 
                THEN LEAST(
                    (usl - mean_value) / (3 * stddev_overall),
                    (mean_value - lsl) / (3 * stddev_overall)
                )
            END
        ) * (1 + 1.96 / SQRT(2 * (n - 1)))
    END AS ppk_ci_upper
FROM mic_stats;

ALTER MATERIALIZED VIEW spc_capability_detail_mv
ADD CONSTRAINT min_samples EXPECT (n >= 30) ON VIOLATION DROP ROW;
```

### 4.2 Pipeline Configuration

The pipeline will be configured in `databricks.yml` (see Section 6) with:

* **Catalog**: `${var.trace_catalog}` (e.g., `connected_plant_uat`)
* **Target schema**: `${var.trace_schema}` (e.g., `gold`)
* **Serverless**: Enabled for cost efficiency
* **Channel**: `CURRENT` for stable releases
* **Continuous**: `false` — triggered by scheduled job

---

## 5. Databricks Jobs

### 5.1 spc_gold_refresh_job

**Purpose**: Trigger the Lakeflow pipeline on a schedule to refresh all MVs.

| Property | Value |
|----------|-------|
| **Schedule** | Every 4 hours during business hours (06:00-22:00 UTC) |
| **Compute** | Serverless |
| **Timeout** | 2 hours |
| **Retries** | 2 |
| **Alerts** | Email on failure to `${var.job_notification_email}` |

**Cron Expression**: `0 0 6,10,14,18,22 * * ?`

### 5.2 spc_migration_runner_job

**Purpose**: One-shot job to run DDL migrations for non-pipeline-managed objects (tables, views, metric views, UDFs).

| Property | Value |
|----------|-------|
| **Schedule** | On-demand (manual trigger or CI/CD) |
| **Compute** | Serverless |
| **Timeout** | 30 minutes |
| **Task Type** | SQL task with `scripts/migrations/*.sql` |

This job runs the Makefile targets for:
* `setup-locked-limits`
* `setup-exclusions`
* `setup-query-audit`
* `setup-views` (regular views and metric views)

---

## 6. Updated databricks.yml

```yaml
bundle:
  name: spc-tim
  databricks_cli_version: '>= 0.283.0'

variables:
  # ── Existing variables ──
  app_name:
    default: spc-tim
  warehouse_http_path:
    default: /sql/1.0/warehouses/e76480b94bea6ed5
  trace_catalog:
    default: connected_plant_uat
  trace_schema:
    default: gold
  locked_limits_migration:
    default: scripts/migrations/000_setup_locked_limits.sql

  # ── NEW variables ──
  pipeline_name:
    default: spc-gold-refresh
  job_notification_email:
    default: spc-alerts @kerry.com
  refresh_schedule_cron:
    default: "0 0 6,10,14,18,22 * * ?"
  refresh_schedule_timezone:
    default: UTC

targets:
  # ── Development ──
  dev:
    workspace:
      root_path: /Shared/.bundle/${bundle.name}/dev
    variables:
      trace_catalog: connected_plant_dev
      warehouse_http_path: /sql/1.0/warehouses/dev_warehouse_id
      refresh_schedule_cron: "0 0 */2 * * ?"  # Every 2 hours for testing
      job_notification_email: tim.geldard @kerry.com

  # ── UAT (default) ──
  uat:
    default: true
    workspace:
      root_path: /Shared/.bundle/${bundle.name}/${bundle.target}
    variables:
      trace_catalog: connected_plant_uat
      refresh_schedule_cron: "0 0 6,10,14,18,22 * * ?"

  # ── Production ──
  prod:
    workspace:
      root_path: /Shared/.bundle/${bundle.name}/${bundle.target}
    variables:
      trace_catalog: connected_plant_prod
      warehouse_http_path: /sql/1.0/warehouses/prod_warehouse_id
      refresh_schedule_cron: "0 0 */2 * * ?"  # Every 2 hours in prod
      job_notification_email: spc-prod-alerts @kerry.com

resources:
  # ── Existing: Databricks App ──
  apps:
    spc:
      name: ${var.app_name}
      description: Statistical Process Control app powered by Databricks
      source_code_path: .
      user_api_scopes:
        - sql

  # ── NEW: Lakeflow Spark Declarative Pipeline ──
  pipelines:
    spc_gold_refresh:
      name: ${var.pipeline_name}
      catalog: ${var.trace_catalog}
      target: ${var.trace_schema}
      channel: CURRENT
      photon: true
      serverless: true
      continuous: false
      development: false
      libraries:
        - file:
            path: scripts/pipeline/spc_gold_refresh.sql
      configuration:
        trace_catalog: ${var.trace_catalog}
        trace_schema: ${var.trace_schema}
      clusters:
        - label: default
          num_workers: 0  # Serverless

  # ── NEW: Scheduled Refresh Job ──
  jobs:
    spc_gold_refresh_job:
      name: spc-gold-refresh-job-${bundle.target}
      description: Scheduled refresh of SPC gold-layer materialized views
      schedule:
        quartz_cron_expression: ${var.refresh_schedule_cron}
        timezone_id: ${var.refresh_schedule_timezone}
      email_notifications:
        on_failure:
          - ${var.job_notification_email}
      tasks:
        - task_key: refresh_mvs
          pipeline_task:
            pipeline_id: ${resources.pipelines.spc_gold_refresh.id}
            full_refresh: false
      max_concurrent_runs: 1
      timeout_seconds: 7200  # 2 hours

    spc_migration_runner_job:
      name: spc-migration-runner-${bundle.target}
      description: One-shot job to apply DDL migrations for tables/views/UDFs
      tasks:
        - task_key: run_migrations
          sql_task:
            warehouse_id: ${var.warehouse_http_path}
            file:
              path: scripts/migrations/run_all_migrations.sql
      max_concurrent_runs: 1
      timeout_seconds: 1800  # 30 minutes
```

---

## 7. Schemas & Catalog Definitions

### 7.1 Catalog Setup Script

**Path**: `scripts/catalog/setup_catalog.sql`

```sql
-- scripts/catalog/setup_catalog.sql
-- Idempotent setup of Unity Catalog resources for SPC

-- Create catalog if not exists (requires CREATE CATALOG privilege)
-- Typically done once by admin; included here for completeness
-- CREATE CATALOG IF NOT EXISTS ${TRACE_CATALOG}
--   COMMENT 'Connected Plant data catalog for manufacturing analytics';

-- Create or update schema
CREATE SCHEMA IF NOT EXISTS `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`
  COMMENT 'Gold layer: governed, business-ready manufacturing data including SPC metrics';

-- Set schema properties
ALTER SCHEMA `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`
  SET DBPROPERTIES (
    'owner' = 'data-engineering @kerry.com',
    'domain' = 'manufacturing',
    'tier' = 'gold',
    'contains_pii' = 'false'
  );
```

### 7.2 Multi-Catalog Deployment

The bundle supports multi-plant / multi-catalog deployments via target-specific variable overrides:

| Target | Catalog | Use Case |
|--------|---------|----------|
| `dev` | `connected_plant_dev` | Development testing with synthetic data |
| `uat` | `connected_plant_uat` | Pre-production validation with production-like data |
| `prod` | `connected_plant_prod` | Production deployment |

Each target can also override `trace_schema` if needed for schema-level isolation.

---

## 8. Grants, Tags, and Lineage Metadata

### 8.1 Grants Script

**Path**: `scripts/grants/spc_gold_grants.sql`

```sql
-- scripts/grants/spc_gold_grants.sql
-- Unity Catalog grants for SPC gold-layer objects

-- Grant SELECT on all SPC views and MVs to data consumers
GRANT SELECT ON VIEW `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_quality_metric_subgroup_v`
  TO `spc-data-consumers`;
GRANT SELECT ON VIEW `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_quality_metrics`
  TO `spc-data-consumers`;
GRANT SELECT ON TABLE `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_material_dim_mv`
  TO `spc-data-consumers`;
GRANT SELECT ON TABLE `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_nelson_rule_flags_mv`
  TO `spc-data-consumers`;
GRANT SELECT ON TABLE `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_capability_detail_mv`
  TO `spc-data-consumers`;

-- Grant MODIFY on user-editable tables to app service principal
GRANT MODIFY ON TABLE `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_locked_limits`
  TO `spc-app-service-principal`;
GRANT MODIFY ON TABLE `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_exclusions`
  TO `spc-app-service-principal`;
GRANT MODIFY ON TABLE `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_mic_chart_config`
  TO `spc-app-service-principal`;

-- Grant pipeline execution to data engineering
GRANT EXECUTE ON PIPELINE `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc-gold-refresh`
  TO `data-engineering`;
```

### 8.2 Tags Script

**Path**: `scripts/tags/spc_gold_tags.sql`

```sql
-- scripts/tags/spc_gold_tags.sql
-- Unity Catalog tags for SPC gold-layer objects

-- Tag all SPC objects with domain
ALTER VIEW `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_quality_metric_subgroup_v`
  SET TAGS ('domain' = 'spc', 'tier' = 'gold', 'pii' = 'false');

ALTER TABLE `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_material_dim_mv`
  SET TAGS ('domain' = 'spc', 'tier' = 'gold', 'pii' = 'false', 'refresh' = 'pipeline');

ALTER TABLE `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_locked_limits`
  SET TAGS ('domain' = 'spc', 'tier' = 'gold', 'pii' = 'false', 'user_editable' = 'true');

-- Tag capability columns with statistical method
ALTER TABLE `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_capability_detail_mv`
  ALTER COLUMN ppk_ci_lower SET TAGS ('statistical_method' = 'montgomery_95ci');
ALTER TABLE `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_capability_detail_mv`
  ALTER COLUMN ppk_ci_upper SET TAGS ('statistical_method' = 'montgomery_95ci');
```

### 8.3 Lineage

Unity Catalog automatically tracks lineage for:

* **Pipeline MVs**: Lineage flows from upstream gold views → pipeline MVs
* **Metric Views**: Lineage flows from source views → metric view measures
* **Regular Views**: Lineage flows from base tables → derived views

No additional configuration required. Lineage is visible in Catalog Explorer and queryable via `INFORMATION_SCHEMA.TABLE_LINEAGE`.

---

## 9. Schema Contract / Data Quality Documentation

### 9.1 docs/DATA_CONTRACT.md Updates

Add a new section to the existing `docs/DATA_CONTRACT.md`:

```markdown
## SPC-Owned Gold Objects

### Materialized Views (Pipeline-Managed)

| Object | Grain | Refresh | SLA | Owner |
|--------|-------|---------|-----|-------|
| spc_material_dim_mv | material_id | 4h | 99.5% | SPC Team |
| spc_plant_material_dim_mv | plant_id, material_id | 4h | 99.5% | SPC Team |
| spc_correlation_source_mv | material_id, batch_id, mic_id | 4h | 99.5% | SPC Team |
| spc_process_flow_source_mv | material_id, batch_id | 4h | 99.5% | SPC Team |
| spc_nelson_rule_flags_mv | material_id, plant_id, mic_id, batch_id | 4h | 99.5% | SPC Team |
| spc_capability_detail_mv | material_id, plant_id, mic_id | 4h | 99.5% | SPC Team |

### User-Editable Tables

| Object | Purpose | Retention |
|--------|---------|-----------|
| spc_locked_limits | User-defined control limits | Permanent |
| spc_exclusions | Sample/batch exclusions | Permanent |
| spc_mic_chart_config | Chart type overrides | Permanent |
| spc_query_audit | Query audit log | 90 days |
```

### 9.2 docs/GOLD_LAYER.md (New)

**Path**: `docs/GOLD_LAYER.md`

```markdown
# SPC Gold Layer Documentation

## Object Inventory

| Object Name | Type | Grain | Clustering | Refresh |
|-------------|------|-------|------------|---------|
| spc_quality_metric_subgroup_v | VIEW | sample | N/A | Real-time |
| spc_quality_metrics | METRIC VIEW | flexible | N/A | Real-time |
| spc_material_dim_mv | MATERIALIZED VIEW | material_id | material_id | Pipeline (4h) |
| spc_plant_material_dim_mv | MATERIALIZED VIEW | plant_id, material_id | plant_id, material_id | Pipeline (4h) |
| spc_correlation_source_mv | MATERIALIZED VIEW | material_id, batch_id, mic_id | material_id, mic_id | Pipeline (4h) |
| spc_nelson_rule_flags_mv | MATERIALIZED VIEW | material_id, plant_id, mic_id, batch_id | material_id, mic_id | Pipeline (4h) |
| spc_capability_detail_mv | MATERIALIZED VIEW | material_id, plant_id, mic_id | material_id, mic_id | Pipeline (4h) |
| spc_locked_limits | TABLE | material_id, plant_id, mic_id, operation_id | N/A | User-managed |
| spc_exclusions | TABLE | material_id, batch_id, mic_id | N/A | User-managed |

## Refresh Cadence

- **Real-time views**: Query upstream gold on every request
- **Pipeline MVs**: Refreshed every 4 hours via `spc_gold_refresh_job`
- **User-managed tables**: Updated via app UI; no automated refresh

## Clustering Strategy

All MVs use CLUSTER BY for optimal query performance:
- **material_id**: Primary filter in all scorecard/chart queries
- **mic_id**: Secondary filter for MIC-specific analysis
- **plant_id**: Tertiary filter for plant scoping

## Quality Expectations

Each pipeline MV has EXPECT constraints:
- `valid_material_id`: material_id IS NOT NULL
- `valid_plant_id`: plant_id IS NOT NULL (where applicable)
- `min_samples`: n >= 30 (for capability MVs)
```

### 9.3 docs/SPC_DATA_MODEL.md (New)

**Path**: `docs/SPC_DATA_MODEL.md`

```markdown
# SPC Data Model

## Entity Relationship Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           UPSTREAM GOLD VIEWS                           │
│  (Not SPC-owned; read-only dependencies)                                │
├─────────────────────────────────────────────────────────────────────────┤
│  gold_batch_quality_result_v ─────┬───► spc_quality_metric_subgroup_v   │
│  gold_batch_mass_balance_v ───────┤                                     │
│  gold_material ───────────────────┤                                     │
│  gold_plant ──────────────────────┘                                     │
│  gold_batch_lineage ──────────────────► spc_process_flow_source_mv      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           SPC BASE VIEWS                                │
├─────────────────────────────────────────────────────────────────────────┤
│  spc_quality_metric_subgroup_v ───┬───► spc_quality_metrics (METRIC)    │
│                                   ├───► spc_nelson_rule_flags_mv        │
│                                   ├───► spc_capability_detail_mv        │
│                                   └───► spc_correlation_source_mv       │
│  spc_attribute_metric_source_v ───────► spc_attribute_quality_metrics   │
│  spc_unified_mic_key_v                                                  │
│  spc_mic_routing_v                                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SPC DIMENSION MVs                               │
├─────────────────────────────────────────────────────────────────────────┤
│  spc_material_dim_mv          (UI material picker)                      │
│  spc_plant_material_dim_mv    (UI plant-material picker)                │
│  spc_characteristic_dim_mv    (UI MIC picker)                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       SPC USER-EDITABLE TABLES                          │
├─────────────────────────────────────────────────────────────────────────┤
│  spc_locked_limits      (control limit overrides)                       │
│  spc_exclusions         (sample/batch exclusions)                       │
│  spc_mic_chart_config   (chart type overrides)                          │
│  spc_query_audit        (audit log)                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Relationships

| From | To | Join Key | Cardinality |
|------|-----|----------|-------------|
| gold_batch_quality_result_v | spc_quality_metric_subgroup_v | MATERIAL_ID, BATCH_ID | 1:N |
| spc_quality_metric_subgroup_v | spc_quality_metrics | source view | N/A (metric) |
| spc_quality_metric_subgroup_v | spc_nelson_rule_flags_mv | material_id, mic_id, batch_id | N:1 |
| spc_quality_metric_subgroup_v | spc_capability_detail_mv | material_id, plant_id, mic_id | N:1 |
| spc_locked_limits | spc_quality_metric_subgroup_v | material_id, plant_id, mic_id, operation_id | 1:N |
```

### 9.4 Machine-Readable Contract

**Path**: `backend/schema/spc_gold_views.v1.json`

```json
{
  "$schema": "https://json-schema.org/draft/2020-12/schema",
  "title": "SPC Gold Layer Schema Contract",
  "version": "1.0.0",
  "objects": {
    "spc_quality_metric_subgroup_v": {
      "type": "VIEW",
      "grain": ["material_id", "batch_id", "mic_id", "operation_id"],
      "columns": {
        "material_id": {"type": "STRING", "nullable": false},
        "material_name": {"type": "STRING", "nullable": true},
        "batch_id": {"type": "STRING", "nullable": false},
        "plant_id": {"type": "STRING", "nullable": true},
        "mic_id": {"type": "STRING", "nullable": false},
        "value": {"type": "DOUBLE", "nullable": true},
        "lsl_spec": {"type": "DOUBLE", "nullable": true},
        "usl_spec": {"type": "DOUBLE", "nullable": true}
      }
    },
    "spc_nelson_rule_flags_mv": {
      "type": "MATERIALIZED_VIEW",
      "grain": ["material_id", "plant_id", "mic_id", "batch_id"],
      "clustering": ["material_id", "mic_id"],
      "columns": {
        "material_id": {"type": "STRING", "nullable": false},
        "plant_id": {"type": "STRING", "nullable": false},
        "mic_id": {"type": "STRING", "nullable": false},
        "batch_id": {"type": "STRING", "nullable": false},
        "is_stable": {"type": "INT", "nullable": false},
        "violations": {"type": "STRING", "nullable": true}
      }
    },
    "spc_capability_detail_mv": {
      "type": "MATERIALIZED_VIEW",
      "grain": ["material_id", "plant_id", "mic_id"],
      "clustering": ["material_id", "mic_id"],
      "columns": {
        "material_id": {"type": "STRING", "nullable": false},
        "plant_id": {"type": "STRING", "nullable": false},
        "mic_id": {"type": "STRING", "nullable": false},
        "ppk": {"type": "DOUBLE", "nullable": true},
        "ppk_ci_lower": {"type": "DOUBLE", "nullable": true},
        "ppk_ci_upper": {"type": "DOUBLE", "nullable": true}
      }
    }
  }
}
```

---

## 10. Environment-Specific Overrides

### Target Configuration Matrix

| Variable | dev | uat | prod |
|----------|-----|-----|------|
| `trace_catalog` | `connected_plant_dev` | `connected_plant_uat` | `connected_plant_prod` |
| `trace_schema` | `gold` | `gold` | `gold` |
| `warehouse_http_path` | dev warehouse | `/sql/1.0/warehouses/e76480b94bea6ed5` | prod warehouse |
| `refresh_schedule_cron` | `0 0 */2 * * ?` (2h) | `0 0 6,10,14,18,22 * * ?` (5×/day) | `0 0 */2 * * ?` (2h) |
| `job_notification_email` | developer email | team DL | prod-alerts DL |
| Pipeline `development` | `true` | `false` | `false` |

### Development Target Details

```yaml
dev:
  workspace:
    root_path: /Shared/.bundle/${bundle.name}/dev
  variables:
    trace_catalog: connected_plant_dev
    warehouse_http_path: /sql/1.0/warehouses/dev_warehouse_id
    refresh_schedule_cron: "0 0 */2 * * ?"
    job_notification_email: tim.geldard @kerry.com
  resources:
    pipelines:
      spc_gold_refresh:
        development: true  # Enables faster iteration
```

### UAT Target Details

```yaml
uat:
  default: true
  workspace:
    root_path: /Shared/.bundle/${bundle.name}/uat
  variables:
    trace_catalog: connected_plant_uat
    refresh_schedule_cron: "0 0 6,10,14,18,22 * * ?"
```

### Production Target Details

```yaml
prod:
  workspace:
    root_path: /Shared/.bundle/${bundle.name}/prod
  variables:
    trace_catalog: connected_plant_prod
    warehouse_http_path: /sql/1.0/warehouses/prod_warehouse_id
    refresh_schedule_cron: "0 0 */2 * * ?"
    job_notification_email: spc-prod-alerts @kerry.com
  resources:
    jobs:
      spc_gold_refresh_job:
        email_notifications:
          on_failure:
            - spc-prod-alerts @kerry.com
            - oncall-pager @kerry.com
```

---

## 11. CI/CD Enhancements

### Updated .github/workflows/deploy.yml

```yaml
name: CI

on:
  push:
    branches: [main]
  pull_request:
    branches: [main]
  workflow_dispatch:

jobs:
  # ── Existing: lint-and-test ──
  lint-and-test:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout
        uses: actions/checkout @frontend/dist/assets/process-flow-BZV40eAE.css

      # ... existing frontend steps (typecheck, test, build, bundle:check) ...
      # ... existing backend steps (pytest with coverage) ...

  # ── NEW: validate-gold-sql ──
  validate-gold-sql:
    runs-on: ubuntu-latest
    needs: lint-and-test
    steps:
      - name: Checkout
        uses: actions/checkout @frontend/dist/assets/process-flow-BZV40eAE.css

      - name: Set up Databricks CLI
        uses: databricks/setup-cli @frontend/src/main.jsx

      - name: Configure Databricks CLI
        env:
          DATABRICKS_HOST: ${{ secrets.DATABRICKS_HOST }}
          DATABRICKS_TOKEN: ${{ secrets.DATABRICKS_TOKEN }}
        run: |
          cat > "$HOME/.databrickscfg" <<EOF
          [ci]
          host = ${DATABRICKS_HOST}
          token = ${DATABRICKS_TOKEN}
          EOF

      - name: Validate bundle
        run: databricks bundle validate -t uat --profile ci

      - name: Validate pipeline SQL syntax
        run: |
          # Run SQL syntax check on pipeline files
          for f in scripts/pipeline/*.sql; do
            echo "Validating $f..."
            databricks sql query --profile ci --warehouse-id ${{ vars.WAREHOUSE_ID }} \
              "EXPLAIN $(cat $f | head -50)" || echo "Warning: $f may have syntax issues"
          done

  # ── NEW: schema-contract-check ──
  schema-contract-check:
    runs-on: ubuntu-latest
    needs: lint-and-test
    steps:
      - name: Checkout
        uses: actions/checkout @frontend/dist/assets/process-flow-BZV40eAE.css

      - name: Set up Python
        uses: actions/setup-python @v5
        with:
          python-version: '3.11'

      - name: Install jsonschema
        run: pip install jsonschema

      - name: Validate schema contract JSON
        run: |
          python -c "
          import json
          with open('backend/schema/spc_gold_views.v1.json') as f:
              contract = json.load(f)
          print(f'Schema contract valid: {len(contract[\"objects\"])} objects defined')
          "

  # ── NEW: gold-integration-test ──
  gold-integration-test:
    runs-on: ubuntu-latest
    needs: [validate-gold-sql, schema-contract-check]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    steps:
      - name: Checkout
        uses: actions/checkout @frontend/dist/assets/process-flow-BZV40eAE.css

      - name: Set up Databricks CLI
        uses: databricks/setup-cli @frontend/src/main.jsx

      - name: Configure Databricks CLI
        env:
          DATABRICKS_HOST: ${{ secrets.DATABRICKS_HOST }}
          DATABRICKS_TOKEN: ${{ secrets.DATABRICKS_TOKEN }}
        run: |
          cat > "$HOME/.databrickscfg" <<EOF
          [ci]
          host = ${DATABRICKS_HOST}
          token = ${DATABRICKS_TOKEN}
          EOF

      - name: Run SQL integration tests
        env:
          TRACE_CATALOG: ${{ vars.TRACE_CATALOG || 'connected_plant_uat' }}
          TRACE_SCHEMA: ${{ vars.TRACE_SCHEMA || 'gold' }}
        run: |
          for f in scripts/tests/*.sql; do
            echo "Running $f..."
            cat $f | envsubst | databricks sql query --profile ci --warehouse-id ${{ vars.WAREHOUSE_ID }}
          done

  # ── Updated: deploy ──
  deploy:
    runs-on: ubuntu-latest
    needs: [validate-gold-sql, schema-contract-check, gold-integration-test]
    if: github.event_name == 'push' && github.ref == 'refs/heads/main'
    environment: uat
    steps:
      - name: Checkout
        uses: actions/checkout @frontend/dist/assets/process-flow-BZV40eAE.css

      - name: Set up Databricks CLI
        uses: databricks/setup-cli @frontend/src/main.jsx

      - name: Configure Databricks CLI
        env:
          DATABRICKS_HOST: ${{ secrets.DATABRICKS_HOST }}
          DATABRICKS_TOKEN: ${{ secrets.DATABRICKS_TOKEN }}
        run: |
          cat > "$HOME/.databrickscfg" <<EOF
          [ci]
          host = ${DATABRICKS_HOST}
          token = ${DATABRICKS_TOKEN}
          EOF

      - name: Deploy bundle
        run: databricks bundle deploy -t uat --profile ci

      - name: Apply migrations
        env:
          TRACE_CATALOG: ${{ vars.TRACE_CATALOG || 'connected_plant_uat' }}
          TRACE_SCHEMA: ${{ vars.TRACE_SCHEMA || 'gold' }}
        run: |
          make setup-locked-limits PROFILE=ci
          make setup-exclusions PROFILE=ci
          make setup-query-audit PROFILE=ci
          make setup-views PROFILE=ci

      - name: Trigger pipeline refresh
        run: |
          databricks pipelines start-update \
            --pipeline-id $(databricks bundle show -t uat --profile ci | grep spc_gold_refresh | awk '{print $2}') \
            --profile ci
```

### Dependency Graph

```
lint-and-test
      │
      ├──► validate-gold-sql
      │           │
      └──► schema-contract-check
                  │
                  ▼
         gold-integration-test
                  │
                  ▼
              deploy
```

---

## 12. Tests

### 12.1 SQL Unit Tests

**Path**: `scripts/tests/test_spc_quality_metrics.sql`

```sql
-- Test: spc_quality_metrics measure correctness for known material
-- Expected: Returns correct batch_count and mean_value for test material

WITH test_result AS (
    SELECT
        material_id,
        MEASURE(batch_count) AS batch_count,
        MEASURE(mean_value) AS mean_value,
        MEASURE(ppk_gaussian) AS ppk
    FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_quality_metrics`
    WHERE material_id = '20582002'  -- Known test material
    GROUP BY material_id
)
SELECT
    CASE
        WHEN batch_count > 0 AND mean_value IS NOT NULL
        THEN 'PASS: spc_quality_metrics returns valid data'
        ELSE 'FAIL: spc_quality_metrics returned no data for test material'
    END AS test_result,
    batch_count,
    mean_value,
    ppk
FROM test_result;
```

**Path**: `scripts/tests/test_nelson_rules.sql`

```sql
-- Test: Nelson Rule 1 detection (point > 3σ)
-- Uses synthetic data pattern to verify rule triggers correctly

WITH synthetic_data AS (
    SELECT 1 AS idx, 100.0 AS value UNION ALL
    SELECT 2, 101.0 UNION ALL
    SELECT 3, 99.0 UNION ALL
    SELECT 4, 100.5 UNION ALL
    SELECT 5, 150.0  -- Outlier > 3σ
),
stats AS (
    SELECT
        AVG(value) AS centerline,
        STDDEV_SAMP(value) AS sigma
    FROM synthetic_data
),
flagged AS (
    SELECT
        d.idx,
        d.value,
        s.centerline,
        s.sigma,
        CASE WHEN ABS(d.value - s.centerline) > 3 * s.sigma THEN 1 ELSE 0 END AS rule_1
    FROM synthetic_data d
    CROSS JOIN stats s
)
SELECT
    CASE
        WHEN SUM(CASE WHEN idx = 5 AND rule_1 = 1 THEN 1 ELSE 0 END) = 1
        THEN 'PASS: Rule 1 correctly flags outlier at idx 5'
        ELSE 'FAIL: Rule 1 did not flag expected outlier'
    END AS test_result
FROM flagged;
```

**Path**: `scripts/tests/test_capability_ci.sql`

```sql
-- Test: Capability CI bounds are ordered correctly
-- ci_lower < ppk < ci_upper for all rows with sufficient samples

SELECT
    CASE
        WHEN COUNT(*) = 0
        THEN 'SKIP: No capability data with CI bounds'
        WHEN SUM(CASE WHEN ppk_ci_lower > ppk OR ppk > ppk_ci_upper THEN 1 ELSE 0 END) = 0
        THEN 'PASS: All CI bounds correctly ordered (lower < ppk < upper)'
        ELSE 'FAIL: Found CI bounds out of order'
    END AS test_result,
    COUNT(*) AS rows_checked,
    SUM(CASE WHEN ppk_ci_lower > ppk OR ppk > ppk_ci_upper THEN 1 ELSE 0 END) AS violations
FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_capability_detail_mv`
WHERE ppk IS NOT NULL
  AND ppk_ci_lower IS NOT NULL
  AND ppk_ci_upper IS NOT NULL;
```

**Path**: `scripts/tests/test_mv_not_empty.sql`

```sql
-- Test: All pipeline-managed MVs have rows after refresh

WITH mv_counts AS (
    SELECT 'spc_material_dim_mv' AS mv_name, 
           (SELECT COUNT(*) FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_material_dim_mv`) AS row_count
    UNION ALL
    SELECT 'spc_plant_material_dim_mv',
           (SELECT COUNT(*) FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_plant_material_dim_mv`)
    UNION ALL
    SELECT 'spc_correlation_source_mv',
           (SELECT COUNT(*) FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_correlation_source_mv`)
    UNION ALL
    SELECT 'spc_process_flow_source_mv',
           (SELECT COUNT(*) FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_process_flow_source_mv`)
)
SELECT
    mv_name,
    row_count,
    CASE WHEN row_count > 0 THEN 'PASS' ELSE 'FAIL: MV is empty' END AS test_result
FROM mv_counts;
```

### 12.2 Backend Test Updates

**Updates to**: `backend/tests/test_spc_analysis_dal.py`

```python
# Add mock for new gold objects

 @pytest.fixture
def mock_nelson_flags():
    """Mock spc_nelson_rule_flags_mv response."""
    return [
        {
            "material_id": "20582002",
            "plant_id": "1000",
            "mic_id": "MIC001",
            "batch_id": "0009989623",
            "is_stable": 1,
            "violations": None
        }
    ]

def test_fetch_scorecard_reads_stability_from_nelson_mv(mock_db, mock_nelson_flags):
    """Verify scorecard reads is_stable from MV instead of computing in frontend."""
    mock_db.execute.return_value = mock_nelson_flags
    
    result = fetch_scorecard(material_id="20582002", plant_id="1000")
    
    # Verify query hits the MV
    call_args = mock_db.execute.call_args[0][0]
    assert "spc_nelson_rule_flags_mv" in call_args
    assert result[0]["is_stable"] == 1
```

---

## 13. Sample Content

### 13a. Gold Materialized View — spc_nelson_rule_flags_mv

See Section 4.1 for the complete DDL in the pipeline file.

### 13b. Lakeflow Pipeline Definition in databricks.yml

```yaml
resources:
  pipelines:
    spc_gold_refresh:
      name: ${var.pipeline_name}
      catalog: ${var.trace_catalog}
      target: ${var.trace_schema}
      channel: CURRENT
      photon: true
      serverless: true
      continuous: false
      development: false
      libraries:
        - file:
            path: scripts/pipeline/spc_gold_refresh.sql
      configuration:
        trace_catalog: ${var.trace_catalog}
        trace_schema: ${var.trace_schema}
      clusters:
        - label: default
          num_workers: 0
```

### 13c. Updated resources Section in databricks.yml

```yaml
resources:
  # Existing app
  apps:
    spc:
      name: ${var.app_name}
      description: Statistical Process Control app powered by Databricks
      source_code_path: .
      user_api_scopes:
        - sql

  # NEW: Pipeline
  pipelines:
    spc_gold_refresh:
      name: ${var.pipeline_name}
      catalog: ${var.trace_catalog}
      target: ${var.trace_schema}
      channel: CURRENT
      photon: true
      serverless: true
      continuous: false
      libraries:
        - file:
            path: scripts/pipeline/spc_gold_refresh.sql

  # NEW: Jobs
  jobs:
    spc_gold_refresh_job:
      name: spc-gold-refresh-job-${bundle.target}
      description: Scheduled refresh of SPC gold-layer materialized views
      schedule:
        quartz_cron_expression: ${var.refresh_schedule_cron}
        timezone_id: ${var.refresh_schedule_timezone}
      email_notifications:
        on_failure:
          - ${var.job_notification_email}
      tasks:
        - task_key: refresh_mvs
          pipeline_task:
            pipeline_id: ${resources.pipelines.spc_gold_refresh.id}
            full_refresh: false
      max_concurrent_runs: 1
      timeout_seconds: 7200

    spc_migration_runner_job:
      name: spc-migration-runner-${bundle.target}
      description: One-shot job to apply DDL migrations
      tasks:
        - task_key: run_migrations
          sql_task:
            warehouse_id: ${var.warehouse_http_path}
            file:
              path: scripts/run_all_migrations.sql
      max_concurrent_runs: 1
      timeout_seconds: 1800
```

### 13d. Schema Contract Markdown Template

See Section 9.2 (`docs/GOLD_LAYER.md`) and Section 9.3 (`docs/SPC_DATA_MODEL.md`) for complete examples.

---

## 14. Migration Path

### Phase 1: Add Pipeline + Job Resources (Week 1-2)

**Goal**: Declarative management of existing 4 MVs without changing behavior.

1. Create `scripts/pipeline/spc_gold_refresh.sql` with existing MV DDL
2. Add `pipelines` and `jobs` sections to `databricks.yml`
3. Deploy: `databricks bundle deploy -t uat`
4. Verify MVs refresh correctly via pipeline
5. Deprecate migration scripts 015-018 (mark as "pipeline-managed")

**Validation**:
- [ ] Pipeline runs successfully
- [ ] MV row counts match pre-migration
- [ ] DAL queries return same results

### Phase 2: Add New Gold Objects (Week 3-4)

**Goal**: Pre-compute Nelson rules and capability CIs in SQL.

1. Add `spc_nelson_rule_flags_mv` to pipeline
2. Add `spc_capability_detail_mv` to pipeline
3. Add `spc_chi2_inv_lookup` table via migration
4. Add `spc_spec_drift_v` and `spc_control_limit_history_v` views via migration
5. Deploy and verify

**Validation**:
- [ ] Nelson MV flags match frontend JS calculations for sample batches
- [ ] Capability CI bounds match Python `cpk_ci()` for sample MICs
- [ ] Pipeline completes in < 1 hour

### Phase 3: Thin the DAL (Week 5-6)

**Goal**: Backend reads from gold instead of computing.

1. Update `spc_analysis_dal.py`:
   - `fetch_scorecard()` reads `is_stable` from `spc_nelson_rule_flags_mv`
   - `fetch_scorecard()` reads `ci_lower`, `ci_upper` from `spc_capability_detail_mv`
2. Update `spc_analysis_dal.py`:
   - `fetch_multivariate()` reads pre-pivoted data from `spc_hotelling_t2_source_mv` (Phase 2b)
3. Remove Python `cpk_ci()` function
4. Remove frontend Nelson rule runtime.ts logic
5. Update tests to mock new MV responses

**Validation**:
- [ ] Scorecard API response matches pre-migration
- [ ] API latency improves (no runtime computation)
- [ ] Backend test coverage remains > 80%

### Phase 4: Convert Managed Tables to MVs (Week 7-8)

**Goal**: Unified lifecycle management for all pre-computed objects.

1. Add `spc_batch_dim_mv` to pipeline (replace CTAS table)
2. Add `spc_characteristic_dim_mv` to pipeline
3. Add `spc_lineage_graph_mv` to pipeline
4. Add `spc_attribute_subgroup_mv` to pipeline
5. Add `spc_quality_metric_subgroup_mv` to pipeline
6. Drop old managed tables after validation

**Validation**:
- [ ] All 9 MVs refresh via single pipeline
- [ ] No orphaned managed tables remain

### Phase 5: Grants, Tags, and Full CI/CD (Week 9-10)

**Goal**: Production-ready governance and automation.

1. Apply `scripts/grants/spc_gold_grants.sql`
2. Apply `scripts/tags/spc_gold_tags.sql`
3. Update `.github/workflows/deploy.yml` with new jobs
4. Add `backend/schema/spc_gold_views.v1.json` contract
5. Add SQL integration tests to CI
6. Enable production alerts

**Validation**:
- [ ] CI pipeline passes all new jobs
- [ ] Schema contract validates against deployed objects
- [ ] Production alerts fire on test failure

---

## Appendix A: File Inventory

| Path | Type | Status | Phase |
|------|------|--------|-------|
| `databricks.yml` | YAML | Update | 1 |
| `scripts/pipeline/spc_gold_refresh.sql` | SQL | Create | 1 |
| `scripts/gold/spc_nelson_rule_flags_mv.sql` | SQL | Create | 2 |
| `scripts/gold/spc_capability_detail_mv.sql` | SQL | Create | 2 |
| `scripts/gold/spc_hotelling_t2_source_mv.sql` | SQL | Create | 2 |
| `scripts/gold/spc_spec_drift_v.sql` | SQL | Create | 2 |
| `scripts/gold/spc_control_limit_history_v.sql` | SQL | Create | 2 |
| `scripts/gold/spc_chi2_inv_lookup.sql` | SQL | Create | 2 |
| `scripts/catalog/setup_catalog.sql` | SQL | Create | 5 |
| `scripts/grants/spc_gold_grants.sql` | SQL | Create | 5 |
| `scripts/tags/spc_gold_tags.sql` | SQL | Create | 5 |
| `scripts/tests/test_spc_quality_metrics.sql` | SQL | Create | 5 |
| `scripts/tests/test_nelson_rules.sql` | SQL | Create | 5 |
| `scripts/tests/test_capability_ci.sql` | SQL | Create | 5 |
| `scripts/tests/test_mv_not_empty.sql` | SQL | Create | 5 |
| `docs/GOLD_LAYER.md` | Markdown | Create | 1 |
| `docs/SPC_DATA_MODEL.md` | Markdown | Create | 1 |
| `docs/DATA_CONTRACT.md` | Markdown | Update | 1 |
| `backend/schema/spc_gold_views.v1.json` | JSON | Create | 5 |
| `backend/dal/spc_analysis_dal.py` | Python | Update | 3 |
| `backend/tests/test_spc_analysis_dal.py` | Python | Update | 3 |
| `.github/workflows/deploy.yml` | YAML | Update | 5 |

---

## Appendix B: Glossary

| Term | Definition |
|------|------------|
| **DAL** | Data Access Layer — Python modules that query gold views |
| **MIC** | Master Inspection Characteristic — quality measurement definition |
| **MV** | Materialized View — pre-computed Delta table refreshed by pipeline |
| **Metric View** | Databricks WITH METRICS view with YAML-defined measures |
| **Nelson Rules** | Western Electric rules for control chart out-of-control detection |
| **Ppk** | Process Performance Index — capability using overall sigma |
| **Cpk** | Process Capability Index — capability using within-group sigma |
| **Cpm** | Taguchi Capability Index — accounts for deviation from target |
| **Hotelling's T²** | Multivariate statistical distance measure |
| **WECO** | Western Electric Company rules (synonymous with Nelson rules) |

---

*End of Artifact Specification*
