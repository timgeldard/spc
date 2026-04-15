-- Migration 011: create the shared correlation source view.

CREATE OR REPLACE VIEW `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_correlation_source_v`
COMMENT 'Shared quantitative correlation source view at material/batch/MIC grain for CORR-based analysis, preserving operation-scoped characteristic identity.'
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
    bm.batch_id,
    bm.batch_date,
    bm.batch_week,
    bm.batch_month,
    bm.plant_id,
    r.MIC_ID AS mic_id,
    CAST(r.OPERATION_ID AS STRING) AS operation_id,
    CONCAT_WS('||', r.MIC_ID, COALESCE(CAST(r.OPERATION_ID AS STRING), 'NO_OP')) AS mic_selection_key,
    ANY_VALUE(r.MIC_NAME) AS mic_name,
    ANY_VALUE(
        CASE
            WHEN r.OPERATION_ID IS NOT NULL
            THEN CONCAT(r.MIC_NAME, ' · Op ', CAST(r.OPERATION_ID AS STRING))
            ELSE r.MIC_NAME
        END
    ) AS mic_display_name,
    AVG(CAST(r.QUANTITATIVE_RESULT AS DOUBLE)) AS avg_result
FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_quality_result_v` r
LEFT JOIN batch_metadata bm
    ON bm.material_id = r.MATERIAL_ID
   AND bm.batch_id = r.BATCH_ID
WHERE r.QUANTITATIVE_RESULT IS NOT NULL
  AND (r.QUALITATIVE_RESULT IS NULL OR r.QUALITATIVE_RESULT = '')
GROUP BY
    r.MATERIAL_ID,
    bm.batch_id,
    bm.batch_date,
    bm.batch_week,
    bm.batch_month,
    bm.plant_id,
    r.MIC_ID,
    CAST(r.OPERATION_ID AS STRING);
