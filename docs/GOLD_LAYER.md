# SPC Gold Layer Documentation

## Object Inventory

| Object Name | Type | Grain | Clustering | Refresh |
|-------------|------|-------|------------|---------|
| spc_quality_metric_subgroup_v | VIEW | sample | N/A | Real-time |
| spc_quality_metrics | METRIC VIEW | flexible | N/A | Real-time |
| spc_material_dim_mv | MATERIALIZED VIEW | material_id | material_id | Pipeline (4h) |
| spc_plant_material_dim_mv | MATERIALIZED VIEW | plant_id, material_id | plant_id, material_id | Pipeline (4h) |
| spc_correlation_source_mv | MATERIALIZED VIEW | material_id, batch_id, mic_id | material_id, mic_id | Pipeline (4h) |
| spc_nelson_rule_flags_mv | MATERIALIZED VIEW | material_id, plant_id, mic_id, batch_id | material_id, mic_id | Pipeline (4h) |
| spc_capability_detail_mv | MATERIALIZED VIEW | material_id, plant_id, mic_id | material_id, mic_id | Pipeline (4h) |
| spc_locked_limits | TABLE | material_id, plant_id, mic_id, operation_id | N/A | User-managed |
| spc_exclusions | TABLE | material_id, batch_id, mic_id | N/A | User-managed |

## Refresh Cadence

- **Real-time views**: Query upstream gold on every request
- **Pipeline MVs**: Refreshed every 4 hours via `spc_gold_refresh_job`
- **User-managed tables**: Updated via app UI; no automated refresh

## Clustering Strategy

All MVs use CLUSTER BY for optimal query performance:
- **material_id**: Primary filter in all scorecard/chart queries
- **mic_id**: Secondary filter for MIC-specific analysis
- **plant_id**: Tertiary filter for plant scoping

## Quality Expectations

Each pipeline MV has EXPECT constraints:
- `valid_material_id`: material_id IS NOT NULL
- `valid_plant_id`: plant_id IS NOT NULL (where applicable)
- `min_samples`: n >= 30 (for capability MVs)
