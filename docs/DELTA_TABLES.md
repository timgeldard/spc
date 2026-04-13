# Delta Tables — App-Managed Persistent State

This document describes the Delta tables created by the SPC App for persistent
state that cannot live in the read-only gold views. The deploy pipeline is
expected to apply the relevant migrations automatically; the SQL shown here is
the underlying shape for audit and admin review.

## Recommendations

- Consider using a dedicated `spc_app` schema rather than the shared `gold` schema
  to isolate app-managed tables from the data engineering pipeline's views.
- Grant the minimum required permissions to users (see **Required Unity Catalog Grants** below).

---

## Table: `spc_locked_limits`

**Purpose:** Stores control limits locked by a user for Phase II monitoring.
Allows a stable baseline period's limits to be persisted and projected forward
onto new data, without recalculating from the full date range.

**Feature:** Locked Phase II Control Limits (Feature 2)

**DDL:**

```sql
CREATE TABLE IF NOT EXISTS `connected_plant_uat`.`gold`.`spc_locked_limits` (
  material_id    STRING  NOT NULL  COMMENT 'SAP material number',
  mic_id         STRING  NOT NULL  COMMENT 'Inspection characteristic code',
  plant_id       STRING            COMMENT 'Plant ID (NULL = all plants)',
  chart_type     STRING  NOT NULL  COMMENT 'imr, xbar_r, xbar_s, or attribute chart type',
  cl             DOUBLE            COMMENT 'Centre line (grand mean or mean of means)',
  ucl            DOUBLE            COMMENT 'Upper control limit (individuals / Xbar)',
  lcl            DOUBLE            COMMENT 'Lower control limit (individuals / Xbar)',
  ucl_r          DOUBLE            COMMENT 'UCL for the secondary chart (moving range, range, or sigma)',
  lcl_r          DOUBLE            COMMENT 'LCL for the secondary chart (moving range, range, or sigma)',
  sigma_within   DOUBLE            COMMENT 'Estimated within-subgroup sigma',
  baseline_from  STRING            COMMENT 'Start of the baseline period used to lock limits',
  baseline_to    STRING            COMMENT 'End of the baseline period used to lock limits',
  locked_by      STRING  NOT NULL  COMMENT 'Databricks identity (CURRENT_USER()) who locked limits',
  locked_at      TIMESTAMP NOT NULL COMMENT 'Timestamp when limits were locked'
)
USING DELTA
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'false')
COMMENT 'SPC App: user-locked Phase II control limits';
```

The nullable numeric columns match the live backend contract in
`backend/routers/spc.py`, which allows partially populated limit rows for chart
types that do not use every limit field.

**Required Unity Catalog Grants:**

```sql
-- Read locked limits (all authenticated users)
GRANT SELECT ON TABLE `connected_plant_uat`.`gold`.`spc_locked_limits`
  TO `spc_users`;

-- Write/delete locked limits (quality engineers or admin group)
GRANT MODIFY ON TABLE `connected_plant_uat`.`gold`.`spc_locked_limits`
  TO `spc_quality_engineers`;
```

> **Security note:** The application uses token passthrough — the logged-in user's
> identity is forwarded to Databricks, and Unity Catalog enforces these grants
> automatically. No service principal credentials are stored in the app.

---

## Table: `spc_query_audit`

**Purpose:** Stores operational audit events for SPC runtime failures and
eventually for SQL-query traceability. Freshness lookup failures write here with
an error id so the API no longer returns a silent partial-success payload.

**Feature:** Operational audit trail / compliance monitoring

**DDL:**

```sql
CREATE TABLE IF NOT EXISTS `connected_plant_uat`.`gold`.`spc_query_audit` (
  audit_id     STRING    NOT NULL,
  event_type   STRING    NOT NULL,
  sql_hash     STRING,
  error_id     STRING,
  request_path STRING,
  detail_json  STRING    NOT NULL,
  user_id      STRING    NOT NULL,
  created_at   TIMESTAMP NOT NULL
)
USING DELTA
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true');
```

**Required Unity Catalog Grants:**

```sql
-- Write runtime audit rows (must match the principal used at execution time)
GRANT MODIFY ON TABLE `connected_plant_uat`.`gold`.`spc_query_audit`
  TO `<principal-used-by-caller-token>`;

-- Read audit history during investigations / reviews
GRANT SELECT ON TABLE `connected_plant_uat`.`gold`.`spc_query_audit`
  TO `spc_admins`;
```

---

## Table: `spc_exclusions`

**Purpose:** Stores immutable exclusion snapshots for SPC control-chart points.
Each save records the chart scope, justification, affected points, and
before/after limit snapshots so exclusion actions remain attributable.

**Feature:** Audited point exclusions / Phase I cleaning

