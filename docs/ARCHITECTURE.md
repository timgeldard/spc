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
├── main.py             App entry point, SPA serving, and trace logic
├── routers/            HTTP Controllers (Rate limiting, auth, validation)
│   ├── spc_charts.py   Chart-data & pagination logic
│   ├── spc_metadata.py MIC & Material master data
│   ├── spc_analysis.py Scorecard & Process flow
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

All SPC state lives in a strictly-typed `useReducer` context. Cascading resets ensure data integrity—e.g., changing the selected Material automatically clears MIC selections and calculated indices.

### Chart Rendering

| Library | Used for |
|---|---|
| **ECharts** | Control charts (I-MR, X̄-R, P) and Histograms |
| **ag-Grid** | Performance-optimized Capability Scorecards |
| **ReactFlow** | Interactive Process Flow DAGs |

---

## Security

### Authentication Flow

Databricks Apps injects the user's OIDC token into the header. The backend extracts this via `resolve_token()` and passes it as a Bearer token to the SQL Warehouse. This ensures:
1.  **Auditor Visibility**: Every query in the SQL Warehouse logs shows the actual user's email.
2.  **Native UC Security**: Row and column-level policies are enforced by Spark, not the application logic.

---

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
| Rate limiting | `rate_limit.py` is wired but no endpoint decorators applied (slowapi not in Databricks Apps venv) |
| Plant filter in chart-data | Uses INNER JOIN on batch_dates — batches with no mass balance record are excluded |
| Histogram bins | Sturges' formula underestimates bin count for non-normal distributions |
| Scorecard stability | Cpk shown without per-MIC stability check (requires full chart-data fetch per MIC) |
| UoM consistency | No unit-of-measure conversion; cross-plant SPC is only valid if UoM is consistent in the gold view |
