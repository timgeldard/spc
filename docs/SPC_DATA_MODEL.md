# SPC Data Model

## Entity Relationship Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                           UPSTREAM GOLD VIEWS                           │
│  (Not SPC-owned; read-only dependencies)                                │
├─────────────────────────────────────────────────────────────────────────┤
│  gold_batch_quality_result_v ─────┬───► spc_quality_metric_subgroup_v   │
│  gold_batch_mass_balance_v ───────┤                                     │
│  gold_material ───────────────────┤                                     │
│  gold_plant ──────────────────────┘                                     │
│  gold_batch_lineage ──────────────────► spc_process_flow_source_mv      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                           SPC BASE VIEWS                                │
├─────────────────────────────────────────────────────────────────────────┤
│  spc_quality_metric_subgroup_v ───┬───► spc_quality_metrics (METRIC)    │
│                                   ├───► spc_nelson_rule_flags_mv        │
│                                   ├───► spc_capability_detail_mv        │
│                                   └───► spc_correlation_source_mv       │
│  spc_attribute_metric_source_v ───────► spc_attribute_quality_metrics   │
│  spc_unified_mic_key_v                                                  │
│  spc_mic_routing_v                                                      │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                         SPC DIMENSION MVs                               │
├─────────────────────────────────────────────────────────────────────────┤
│  spc_material_dim_mv          (UI material picker)                      │
│  spc_plant_material_dim_mv    (UI plant-material picker)                │
│  spc_characteristic_dim_mv    (UI MIC picker)                           │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                       SPC USER-EDITABLE TABLES                          │
├─────────────────────────────────────────────────────────────────────────┤
│  spc_locked_limits      (control limit overrides)                       │
│  spc_exclusions         (sample/batch exclusions)                       │
│  spc_mic_chart_config   (chart type overrides)                          │
│  spc_query_audit        (audit log)                                     │
└─────────────────────────────────────────────────────────────────────────┘
```

## Key Relationships

| From | To | Join Key | Cardinality |
|------|-----|----------|-------------|
| gold_batch_quality_result_v | spc_quality_metric_subgroup_v | MATERIAL_ID, BATCH_ID | 1:N |
| spc_quality_metric_subgroup_v | spc_quality_metrics | source view | N/A (metric) |
| spc_quality_metric_subgroup_v | spc_nelson_rule_flags_mv | material_id, mic_id, batch_id | N:1 |
| spc_quality_metric_subgroup_v | spc_capability_detail_mv | material_id, plant_id, mic_id | N:1 |
| spc_locked_limits | spc_quality_metric_subgroup_v | material_id, plant_id, mic_id, operation_id | 1:N |
