# SPC App — Statistical Process Control on Databricks

A **Databricks App** that delivers real-time Statistical Process Control (SPC)
charting and batch traceability for manufacturing quality teams, backed by a
Databricks SQL Warehouse and Unity Catalog.

---

## Features

### SPC Module
- **Control Charts** — I-MR (Individuals + Moving Range) and X̄-R (Subgroup Mean + Range), auto-selected from data
- **Rule Detection** — WECO (4 rules) and Nelson (8 rules) out-of-control signals, toggleable per chart
- **P-Chart** — Proportion nonconforming chart for attribute (pass/fail) characteristics, with variable control limits
- **Process Capability** — Pp, Ppk (overall, using sample standard deviation) with a stability warning when rule violations exist
- **Capability Scorecard** — All MIC characteristics for a material in a single table, sorted by Ppk ascending (least capable first)
- **Process Flow** — DAG showing upstream/downstream material lineage with rejection-rate-based health colouring per node
- **Plant Stratification** — Filter all charts and scorecard to a single producing plant
- **ATTRIBUT Outlier Handling** — Kerry QM outliers (`QAMR.ATTRIBUT = '*'`) surfaced on charts; optional exclusion from control limit calculations
- **Manual Point Exclusion** — Click any control chart point to exclude it from limit recalculation; click again to restore

### Traceability Module
- **Recursive Batch Trace** — Top-down trace via `WITH RECURSIVE` CTE, up to 10 levels deep, with cycle detection
- **Batch Intelligence** — CoA results, mass balance KPIs, stock positions
- **Recall Readiness** — Customers affected by a batch, cross-batch exposure warnings

### Platform
- **Token Passthrough Security** — User's OIDC token passed directly to the SQL Warehouse; Unity Catalog row/column policies enforced automatically
- **No Credential Storage** — No service account secrets; every query auditable to the signed-in user
- **Audit Logging** — All SQL executions logged with statement hash, row count, and duration

---

## Architecture

```
Databricks Apps Runtime
    │
    └── uvicorn → FastAPI (Python)
          ├── /api/spc/*           SPC endpoints (backend/routers/spc.py)
          ├── /api/trace           Batch traceability (backend/main.py)
          ├── /api/batch-details   Batch intelligence (backend/main.py)
          ├── /api/health          Liveness probe
          └── /assets + /*         Serves React SPA (frontend/dist/)

React SPA (Vite)
    ├── SPCPage              Tab shell: Flow | Charts | Scorecard
    ├── SPCFilterBar         Material → Plant → MIC → Date range
    ├── SPCContext           useReducer state management
    ├── spc/charts/          IMRChart, XbarRChart, PChart, CapabilityPanel, SignalsPanel
    ├── spc/flow/            ProcessFlowView (ReactFlow DAG)
    └── spc/scorecard/       ScorecardView (ag-Grid)
```

The FastAPI process serves both the compiled SPA (`frontend/dist/`) and the REST
API under `/api/`. In production the Databricks Apps proxy injects the signed-in
user's OIDC token into every request via `x-forwarded-access-token` — the backend
passes it directly to the SQL Warehouse so Unity Catalog permissions are enforced
automatically with no app-level filtering needed.

SQL is executed via the Databricks REST API (`/api/2.0/sql/statements`) rather
than the Python connector, to avoid a known bug with `WITH RECURSIVE` CTEs in
async Python contexts.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for a full technical deep-dive.

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 20+ with npm
- Databricks workspace with a SQL Warehouse
- Access to `connected_plant_uat.gold.*` views (or equivalent Unity Catalog coordinates)

### 1 — Clone and configure

```bash
git clone https://github.com/timgeldard/spc.git
cd spc
cp .env.example .env
```

Edit `.env` with your workspace details:

```bash
DATABRICKS_HOST=https://your-workspace.azuredatabricks.net
DATABRICKS_WAREHOUSE_HTTP_PATH=/sql/1.0/warehouses/YOUR_WAREHOUSE_ID
TRACE_CATALOG=connected_plant_uat
TRACE_SCHEMA=gold
```

### 2 — Backend

```bash
# Install dependencies
pip install -r backend/requirements.txt

# Start the API server (Terminal 1)
export $(cat .env | xargs)
uvicorn backend.main:app --reload --port 8000
```

The API is available at `http://localhost:8000/api/docs`.

For endpoints that require a token, pass your Databricks PAT:

```
Authorization: Bearer <your-databricks-pat>
```

### 3 — Frontend

