-- Migration 008: create the attribute-quality metric view for p-chart style analytics.

CREATE OR REPLACE VIEW `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_attribute_quality_metrics`
WITH METRICS
LANGUAGE YAML
AS $$
version: 1.1
comment: "Governed attribute SPC metrics for defect and nonconformance analysis."
source: ${TRACE_CATALOG}.${TRACE_SCHEMA}.spc_attribute_metric_source_v

dimensions:
  - name: material_id
    expr: material_id
    display_name: Material ID
  - name: material_name
    expr: material_name
    display_name: Material Name
  - name: plant_id
    expr: plant_id
    display_name: Plant ID
  - name: plant_name
    expr: plant_name
    display_name: Plant Name
  - name: mic_id
    expr: mic_id
    display_name: MIC ID
  - name: mic_name
    expr: mic_name
    display_name: MIC Name
  - name: operation_id
    expr: operation_id
    display_name: Operation ID
  - name: inspection_method
    expr: inspection_method
    display_name: Inspection Method
  - name: batch_id
    expr: batch_id
    display_name: Batch ID
  - name: batch_date
    expr: batch_date
    display_name: Batch Date
  - name: batch_week
    expr: batch_week
    display_name: Batch Week
  - name: batch_month
    expr: batch_month
    display_name: Batch Month

measures:
  - name: batch_count
    expr: COUNT(DISTINCT batch_id)
    display_name: Batch Count
  - name: total_inspected
    expr: SUM(n_inspected)
    display_name: Total Inspected
    synonyms: ['inspection count']
  - name: total_nonconforming
    expr: SUM(n_nonconforming)
    display_name: Total Nonconforming
    synonyms: ['defect count', 'failed inspections']
  - name: rejected_batches
    expr: COUNT(DISTINCT CASE WHEN has_rejection = 1 THEN batch_id END)
    display_name: Rejected Batches
  - name: p_bar
    expr: |
      CASE
      WHEN MEASURE(total_inspected) = 0 THEN NULL
      ELSE MEASURE(total_nonconforming) / MEASURE(total_inspected)
      END
    display_name: P Bar
    synonyms: ['nonconforming proportion', 'defect proportion']
    format:
      type: percentage
  - name: defect_rate_pct
    expr: |
      CASE
      WHEN MEASURE(p_bar) IS NULL THEN NULL
      ELSE 100 * MEASURE(p_bar)
      END
    display_name: Defect Rate Percent
    synonyms: ['defect rate', 'nonconformance percent']
$$;
