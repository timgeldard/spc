-- Migration 005: create the quantitative SPC subgroup source view.
--
-- Release 1 scope:
--   * Preserve current scorecard semantics from backend/dal/spc_analysis_dal.py
--   * Push reusable sufficient statistics upstream for metric-view consumption
--   * Defer security / consumption views to Release 2

CREATE OR REPLACE VIEW `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_quality_metric_subgroup_v`
COMMENT 'Quantitative SPC subgroup source view preserving one row per material/batch/MIC for governed capability metrics.'
AS
WITH batch_metadata AS (
    SELECT
        mb.MATERIAL_ID AS material_id,
        mb.BATCH_ID AS batch_id,
        MIN(mb.POSTING_DATE) AS first_posting_date,
        MAX(mb.POSTING_DATE) AS last_posting_date,
        MIN(mb.POSTING_DATE) AS batch_date,
        DATE_TRUNC('WEEK', MIN(mb.POSTING_DATE)) AS batch_week,
        DATE_TRUNC('MONTH', MIN(mb.POSTING_DATE)) AS batch_month,
        MAX(mb.PLANT_ID) AS plant_id
    FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_mass_balance_v` mb
    WHERE mb.MOVEMENT_CATEGORY = 'Production'
    GROUP BY mb.MATERIAL_ID, mb.BATCH_ID
),
filtered_results AS (
    SELECT
        r.MATERIAL_ID AS material_id,
        COALESCE(m.MATERIAL_NAME, r.MATERIAL_ID) AS material_name,
        bm.batch_id,
        bm.first_posting_date,
        bm.last_posting_date,
        bm.batch_date,
        bm.batch_week,
        bm.batch_month,
        bm.plant_id,
        COALESCE(p.PLANT_NAME, bm.plant_id) AS plant_name,
        r.MIC_ID AS mic_id,
        r.MIC_NAME AS mic_name,
        r.INSPECTION_METHOD AS inspection_method,
        CAST(r.QUANTITATIVE_RESULT AS DOUBLE) AS value,
        TRY_CAST(r.TARGET_VALUE AS DOUBLE) AS nominal_target,
        TRY_CAST(
            CASE
                WHEN LOCATE('...', r.TOLERANCE) > 0
                THEN SUBSTRING(r.TOLERANCE, 1, LOCATE('...', r.TOLERANCE) - 1)
            END
            AS DOUBLE
        ) AS lsl_spec,
        TRY_CAST(
            CASE
                WHEN LOCATE('...', r.TOLERANCE) > 0
                THEN SUBSTRING(r.TOLERANCE, LOCATE('...', r.TOLERANCE) + 3)
            END
            AS DOUBLE
        ) AS usl_spec,
        CASE
            WHEN LOCATE('...', r.TOLERANCE) = 0
            THEN TRY_CAST(r.TOLERANCE AS DOUBLE)
        END AS tolerance_half_width,
        r.TOLERANCE AS raw_tolerance,
        r.INSPECTION_RESULT_VALUATION AS valuation
    FROM `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_batch_quality_result_v` r
    INNER JOIN batch_metadata bm
        ON bm.material_id = r.MATERIAL_ID
       AND bm.batch_id = r.BATCH_ID
    LEFT JOIN `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_material` m
        ON m.MATERIAL_ID = r.MATERIAL_ID
       AND m.LANGUAGE_ID = 'E'
    LEFT JOIN `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`gold_plant` p
        ON p.PLANT_ID = bm.plant_id
    WHERE r.QUANTITATIVE_RESULT IS NOT NULL
      AND (r.QUALITATIVE_RESULT IS NULL OR r.QUALITATIVE_RESULT = '')
),
subgroup_rollup AS (
    SELECT
        material_id,
        material_name,
        batch_id,
        first_posting_date,
        last_posting_date,
        batch_date,
        batch_week,
        batch_month,
        plant_id,
        plant_name,
        mic_id,
        mic_name,
        inspection_method,
        COUNT(*) AS batch_n,
        SUM(value) AS sum_value,
        SUM(POWER(value, 2)) AS sum_squares,
        MIN(value) AS min_value,
        MAX(value) AS max_value,
        MAX(nominal_target) AS nominal_target,
        MAX(lsl_spec) AS lsl_spec,
        MAX(usl_spec) AS usl_spec,
        MAX(tolerance_half_width) AS tolerance_half_width,
        MAX(raw_tolerance) AS raw_tolerance,
        MAX(CASE WHEN valuation = 'R' THEN 1 ELSE 0 END) AS any_rejection,
        MAX(CASE WHEN valuation = 'A' THEN 1 ELSE 0 END) AS any_acceptance
    FROM filtered_results
    GROUP BY
        material_id,
        material_name,
        batch_id,
        first_posting_date,
        last_posting_date,
        batch_date,
        batch_week,
        batch_month,
        plant_id,
        plant_name,
        mic_id,
        mic_name,
        inspection_method
),
resolved_specs AS (
    SELECT
        material_id,
        material_name,
        batch_id,
        first_posting_date,
        last_posting_date,
        batch_date,
        batch_week,
        batch_month,
        plant_id,
        plant_name,
        mic_id,
        mic_name,
        inspection_method,
        batch_n,
        sum_value,
        sum_squares,
        min_value,
        max_value,
        CASE WHEN batch_n >= 2 THEN max_value - min_value END AS batch_range,
        nominal_target,
        CASE
            WHEN lsl_spec IS NOT NULL THEN lsl_spec
            WHEN nominal_target IS NOT NULL AND tolerance_half_width IS NOT NULL
            THEN nominal_target - tolerance_half_width
            ELSE NULL
        END AS resolved_lsl,
        CASE
            WHEN usl_spec IS NOT NULL THEN usl_spec
            WHEN nominal_target IS NOT NULL AND tolerance_half_width IS NOT NULL
            THEN nominal_target + tolerance_half_width
            ELSE NULL
        END AS resolved_usl,
        tolerance_half_width,
        raw_tolerance,
        any_rejection,
        any_acceptance
    FROM subgroup_rollup
)
SELECT
    material_id,
    material_name,
    batch_id,
    first_posting_date,
    last_posting_date,
    batch_date,
    batch_week,
    batch_month,
    plant_id,
    plant_name,
    mic_id,
    mic_name,
    inspection_method,
    batch_n,
    sum_value,
    sum_squares,
    min_value,
    max_value,
    batch_range,
    nominal_target,
    resolved_lsl AS lsl_spec,
    resolved_usl AS usl_spec,
    tolerance_half_width,
    raw_tolerance,
    CONCAT_WS(
        '|',
        COALESCE(CAST(resolved_lsl AS STRING), '_'),
        COALESCE(CAST(resolved_usl AS STRING), '_'),
        COALESCE(CAST(nominal_target AS STRING), '_')
    ) AS spec_signature,
    any_rejection,
    any_acceptance,
    CASE
        WHEN resolved_usl IS NOT NULL
         AND resolved_lsl IS NOT NULL
         AND nominal_target IS NOT NULL
         AND ABS((resolved_usl - nominal_target) - (nominal_target - resolved_lsl)) <= 1e-6
        THEN 'bilateral_symmetric'
        WHEN resolved_usl IS NOT NULL AND resolved_lsl IS NOT NULL
        THEN 'bilateral_asymmetric'
        WHEN resolved_usl IS NOT NULL
        THEN 'unilateral_upper'
        WHEN resolved_lsl IS NOT NULL
        THEN 'unilateral_lower'
        ELSE 'unspecified'
    END AS spec_type
FROM resolved_specs;
