-- Migration 007: create the attribute-quality source view.

CREATE OR REPLACE VIEW `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_attribute_metric_source_v`
COMMENT 'Attribute SPC source view aggregated to material/batch/MIC/operation grain for p-chart style metrics.'
AS
WITH batch_metadata AS (
    SELECT
        mb.MATERIAL_ID AS material_id,
        mb.BATCH_ID AS batch_id,
        MIN(mb.POSTING_DATE) AS batch_date,
        DATE_TRUNC('WEEK', MIN(mb.POSTING_DATE)) AS batch_week,
        DATE_TRUNC('MONTH', MIN(mb.POSTING_DATE)) AS batch_month,
        MAX(mb.PLANT_ID) AS plant_id
    FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_mass_balance_v` mb
    WHERE mb.MOVEMENT_CATEGORY = 'Production'
    GROUP BY mb.MATERIAL_ID, mb.BATCH_ID
)
SELECT
    r.MATERIAL_ID AS material_id,
    COALESCE(m.MATERIAL_NAME, r.MATERIAL_ID) AS material_name,
    bm.batch_id,
    bm.batch_date,
    bm.batch_week,
    bm.batch_month,
    bm.plant_id,
    COALESCE(p.PLANT_NAME, bm.plant_id) AS plant_name,
    r.MIC_ID AS mic_id,
    r.MIC_NAME AS mic_name,
    CAST(r.OPERATION_ID AS STRING) AS operation_id,
    r.INSPECTION_METHOD AS inspection_method,
    COUNT(*) AS n_inspected,
    SUM(CASE WHEN r.INSPECTION_RESULT_VALUATION = 'R' THEN 1 ELSE 0 END) AS n_nonconforming,
    MAX(CASE WHEN r.INSPECTION_RESULT_VALUATION = 'R' THEN 1 ELSE 0 END) AS has_rejection
FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_quality_result_v` r
INNER JOIN batch_metadata bm
    ON bm.material_id = r.MATERIAL_ID
   AND bm.batch_id = r.BATCH_ID
LEFT JOIN `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_material` m
    ON m.MATERIAL_ID = r.MATERIAL_ID
   AND m.LANGUAGE_ID = 'E'
LEFT JOIN `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_plant` p
    ON p.PLANT_ID = bm.plant_id
WHERE r.QUALITATIVE_RESULT IS NOT NULL
  AND r.QUALITATIVE_RESULT != ''
  AND r.INSPECTION_RESULT_VALUATION IN ('A', 'R')
GROUP BY
    r.MATERIAL_ID,
    COALESCE(m.MATERIAL_NAME, r.MATERIAL_ID),
    bm.batch_id,
    bm.batch_date,
    bm.batch_week,
    bm.batch_month,
    bm.plant_id,
    COALESCE(p.PLANT_NAME, bm.plant_id),
    r.MIC_ID,
    r.MIC_NAME,
    CAST(r.OPERATION_ID AS STRING),
    r.INSPECTION_METHOD;
