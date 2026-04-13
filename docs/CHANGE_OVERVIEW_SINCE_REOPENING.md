# SPC App Change Overview Since Reopening

## Purpose

This document summarises the major changes delivered since the SPC app was
reopened for active development. It is intended to give both business and
technical stakeholders a concise view of what has changed, why it matters, and
what benefit each change delivers.

The app has moved from a promising prototype into a production-grade
Databricks-native quality application with stronger statistical rigor, better
user experience, improved operational resilience, and a cleaner long-term
architecture.

---

## Executive Summary

Since reopening, the SPC app has been substantially upgraded across six major
dimensions:

1. **Statistical capability** was expanded from basic long-term capability to a
   more complete AIAG-aligned engine including short-term capability,
   non-normal handling, and improved rule detection.
2. **QMS compliance and auditability** were strengthened through persistent
   exclusions, justification capture, immutable audit snapshots, and improved
   deployment-time schema handling.
3. **Frontend usability** was modernised with a stronger application shell,
   typed React state, more intentional loading and exclusion flows, and a much
   cleaner component architecture.
4. **Backend architecture** was refactored from a monolithic router into a
   layered design with routers, schemas, and DAL modules, making the service
   easier to maintain and safer to extend.
5. **Performance and resilience** improved through pagination, request
   cancellation, shared result caching, worker-based analytics, tighter bundle
   splitting, stricter data validation, and safer runtime dependency handling.
6. **Deployment and operational readiness** improved through repeatable
   migrations, documented runtime requirements, and a more robust Databricks
   deployment flow.

---

## 1. Frontend Modernisation and Usability Improvements

### What changed

- Rebuilt the SPC UI around a stronger typed React architecture.
- Migrated the SPC frontend from mixed JavaScript/JSX to native
  TypeScript/TSX.
- Burned down legacy `spc.css` usage in favour of utility-based styling.
- Added a more modern shell with better navigation, cleaner panels, and a more
  structured layout for charts, scorecards, and process flow.
- Added recent-material handling, improved interaction flows, and cleaner
  loading behaviour.
- Added code splitting and vendor chunk optimisation for large frontend
  dependencies such as ECharts and Carbon table/layout runtimes.
- Split advanced SPC modules behind a second lazy boundary so the base SPC
  shell no longer carries the full tab loader map.
- Replaced the Carbon AI Chat runtime with a native Genie panel so the
  governed conversational workflow remains available without shipping the
  large Carbon AI Chat dependency stack.
- Added selector-based SPC state subscriptions and removed broad app-wide
  rerenders caused by publishing the full mutable state object to every SPC
  consumer.
- Moved heavy client-side control-chart analytics off the main thread into a
  web worker.
- Added worker failure handling and fallback computation so chart analytics no
  longer strand the UI in a permanent loading state when worker execution
  fails.
- Changed quantitative chart loading to progressive hydration so the first page
  of history renders immediately while deeper history continues loading in the
  background.
- Added shared request caching for overview-to-detail SPC flows so repeated tab
  transitions reuse hot scorecard and process-flow results.
- Introduced TanStack Query across the main cacheable SPC read layer:
  plants, characteristics, attribute characteristics, scorecard, compare,
  process flow, correlation, correlation scatter, multivariate, and locked
  limits. Those paths now use stable query keys and centralized
  retry/staleness behavior instead of bespoke hook-local caching.
- Extended true request cancellation and stale-request suppression across the
  remaining high-cost analytical hooks, including correlation, scatter, P chart,
  count chart, and plant lookups.
- Added configurable upstream/downstream lineage depth controls to the process
  flow experience, with the selected search horizon persisted into saved views
  and shareable URL state.
- Extended subgroup variable charting to support `X̄-S` alongside the existing
  `I-MR` and `X̄-R` families, including secondary sigma-chart rendering and
  lockable subgroup sigma limits.
- Added time-weighted quantitative chart families (`EWMA` and `CUSUM`) with
  analyst-tunable parameters, while keeping capability anchored to the existing
  within-sigma baseline.
- Expanded capability evidence to include approximate 95% confidence intervals
  for `Cp`, `Cpk`, `Pp`, and `Ppk`.
- Added a backend Gauge R&R reference module so MSA calculations now have a
  governed parity seam instead of existing only in the browser.
- Added a live backend MSA calculation endpoint and switched the MSA view to
  use it, preserving the current CSV-driven workflow while making backend
  results the displayed source of truth.
