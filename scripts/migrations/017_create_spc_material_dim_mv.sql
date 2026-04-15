-- Migration 017: create the material dimension materialized view.
--
-- fetch_materials() in spc_metadata_dal.py issues a DISTINCT scan over
-- gold_batch_quality_result_v (the full table) on every material-picker load.
-- This materialized view pre-computes the distinct set of materials that have
-- quantitative SPC data so the metadata endpoint reads from a tiny lookup table
-- instead of scanning the full gold result view each time.
--
-- Refreshed automatically by Databricks when the upstream Delta tables change.

CREATE OR REPLACE MATERIALIZED VIEW `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_material_dim_mv`
CLUSTER BY (material_id)
COMMENT 'Distinct materials that have quantitative SPC data. Serves the UI material-picker without scanning gold_batch_quality_result_v per request.'
AS
SELECT DISTINCT
    r.MATERIAL_ID                                   AS material_id,
    COALESCE(m.MATERIAL_NAME, r.MATERIAL_ID)        AS material_name
FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_quality_result_v` r
LEFT JOIN `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_material` m
    ON m.MATERIAL_ID = r.MATERIAL_ID
   AND m.LANGUAGE_ID = 'E'
WHERE r.QUANTITATIVE_RESULT IS NOT NULL
  AND (r.QUALITATIVE_RESULT IS NULL OR r.QUALITATIVE_RESULT = '');
