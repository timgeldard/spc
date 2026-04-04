# SAP QM / PP-PI Repository Quality Review

**Repository:** `spc`
**Review date:** 2026-04-02  
**Reviewer perspective:** SAP QM + PP-PI product quality, genealogy, and SPC analytics

---

## 1) Executive summary

This repository has a solid architecture baseline for SAP quality analytics: token-passthrough security, centralized SQL execution helper, explicit data lineage documentation, and a statistically meaningful SPC feature set (I-MR, X̄-R, P-chart, WECO/Nelson rules, capability metrics).

The highest-value improvements are not in core chart formulas but in **production hardening** and **SAP semantic rigor**:

1. Remove or environment-gate debug endpoints that expose connectivity internals.
2. Add runtime rate limiting and query guardrails to protect Databricks warehouse cost/performance.
3. Expand test coverage from utility/unit level into router contract tests and SAP data-shape edge cases.
4. Improve QM semantic handling for specs and units (e.g., mixed units/spec revisions across time windows).

---

## 2) What is working well

### A. Security model aligns with enterprise SAP data governance
- API routes consistently resolve user tokens from Databricks proxy headers or Bearer fallback and rely on Unity Catalog enforcement at query time.
- SQL is centralized via `run_sql()` with named parameters, reducing injection risk and improving auditability through statement hashing + timing logs.

### B. SPC implementation maturity is above typical MVP level
- Control chart support covers both individual and subgroup contexts.
- Capability metrics include both within-subgroup and overall spread (`Cp/Cpk` + `Pp/Ppk`).
- Rule engines include WECO and Nelson signals, making the app useful for quality engineers rather than only reporting teams.

### C. Data lineage and SAP mapping are unusually clear
- The repository documents lineage from gold views back to SAP QM and MM source tables (QALS/QASE/QASPR/QPMK/QAME, MSEG/MKPF, etc.).
- This is a major strength for audit/compliance and onboarding.

---

## 3) Findings and recommendations (prioritized)

## High priority

### H1. Debug endpoints are exposed in application routes
**Observation**  
`/api/health/debug` and `/api/test-query` are present and return operational details/connectivity behavior.

**Why this matters (SAP enterprise context)**  
Even without direct secrets, operational disclosures can aid reconnaissance. In regulated manufacturing environments, production APIs should minimize observable internals.

**Recommendation**
- Restrict these endpoints to non-production environments via config flag.
- Or remove entirely and replace with internal-only diagnostics.
- If retained, require explicit role check and redact environment/connection details.

---

### H2. Rate-limiting utility exists but is not wired into app/router
**Observation**  
`backend/utils/rate_limit.py` defines limiter primitives, but no middleware/handler/route decorators are applied in `main.py` or routers.

**Why this matters**  
Traceability recursion and scorecard queries can become expensive on large genealogy scopes. Without request controls, accidental or malicious high-frequency calls may impact warehouse spend and API latency.

**Recommendation**
- Enable SlowAPI middleware and exception handler in app startup.
- Apply route-specific limits (e.g., stricter on `/api/trace`, `/api/spc/process-flow`, `/api/spc/scorecard`).
- Pair with request-level safeguards (max date window, max rows, timeout and response truncation strategy).

---

### H3. Test strategy lacks API contract and integration coverage
**Observation**  
Backend tests currently focus on helper functions; frontend tests focus calculation utilities. There is no evidence of endpoint-level contract tests with mocked Databricks responses.

**Why this matters**  
Most risk in this application is at boundary layers: SQL shape changes, null handling, type conversion, and API schema stability.

**Recommendation**
- Add FastAPI TestClient suite for each endpoint family with representative success/failure payloads.
- Mock `run_sql()` to simulate SAP/QM edge cases: null tolerances, missing specs, mixed batch populations, non-numeric cast failures.
- Add snapshot/contract checks for JSON response schema used by frontend components.

---

## Medium priority

### M1. Potential SAP QM semantic drift for tolerance/spec over time windows
**Observation**  
Several queries derive nominal/tolerance via `MAX(TRY_CAST(...))` aggregations per MIC/material slice.

**Why this matters**  
In SAP QM, specifications can evolve by recipe/version/date/plant/inspection setup. Using max aggregation across a broad range can produce a mathematically valid but semantically incorrect spec baseline for capability judgments.

**Recommendation**
- Resolve spec per result row (effective dating / lot-level specification), then compute metrics using consistent spec cohorts.
- At minimum, detect mixed spec values and emit an “inconsistent specification” warning in API payload.

---

### M2. Duplicate context implementation file in frontend (`SPCContext.js` and `SPCContext.jsx`)
**Observation**  
Both files exist with overlapping but different state models (e.g., plant/outlier handling only in `.jsx`).

**Why this matters**  
Dual definitions increase maintenance risk and onboarding confusion, and can lead to accidental import drift in future refactors.

**Recommendation**
- Remove or archive unused variant; keep a single canonical context module.
- Add lint rule/convention to enforce extension/import consistency.

---

### M3. Global exception handler returns traceback content to clients
**Observation**  
Unhandled exceptions are returned with truncated traceback in JSON response.

**Why this matters**  
Useful during development, but inappropriate for production security posture and user-facing API stability.

**Recommendation**
- In production, return a stable error code/correlation ID only.
- Log full traceback server-side with structured logging.

---

## Lower priority / enhancement backlog

### L1. Add domain-level data quality checks for SAP QM/PP-PI use
Suggested checks:
- Unit-of-measure consistency per MIC (reject/normalize mixed units before SPC).
- Detection of reused batch IDs across plants/company codes if applicable.
- Explicit handling for inspection lot reversals/cancellations.
- Data freshness indicators per source view and per endpoint response.

### L2. Add non-functional quality gates
- Frontend lint/type checks in CI (if not already external).
- Performance tests for process-flow recursion and large scorecards.
- SLO-oriented observability: p95 latency, SQL failure classes, cache effectiveness.

---

## 4) Suggested 30/60/90-day quality plan

### First 30 days
- Gate/remove debug endpoints.
- Wire rate limiter + set conservative defaults.
- Add backend endpoint contract tests for top 5 routes.

### 60 days
- Implement spec-consistency detection for capability calculations.
- Add mixed-unit detection and API warnings.
- Remove duplicate SPC context module.

### 90 days
- Introduce observability dashboard (latency/error/cost).
- Add integration tests against a representative QA dataset snapshot.
- Formalize SAP QM/PP-PI semantic acceptance criteria for releases.

---

## 5) Overall quality score (current)

- **Architecture & Security pattern:** 8/10  
- **SPC/statistical capability:** 8/10  
- **SAP QM/PP-PI semantic robustness:** 6.5/10  
- **Testing depth:** 5.5/10  
- **Operational hardening:** 6/10

**Overall:** **6.8/10** (strong foundation, needs production hardening + semantic safeguards for enterprise scale).
