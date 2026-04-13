# Architecture

Technical reference for the SPC App backend and frontend.

Related references:

- [Statistical Methods Reference](./STATISTICAL_METHODS.md)
- [SPC Tab & Visual Calculations Reference](./SPC_TAB_VISUAL_CALCULATIONS.md)

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
            (Statement REST API or official SQL connector)
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
    ├── db.py           SQL statement execution adapter, caching, and token resolution
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

Named `:name` placeholders remain the only DAL contract. The default REST executor passes them straight through to the Statement Execution API, while the optional connector executor normalizes them to positional parameters before dispatch. No user input is ever string-interpolated into the SQL text.

### SQL Execution Adapter

`backend/utils/db.py` now exposes a small executor boundary under the existing `run_sql()` / `run_sql_async()` wrappers.

*   **Default**: `SPC_SQL_EXECUTOR=rest` uses the Databricks Statement Execution REST API for behavioral parity with the existing app.
*   **Optional**: `SPC_SQL_EXECUTOR=connector` enables the official `databricks-sql-connector` path using the same DAL call sites.
*   **Parity strategy**: the adapter boundary lets the app compare executors against the same DAL tests and live validation harness before removing the REST fallback.

---

## Frontend

### TypeScript Foundation

The frontend is fully migrated to **TypeScript** to ensure mathematical correctness in the SPC engine.

*   **`calculations.runtime.ts`**: Pure TS implementation of AIAG/Six Sigma math.
*   **`types.ts`**: Centralized interfaces for Chart Data, Capability results, and signals.
*   **`uiClasses.ts`**: Manages Tailwind utility composites to ensure consistent aesthetics across the SPC module.

### State Management (`SPCContext.tsx`)

All SPC local UI state still originates from a strictly typed reducer, but consumers now subscribe through selector-based accessors built on `useSyncExternalStore` rather than receiving the full mutable state object.

This keeps domain integrity rules in one place while avoiding app-wide rerenders for unrelated state changes such as tab switches, loading flags, or exclusion updates.

### Server State (`TanStack Query`)

The frontend now treats API-backed state separately from local workbench state.

*   **TanStack Query** owns cacheable server state for:
    * plants
    * characteristics
    * attribute characteristics
    * scorecards
    * compare scorecards
    * process-flow summaries
    * correlation runs
    * correlation scatter detail
    * multivariate runs
    * locked limits
*   **SPCContext** remains responsible for:
    * selected material / plant / MIC
    * chart posture and exclusion UI
    * multivariate variable picks
    * process-flow lineage depth
    * active tab / saved views

This split reduces custom fetch logic and lets the app use stable query keys for cache reuse, background refresh, and future optimistic invalidation without replacing the existing reducer-based domain state.

### Frontend Performance Boundaries

The SPC frontend now treats expensive capabilities as explicit runtime boundaries instead of letting them accumulate in the main page shell.

