# Implementation Plan: Statistical Correctness & Security Hardening

**Branch**: `001-stat-correctness-fix` | **Date**: 2026-04-19 | **Spec**: [specs/001-stat-correctness-fix/spec.md](spec.md)
**Input**: Feature specification from `/specs/001-stat-correctness-fix/spec.md`

## Summary

This plan addresses critical statistical calculation errors in MSA and Capability modules, fixes a security vulnerability in the process-flow cache, and improves signal detection logic. The approach involves refactoring calculation formulas to align with AIAG standards, updating SQL aggregations for true within-subgroup sigma, and introducing user-identity hashing into cache keys.

## Technical Context

**Language/Version**: Python 3.11+ (FastAPI), TypeScript (React/TSX)
**Primary Dependencies**: FastAPI, Pydantic, PyPika, databricks-sql-connector (Backend); React, TanStack Query, ECharts, Carbon Design System (Frontend)
**Storage**: Databricks SQL Warehouse (Unity Catalog), Delta Tables (`spc_locked_limits`, `spc_exclusions`)
**Testing**: pytest (Backend), Vitest & Playwright (Frontend)
**Target Platform**: Databricks Apps
**Project Type**: Web service + SPA
**Performance Goals**: <200ms API response time for cached flows; accurate statistical results even for small datasets.
**Constraints**: Must maintain OIDC token passthrough for Unity Catalog row/column level security.
**Scale/Scope**: Manufacturing quality datasets with millions of records.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

1. **Layered Architecture**: Changes MUST respect the Routers -> Schemas -> DAL separation.
2. **Programmatic SQL**: SQL changes MUST use PyPika and parameterization; no string interpolation.
3. **Statistical Ground Truth**: Calculations MUST be verified against AIAG MSA 4th Edition and SPC 4th Edition reference data.
4. **User-Scoped Security**: Any caching layer MUST explicitly include user identity in the cache key.
5. **Test-First Reliability**: New tests MUST cover the specific mathematical failures identified (e.g., K-constant inversion, population vs sample stddev).

## Project Structure

### Documentation (this feature)

```text
specs/001-stat-correctness-fix/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
└── tasks.md             # Phase 2 output
```

### Source Code (repository root)

```text
backend/
├── dal/                # SQL Logic (PyPika builders)
├── routers/            # API Endpoints (Cache logic, schema mapping)
├── utils/              # Calculation helpers (msa.py)
└── tests/              # Pytest suites

frontend/
├── src/
│   ├── spc/
│   │   ├── calculations.js     # Shared SPC math (to be updated)
│   │   ├── msa/
│   │   │   └── msaCalculations.js  # MSA math (to be updated)
│   └── components/charts/
└── e2e/                # Playwright tests
```

**Structure Decision**: Web application (Frontend + Backend) as defined in the project root.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| [e.g., 4th project] | [current need] | [why 3 projects insufficient] |
| [e.g., Repository pattern] | [specific problem] | [why direct DB access insufficient] |