```bash
# Terminal 2
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api/*` → `http://localhost:8000`.

---

## Running Tests

### Backend

```bash
pip install pytest
pytest backend/tests -v
```

### Frontend

```bash
cd frontend
npm test                    # run once
npm run test:watch          # watch mode
npm run test:coverage       # with coverage report
```

---

## Deployment

> Always use `make deploy` — never run `databricks bundle deploy` directly.
> Every bundle deploy resets `user_api_scopes` to empty, which breaks SQL token
> passthrough. The Makefile re-applies the scope automatically via `scripts/post-deploy.sh`.

### Prerequisites

- [Databricks CLI](https://docs.databricks.com/dev-tools/cli/index.html) installed
- Profile configured: `databricks configure --profile uat`

### Deploy

```bash
make deploy                 # builds frontend + deploys to UAT
make deploy PROFILE=prod    # deploy to a different target profile
make deploy PROFILE=dev APP_NAME=spc-dev TRACE_CATALOG=connected_plant_dev
```

The Makefile:
1. Verifies Databricks CLI authentication
2. Builds the frontend (`npm run build` → `frontend/dist/`)
3. Renders `app.yaml` from `app.template.yaml` using the active warehouse/catalog/schema values
4. Runs `databricks bundle deploy` (uploads all files)
5. Runs `scripts/post-deploy.sh` (triggers snapshot, re-applies `user_api_scopes: ["sql"]`)
6. Applies the idempotent locked-limits migration (`scripts/migrations/000_setup_locked_limits.sql`)
7. Applies the exclusions audit migration (`scripts/migrations/001_create_spc_exclusions.sql`)
8. Applies the query-audit migration (`scripts/migrations/002_create_query_audit.sql`)

### CI

GitHub Actions runs `lint-and-test` on every push to `main`:
- Frontend: `npm test` (Vitest)
- Backend: `pytest backend/tests`

When Databricks credentials are configured in GitHub Actions secrets, CI also
applies the locked-limits, exclusions, and query-audit migrations to keep
app-managed tables in sync with the deployed backend expectations.

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABRICKS_HOST` | Yes | Workspace URL (auto-injected by Databricks Apps in production) |
| `DATABRICKS_WAREHOUSE_HTTP_PATH` | Yes | HTTP path of the SQL Warehouse (`/sql/1.0/warehouses/...`) |
| `TRACE_CATALOG` | Yes | Unity Catalog name (default: `connected_plant_uat`) |
| `TRACE_SCHEMA` | Yes | Schema name (default: `gold`) |
| `MAX_TRACE_LEVELS` | No | Maximum depth for batch traceability CTE (default: `10`) |

---

## API Reference

### SPC Endpoints (`/api/spc/`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/spc/materials` | All materials with quantitative quality results |
| `POST` | `/api/spc/validate-material` | Check a material ID exists with quality data |
| `GET` | `/api/spc/plants?material_id=...` | Producing plants for a material |
| `POST` | `/api/spc/characteristics` | MIC list with statistical metadata (mean, stddev, chart type) |
| `POST` | `/api/spc/attribute-characteristics` | Attribute (pass/fail) MIC list with p-bar |
| `POST` | `/api/spc/chart-data` | Time-ordered measurement points for a material + MIC |
| `POST` | `/api/spc/export` | Export scorecard, chart data, or signals as Excel / CSV |
| `POST` | `/api/spc/p-chart-data` | Per-batch proportion nonconforming for a P-chart |
| `POST` | `/api/spc/process-flow` | Material DAG (4 levels upstream, 3 downstream) with SPC health |
| `POST` | `/api/spc/scorecard` | Pp/Ppk per MIC for a material, sorted by Ppk ascending |

All SPC endpoints accept `plant_id`, `date_from`, and `date_to` filters where relevant.

### Traceability Endpoints

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/trace` | Recursive batch trace — returns a tree of child batches |
| `POST` | `/api/batch-details` | CoA + mass balance + customers + cross-batch exposure |
| `POST` | `/api/summary` | KPIs for a single batch |
| `POST` | `/api/impact` | Customers affected + cross-batch exposure |

### Utility Endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| `GET` | `/api/health` | None | Liveness probe (`{"status":"ok"}`) |
| `GET` | `/api/health/debug` | Required | Config details (host, warehouse, catalog) |
| `GET` | `/api/test-query` | Required | Runs `SELECT 1` to verify SQL connectivity |
| `GET` | `/api/docs` | None | OpenAPI / Swagger UI |

Full interactive documentation: **`/api/docs`**

---

## Unity Catalog Requirements

All queries run in `<TRACE_CATALOG>.<TRACE_SCHEMA>` (default `connected_plant_uat.gold`).

### SPC Module

| View / Table | Purpose |
|---|---|
| `gold_batch_quality_result_v` | Inspection results — one row per MIC result per batch |
| `gold_material` | Material descriptions (join on `LANGUAGE_ID = 'E'`) |
| `gold_batch_mass_balance_v` | Goods movements — used for `POSTING_DATE` and `PLANT_ID` |
| `gold_batch_lineage` | Parent → child batch relationships for the process flow DAG |
| `gold_plant` | Plant name lookup |

Key columns expected in `gold_batch_quality_result_v`:

| Column | Type | Notes |
|---|---|---|
| `MATERIAL_ID` | STRING | SAP material number |
| `BATCH_ID` | STRING | SAP batch number |
| `MIC_ID` | STRING | Inspection characteristic code |
| `MIC_NAME` | STRING | Characteristic description |
| `QUANTITATIVE_RESULT` | STRING | Numeric result (cast to DOUBLE in queries) |
| `TARGET_VALUE` | STRING | Specification nominal |
| `TOLERANCE` | STRING | Half-tolerance (USL = target + tolerance) |
| `INSPECTION_RESULT_VALUATION` | STRING | `A` = Accepted, `R` = Rejected |
| `attribute` | STRING | `*` = Kerry QM outlier flag (from `QAMR.ATTRIBUT`) |

### Traceability Module

| View / Table | Purpose |
|---|---|
| `gold_batch_lineage` | Parent → child batch links with `LINK_TYPE = 'PRODUCTION'` |
| `gold_batch_mass_balance_v` | Volume KPIs (produced, shipped, stock) |
| `gold_batch_quality_summary_v` | CoA results per batch |
| `impact_analysis_v` | Customer + country exposure per batch |
| `cross_batch_exposure_v` | Other batches that shared raw materials |

See [`docs/DATA_LINEAGE.md`](docs/DATA_LINEAGE.md) for the full SAP table lineage
tracing every gold view back to its source tables (QALS, QASE, QASPR, MSEG, AUFM, etc.).

---

## Security Model

All API endpoints (except `/api/health`) require an access token:

1. **In production** — The Databricks Apps proxy sets `x-forwarded-access-token` on every request
2. **In local development** — Pass `Authorization: Bearer <PAT>` header

The token is passed directly to the SQL Warehouse. Unity Catalog row and column-level
security policies apply automatically to every query. The app performs no
credential storage and no app-level data filtering.

| HTTP Status | Meaning |
|---|---|
| `401 Unauthorized` | Token missing or not accepted by header parsing |
| `403 Forbidden` | Token valid but user lacks UC permission on the queried view |
| `404 Not Found` | Record not found (user may lack access) |
| `500 Internal Server Error` | SQL error, warehouse unreachable, or misconfigured env var |

---

## Project Structure

```
spc/
├── app.yaml                    Rendered Databricks Apps runtime config
├── app.template.yaml           Template used by `make deploy` to render app.yaml
├── databricks.yml              Databricks Asset Bundle (DAB) config
├── Makefile                    Build and deploy automation
├── start.sh                    Alt startup script
├── .env.example                Local dev environment template
├── requirements.txt            Root Python dependencies (mirrors backend/)
│
├── backend/
│   ├── main.py                 FastAPI app — traceability endpoints + SPA serving
│   ├── requirements.txt        Python dependencies
│   ├── routers/
│   │   └── spc.py              SPC endpoints (9 routes)
│   ├── utils/
│   │   ├── db.py               SQL execution, token resolution, parameterization
│   │   ├── spc_thresholds.py   CPK/rejection rate threshold constants
│   │   └── rate_limit.py       In-process rate limiter; identifies clients via JWT sub, x-forwarded-for, or IP
│   └── tests/
│       ├── __init__.py
│       └── test_db.py          Unit tests for db.py utilities
│
├── frontend/
│   ├── package.json
│   ├── vite.config.js          Vite build + Vitest test config
│   ├── index.html
│   └── src/
│       ├── main.jsx
│       ├── App.jsx
│       ├── AppShell.jsx
│       ├── App.css
│       ├── spc.css             SPC module styles
│       └── spc/
│           ├── SPCPage.jsx         Tab shell (Flow / Charts / Scorecard)
│           ├── SPCContext.jsx      Global state (useReducer)
│           ├── SPCFilterBar.jsx    Material → Plant → MIC → Date range
│           ├── calculations.js     Pure SPC statistics (IMR, Xbar/R, P-chart, WECO, Nelson)
│           ├── spcConstants.js     AIAG SPC constants (d2, A2, D3, D4) + CPK thresholds
│           ├── charts/
│           │   ├── ControlChartsView.jsx   Chart tab shell
│           │   ├── IMRChart.jsx            I-MR chart container
│           │   ├── IndividualsChart.jsx    X (individuals) chart — ECharts
│           │   ├── MovingRangeChart.jsx    MR chart — ECharts
│           │   ├── XbarRChart.jsx          X̄-R chart container
│           │   ├── XbarChart.jsx           X̄ chart — ECharts
│           │   ├── RangeChart.jsx          R chart — ECharts
│           │   ├── PChart.jsx              P-chart (attribute data) — ECharts
│           │   ├── CapabilityPanel.jsx     Cp/Cpk/Pp/Ppk gauges + histogram + stability warning
│           │   ├── CapabilityGauge.jsx     SVG arc gauge
│           │   ├── CapabilityHistogram.jsx Histogram with normal curve overlay
│           │   ├── SignalsPanel.jsx        Rule violation list
│           │   └── CustomDot.jsx          Custom marker for out-of-control points
│           ├── flow/
│           │   ├── ProcessFlowView.jsx     ReactFlow DAG with health status
│           │   ├── ProcessNode.jsx         Individual node (colour-coded by CPK)
│           │   ├── SparklineMini.jsx       Tiny SVG sparkline per node
│           │   └── layoutFlowGraph.js      Sugiyama-style layered layout
│           ├── scorecard/
│           │   ├── ScorecardView.jsx       Summary KPIs + ag-Grid table
│           │   └── ScorecardTable.jsx      ag-Grid capability scorecard
│           └── hooks/
│               ├── useMaterials.js              Validate material ID
│               ├── usePlants.js                 Fetch plants for a material
│               ├── useCharacteristics.js        Fetch quantitative MIC list
│               ├── useAttributeCharacteristics.js Fetch attribute MIC list
│               ├── useSPCChartData.js           Fetch measurement points
│               ├── usePChartData.js             Fetch attribute chart points
│               ├── useSPCCalculations.js        Memoized SPC calculations
│               ├── useSPCFlow.js                Fetch process flow graph
│               └── useSPCScorecard.js           Fetch capability scorecard
│
├── docs/
│   ├── ARCHITECTURE.md         Technical architecture and design decisions
│   ├── DATA_LINEAGE.md         SAP table lineage for every gold view
│   └── STRATIFICATION_PLAN.md  Roadmap for work centre, vendor, operator stratification
│
├── scripts/
│   └── post-deploy.sh          Re-applies user_api_scopes after bundle deploy
│
└── .github/
    └── workflows/
        └── deploy.yml          CI: lint + test on push to main
```

---

## Key Design Decisions

**Why REST API instead of `databricks-sql-connector`?**
The Python connector has a known bug with `WITH RECURSIVE` CTEs when used inside
an async Python process. All SQL executes via `POST /api/2.0/sql/statements` with
a polling loop instead.

**Why token passthrough instead of a service account?**
Every query runs as the signed-in user so Unity Catalog row and column-level
security policies apply without any app-level filtering code. The query audit trail
shows real user emails, not a service account.

**Why `useReducer` instead of Redux/Zustand?**
The state graph is small and well-defined. `useReducer` + cascading resets (clearing
downstream selections when an upstream selection changes) gives predictable behaviour
without additional dependencies.

**Ppk colour thresholds (AIAG SPC Reference Manual 4th Edition, Table III-4):**

Scorecard and capability panel status is based on **Ppk** (overall capability using sample standard deviation, STDDEV_SAMP / N-1). Cp and Cpk are not reported — within-subgroup sigma cannot be derived from a single SQL GROUP BY aggregate.

| Ppk | Status |
|---|---|
| ≥ 1.67 | Excellent / Highly Capable |
| ≥ 1.33 | Capable (green) |
| ≥ 1.00 | Marginal (amber) |
| < 1.00 | Not Capable (red) |

**Process flow health colouring** is based on batch rejection rate (`INSPECTION_RESULT_VALUATION = 'R'`), not Cpk. Thresholds: < 2% rejection → green, < 10% → amber, ≥ 10% → red.
