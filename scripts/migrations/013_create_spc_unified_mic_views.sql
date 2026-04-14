-- Migration 013: Unified MIC identity views.
--
-- Solves the "Mix" problem: a single inspection lot can contain both Generic MICs
-- (referenced from QPMK master) and Standard/Local MICs (copied per-plan). This
-- migration creates two views that allow Gold-layer reporting to treat any MIC with
-- the same normalised Short Text and UoM within a plant as the same entity,
-- regardless of origin.
--
-- NOTE: gold_batch_quality_result_v does not yet surface QASE.EINHEIT (unit of
-- measure). Until it does, the UoM segment of all keys is the literal 'NO_UNIT'.
-- When the gold view is updated to expose UOM, replace 'NO_UNIT' with
-- UPPER(TRIM(COALESCE(r.UOM, 'NO_UNIT'))) throughout both views.

-- ── View 1: Canonical MIC identity lookup ─────────────────────────────────

CREATE OR REPLACE VIEW `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_unified_mic_key_v`
COMMENT 'Plant-scoped canonical MIC identity. Harmonises Generic (QPMK-origin) and Local/copied MIC variants that share the same normalised Short Text and Unit of Measure into a single reporting entity. One row per (plant_id, mic_id) combination observed in gold_batch_quality_result_v.'
AS
SELECT DISTINCT
    bm.PLANT_ID                                  AS plant_id,
    r.MIC_ID                                     AS mic_id,
    r.MIC_NAME                                   AS mic_name,

    -- Normalised name: trim surrounding whitespace, fold to upper-case.
    UPPER(TRIM(r.MIC_NAME))                      AS mic_name_normalized,

    -- UoM normalised. Replace literal 'NO_UNIT' once gold_batch_quality_result_v
    -- exposes QASE.EINHEIT as a UOM column.
    'NO_UNIT'                                    AS uom_normalized,

    -- Plant-scoped unified key: the primary reporting identity for this MIC within
    -- a plant. Format: PLANT_ID||NORMALISED_NAME||NORMALISED_UOM.
    -- Plant-scoped so each site can hold independent locked control limits even for
    -- the same Generic MIC (different processes, different sigma targets).
    CONCAT_WS(
        '||',
        bm.PLANT_ID,
        UPPER(TRIM(r.MIC_NAME)),
        'NO_UNIT'
    )                                            AS unified_mic_key

FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_quality_result_v` r
INNER JOIN (
    SELECT DISTINCT MATERIAL_ID, BATCH_ID, MAX(PLANT_ID) AS PLANT_ID
    FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_mass_balance_v`
    WHERE MOVEMENT_CATEGORY = 'Production'
    GROUP BY MATERIAL_ID, BATCH_ID
) bm
    ON  bm.MATERIAL_ID = r.MATERIAL_ID
    AND bm.BATCH_ID    = r.BATCH_ID
WHERE r.MIC_NAME IS NOT NULL
  AND bm.PLANT_ID IS NOT NULL;


-- ── View 2: Variable vs Attribute routing per canonical MIC ────────────────

CREATE OR REPLACE VIEW `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_mic_routing_v`
COMMENT 'Data-driven Variable/Attribute chart routing for each canonical MIC within a plant. Detects routing conflicts (a MIC with both quantitative and qualitative results across its history) that require user attention before SPC charting. One row per (plant_id, unified_mic_key).'
AS
WITH result_types AS (
    SELECT
        bm.PLANT_ID                              AS plant_id,
        CONCAT_WS(
            '||',
            bm.PLANT_ID,
            UPPER(TRIM(r.MIC_NAME)),
            'NO_UNIT'
        )                                        AS unified_mic_key,
        r.MIC_ID                                 AS mic_id,
        r.MIC_NAME                               AS mic_name,
        UPPER(TRIM(r.MIC_NAME))                  AS mic_name_normalized,

        SUM(CASE
                WHEN r.QUANTITATIVE_RESULT IS NOT NULL
                 AND (r.QUALITATIVE_RESULT IS NULL OR r.QUALITATIVE_RESULT = '')
                THEN 1 ELSE 0
            END)                                 AS quant_rows,

        SUM(CASE
                WHEN r.QUALITATIVE_RESULT IS NOT NULL
                 AND r.QUALITATIVE_RESULT != ''
                THEN 1 ELSE 0
            END)                                 AS qual_rows

    FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_quality_result_v` r
    INNER JOIN (
        SELECT DISTINCT MATERIAL_ID, BATCH_ID, MAX(PLANT_ID) AS PLANT_ID
        FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_mass_balance_v`
        WHERE MOVEMENT_CATEGORY = 'Production'
        GROUP BY MATERIAL_ID, BATCH_ID
    ) bm
        ON  bm.MATERIAL_ID = r.MATERIAL_ID
        AND bm.BATCH_ID    = r.BATCH_ID
    WHERE r.MIC_NAME IS NOT NULL
      AND bm.PLANT_ID IS NOT NULL
    GROUP BY
        bm.PLANT_ID,
        CONCAT_WS('||', bm.PLANT_ID, UPPER(TRIM(r.MIC_NAME)), 'NO_UNIT'),
        r.MIC_ID,
        r.MIC_NAME,
        UPPER(TRIM(r.MIC_NAME))
)
SELECT
    plant_id,
    unified_mic_key,
    mic_id,
    mic_name,
    mic_name_normalized,
    quant_rows,
    qual_rows,

    -- routing: primary chart type to use for this MIC
    CASE
        WHEN quant_rows > 0 AND qual_rows = 0  THEN 'variable'
        WHEN qual_rows  > 0 AND quant_rows = 0 THEN 'attribute'
        WHEN quant_rows > 0 AND qual_rows  > 0 THEN 'mixed'
        ELSE 'no_results'
    END                                          AS chart_routing,

    -- routing_conflict: true when the MIC has both result types across its history.
    -- Charts built on 'mixed' MICs may combine incompatible data; flag for user review.
    CASE
        WHEN quant_rows > 0 AND qual_rows > 0 THEN TRUE
        ELSE FALSE
    END                                          AS routing_conflict

FROM result_types;
