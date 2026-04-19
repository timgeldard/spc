# Data Model: SPC Application Current State

## Core Entities

### SPC Quality Metrics (Metric View)
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

#### Governed Logic Details (Implemented in SQL)
1. **Model Selection**: If `normality_type` is 'normal', `pp` uses `pp_gaussian`. If 'non_normal', it uses `pp_non_parametric` (empirical percentiles). If 'mixed' or 'unknown', it returns `NULL`.
2. **Short-term Estimation**: `sigma_within` is calculated using a `CASE` statement containing the $d_2$ constants for subgroup sizes $n=2$ to $n=15$.
3. **DPMO Calculation**: Implemented as an inline SQL arithmetic block (Horner's method approximation of Normal CDF) including a mandatory 1.5σ long-term shift.
4. **Safety Guards**: `spec_safe` and `normality_safe` flags ensure that if multiple specifications or normality types are detected in a single slice, capability results are suppressed to prevent misleading metrics.

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

### DAL Implementation: PyPika to Databricks SQL Mapping

The application uses PyPika to programmatically build Databricks SQL. This ensures that complex logic (like pagination and SAP spec parsing) is deterministic and consistent.

#### 1. Keyset Pagination (Cursor Translation)
The `/chart-data` endpoint uses a composite cursor to handle large datasets.
- **Python Mapping**: `decode_chart_cursor(cursor)` splits the string.
- **SQL Translation**: Translates into a nested `OR` structure to ensure the next page starts exactly after the last point:
  ```sql
  WHERE (epoch > :e OR (epoch = :e AND batch_id > :b) OR (epoch = :e AND batch_id = :b AND sample_id > :s) ...)
  ```

#### 2. SAP QM Tolerance Parsing
SAP QM often stores tolerances as a single string (e.g., `10...15`).
- **SQL Mapping**: The DAL injects `LOCATE` and `SUBSTRING` logic to split these at runtime:
  ```sql
  TRY_CAST(SUBSTRING(TOLERANCE, 1, LOCATE('...', TOLERANCE) - 1) AS DOUBLE) AS lsl,
  TRY_CAST(SUBSTRING(TOLERANCE, LOCATE('...', TOLERANCE) + 3) AS DOUBLE) AS usl
  ```

#### 3. Dynamic Stratification
- **Logical Map**:
  - `Lot` → `CAST(r.INSPECTION_LOT_ID AS STRING) AS stratify_value`
  - `Operation` → `CAST(r.OPERATION_ID AS STRING) AS stratify_value`
  - `Plant` → `bd.plant_id AS stratify_value`

#### 4. Intra-Batch Sequencing
To ensure control charts render correctly, samples within a single batch must be sequenced.
- **SQL Mapping**: Uses `ROW_NUMBER()` window function:
  ```sql
  ROW_NUMBER() OVER (PARTITION BY r.BATCH_ID ORDER BY r.SAMPLE_ID, r.INSPECTION_LOT_ID) AS sample_seq
  ```
