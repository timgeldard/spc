-- Migration 006: create the quantitative SPC metric view for dashboards and Genie.

CREATE OR REPLACE VIEW `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_quality_metrics`
WITH METRICS
LANGUAGE YAML
AS $$
version: 1.1
comment: "Governed quantitative SPC metrics for capability, drift, control, and batch disposition."
source: ${TRACE_CATALOG}.${TRACE_SCHEMA}.spc_quality_metric_subgroup_v

dimensions:
  - name: material_id
    expr: material_id
    display_name: Material ID
    synonyms: ['material', 'sku']
  - name: material_name
    expr: material_name
    display_name: Material Name
  - name: plant_id
    expr: plant_id
    display_name: Plant ID
    synonyms: ['plant', 'site']
  - name: plant_name
    expr: plant_name
    display_name: Plant Name
  - name: mic_id
    expr: mic_id
    display_name: MIC ID
    synonyms: ['characteristic id', 'inspection characteristic']
  - name: mic_name
    expr: mic_name
    display_name: MIC Name
    synonyms: ['characteristic', 'quality characteristic']
  - name: inspection_method
    expr: inspection_method
    display_name: Inspection Method
  - name: batch_id
    expr: batch_id
    display_name: Batch ID
    synonyms: ['batch']
  - name: batch_date
    expr: batch_date
    display_name: Batch Date
  - name: batch_week
    expr: batch_week
    display_name: Batch Week
  - name: batch_month
    expr: batch_month
    display_name: Batch Month
  - name: spec_type
    expr: spec_type
    display_name: Spec Type
  - name: normality_type
    expr: normality_type
    display_name: Normality Type
    synonyms: ['distribution type', 'normality classification']
  - name: normality_method
    expr: normality_method
    display_name: Normality Method
    synonyms: ['normality method']

