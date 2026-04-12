-- Migration 010: create the process-flow material health metric view.

CREATE OR REPLACE VIEW `${TRACE_CATALOG}`.`${TRACE_SCHEMA}`.`spc_process_flow_metrics`
WITH METRICS
LANGUAGE YAML
AS $$
version: 1.1
comment: "Governed process-flow health metrics for material-level overview and Genie summaries."
source: ${TRACE_CATALOG}.${TRACE_SCHEMA}.spc_process_flow_source_v

dimensions:
  - name: material_id
    expr: material_id
    display_name: Material ID
  - name: material_name
    expr: material_name
    display_name: Material Name
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
  - name: plant_id
    expr: plant_id
    display_name: Plant ID
  - name: plant_name_resolved
    expr: plant_name_resolved
    display_name: Resolved Plant Name
  - name: mic_id
    expr: mic_id
    display_name: MIC ID

measures:
  - name: total_batches
    expr: COUNT(DISTINCT batch_id)
    display_name: Total Batches
  - name: rejected_batches
    expr: COUNT(DISTINCT CASE WHEN has_rejection = 1 THEN batch_id END)
    display_name: Rejected Batches
  - name: mic_count
    expr: COUNT(DISTINCT mic_id)
    display_name: MIC Count
  - name: rejection_rate
    expr: |
      CASE
      WHEN MEASURE(total_batches) = 0 THEN NULL
      ELSE MEASURE(rejected_batches) / MEASURE(total_batches)
      END
    display_name: Rejection Rate
    format:
      type: percentage
$$;
