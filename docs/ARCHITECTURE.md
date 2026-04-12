# Architecture

Technical reference for the SPC App backend and frontend.

---

## Overview

The app is a single Databricks App unit: a FastAPI backend serving both the REST API and the compiled React SPA.

```
┌─────────────────────────────────────────────────────────┐
│ Databricks Apps Runtime                                  │
│                                                          │
│  ┌────────────────────────────────────────────────────┐  │
│  │ uvicorn (port 8000)                                │  │
│  │                                                    │  │
│  │  FastAPI Layered Architecture                      │  │
│  │    Routers → Controllers/Validation                │  │
│  │    Schemas → Pydantic Data Contracts               │  │
│  │    DAL     → Programmatic SQL Execution            │  │
│  │                                                    │  │
│  │    /assets → frontend/dist/assets/                 │  │
│  │    /*      → frontend/dist/index.html (SPA)        │  │
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

### Module Layout

The backend follows a **Layered Architecture** to separate concerns and ensure maintainability.

```
backend/
├── main.py             App entry point, health/readiness, and SPA serving
├── routers/            HTTP Controllers (Rate limiting, auth, validation)
│   ├── spc_charts.py   Chart-data & pagination logic
│   ├── spc_metadata.py MIC & Material master data
│   ├── spc_analysis.py Scorecard & Process flow
│   ├── trace.py        Traceability endpoints
│   └── export.py       Excel/CSV generation
├── dal/                Data Access Layer (SQL isolation)
│   ├── spc_charts_dal.py Pypika-based dynamic queries
│   └── spc_shared.py   Shared SQL fragments and table resolution
├── schemas/            Pydantic Models
│   └── spc_schemas.py  Request/Response type safety
└── utils/
    ├── db.py           SQL statement execution and token resolution
    └── rate_limit.py   API protection
