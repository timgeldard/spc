-- Migration 018: create the plant-material dimension materialized view.
--
-- fetch_plants() in spc_metadata_dal.py joins gold_batch_mass_balance_v,
-- gold_plant, and gold_batch_quality_result_v on every plant-picker load
-- (one per material selection in the UI).  This materialized view pre-computes
-- the distinct plant-per-material combinations that have production batches with
-- quantitative quality data, so the metadata endpoint is a simple point lookup
-- on the clustered Delta table instead of a three-way join over raw gold.
--
-- CLUSTER BY (material_id) aligns with the dominant query shape:
--   WHERE material_id = :material_id ORDER BY plant_name

CREATE OR REPLACE MATERIALIZED VIEW `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_plant_material_dim_mv`
CLUSTER BY (material_id)
COMMENT 'Distinct plant-material pairs with production batches and quantitative quality data. Serves the UI plant-picker without scanning three gold views per request.'
AS
SELECT DISTINCT
    mb.MATERIAL_ID                                  AS material_id,
    mb.PLANT_ID                                     AS plant_id,
    COALESCE(p.PLANT_NAME, mb.PLANT_ID)             AS plant_name
FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_mass_balance_v` mb
LEFT JOIN `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_plant` p
    ON p.PLANT_ID = mb.PLANT_ID
INNER JOIN `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_quality_result_v` r
    ON r.MATERIAL_ID             = mb.MATERIAL_ID
   AND r.BATCH_ID                = mb.BATCH_ID
   AND r.QUANTITATIVE_RESULT IS NOT NULL
WHERE mb.MOVEMENT_CATEGORY = 'Production';
