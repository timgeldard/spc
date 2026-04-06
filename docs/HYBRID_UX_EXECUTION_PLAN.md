# Hybrid UX Execution Plan

This plan translates the agreed hybrid design direction into a sequence of
small, reviewable frontend PRs. The target experience combines:

- **Control Tower** layout and scanability
- **Clinical QMS** tone, evidence structure, and audit readiness

The redesign is explicitly **UI-only** unless a missing display field blocks
delivery. All current SPC functionality must remain intact.

---

## PR 1 — Shared UI Foundation

**Scope**

- Extend shared UI tokens and utility classes.
- Introduce reusable primitives for:
  - page sections
  - status chips
  - summary cards
  - evidence-rail cards
  - alert banners

**Primary files**

- `frontend/src/spc/uiClasses.ts`
- `frontend/src/index.css`

**Outcome**

- A consistent visual language exists before feature views are rewritten.

---

## PR 2 — SPC Shell, Header, and Filter Experience

**Scope**

- Refactor the SPC page shell.
- Replace the current flat filter strip with a grouped, two-layer header.
- Promote context metadata:
  - material
  - characteristic
  - chart type
  - stratification
  - exclusions active
  - normality state

**Primary files**

- `frontend/src/spc/SPCPage.tsx`
- `frontend/src/spc/SPCFilterBar.tsx`

**New components**

- `frontend/src/spc/SPCPageHeader.tsx`

**Outcome**

- The app state becomes legible at a glance.
- Analysts can see review context without digging into the chart body.

---

## PR 3 — Control Chart Workspace

**Scope**

- Restructure the control chart page into:
  - context header
  - main chart canvas
  - right evidence rail
  - signals section
- Move controls out of the crowded inline header.
- Keep exclusions, exports, locked limits, and auto-clean intact.

**Primary files**

- `frontend/src/spc/charts/ControlChartsView.tsx`
- `frontend/src/spc/charts/CapabilityPanel.tsx`
- `frontend/src/spc/charts/SignalsPanel.tsx`
- `frontend/src/spc/charts/ExcludedPointsPanel.tsx`

**New components**

- `frontend/src/spc/charts/AnalysisHeader.tsx`
- `frontend/src/spc/charts/EvidenceRail.tsx`

**Outcome**

- The chart page becomes an analysis workspace rather than a settings dump.

---

## PR 4 — Per-Stratum Comparison Refinement

**Scope**

- Keep the existing per-stratum capability logic.
- Reframe per-stratum output as compact comparison cards instead of repeated
  full sections.

**Primary files**

- `frontend/src/spc/charts/ControlChartsView.tsx`

**Outcome**

- Stratification remains powerful without overwhelming the page.

---

## PR 5 — Scorecard Refresh

**Scope**

- Strengthen the scorecard hierarchy.
- Add a headline summary band above the grid.
- Emphasize Cpk and Ppk as primary decision metrics.
- Keep ag-Grid, exports, sorting, and click-through.

**Primary files**

- `frontend/src/spc/scorecard/ScorecardView.tsx`
- `frontend/src/spc/scorecard/ScorecardTable.tsx`

**New components**

- `frontend/src/spc/scorecard/ScorecardSummaryCards.tsx`

**Outcome**

- Users can triage capability faster before entering table detail.

---

## PR 6 — Cross-Module Consistency Pass

**Scope**

- Apply the same card/header/status language to:
  - Compare
  - Correlation
  - Process Flow
  - MSA

**Primary files**

- `frontend/src/spc/compare/CompareView.tsx`
- `frontend/src/spc/correlation/CorrelationView.tsx`
- `frontend/src/spc/flow/ProcessFlowView.tsx`
- `frontend/src/spc/msa/MSAView.tsx`

**Outcome**

- The overall product feels coherent rather than partially redesigned.

---

## PR 7 — Responsive and Accessibility QA

**Scope**

- Focus management
- mobile/tablet layout checks
- contrast review
- non-color cues for status and signals

**Outcome**

- The redesign is robust enough for real operational use.