- Replaced the full-framework Carbon stylesheet import with a curated set of
  Carbon style modules, cutting the global CSS bundle and eliminating the IBM
  Plex runtime font warnings in production builds.

### Business benefit

- The app is significantly easier for quality engineers to use day-to-day.
- Faster initial loads and better chunking reduce friction for plant-floor and
  office users.
- The UI now feels like a supported product rather than a proof of concept,
  which improves adoption and stakeholder confidence.

### Technical benefit

- TypeScript catches integration mistakes earlier and makes future frontend
  changes safer.
- Removal of CSS sprawl and JS forwarder stubs reduces maintenance overhead.
- Code splitting lowers the main bundle size and improves perceived
  performance.
- The main SPC shell is now a thin coordinator rather than a large dependency
  registry, which improves first-load behaviour and keeps advanced tooling out
  of the default path.
- Heavy SPC computations no longer compete with input handling on the main UI
  thread, reducing chart interaction jank on larger datasets.
- Shared result caching avoids reissuing identical warehouse-backed calls when
  users move from overview into detail tabs.

---

## 2. Statistical Engine Enhancements

### What changed

- Added **short-term capability** metrics: `Cp` and `Cpk`.
- Preserved and improved long-term capability metrics: `Pp` and `Ppk`.
- Added **non-parametric capability** fallback for non-normal datasets using
  empirical percentile bounds.
- Added structured normality handling driven by Shapiro-Wilk metadata.
- Improved X-bar/R and I-MR handling, including better within-sigma treatment
  and subgroup awareness.
- Strengthened Nelson / WECO rule logic and test coverage.
- Added mixed-subgroup and non-normal messaging in the UI so users understand
  when standard assumptions do not hold.

### Business benefit

- The app now supports a more realistic quality-engineering workflow and better
  matches what AIAG-trained engineers expect to see.
- Users can distinguish between **short-term process capability** and
  **long-term process performance**, which is essential for meaningful release
  and improvement decisions.
- Non-normal handling reduces the risk of making incorrect capability claims on
  skewed or bimodal data.

### Technical benefit

- Capability calculations are closer to accepted SPC practice rather than being
  a simplified approximation.
- The engine is more transparent because the UI now explains when it is using
  empirical rather than parametric assumptions.
- Expanded tests reduce the risk of subtle mathematical regressions.

---

## 3. Dynamic Stratification and Per-Stratum Analysis

### What changed

- Replaced hardcoded plant-only stratification with a generic `stratify_by`
  model.
- Added backend-safe whitelisting for supported stratification keys.
- Enabled quantitative charting to carry `stratify_value` through the dataset.
- Added separate **per-stratum analytical panes** for quantitative SPC views,
  each with its own charts, signals, and capability panel.
- Extended exclusion scope to align with active stratification.

### Business benefit

- Quality teams can now isolate hidden causes of variation such as plant, lot,
  or operation rather than treating all data as one blended distribution.
- This makes root-cause analysis more actionable and reduces the chance that a
  bimodal process looks “average” but hides serious instability.

### Technical benefit

- Stratification is now a first-class concept rather than a special-case plant
  filter.
- The backend and frontend now share a consistent stratification contract,
  which is easier to extend later.

---

## 4. Exclusion Audit Trail and QMS Hardening

### What changed

- Implemented persistent exclusions with backend storage.
- Added justification-driven exclusion flows instead of silent point toggling.
- Added immutable exclusion snapshots and before/after limits capture.
- Added compatibility handling for legacy exclusion snapshots during the
  `stratify_by` rollout.
- Updated deploy-time schema evolution so existing Databricks environments can
  add required columns safely.

### Business benefit

- Manual data exclusion is now traceable and defensible in regulated
  environments.
- This supports stronger ALCOA+ expectations and is more appropriate for
  quality-management and validation use cases.
- Users can understand who excluded points, why they did so, and what effect
  the exclusion had.

### Technical benefit

- The exclusion workflow is no longer ephemeral frontend state.
- Deployments are less likely to fail because schema drift is handled more
  safely for existing tables.
- Persisted exclusion scope is aligned with stratification, reducing ambiguity
  and cross-slice confusion.

---

## 5. Backend Architecture Refactor

### What changed

- Broke apart the former monolithic SPC backend route file into:
  - dedicated routers
  - separate Pydantic schemas
  - a Data Access Layer (DAL)
  - shared SPC helpers
- Moved SQL and formatting logic out of route handlers and into dedicated data
  modules.
