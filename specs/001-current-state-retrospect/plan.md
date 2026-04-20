# Architecture & Implementation Plan: SPC Current State

**Status**: Baseline (As of 2026-04-19)

## Summary

The SPC Application is a Databricks App that provides advanced quality analytics and statistical process control for SAP manufacturing data. It features a layered FastAPI backend and a typed React/TypeScript frontend.

## Technical Context

- **Backend**: FastAPI (Python 3.11), PyPika (SQL generation), Databricks Statement REST API / SQL Connector.
- **Frontend**: React (Vite), TypeScript, ECharts (Charting), ReactFlow (Lineage), TanStack Query (Server State).
- **Data Layer**: Unity Catalog (Gold Layer), Delta Tables with CDF, Materialized Views.
- **Security**: OIDC Token Passthrough, SHA-256 Cache Key Scoping.

## Project Structure

```text
backend/
├── dal/                # PyPika SQL builders
├── routers/            # API Endpoints
├── utils/              # Calculation engines (msa, normality, etc.)
└── schemas/            # Pydantic models

frontend/
├── src/spc/            # Core SPC domain logic
│   ├── charts/         # Charting components
│   ├── calculations.runtime.ts # Math engine
│   └── SPCContext.tsx  # Global UI state
└── scripts/            # Build & audit scripts
```

## Governance & Performance

- **Caching**: Local-in-process TTL cache for metadata (15m), scorecards (5m), and charts (3m). Keyed by user hash to prevent cross-user data leakage. All cache tiers are token-hashed and user-scoped, including the chart cache used by process-flow queries (e.g., queries against `spc_process_flow_source_mv`) which uses token-hashed keys via the `_sql_cache_key()` in `backend/utils/db.py`.
- **Progressive Loading**: Charts hydrate the first 100 points immediately, then fetch historical data in background chunks.
- **Statistical Parity**: Parity between backend (PyPika/SQL) and frontend (TypeScript) math is maintained via shared test suites. (Note: Current implementation has known mathematical gaps in Cp/Pp and MSA logic as per `QUALITY_REVIEW_2026-04-03`).