```

### Data Access Layer (DAL) & PyPika

SQL generation is entirely programmatic via **PyPika**. This eliminates brittle string concatenation and ensures injection safety.

*   **Dynamic Filtering**: The `ChartFilterSpec` class encapsulates complex WHERE clauses (material, date range, plant) which are used by the `SqlSelectBuilder`.
*   **Whitelisting**: Stratification columns are strictly whitelisted to prevent unauthorized column access.
*   **CTE Pipeline**: Complex analytical queries for Process Flow and Scorecards are built as a sequence of Common Table Expressions (CTEs) before final selection.

### Cursor-based Pagination

The `/chart-data` endpoint implements an immutable, deterministic pagination strategy to handle large manufacturing datasets.

*   **Cursor Structure**: `batch_date_epoch:batch_id:sample_id:inspection_lot_id:operation_id`
*   **Stability**: Unlike offset-based or rank-based pagination, this composite key remains stable even if historical batches are posted retrospectively between page loads.

### SQL Parameterization

Every user-supplied value flows through named parameters:

```python
query = Query.from_(table).select("*").where(table.ID == Parameter(":id"))
params = [sql_param("id", val)]
rows = await run_sql_async(token, query.get_sql(), params)
```

The REST API substitutes `:name` placeholders server-side. No user input is ever string-interpolated into the SQL text.

---

## Frontend

### TypeScript Foundation

The frontend is fully migrated to **TypeScript** to ensure mathematical correctness in the SPC engine.

*   **`calculations.runtime.ts`**: Pure TS implementation of AIAG/Six Sigma math.
*   **`types.ts`**: Centralized interfaces for Chart Data, Capability results, and signals.
*   **`uiClasses.ts`**: Manages Tailwind utility composites to ensure consistent aesthetics across the SPC module.

### State Management (`SPCContext.tsx`)

All SPC state still originates from a strictly typed reducer, but consumers now subscribe through selector-based accessors built on `useSyncExternalStore` rather than receiving the full mutable state object.

This keeps domain integrity rules in one place while avoiding app-wide rerenders for unrelated state changes such as tab switches, loading flags, or exclusion updates.

### Frontend Performance Boundaries

The SPC frontend now treats expensive capabilities as explicit runtime boundaries instead of letting them accumulate in the main page shell.

*   **Thin SPC Shell**: `SPCPage.tsx` only owns the primary navigation and the default analysis tabs. Advanced tools (`Compare`, `MSA`, `Correlation`, `Genie`) are loaded through a second lazy boundary in `AdvancedTabView.tsx`.
*   **Deferred Genie Runtime**: `GenieView.tsx` loads the Carbon AI Chat runtime only when the Genie tab mounts. This keeps the SPC shell and Genie wrapper tiny while isolating the large chat runtime in its own deferred chunk.
*   **Worker-based Analytics**: Heavy chart analytics run in `spcCompute.worker.ts` via `useSPCComputedAnalytics`, which keeps large quantitative recalculations off the main thread.
*   **Shared Request Reuse**: Overview and detail tabs share hot scorecard and process-flow results through a lightweight request cache instead of immediately re-querying the same backend endpoints.

### Chart Rendering

| Library | Used for |
|---|---|
| **ECharts** | Control charts (I-MR, X̄-R, P) and Histograms |
| **ag-Grid** | Performance-optimized Capability Scorecards |
| **ReactFlow** | Interactive Process Flow DAGs |

The Carbon-based shell remains the design system baseline, but production builds currently still include the full Carbon stylesheet and IBM Plex font references. That path is functional, but further CSS/font slimming remains a follow-on optimisation target.

---

## Security

### Authentication Flow

Databricks Apps injects the user's OIDC token into the header. The backend extracts this via `resolve_token()` and passes it as a Bearer token to the SQL Warehouse. This ensures:
1.  **Auditor Visibility**: Every query in the SQL Warehouse logs shows the actual user's email.
2.  **Native UC Security**: Row and column-level policies are enforced by Spark, not the application logic.

### Health and Readiness

- `/api/health` is a liveness endpoint only.
- `/api/ready` performs a SQL `SELECT 1` probe using `DATABRICKS_READINESS_TOKEN`.
- In a passthrough-auth app, readiness cannot verify warehouse connectivity without a dedicated non-user token.

---

## Rate Limits

The API uses `slowapi` limits to protect the warehouse from accidental UI storms while preserving a responsive analyst workflow.

| Endpoint | Limit | Rationale |
|---|---:|---|
| `/api/trace` | `30/minute` | Recursive lineage queries are warehouse-expensive and typically user-driven, not polled |
| `/api/summary` | `60/minute` | Summary cards are lighter and often refreshed during investigations |
| `/api/batch-details` | `30/minute` | Consolidated CoA and movement lookups fan out across multiple gold views |
| `/api/impact` | `60/minute` | Impact checks are analytical but lighter than full batch details |
| `/api/spc/chart-data` | `60/minute` | Quantitative chart pages paginate and can trigger repeated fetches during navigation |
| `/api/spc/p-chart-data` | `60/minute` | Attribute chart queries are batch-level and moderately sized |
| `/api/spc/count-chart-data` | `60/minute` | Count-chart queries are batch-level and moderately sized |
| `/api/spc/locked-limits` (POST/DELETE) | `30/minute` | Mutating audit-relevant control limits should remain deliberately paced |
| `/api/spc/locked-limits` (GET) | `120/minute` | Read-only lookup used during chart hydration |

---

## Deployment Notes

- `databricks.yml` now defines both `uat` and `prod` targets.
- `make deploy` remains the supported path because bundle deploy resets `user_api_scopes`.
- `scripts/post-deploy.sh` is still required until Databricks bundle schema supports persisted app scopes.

## Implementation Rationale

**Why PyPika?**
Standardizes SQL generated across multiple routers. Ensures complex CTE logic is readable and testable without the overhead of a full ORM like SQLAlchemy.

**Why TypeScript for math?**
In a statistical engine, any "null vs 0" confusion in JavaScript can corrupt a capability score. TypeScript enforces the handling of optionality and type coercion ($d_2, D_4$) at compile time.
test)

No automated deployment — push to UAT is a manual step via `make deploy`.

---

## Known Limitations

| Area | Limitation |
|---|---|
| Databricks connector | Not used — REST API polling adds ~2s latency vs native driver |
| In-process SQL cache | `TTLCache` is per app instance; multi-instance deployments do not share cache state |
| App scopes | `user_api_scopes: ["sql"]` still requires post-deploy re-application via script |
| Plant filter in chart-data | Uses INNER JOIN on batch_dates — batches with no mass balance record are excluded |
| Histogram bins | Binning follows Freedman-Diaconis and may still need UX tuning for very small samples |
| Scorecard stability | Cpk shown without per-MIC stability check (requires full chart-data fetch per MIC) |
| UoM consistency | No unit-of-measure conversion; cross-plant SPC is only valid if UoM is consistent in the gold view |