- Improved query reuse between charting, export, and analysis flows.

### Business benefit

- New features can be delivered with less risk because the backend is easier to
  change safely.
- Troubleshooting and onboarding are faster because responsibilities are more
  clearly separated.

### Technical benefit

- Better separation of concerns makes testing easier and reduces coupling
  between HTTP handling and query logic.
- Shared logic is less likely to drift between multiple endpoints.
- The codebase is much better prepared for future module growth.

---

## 6. Query Safety, Pagination, and Data Integrity

### What changed

- Replaced unstable rank-based chart pagination with an **immutable composite
  cursor**.
- Added strict chart row parsing so malformed numeric values fail loudly rather
  than being silently converted to `None`.
- Replaced the in-house chart SQL string-builder approach with **PyPika** for
  safer programmatic query construction.
- Added bounded chart data retrieval and client aggregation protections.

### Business benefit

- Users can trust that large chart histories load more predictably and do not
  silently skip or corrupt data.
- The system is more reliable for high-volume production datasets.

### Technical benefit

- Immutable cursors avoid pagination drift when historical batches are inserted
  later.
- Loud failures are far safer than silent statistical corruption.
- Standard query-building reduces maintenance risk compared with ad hoc SQL
  concatenation.

---

## 7. Scorecard and Analysis Improvements

### What changed

- Added `Cpk` to the scorecard so users can compare short-term capability
  across characteristics.
- Improved scorecard query structure to reduce duplication risk and align with
  statistical intent.
- Strengthened correlation handling and process-flow rollups.

### Business benefit

- Engineers can prioritise both immediate control performance and longer-term
  process capability directly from the scorecard.
- This improves triage and supports a “worst first” improvement workflow.

### Technical benefit

- Cleaner scorecard query design improves correctness and reduces the risk of
  misleading batch counts or duplicated aggregations.

---

## 8. Export, Documentation, and Transparency

### What changed

- Improved export alignment so exported chart/scorecard data reuses the same
  core SPC logic as the in-app views.
- Expanded project documentation to cover:
  - layered architecture
  - Delta tables
  - statistical methods
  - quality review findings and remediation

### Business benefit

- Exported outputs are more trustworthy because they better match the UI.
- Documentation now supports handover, audit readiness, and stakeholder review.

### Technical benefit

- Reduced logic drift between runtime analysis and exported reporting.
- Better docs lower maintenance cost and reduce future re-discovery work.

---

## 9. Deployment and Runtime Readiness

### What changed

- Hardened the Databricks deployment path around `make deploy`.
- Moved SQL token passthrough scopes into declarative bundle config and removed
  the old post-deploy scope patching fallback.
- Added missing root runtime dependencies required by the deployed app:
  `openpyxl`, `numpy`, `pandas`, `scipy`, `cachetools`, and `pypika`.
- Introduced an execution adapter in `backend/utils/db.py` so the backend can
  run against either the Databricks Statement Execution REST API or the
  official `databricks-sql-connector` without changing DAL call sites.
- Added `databricks-sql-connector` as an optional supported runtime dependency
  and kept the REST path as the default parity baseline.

### Business benefit

- Reduced risk of “works locally, fails in UAT” deployment surprises.
- UAT and production deployments are now more repeatable and less dependent on
  tribal knowledge.

### Technical benefit

- Startup crashes caused by missing runtime packages are avoided.
- The deployed environment is now aligned with the actual import graph of the
  backend, and the SQL transport can be swapped in a controlled way with
  parity-oriented tests.

---

## 10. Overall Outcome

The SPC app is no longer just a charting demo. It is now a substantially more
credible quality-management application with:

- stronger statistical integrity
- better auditability
- more scalable architecture
- safer deployment behaviour
- a modernised, typed frontend

This foundation makes the application far better suited for continued rollout
into manufacturing quality workflows, especially where capability analysis,
traceability, and defensible user actions matter.

---

## Recommended Next Steps

To build on this work, the next highest-value items are:

1. Apply the UAT deployment and verify all schema migrations complete cleanly.
2. Close the remaining GitHub issues around SAP metadata discovery, semantic
   threshold styling, actionable signal workflows, and operational alerting.
3. Continue polishing per-stratum workflows, especially export and edit flows,
   if stratification becomes a core daily usage pattern.
4. Add a short stakeholder demo pack showing:
   - normal vs non-normal capability
   - exclusions with audit trail
   - per-stratum analysis
   - scorecard triage using `Cpk` and `Ppk`
