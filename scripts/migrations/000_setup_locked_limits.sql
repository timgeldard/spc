-- Migration 000: setup spc_locked_limits
--
-- This table stores Phase II locked control limits for SPC charts.
-- The deployment pipeline applies this migration idempotently so a newly
-- deployed app can use locked limits without a manual workspace setup step.

CREATE TABLE IF NOT EXISTS `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_locked_limits` (
    material_id   STRING   NOT NULL COMMENT 'SAP material number',
    mic_id        STRING   NOT NULL COMMENT 'Inspection characteristic (MIC) code',
    plant_id      STRING            COMMENT 'Producing plant — NULL means all plants',
    chart_type    STRING   NOT NULL COMMENT 'imr | xbar_r | p_chart',
    cl            DOUBLE            COMMENT 'Centre line (grand mean or p-bar)',
    ucl           DOUBLE            COMMENT 'Upper control limit (X or X̄ chart)',
    lcl           DOUBLE            COMMENT 'Lower control limit (X or X̄ chart)',
    ucl_r         DOUBLE            COMMENT 'UCL for MR or R chart',
    lcl_r         DOUBLE            COMMENT 'LCL for MR or R chart',
    sigma_within  DOUBLE            COMMENT 'σ_within at time of locking',
    baseline_from STRING            COMMENT 'First batch date in the baseline (YYYY-MM-DD)',
    baseline_to   STRING            COMMENT 'Last batch date in the baseline (YYYY-MM-DD)',
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
