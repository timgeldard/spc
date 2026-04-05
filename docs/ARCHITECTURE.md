# Architecture

Technical reference for the SPC App backend and frontend.

---

## Overview

The app is a single Databricks App unit: one `uvicorn` process serving both
the FastAPI REST API and the compiled React SPA. There is no separate
frontend server in production.

```
┌─────────────────────────────────────────────────────────┐
│ Databricks Apps Runtime                                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ uvicorn (port 8000)                                │  │
│  │                                                    │  │
│  │  FastAPI                                           │  │
│  │    /api/spc/*    ← backend/routers/spc.py          │  │
│  │    /api/spc/export ← backend/routers/export.py     │  │
│  │    /api/trace    ← backend/main.py                 │  │
│  │    /api/health   ← backend/main.py                 │  │
│  │    /assets       ← frontend/dist/assets/           │  │
│  │    /*            → frontend/dist/index.html (SPA)  │  │
│  └────────────────────────────────────────────────────┘  │
│                         │                                │
│          x-forwarded-access-token                        │
│          (injected by Apps proxy per-request)            │
└─────────────────────────────────────────────────────────┘
                          │
            Databricks SQL Warehouse
            (REST API /api/2.0/sql/statements)
                          │
            Unity Catalog (connected_plant_uat.gold.*)
            Row/column policies enforced per user
```

---

## Backend

### Module layout

```
backend/
├── main.py             App entry point, global exception handler,
│                       traceability endpoints, SPA serving
├── routers/
│   ├── spc.py          Core SPC endpoints (router mounted at /api/spc)
│   ├── export.py       Export endpoints for scorecard / chart data / signals
│   └── exclusions.py   Persisted exclusions audit trail endpoints
└── utils/
    ├── db.py           SQL execution, token resolution, configuration
    ├── spc_thresholds.py  CPK/rejection rate threshold constants
    └── rate_limit.py   slowapi Limiter instance (available for endpoint decoration)
```

### `backend/utils/db.py` — the security foundation

Every API endpoint imports from here. Key functions:

| Function | Purpose |
|---|---|
| `resolve_token(fwd, auth)` | Extracts token from `x-forwarded-access-token` (production) or `Authorization: Bearer` (local dev). Raises HTTP 401 if absent. |
| `run_sql(token, stmt, params)` | POSTs to `/api/2.0/sql/statements`, polls until terminal state, returns `list[dict]`. Raises `RuntimeError` on SQL failure. |
| `sql_param(name, value)` | Builds `{"name": ..., "value": str(v), "type": "STRING"}` dict for named parameters. All user inputs go through this. |
| `tbl(name)` | Returns `` `CATALOG`.`SCHEMA`.`name` `` — fully-qualified backtick-quoted. |
| `check_warehouse_config()` | Raises HTTP 500 if `DATABRICKS_WAREHOUSE_HTTP_PATH` is not set. |
| `hostname()` | Strips scheme and trailing slash from `DATABRICKS_HOST`. |

Configuration is read once at module import from environment variables
(`DATABRICKS_HOST`, `DATABRICKS_WAREHOUSE_HTTP_PATH`, `TRACE_CATALOG`, `TRACE_SCHEMA`).

### Why REST API instead of `databricks-sql-connector`

The Python connector has a known bug when `WITH RECURSIVE` CTEs are executed
inside an async Python process: the connector recurses internally and hits Python's
default recursion limit. The traceability module uses `WITH RECURSIVE` for batch
lineage traversal. Using the REST API (`/api/2.0/sql/statements`) avoids this
entirely and also removes the native driver dependency from the runtime.

The recursion limit is set to 10,000 in `main.py` as an additional safeguard.

### SQL parameterization

All user-supplied values use named parameters:

```python
query = "SELECT * FROM t WHERE MATERIAL_ID = :material_id"
params = [sql_param("material_id", body.material_id)]
rows = run_sql(token, query, params)
```

The REST API substitutes `:name` placeholders server-side. No string escaping or
f-string interpolation of user values occurs anywhere in the codebase.
Only table/column names (which come from code, not user input) are interpolated
via `tbl()` (which uses backtick quoting).

### SQL execution audit logging

`run_sql` logs at INFO level using `logging.getLogger(__name__)`:

