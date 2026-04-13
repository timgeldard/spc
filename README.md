# SPC App — Statistical Process Control on Databricks

A **Databricks App** that delivers real-time Statistical Process Control (SPC)
charting and batch traceability for manufacturing quality teams, backed by a
Databricks SQL Warehouse and Unity Catalog.

---

## Features

### SPC Module
- **Control Charts** — I-MR, X̄-R, X̄-S, EWMA, CUSUM, and attribute charts (`P`, `nP`, `C`, `U`)
- **Advanced Capability** — **Cp, Cpk** (short-term) and **Pp, Ppk** (long-term) calculation scores with 95% confidence intervals
- **Non-Parametric Analysis** — Automatic fallback to percentile-based capability ($P_{0.135}$, $P_{99.865}$) for non-normal datasets
- **Rule Detection** — WECO (4 rules) and Nelson (8 rules) out-of-control signals
- **P-Chart / nP-Chart** — Proportion nonconforming charts for attribute data
- **Dynamic Stratification** — Slice charts and scorecards by **Plant, Lot, or Operation**
- **Process Flow** — DAG showing upstream/downstream material lineage with health colouring and configurable lineage depth
- **Multivariate SPC** — Hotelling's T² control chart for coordinated drift across multiple characteristics
- **Root-Cause Suggestions** — Contributor ranking for multivariate anomalies using covariance-weighted decomposition
- **Correlation Explorer** — Interactive heatmap showing pairwise coupling across the same shared-batch population
- **Manual Point Exclusion** — Click any point to exclude it from limit recalculation with audit justification
- **Cursor-based Pagination** — High-performance data fetching for massive batch histories
- **Exports** — Excel and CSV export for scorecards, chart data, and signals

### Traceability Module
- **Recursive Batch Trace** — Top-down/Bottom-up trace up to 10 levels deep with cycle detection
- **Recall Readiness** — Immediate identification of affected customers and cross-batch exposure
- **Batch Intelligence** — Integrated CoA results and mass balance KPIs

### Platform
- **Token Passthrough Security** — User's OIDC token passed directly to SQL; Unity Catalog policies enforced natively
- **Zero-Trust Architecture** — No credential storage; every query auditable to the signed-in user
- **Layered Backend** — Clean Separation of Concerns via Routers, DAL, and Schemas

---

## Architecture

```
Databricks Apps Runtime
    │
    └── uvicorn → FastAPI (Python)
          ├── /api/spc/*           SPC Routers (backend/routers/)
          ├── /api/trace           Batch traceability (backend/routers/trace.py)
          ├── /api/health          Liveness probe
          ├── /api/ready           SQL-backed readiness probe
          └── /assets + /*         Serves React SPA (frontend/dist/)

React SPA (Vite + TypeScript)
    ├── SPCPage              Tab shell: Overview | Flow | Charts | Scorecard | Advanced analysis
    ├── SPCFilterBar         Material → Dynamic Stratification → Date range
    ├── SPCContext           Reducer-backed local UI/workbench state
    ├── TanStack Query       Server-state caching for metadata, summary, and analytical reads
    ├── spc/dal/             Data Access Layer (PyPika SQL Builders)
    ├── spc/charts/          IMR, XbarR/S, EWMA, CUSUM, P, Capability, T² & Signals Panels
    └── spc/scorecard/       ScorecardView (Carbon DataTable with sorting)
```

The FastAPI backend is built with a layered architecture:
*   **Routers** handle HTTP logic, validation, and rate limiting.
*   **Schemas** define Pydantic models for request/response contracts.
*   **Data Access Layer (DAL)** manages programmatic SQL generation via **PyPika**, ensuring injection safety and deterministic data formatting.

SQL is executed through a swappable adapter in `backend/utils/db.py`. The default path remains the Databricks Statement Execution REST API for parity, and `SPC_SQL_EXECUTOR=connector` enables the official `databricks-sql-connector` path against the same DAL call sites.

---

## Local Development

### Prerequisites