measures:
  - name: subgroup_count
    expr: SUM(CASE WHEN subgroup_rep = 1 THEN 1 ELSE 0 END)
    display_name: Subgroup Count
    synonyms: ['subgroups', 'mic batch groups']
  - name: batch_count
    expr: COUNT(DISTINCT batch_id)
    display_name: Batch Count
    synonyms: ['batches']
  - name: total_samples
    expr: COUNT(1)
    display_name: Sample Count
    synonyms: ['sample count', 'inspection count']
  - name: mean_value
    expr: AVG(value)
    display_name: Mean Value
    synonyms: ['average result', 'process mean']
  - name: stddev_overall
    expr: STDDEV_SAMP(value)
    display_name: Overall Standard Deviation
    synonyms: ['overall sigma', 'long term sigma']
  - name: min_value
    expr: MIN(value)
    display_name: Minimum Value
  - name: max_value
    expr: MAX(value)
    display_name: Maximum Value
  - name: spec_upper
    expr: MAX(usl_spec)
    display_name: Upper Spec Limit
    synonyms: ['usl']
  - name: spec_lower
    expr: MAX(lsl_spec)
    display_name: Lower Spec Limit
    synonyms: ['lsl']
  - name: nominal_target
    expr: MAX(nominal_target)
    display_name: Nominal Target
    synonyms: ['nominal', 'target']
  - name: distinct_spec_count
    expr: COUNT(DISTINCT spec_signature)
    display_name: Distinct Spec Count
  - name: spec_safe
    expr: CASE WHEN COUNT(DISTINCT spec_signature) = 1 THEN 1 ELSE 0 END
    display_name: Spec Safe Flag
  - name: distinct_normality_count
    expr: COUNT(DISTINCT normality_signature)
    display_name: Distinct Normality Count
  - name: normality_safe
    expr: CASE WHEN COUNT(DISTINCT normality_signature) = 1 THEN 1 ELSE 0 END
    display_name: Normality Safe Flag
  - name: rejected_batches
    expr: COUNT(DISTINCT CASE WHEN any_rejection = 1 THEN batch_id END)
    display_name: Rejected Batches
    synonyms: ['failed batches', 'bad batches', 'ooc batches']
  - name: accepted_batches
    expr: COUNT(DISTINCT CASE WHEN any_acceptance = 1 THEN batch_id END)
    display_name: Accepted Batches
    synonyms: ['passed batches']
  - name: ooc_rate
    expr: |
      CASE
      WHEN MEASURE(batch_count) = 0 THEN NULL
      ELSE MEASURE(rejected_batches) / MEASURE(batch_count)
      END
    display_name: Out of Control Rate
    synonyms: ['out of control rate', 'reject rate', 'rejection rate']
    format:
      type: percentage
  - name: avg_samples_per_batch
    expr: |
      CASE
      WHEN MEASURE(batch_count) = 0 THEN NULL
      ELSE MEASURE(total_samples) / MEASURE(batch_count)
      END
    display_name: Avg Samples Per Batch
  - name: eligible_subgroup_count
    expr: SUM(CASE WHEN subgroup_rep = 1 AND batch_n >= 2 THEN 1 ELSE 0 END)
    display_name: Eligible Subgroup Count
  - name: avg_subgroup_range
    expr: |
      CASE
      WHEN MEASURE(eligible_subgroup_count) = 0 THEN NULL
      ELSE SUM(CASE WHEN subgroup_rep = 1 AND batch_n >= 2 THEN batch_range ELSE 0 END) / MEASURE(eligible_subgroup_count)
      END
    display_name: Avg Subgroup Range
  - name: avg_n_eligible
    expr: |
      CASE
      WHEN MEASURE(eligible_subgroup_count) = 0 THEN NULL
      ELSE SUM(CASE WHEN subgroup_rep = 1 AND batch_n >= 2 THEN batch_n ELSE 0 END) / MEASURE(eligible_subgroup_count)
      END
    display_name: Avg Eligible Subgroup Size
  - name: sigma_within
    expr: |
      CASE ROUND(MEASURE(avg_n_eligible), 0)
      WHEN 2 THEN MEASURE(avg_subgroup_range) / 1.128
      WHEN 3 THEN MEASURE(avg_subgroup_range) / 1.693
      WHEN 4 THEN MEASURE(avg_subgroup_range) / 2.059
      WHEN 5 THEN MEASURE(avg_subgroup_range) / 2.326
      WHEN 6 THEN MEASURE(avg_subgroup_range) / 2.534
      WHEN 7 THEN MEASURE(avg_subgroup_range) / 2.704
      WHEN 8 THEN MEASURE(avg_subgroup_range) / 2.847
      WHEN 9 THEN MEASURE(avg_subgroup_range) / 2.970
      WHEN 10 THEN MEASURE(avg_subgroup_range) / 3.078
      WHEN 11 THEN MEASURE(avg_subgroup_range) / 3.173
      WHEN 12 THEN MEASURE(avg_subgroup_range) / 3.258
      WHEN 13 THEN MEASURE(avg_subgroup_range) / 3.336
      WHEN 14 THEN MEASURE(avg_subgroup_range) / 3.407
      WHEN 15 THEN MEASURE(avg_subgroup_range) / 3.472
      ELSE NULL
      END
    display_name: Within Sigma
    synonyms: ['within sigma', 'short term sigma']
  - name: empirical_p00135
    expr: percentile(value, 0.00135)
    display_name: Empirical P0.135
  - name: empirical_p50
    expr: median(value)
    display_name: Empirical Median
    synonyms: ['median']
  - name: empirical_p99865
    expr: percentile(value, 0.99865)
    display_name: Empirical P99.865
  - name: pp_gaussian
    expr: |
      CASE
      WHEN MEASURE(spec_safe) = 1
       AND MEASURE(stddev_overall) > 0
       AND MEASURE(spec_upper) IS NOT NULL
       AND MEASURE(spec_lower) IS NOT NULL
      THEN (MEASURE(spec_upper) - MEASURE(spec_lower)) / (6 * MEASURE(stddev_overall))
      ELSE NULL
      END
    display_name: Pp Gaussian
    synonyms: ['pp parametric']
  - name: ppk_gaussian
    expr: |
      CASE
      WHEN MEASURE(spec_safe) <> 1 OR MEASURE(stddev_overall) <= 0 OR MEASURE(mean_value) IS NULL THEN NULL
      WHEN MEASURE(spec_upper) IS NOT NULL AND MEASURE(spec_lower) IS NOT NULL
      THEN LEAST(
        (MEASURE(spec_upper) - MEASURE(mean_value)) / (3 * MEASURE(stddev_overall)),
        (MEASURE(mean_value) - MEASURE(spec_lower)) / (3 * MEASURE(stddev_overall))
      )
      WHEN MEASURE(spec_upper) IS NOT NULL
      THEN (MEASURE(spec_upper) - MEASURE(mean_value)) / (3 * MEASURE(stddev_overall))
      WHEN MEASURE(spec_lower) IS NOT NULL
      THEN (MEASURE(mean_value) - MEASURE(spec_lower)) / (3 * MEASURE(stddev_overall))
      ELSE NULL
      END
    display_name: Ppk Gaussian
    synonyms: ['ppk parametric', 'gaussian ppk']
  - name: pp_non_parametric
    expr: |
      CASE
      WHEN MEASURE(spec_safe) = 1
       AND MEASURE(empirical_p99865) IS NOT NULL
       AND MEASURE(empirical_p00135) IS NOT NULL
       AND MEASURE(empirical_p99865) > MEASURE(empirical_p00135)
       AND MEASURE(spec_upper) IS NOT NULL
       AND MEASURE(spec_lower) IS NOT NULL
      THEN (MEASURE(spec_upper) - MEASURE(spec_lower)) / (MEASURE(empirical_p99865) - MEASURE(empirical_p00135))
      ELSE NULL
      END
    display_name: Pp Non Parametric
    synonyms: ['pp percentile', 'pp non gaussian']
  - name: ppk_non_parametric
    expr: |
      CASE
      WHEN MEASURE(spec_safe) <> 1 OR MEASURE(empirical_p50) IS NULL THEN NULL
      WHEN MEASURE(spec_upper) IS NOT NULL
       AND MEASURE(spec_lower) IS NOT NULL
       AND MEASURE(empirical_p99865) IS NOT NULL
       AND MEASURE(empirical_p00135) IS NOT NULL
       AND MEASURE(empirical_p99865) > MEASURE(empirical_p50)
       AND MEASURE(empirical_p50) > MEASURE(empirical_p00135)
      THEN LEAST(
        (MEASURE(spec_upper) - MEASURE(empirical_p50)) / (MEASURE(empirical_p99865) - MEASURE(empirical_p50)),
        (MEASURE(empirical_p50) - MEASURE(spec_lower)) / (MEASURE(empirical_p50) - MEASURE(empirical_p00135))
      )
      WHEN MEASURE(spec_upper) IS NOT NULL
       AND MEASURE(empirical_p99865) IS NOT NULL
       AND MEASURE(empirical_p99865) > MEASURE(empirical_p50)
      THEN (MEASURE(spec_upper) - MEASURE(empirical_p50)) / (MEASURE(empirical_p99865) - MEASURE(empirical_p50))
      WHEN MEASURE(spec_lower) IS NOT NULL
       AND MEASURE(empirical_p00135) IS NOT NULL
       AND MEASURE(empirical_p50) > MEASURE(empirical_p00135)
      THEN (MEASURE(empirical_p50) - MEASURE(spec_lower)) / (MEASURE(empirical_p50) - MEASURE(empirical_p00135))
      ELSE NULL
      END
    display_name: Ppk Non Parametric
    synonyms: ['ppk percentile', 'non normal ppk', 'iso 22514 ppk']
  - name: performance_capability_method
    expr: |
      CASE
      WHEN MEASURE(normality_safe) <> 1 THEN 'mixed'
      WHEN MAX(normality_type) = 'non_normal' THEN 'non_parametric'
      WHEN MAX(normality_type) = 'normal' THEN 'parametric'
      ELSE 'unknown'
      END
    display_name: Performance Capability Method
  - name: pp
    expr: |
      CASE
      WHEN MEASURE(normality_safe) <> 1 THEN NULL
      WHEN MAX(normality_type) = 'non_normal' THEN MEASURE(pp_non_parametric)
      WHEN MAX(normality_type) = 'normal' THEN MEASURE(pp_gaussian)
      ELSE NULL
      END
    display_name: Pp Governed
    synonyms: ['pp governed']
  - name: ppk
    expr: |
      CASE
      WHEN MEASURE(normality_safe) <> 1 THEN NULL
      WHEN MAX(normality_type) = 'non_normal' THEN MEASURE(ppk_non_parametric)
      WHEN MAX(normality_type) = 'normal' THEN MEASURE(ppk_gaussian)
      ELSE NULL
      END
    display_name: Ppk Governed
    synonyms: ['process performance', 'long term capability', 'governed ppk']
  - name: cp
    expr: |
      CASE
      WHEN MEASURE(spec_safe) = 1
       AND MEASURE(sigma_within) > 0
       AND MEASURE(spec_upper) IS NOT NULL
       AND MEASURE(spec_lower) IS NOT NULL
      THEN (MEASURE(spec_upper) - MEASURE(spec_lower)) / (6 * MEASURE(sigma_within))
      ELSE NULL
      END
    display_name: Cp
  - name: cpk
    expr: |
      CASE
      WHEN MEASURE(spec_safe) <> 1 OR MEASURE(sigma_within) <= 0 OR MEASURE(mean_value) IS NULL THEN NULL
      WHEN MEASURE(spec_upper) IS NOT NULL AND MEASURE(spec_lower) IS NOT NULL
      THEN LEAST(
        (MEASURE(spec_upper) - MEASURE(mean_value)) / (3 * MEASURE(sigma_within)),
        (MEASURE(mean_value) - MEASURE(spec_lower)) / (3 * MEASURE(sigma_within))
      )
      WHEN MEASURE(spec_upper) IS NOT NULL
      THEN (MEASURE(spec_upper) - MEASURE(mean_value)) / (3 * MEASURE(sigma_within))
      WHEN MEASURE(spec_lower) IS NOT NULL
      THEN (MEASURE(mean_value) - MEASURE(spec_lower)) / (3 * MEASURE(sigma_within))
      ELSE NULL
      END
    display_name: Cpk
    synonyms: ['process capability', 'short term capability']
  - name: z_score
    expr: |
      CASE
      WHEN MEASURE(performance_capability_method) <> 'parametric' OR MEASURE(ppk_gaussian) IS NULL THEN NULL
      ELSE MEASURE(ppk_gaussian) * 3
      END
    display_name: Z Score
  - name: dpmo
    expr: |
      -- Inline A&S 7.1.26 normal CDF: Φ(z_val) where z_val = MEASURE(z_score) - 1.5 (1.5σ shift).
      -- DPMO = CAST((1 - Φ(z_val)) * 1e6 AS BIGINT). No UDF, no ERF() — pure SQL arithmetic only.
      -- t = 1 / (1 + 0.3275911 * |z_val / √2|); Horner: t*(p1+t*(p2+t*(p3+t*(p4+t*p5))))*exp(-(z_val/√2)²)
      CASE
      WHEN MEASURE(performance_capability_method) <> 'parametric' OR MEASURE(z_score) IS NULL THEN NULL
      WHEN (MEASURE(z_score) - 1.5) >  20.0 THEN CAST(0 AS BIGINT)
      WHEN (MEASURE(z_score) - 1.5) < -20.0 THEN CAST(1000000 AS BIGINT)
      ELSE CAST(
        (1.0 - (
          0.5 * (1.0 + SIGN((MEASURE(z_score) - 1.5)) * (
            1.0 - (
              (1.0 / (1.0 + 0.3275911 * ABS((MEASURE(z_score) - 1.5) / SQRT(2.0)))) *
              (0.254829592 +
               (1.0 / (1.0 + 0.3275911 * ABS((MEASURE(z_score) - 1.5) / SQRT(2.0)))) *
               (-0.284496736 +
                (1.0 / (1.0 + 0.3275911 * ABS((MEASURE(z_score) - 1.5) / SQRT(2.0)))) *
                (1.421413741 +
                 (1.0 / (1.0 + 0.3275911 * ABS((MEASURE(z_score) - 1.5) / SQRT(2.0)))) *
                 (-1.453152027 +
                  (1.0 / (1.0 + 0.3275911 * ABS((MEASURE(z_score) - 1.5) / SQRT(2.0)))) *
                  1.061405429)))) *
              EXP(-((MEASURE(z_score) - 1.5) / SQRT(2.0)) *
                   ((MEASURE(z_score) - 1.5) / SQRT(2.0)))
            )
          ))
        )) * 1000000.0
        AS BIGINT)
      END
    display_name: DPMO
    synonyms: ['defects per million', 'ppm defects']
  - name: mean_minus_nominal
    expr: |
      CASE
      WHEN MEASURE(spec_safe) = 1 AND MEASURE(nominal_target) IS NOT NULL
      THEN MEASURE(mean_value) - MEASURE(nominal_target)
      ELSE NULL
      END
    display_name: Mean Minus Nominal
    synonyms: ['mean offset', 'target bias', 'off target']
  - name: abs_mean_offset
    expr: |
      CASE
      WHEN MEASURE(mean_minus_nominal) IS NULL THEN NULL
      ELSE ABS(MEASURE(mean_minus_nominal))
      END
    display_name: Absolute Mean Offset
    synonyms: ['absolute bias', 'absolute target deviation']
  - name: pct_mean_offset_of_spec_width
    expr: |
      CASE
      WHEN MEASURE(spec_safe) = 1
       AND MEASURE(spec_upper) IS NOT NULL
       AND MEASURE(spec_lower) IS NOT NULL
       AND (MEASURE(spec_upper) - MEASURE(spec_lower)) <> 0
      THEN 100 * ABS(MEASURE(mean_value) - MEASURE(nominal_target)) / (MEASURE(spec_upper) - MEASURE(spec_lower))
      ELSE NULL
      END
    display_name: Percent Mean Offset of Spec Width
    synonyms: ['percent off target', 'offset vs tolerance']
  - name: mean_out_of_spec_flag
    expr: |
      CASE
      WHEN MEASURE(spec_safe) = 1
       AND MEASURE(mean_value) IS NOT NULL
       AND (
         (MEASURE(spec_upper) IS NOT NULL AND MEASURE(mean_value) > MEASURE(spec_upper))
         OR (MEASURE(spec_lower) IS NOT NULL AND MEASURE(mean_value) < MEASURE(spec_lower))
       )
      THEN 1
      ELSE 0
      END
    display_name: Mean Out of Spec Flag
    synonyms: ['mean out of spec', 'out of spec mean']
$$;