**DDL:**

```sql
CREATE TABLE IF NOT EXISTS `connected_plant_uat`.`gold`.`spc_exclusions` (
  event_id            STRING    NOT NULL,
  material_id         STRING    NOT NULL,
  mic_id              STRING    NOT NULL,
  mic_name            STRING,
  plant_id            STRING,
  stratify_all        BOOLEAN,
  chart_type          STRING    NOT NULL,
  date_from           STRING,
  date_to             STRING,
  rule_set            STRING,
  justification       STRING    NOT NULL,
  action              STRING,
  excluded_count      INT       NOT NULL,
  excluded_points_json STRING   NOT NULL,
  before_limits_json  STRING,
  after_limits_json   STRING,
  user_id             STRING    NOT NULL,
  event_ts            TIMESTAMP NOT NULL
)
USING DELTA
TBLPROPERTIES ('delta.enableChangeDataFeed' = 'true');
```

**Required Unity Catalog Grants:**

```sql
-- Persist exclusion audit snapshots (must match the principal used at execution time)
GRANT MODIFY ON TABLE `connected_plant_uat`.`gold`.`spc_exclusions`
  TO `<principal-used-by-caller-token>`;

-- Review exclusion history during investigations
GRANT SELECT ON TABLE `connected_plant_uat`.`gold`.`spc_exclusions`
  TO `spc_quality_engineers`;
```

---

## Table: `spc_msa_sessions`

**Purpose:** Stores saved Measurement System Analysis (Gauge R&R) study results.
Users can optionally save a completed MSA study linked to a material and MIC for
reference alongside the control chart.

**Feature:** Gauge R&R / MSA Module (Feature 7)

**DDL:**

```sql
CREATE TABLE IF NOT EXISTS `connected_plant_uat`.`gold`.`spc_msa_sessions` (
  session_id     STRING    NOT NULL  COMMENT 'UUID generated by the app',
  material_id    STRING              COMMENT 'Optional — SAP material number',
  mic_id         STRING              COMMENT 'Optional — Inspection characteristic code',
  created_by     STRING    NOT NULL  COMMENT 'Databricks identity (CURRENT_USER())',
  created_at     TIMESTAMP NOT NULL  COMMENT 'When the study was saved',
  n_operators    INT       NOT NULL  COMMENT 'Number of operators in the study',
  n_parts        INT       NOT NULL  COMMENT 'Number of parts measured',
  n_replicates   INT       NOT NULL  COMMENT 'Number of replicates per operator per part',
  results_json   STRING    NOT NULL  COMMENT 'JSON blob: operators x parts x replicates matrix',
  grr_pct        DOUBLE              COMMENT '%GRR = GRR / TV * 100',
  repeatability  DOUBLE              COMMENT 'Equipment Variation (EV) as % of total variation',
  reproducibility DOUBLE             COMMENT 'Appraiser Variation (AV) as % of total variation',
  ndc            INT                 COMMENT 'Number of distinct categories (NDC >= 5 required)'
)
USING DELTA
COMMENT 'SPC App: saved Gauge R&R / MSA study results';
```

**Required Unity Catalog Grants:**

```sql
-- Read saved MSA sessions
GRANT SELECT ON TABLE `connected_plant_uat`.`gold`.`spc_msa_sessions`
  TO `spc_users`;

-- Save new MSA sessions
GRANT MODIFY ON TABLE `connected_plant_uat`.`gold`.`spc_msa_sessions`
  TO `spc_users`;
```

---

## Write Mechanism

Both tables are written via the existing `run_sql()` utility in `backend/utils/db.py`,
which executes DML (`MERGE INTO`, `INSERT INTO`) through the configured Databricks SQL
executor. The default path uses the Statement Execution REST API, and
`SPC_SQL_EXECUTOR=connector` enables the official `databricks-sql-connector`
through the same `run_sql()` / `run_sql_async()` wrappers.

Example pattern used by the locked limits endpoint:

```python
merge_stmt = f"""
    MERGE INTO {tbl('spc_locked_limits')} AS t
    USING (SELECT :material_id AS material_id, :mic_id AS mic_id, ...) AS s
    ON t.material_id = s.material_id
       AND t.mic_id = s.mic_id
       AND t.chart_type = s.chart_type
       AND t.plant_id IS NULL AND s.plant_id IS NULL
    WHEN MATCHED THEN UPDATE SET *
    WHEN NOT MATCHED THEN INSERT *
"""
run_sql(token, merge_stmt, params)
```

When `plant_id` is provided, the app uses a null-safe equality match on both
sides of the `MERGE`. When `plant_id` is omitted, it explicitly matches only
the `NULL` "all plants" row rather than coercing the value to an empty string.