```
sql.execute  hash=<sha256[:16]>  params=<count>
sql.done     hash=<...>  state=SUCCEEDED  rows=<n>  duration_ms=<ms>
sql.failed   hash=<...>  state=FAILED     duration_ms=<ms>
```

The full SQL statement text and parameter values are never logged — only the
statement hash. Databricks Apps captures stdout/stderr; logs are accessible
in the app's log stream.

### Error handling

`_handle_sql_error` in `spc.py` converts common SQL errors to HTTP status codes:

| Condition | HTTP Status |
|---|---|
| "permission denied" / "no access" / "403" in error message | 403 |
| "401" / "unauthorized" in error message | 401 |
| All other SQL errors | 500 |

A global exception handler in `main.py` catches any unhandled exception and
returns structured JSON (detail + type + truncated traceback). It explicitly
re-raises `HTTPException` to avoid recursion.

### Traceability tree building (`_build_tree`)

The `/api/trace` endpoint returns a recursive tree structure. `_build_tree`:

1. Deduplicates rows by `(material_id, batch_id)`, keeping lowest-depth row when duplicates appear
2. Builds a parent→children index from the deduplicated flat rows
3. Wires children recursively with a `frozenset` ancestor path to detect and break cycles
4. Selects the root as the node with no parent (or lowest depth if multiple candidates)

### Export API

`POST /api/spc/export` is a documented backend route, not a frontend-only helper.
It supports:

| Scope | Formats | Description |
|---|---|---|
| `scorecard` | `excel`, `csv` | Capability scorecard download |
| `chart_data` | `excel`, `csv` | Raw chart-point export |
| `signals` | `excel`, `csv` | Rule-violation log export |

The export router reuses shared SPC data-fetch helpers so exported files stay
aligned with the datasets shown in the UI.

### Exclusions API

`/api/spc/exclusions` is the persisted audit trail for manual and auto-cleaned
point exclusions. The endpoints are implemented in
`backend/routers/exclusions.py` and mounted under the main SPC router.

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/spc/exclusions` | Persist a new immutable exclusion snapshot for a chart scope |
| `GET` | `/api/spc/exclusions` | Return the latest exclusion snapshot for a chart scope |

The POST body includes scope fields (`material_id`, `mic_id`, `plant_id`,
`chart_type`, `date_from`, `date_to`), the exclusion payload
(`excluded_points`, `justification`, `action`), and optional
`before_limits` / `after_limits` snapshots. Responses include audit metadata
such as `event_id`, `user_id`, and `event_ts` so the frontend can show who made
the change and when.

---

## Frontend

### Module layout

```
frontend/src/
├── main.jsx              React entry point
├── App.jsx               Root — wraps SPCProvider, renders AppShell
├── AppShell.jsx          Layout shell (nav bar + content area)
├── spc.css               SPC module styles
└── spc/
    ├── SPCPage.jsx       Tab shell: Flow | Charts | Scorecard
    ├── SPCContext.jsx    Global state (useReducer)
    ├── SPCFilterBar.jsx  Filter controls
    ├── calculations.js   Pure statistical functions
    ├── spcConstants.js   AIAG constants + CPK thresholds
    ├── charts/           Control chart components
    ├── flow/             Process flow DAG components
    ├── scorecard/        Capability scorecard components
    └── hooks/            Data-fetching hooks
