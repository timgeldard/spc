-- Migration 019: per-MIC chart-type override
--
-- The default chart-type heuristic (avg samples/batch > 1.5 → X̄-R, else I-MR)
-- in spc_metadata_dal.fetch_characteristics works for the common case but is
-- wrong for characteristics that are sometimes measured once per lot and
-- sometimes multi-sampled within the same material. Production QM engineers
-- need a per-MIC override so a mis-classified MIC can be pinned to the
-- correct chart without a code change.
--
-- This table stores the override; the DAL reads it before falling back to the
-- heuristic. Idempotent create so repeated deploys do not error.

CREATE TABLE IF NOT EXISTS `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_mic_chart_config` (
    plant_id     STRING            COMMENT 'SAP plant id; NULL means the override applies across all plants',
    material_id  STRING            COMMENT 'SAP material id; NULL means the override applies across all materials',
    mic_id       STRING   NOT NULL COMMENT 'Inspection characteristic (MIC) code',
    mic_name     STRING            COMMENT 'Cached MIC name at the time of override for auditability',
    chart_type   STRING   NOT NULL COMMENT 'imr | xbar_r | xbar_s | p_chart | np_chart | c_chart | u_chart',
    rationale    STRING            COMMENT 'Why this override exists — typed by the QM engineer',
    updated_by   STRING   NOT NULL COMMENT 'Databricks user who set the override (CURRENT_USER())',
    updated_at   TIMESTAMP NOT NULL COMMENT 'When the override was set (CURRENT_TIMESTAMP())'
)
USING DELTA
COMMENT 'Per-MIC chart-type override — DAL reads before falling back to sample-per-batch heuristic'
TBLPROPERTIES (
    'delta.enableChangeDataFeed' = 'false',
    'delta.autoOptimize.optimizeWrite' = 'true',
    'delta.autoOptimize.autoCompact' = 'true'
);
