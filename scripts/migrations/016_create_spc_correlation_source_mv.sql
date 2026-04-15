-- Migration 016: materialize the correlation source.
--
-- spc_correlation_source_v (migration 011) is a regular view that re-executes
-- the full gold-view join every time fetch_correlation() runs.  The correlation
-- query performs a pairwise self-join on this result; materializing the source
-- means the self-join reads from a small pre-computed Delta table clustered on
-- (material_id, mic_id) instead of scanning raw gold on every request.
--
-- The regular view (spc_correlation_source_v) is kept so existing tooling and
-- the validate_release1_databricks.py script can reference it without changes.

CREATE OR REPLACE MATERIALIZED VIEW `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_correlation_source_mv`
CLUSTER BY (material_id, mic_id)
COMMENT 'Materialized correlation source at material/batch/MIC grain. Pre-computes avg_result so the pairwise CORR self-join reads from a compact Delta table rather than scanning gold views per request.'
AS
WITH batch_metadata AS (
    SELECT
        mb.MATERIAL_ID                              AS material_id,
        mb.BATCH_ID                                 AS batch_id,
        MIN(mb.POSTING_DATE)                        AS batch_date,
        DATE_TRUNC('WEEK',  MIN(mb.POSTING_DATE))   AS batch_week,
        DATE_TRUNC('MONTH', MIN(mb.POSTING_DATE))   AS batch_month,
        MAX(mb.PLANT_ID)                            AS plant_id
    FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_mass_balance_v` mb
    WHERE mb.MOVEMENT_CATEGORY = 'Production'
    GROUP BY mb.MATERIAL_ID, mb.BATCH_ID
)
SELECT
    r.MATERIAL_ID                                           AS material_id,
    bm.batch_id,
    bm.batch_date,
    bm.batch_week,
    bm.batch_month,
    bm.plant_id,
    r.MIC_ID                                                AS mic_id,
    ANY_VALUE(r.MIC_NAME)                                   AS mic_name,
    AVG(CAST(r.QUANTITATIVE_RESULT AS DOUBLE))              AS avg_result
FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_quality_result_v` r
LEFT JOIN batch_metadata bm
    ON bm.material_id = r.MATERIAL_ID
   AND bm.batch_id    = r.BATCH_ID
WHERE r.QUANTITATIVE_RESULT IS NOT NULL
  AND (r.QUALITATIVE_RESULT IS NULL OR r.QUALITATIVE_RESULT = '')
GROUP BY
    r.MATERIAL_ID,
    bm.batch_id,
    bm.batch_date,
    bm.batch_week,
    bm.batch_month,
    bm.plant_id,
    r.MIC_ID;