```

### State management (`SPCContext.jsx`)

All SPC state lives in a single `useReducer` context. Cascading resets prevent
stale data — changing `selectedMaterial` clears `selectedPlant`, `selectedMIC`,
`excludedIndices`, and `chartTypeOverride`.

```js
{
  selectedMaterial: { material_id, material_name } | null,
  selectedPlant:    { plant_id, plant_name } | null,   // null = all plants
  selectedMIC:      { mic_id, mic_name, chart_type, ... } | null,
  dateFrom: '',          // ISO date string
  dateTo: '',
  activeTab: 'flow',     // 'flow' | 'charts' | 'scorecard'
  chartTypeOverride: null,     // 'imr' | 'xbar_r' | null (null = auto)
  excludedIndices: Set,        // point indices excluded from limit calc
  excludeOutliers: false,      // exclude ATTRIBUT='*' points from limit calc
  ruleSet: 'weco',             // 'weco' | 'nelson'
}
```

### Statistical calculations (`calculations.js`)

All functions are pure (no side effects, no API calls). Formulas follow
AIAG SPC Reference Manual 4th Edition.

| Function | Description |
|---|---|
| `computeIMR(values)` | I-MR control limits. Uses d2=1.128, D4=3.267 for n=2. |
| `groupIntoSubgroups(points)` | Groups raw points by `batch_seq` for X̄-R. |
| `computeXbarR(subgroups)` | X̄-R limits with variable subgroup size support. |
| `computeCapability(values, nominal, tol, sigmaWithin)` | Cp, Cpk (within), Pp, Ppk (overall). Minimum 5 values required. |
| `computePChart(points)` | P-chart with variable control limits per batch size. |
| `detectWECORules(values, limits)` | 4 WECO tests. Returns `[{rule, indices, description}]`. |
| `detectNelsonRules(values, limits)` | 8 Nelson tests (superset of WECO). |
| `computeHistogram(values, forceBins)` | Sturges' formula for bin count. |
| `normalCurve(mu, sigma, minX, maxX, n, binWidth)` | Normal PDF scaled to histogram count. |
| `computeAll(points, chartType, ruleSet)` | Master orchestrator. Returns `{imr, xbarR, capability, signals, mrSignals, ...}`. |

**SPC constants (`spcConstants.js`):**

Tabulated values for subgroup sizes n=2..10:

| Constant | Use |
|---|---|
| `d2` | `sigmaWithin = R̄ / d2` |
| `A2` | UCL = X̄̄ + A2·R̄ |
| `D3` | LCL_R = D3·R̄ |
| `D4` | UCL_R = D4·R̄ |

CPK classification thresholds (`CPK_THRESHOLDS`):

| Key | Value | Meaning |
|---|---|---|
| `EXCELLENT` | 1.67 | Highly capable |
| `CAPABLE` | 1.33 | Capable / green |
| `MARGINAL` | 1.00 | Marginal / amber |

These mirror `backend/utils/spc_thresholds.py`. Any change must be applied in both places.

### Hook pattern

Every data-fetching hook follows the same shape:

```js
export function useSomething(dep1, dep2) {
  const [data, setData] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)

  useEffect(() => {
    if (!dep1) { setData([]); return }
    let cancelled = false
    setLoading(true)
    fetch('/api/spc/something', { method: 'POST', ... })
      .then(r => r.ok ? r.json() : r.json().then(b => Promise.reject(b.detail)))
      .then(d => { if (!cancelled) setData(d.something ?? []) })
      .catch(e => { if (!cancelled) setError(String(e)) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [dep1, dep2])

  return { data, loading, error }
}
```

The `cancelled` flag prevents state updates after a component unmounts or
after a faster subsequent fetch supersedes an in-flight request.

### Chart rendering libraries

| Library | Used for |
|---|---|
| ECharts (`echarts-for-react`) | All control charts (line + scatter with per-point styling) |
| ag-Grid (`ag-grid-react`) | Capability scorecard table |
| ReactFlow (`@xyflow/react`) | Process flow DAG |
| D3 (`d3-array`, `d3-shape`) | Histogram bin calculation utilities |

Recharts is listed in `package.json` but is not actively used in the current
chart components — it was used in an earlier iteration.

### ATTRIBUT outlier handling

`QAMR.ATTRIBUT = '*'` is Kerry's convention for a confirmed QA outlier.
The `chart-data` endpoint returns `is_outlier: boolean` on each point
(derived from the `attribute` column).

In the UI:
- Outlier points render as purple diamonds on the chart
- A "Exclude ATTRIBUT outliers" checkbox appears in the chart header when any outliers exist
- When checked, `useSPCCalculations` excludes outlier indices from control limit recalculation (same mechanism as manual point exclusion)
- The points remain visible on the chart regardless

---

## Process Flow DAG

The process flow is a directed acyclic graph (DAG) of material nodes, built
server-side via two recursive CTEs in `spc_process_flow`:

1. `upstream` — walks up to 4 levels via `CHILD_MATERIAL_ID → PARENT_MATERIAL_ID`
2. `downstream` — walks up to 3 levels via `PARENT_MATERIAL_ID → CHILD_MATERIAL_ID`

Each node is enriched with SPC health from `gold_batch_quality_result_v`:

| CPK | Rejection rate | Status | Colour |
|---|---|---|---|
| ≥ 1.33 | < 2% | Green | `#10b981` |
| ≥ 1.00 | < 10% | Amber | `#f59e0b` |
| < 1.00 | any | Red | `#ef4444` |
| < 5 batches or no data | — | Grey | `#9ca3af` |

The frontend lays out the DAG using a Sugiyama-style layered algorithm
implemented in `flow/layoutFlowGraph.js`. ReactFlow renders the positioned
nodes and edges with drag, pan, and zoom support.

---

## Security

### Authentication flow

```
Browser request
    │
    └─ Databricks Apps proxy adds x-forwarded-access-token (user's OIDC token)
            │
            └─ FastAPI: resolve_token() extracts the token
                    │
                    └─ run_sql() passes token as Authorization: Bearer to SQL Warehouse
                            │
                            └─ Unity Catalog enforces row/column policies
```

For local development, `Authorization: Bearer <PAT>` is accepted as a fallback.

### What is and isn't protected

| Endpoint | Auth required |
|---|---|
| `GET /api/health` | No (liveness probe) |
| `GET /api/health/debug` | Yes |
| `GET /api/test-query` | Soft (returns info dict without error if absent) |
| All `/api/spc/*` | Yes — 401 if no token |
| All `/api/trace`, `/api/summary`, etc. | Yes — 401 if no token |
| `/assets/*`, `/*` (SPA) | No (static files) |

### SQL injection prevention

Every user-supplied value flows through `sql_param()` and is passed as a named
parameter to the SQL Warehouse. The warehouse substitutes values server-side;
they are never string-interpolated into the SQL text. Table and column names
in queries come from code constants, not user input.

---

## Deployment

### Databricks Asset Bundle (DAB)

`databricks.yml` defines one target (`uat`). The app resource `spc` points
`source_code_path: .` — the entire repo directory is uploaded.

The `user_api_scopes: ["sql"]` setting (required for SQL token passthrough) cannot
be set in the DAB schema. `scripts/post-deploy.sh` re-applies it after every deploy
via `databricks apps update`.

**Always use `make deploy`**. Running `databricks bundle deploy` directly will
deploy the code but leave `user_api_scopes` empty, silently breaking all SQL calls.

### `app.yaml`

Controls the runtime startup command:

```yaml
command:
  - uvicorn
  - backend.main:app
  - --host 0.0.0.0
  - --port 8000
env:
  - name: DATABRICKS_WAREHOUSE_HTTP_PATH
    value: "/sql/1.0/warehouses/e76480b94bea6ed5"
  - name: TRACE_CATALOG
    value: "connected_plant_uat"
  - name: TRACE_SCHEMA
    value: "gold"
```

`DATABRICKS_HOST` is injected automatically by the Apps runtime.
`make deploy` renders `app.yaml` from `app.template.yaml` before bundle upload so
the runtime file always contains concrete values rather than unresolved bundle
placeholders.

### CI (GitHub Actions)

`.github/workflows/deploy.yml` runs on push to `main`:

1. Install frontend deps (`npm ci`)
2. Run frontend tests (Vitest)
3. Install backend deps (`pip install -r backend/requirements.txt`)
4. Run backend tests (pytest)

No automated deployment — push to UAT is a manual step via `make deploy`.

---

## Known Limitations

| Area | Limitation |
|---|---|
| Databricks connector | Not used — REST API polling adds ~2s latency vs native driver |
| Rate limiting | `rate_limit.py` is wired but no endpoint decorators applied (slowapi not in Databricks Apps venv) |
| Plant filter in chart-data | Uses INNER JOIN on batch_dates — batches with no mass balance record are excluded |
| Histogram bins | Sturges' formula underestimates bin count for non-normal distributions |
| Scorecard stability | Cpk shown without per-MIC stability check (requires full chart-data fetch per MIC) |
| UoM consistency | No unit-of-measure conversion; cross-plant SPC is only valid if UoM is consistent in the gold view |