- Python 3.11+
- Node.js 20+
- Databricks workspace with a SQL Warehouse

### 1 — Setup

```bash
git clone https://github.com/timgeldard/spc.git
cd spc
cp .env.example .env
# Configure your workspace host and warehouse ID in .env
```

### 2 — Backend

```bash
pip install -r backend/requirements.txt
uvicorn backend.main:app --reload --port 8000
```

To exercise the readiness probe locally, set a dedicated Databricks token:

```bash
export DATABRICKS_READINESS_TOKEN=...
curl http://localhost:8000/api/ready
```

### 3 — Frontend

```bash
cd frontend
npm install
npm run dev
```

---

## Security Model

Every query runs as the signed-in user. The app performs no app-level filtering; instead, it relies on **Unity Catalog** row and column-level security policies enforced at the storage layer.

| HTTP Status | Meaning |
|---|---|
| `401` | Token missing or expired |
| `403` | User lacks Unity Catalog permission on the requested view |
| `500` | SQL failure or environment misconfiguration |

### Health vs Readiness

| Endpoint | Purpose |
|---|---|
| `/api/health` | Process liveness only — confirms the FastAPI app is running |
| `/api/ready` | SQL warehouse readiness — requires `DATABRICKS_READINESS_TOKEN` to run a real `SELECT 1` probe |

Because the app normally relies on per-user token passthrough, readiness needs its own non-user workspace token to verify warehouse connectivity before traffic is considered safe.

---

## Statistical Methods

Calculations strictly follow the **AIAG SPC Reference Manual (4th Edition)** and **Western Electric SQC Handbook**.

| Metric | Goal |
|---|---|
| **Cpk** | Within-subgroup capability using pooled standard deviation or $\bar{R}/d_2$ |
| **Ppk** | Overall performance using sample standard deviation ($N-1$) |
| **Non-Parametric** | Percentile-based capability for non-gaussian distributions ($p < 0.05$ on Shapiro-Wilk) |
| **Hotelling's T²** | Multivariate anomaly detection across shared-batch characteristic vectors |

See [`docs/STATISTICAL_METHODS.md`](docs/STATISTICAL_METHODS.md) for full mathematical definitions.

**Ppk colour thresholds (AIAG SPC Reference Manual 4th Edition, Table III-4):**


| Ppk | Status |
|---|---|
| ≥ 1.67 | Excellent / Highly Capable |
| ≥ 1.33 | Capable (green) |
| ≥ 1.00 | Marginal (amber) |
| < 1.00 | Not Capable (red) |

**Process flow health colouring** is based on batch rejection rate (`INSPECTION_RESULT_VALUATION = 'R'`), not Cpk. Thresholds: < 2% rejection → green, < 10% → amber, ≥ 10% → red.

## Deployment

Use the bundled make target rather than raw bundle deploys:

```bash
make deploy PROFILE=uat
make deploy PROFILE=prod
```

Important deployment notes:
- `databricks bundle deploy` alone is not sufficient for this app
- `databricks.yml` declares `user_api_scopes: ["sql"]` directly on the app resource
- deployment is fully declarative; no post-deploy scope patching script is required
- `/api/ready` requires `DATABRICKS_READINESS_TOKEN` in the target environment for a real warehouse probe
- the in-process SQL cache is per app instance, so multi-instance deployments should treat it as a latency optimisation rather than a shared consistency layer
- the backend supports `SPC_SQL_EXECUTOR=rest|connector`; keep `rest` as the baseline until connector parity is verified in your workspace

Live Release 1 warehouse validation:

```bash
DATABRICKS_HOST=https://<workspace-host> \
DATABRICKS_TOKEN=<token> \
DATABRICKS_WAREHOUSE_ID=<warehouse-id> \
TRACE_CATALOG=connected_plant_uat \
TRACE_SCHEMA=gold \
python3 scripts/validate_release1_databricks.py
```

That harness smoke-tests the metric-view scorecard path and the multivariate shared-batch path against real Databricks data.
