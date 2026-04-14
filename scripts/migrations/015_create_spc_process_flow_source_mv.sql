-- Migration 015: materialize the process-flow health source.
--
-- spc_process_flow_source_v (migration 009) is a regular view that re-executes
-- the gold-view join on every query.  Converting it to a materialized view means
-- the aggregation runs once at refresh time and health queries read from a small
-- pre-computed Delta table instead of scanning gold_batch_mass_balance_v and
-- gold_batch_quality_result_v per request.
--
-- CLUSTER BY (material_id, batch_date) aligns with the dominant query shape in
-- fetch_process_flow(): material_id IN (...) with optional batch_date range.
--
-- The regular view (spc_process_flow_source_v) is kept in place so the
-- Genie metric view (spc_process_flow_metrics) continues to use it as its
-- declared source without needing a DDL change.

CREATE OR REPLACE MATERIALIZED VIEW `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_process_flow_source_mv`
CLUSTER BY (material_id, batch_date)
COMMENT 'Materialized process-flow health source at material/batch/MIC grain. Pre-computes the gold-view join so health aggregation queries pay scan cost only at scheduled refresh time.'
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
),
batch_quality AS (
    SELECT
        r.MATERIAL_ID   AS material_id,
        r.BATCH_ID      AS batch_id,
        MAX(CASE WHEN r.INSPECTION_RESULT_VALUATION = 'R' THEN 1 ELSE 0 END) AS has_rejection
    FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_quality_result_v` r
    GROUP BY r.MATERIAL_ID, r.BATCH_ID
)
SELECT DISTINCT
    r.MATERIAL_ID                                   AS material_id,
    COALESCE(m.MATERIAL_NAME, r.MATERIAL_ID)        AS material_name,
    bm.batch_id,
    bm.batch_date,
    bm.batch_week,
    bm.batch_month,
    bm.plant_id,
    COALESCE(p.PLANT_NAME, bm.plant_id)             AS plant_name_resolved,
    r.MIC_ID                                        AS mic_id,
    COALESCE(bq.has_rejection, 0)                   AS has_rejection
FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_quality_result_v` r
LEFT JOIN batch_metadata bm
    ON bm.material_id = r.MATERIAL_ID
   AND bm.batch_id    = r.BATCH_ID
LEFT JOIN batch_quality bq
    ON bq.material_id = r.MATERIAL_ID
   AND bq.batch_id    = r.BATCH_ID
LEFT JOIN `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_material` m
    ON m.MATERIAL_ID  = r.MATERIAL_ID
   AND m.LANGUAGE_ID  = 'E'
LEFT JOIN `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_plant` p
    ON p.PLANT_ID = bm.plant_id;