*   **Thin SPC Shell**: `SPCPage.tsx` only owns the primary navigation and the default analysis tabs. Advanced tools (`Compare`, `MSA`, `Correlation`, `Genie`) are loaded through a second lazy boundary in `AdvancedTabView.tsx`.
*   **Native Genie Panel**: `GenieView.tsx` is now a lightweight native SPC chat surface that talks directly to the backend Genie endpoint instead of loading the Carbon AI Chat runtime. This preserves the governed conversational workflow while removing a large web-component and editor stack from the shipped frontend.
*   **Worker-based Analytics with Fallbacks**: Heavy chart analytics run in `spcCompute.worker.ts` via `useSPCComputedAnalytics`, which keeps large quantitative recalculations off the main thread. The hook now also traps worker startup, messaging, and execution failures so the chart surface exits loading cleanly and can fall back to in-process computation when needed.
*   **Progressive Chart Hydration**: `useSPCChartData` publishes the first page of quantitative history immediately, then continues hydrating later pages in the background up to the configured cap. This improves time-to-first-chart for high-volume materials without sacrificing full-history analysis.
*   **TanStack Query for SPC Reads and Analytical Runs**: Plants, characteristics, attribute characteristics, scorecards, compare scorecards, process-flow summaries, correlations, multivariate runs, and locked-limit reads now use TanStack Query instead of bespoke hook-local caching. This gives those paths stable query keys, background refetch behavior, and centralized retry/error policy while keeping the reducer for local workbench state.
*   **Request Reuse and Cancellation**: Progressive chart-data hydration, attribute chart data, export flows, and exclusion persistence still use direct hook or mutation paths, but active fetches pass `AbortSignal` through to the underlying request so superseded work stops consuming backend resources.
*   **Explicit Runtime Families**: `vite.config.js` now assigns Carbon table, layout, date-picker, icon families, and a reduced Carbon app residual runtime to explicit chunk families instead of relying on a broad catch-all. This keeps large transitive packages out of app-facing entry chunks and makes bundle growth easier to reason about.
*   **Bundle Budget Guardrails**: `frontend/scripts/check-bundle-budgets.mjs` validates the key shell, chart, Carbon, Genie, and CSS assets after build so regressions are caught as part of routine verification instead of being discovered only during manual bundle inspection.
*   **Governed Performance Switching**: The quantitative metric-view source preserves sample-grain values plus subgroup rollups so the semantic layer can expose both Gaussian and non-parametric long-term performance and switch between them conservatively for Genie-facing queries.
*   **Configurable Lineage Horizon**: Process flow no longer depends on a hidden hardcoded recursion limit; analysts can now tune upstream/downstream lineage depth from the filter bar, and the selection persists in saved views and shareable URLs.

### Chart Rendering

| Library | Used for |
|---|---|
| **ECharts** | Control charts (I-MR, X̄-R, P) and Histograms |
| **Carbon DataTable** | Sortable capability scorecards and scorecard drill-in |
| **ReactFlow** | Interactive Process Flow DAGs |

The Carbon-based shell remains the design system baseline, but the stylesheet is now curated instead of importing the entire framework wholesale. This cut the main CSS payload materially and removed the IBM Plex runtime font-resolution warnings during production builds. Further Carbon pruning is still possible, but the frontend no longer pays the full-framework default tax.

### Metric-View Safety Notes

Release 1 quantitative metric views now separate:

*   **Gaussian performance** (`pp_gaussian`, `ppk_gaussian`)
*   **Non-parametric performance** (`pp_non_parametric`, `ppk_non_parametric`)
*   **Governed performance** (`pp`, `ppk`)

The governed measures switch using source-level normality metadata and return `NULL` when the normality classification is mixed or unavailable. This is deliberate: Genie and dashboards should not infer a Gaussian performance answer when the application itself would treat the distribution as unsafe or unclassified.

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
- `databricks.yml` declares `user_api_scopes: ["sql"]` directly on the app resource.
- `make deploy` remains the supported path because it builds the frontend, renders app config, deploys the bundle, and applies SPC support migrations in order.
- deployment is fully declarative; there is no post-deploy scope patching step in the supported path.

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
| Databricks connector | Optional via `SPC_SQL_EXECUTOR=connector`; parity with the REST baseline still needs live workspace validation before it should become the default |
| In-process SQL cache | `TTLCache` is per app instance; multi-instance deployments do not share cache state |
| Frontend data layer | TanStack Query now covers metadata, scorecard/process-flow summaries, compare, correlation, multivariate, and locked-limit reads; progressive chart-data hydration and exclusion/export mutations still use dedicated hook logic |
| Plant filter in chart-data | Uses INNER JOIN on batch_dates — batches with no mass balance record are excluded |
| Histogram bins | Binning follows Freedman-Diaconis and may still need UX tuning for very small samples |
| Scorecard stability | Cpk shown without per-MIC stability check (requires full chart-data fetch per MIC) |
| UoM consistency | No unit-of-measure conversion; cross-plant SPC is only valid if UoM is consistent in the gold view |
