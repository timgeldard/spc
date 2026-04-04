-- Setup script for the spc_locked_limits Delta table.
--
-- This table stores Phase II locked control limits for SPC charts.
-- It must be created once per Unity Catalog catalog/schema before the
-- /api/spc/locked-limits endpoints can be used.
--
-- Usage:
--   Via Make:  make setup-locked-limits           (reads TRACE_CATALOG / TRACE_SCHEMA from .env)
--   Manually:  replace ${TRACE_CATALOG} and ${TRACE_SCHEMA} with your catalog/schema, then run
--
-- TRACE_CATALOG defaults to connected_plant_uat
-- TRACE_SCHEMA  defaults to gold
-- These must match the values used by the backend (TRACE_CATALOG / TRACE_SCHEMA env vars).
-- The Makefile substitutes them automatically via envsubst.

CREATE TABLE IF NOT EXISTS `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_locked_limits` (
    -- Identification keys (primary key is the combination of these 4 columns)
    material_id   STRING   NOT NULL COMMENT 'SAP material number',
    mic_id        STRING   NOT NULL COMMENT 'Inspection characteristic (MIC) code',
    plant_id      STRING            COMMENT 'Producing plant — NULL means "all plants"',
    chart_type    STRING   NOT NULL COMMENT 'imr | xbar_r | p_chart',

    -- Individuals / X̄ chart limits
    cl            DOUBLE            COMMENT 'Centre line (grand mean or p-bar)',
    ucl           DOUBLE            COMMENT 'Upper control limit (X or X̄ chart)',
    lcl           DOUBLE            COMMENT 'Lower control limit (X or X̄ chart)',

    -- Range chart limits (NULL for I-MR — ucl_mr stored as ucl_r)
    ucl_r         DOUBLE            COMMENT 'UCL for MR or R chart',
    lcl_r         DOUBLE            COMMENT 'LCL for R chart (NULL for MR chart)',

    -- Process spread estimate used at lock time
    sigma_within  DOUBLE            COMMENT 'σ_within (mrBar/d2 or Rbar/d2) at time of locking',

    -- Baseline date range used to calculate the locked limits
    baseline_from STRING            COMMENT 'First batch date in the baseline (YYYY-MM-DD)',
    baseline_to   STRING            COMMENT 'Last batch date in the baseline (YYYY-MM-DD)',

    -- Audit columns
    locked_by     STRING   NOT NULL COMMENT 'Databricks user who locked the limits (CURRENT_USER())',
    locked_at     TIMESTAMP NOT NULL COMMENT 'When the limits were locked (CURRENT_TIMESTAMP())'
)
USING DELTA
COMMENT 'Phase II locked SPC control limits — one row per material/MIC/plant/chart_type combination'
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'false',
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
);
