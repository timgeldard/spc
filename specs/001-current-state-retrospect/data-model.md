# Data Model: SPC Application Current State

## Core Entities

### SPC Quality Metrics (Materialized View)
The primary analytical source for dashboards and scorecards. It implements the "Governed Capability" logic.

| Field | Type | Description |
|---|---|---|
| material_id | string | SAP Material identifier |
| mic_id | string | Master Inspection Characteristic identifier |
| pp / ppk | float | Governed performance index (Gaussian or Non-Parametric) |
| cp / cpk | float | Short-term capability index (using within-sigma) |
| sigma_within | float | Within-subgroup sigma estimated from average range |
| stddev_overall | float | Process performance sigma (Sample StdDev N-1) |
| normality_type | string | `normal`, `non_normal`, or `mixed` |

### SPC Exclusions (Delta Table)
Persists manual data point exclusions with Change Data Feed enabled.

| Field | Type | Description |
|---|---|---|
| event_id | string | Unique UUID for the exclusion event |
| material_id | string | Target material |
| excluded_points_json | string | JSON list of excluded `batch_id:sample_id` pairs |
| justification | string | Mandatory user-provided reasoning |
| user_id | string | Authenticated user (from OIDC) |

### SPC Locked Limits (Delta Table)
Stores governed control limits that override the dynamic calculation.

| Field | Type | Description |
|---|---|---|
| cl / ucl / lcl | float | Control limits |
| locked_at | timestamp | When the lock was applied |
| operation_id | string | Optional operation-level scope |

### Lineage Graph (Materialized View)
Represents the supply chain DAG used by the Process Flow view.

| Field | Type | Description |
|---|---|---|
| source | string | Upstream material |
| target | string | Downstream material |
| relationship_type | string | e.g., `Production`, `Transfer` |

## Data Flows

1. **Analytical Read**: `gold_batch_quality_result_v` -> `spc_quality_metric_subgroup_v` -> `spc_quality_metrics`.
2. **Audit Flow**: `run_sql_async` -> `insert_spc_query_audit` (captures all warehouse queries).
3. **Governance Flow**: User exclusion -> `spc_exclusions` -> `spc_charts_dal` (applies `NOT IN` filter at runtime).
