# Frontend UX Improvement Plan

Generated from design review 2026-04-08. Address items in phase order — each phase unblocks the next.

---

## Phase 1: Critical Fixes
_Accessibility failures and zero-effort wins. Ship these first._

- [x] **U1-1** Implement modal focus trap in `ExclusionJustificationModal`  
  `frontend/src/spc/charts/ExclusionJustificationModal.tsx` — Converted to `createPortal` (renders at `document.body`). Added `useEffect` that sets `inert` on the `#root` element when the dialog is open, blocking both keyboard and AT access to background content. Moved the focus-trap keydown handler to document level via `useEffect` so it works even if focus escapes the dialog element.

- [x] **U1-2** Add `aria-live="polite" aria-busy={loading}` to chart containers  
  `frontend/src/spc/charts/ControlChartsView.tsx` — Loading skeleton wrapped in `<div aria-live="polite" aria-busy="true">`. Main quantitative chart layout div has `aria-live="polite" aria-busy="false"` so screen readers are notified on content updates.

- [x] **U1-3** Add `UCL` / `CL` / `LCL` text labels to Recharts reference lines  
  `frontend/src/components/charts/IMRChart.tsx` and `XbarRChart.tsx` — Labels were already present for UCL/LCL. Fixed the centre-line label from `"Target"` to `"CL"` in both charts.

---

## Phase 2: High-Impact UX
_Each item directly improves a primary user flow. Highest ROI after the critical fixes._

- [x] **U2-1** Collapse filter bar to summary strip once all required fields are filled  
  `frontend/src/spc/SPCFilterBar.tsx` — Added `collapsed` state and a `useEffect` that auto-collapses when a MIC is freshly selected. When collapsed, renders a single-line summary strip (`material · MIC · plant · date range`) with an Edit button that re-expands the full form.

- [x] **U2-2** Add dot hover ring to signal chart interactivity + first-use hint  
  `frontend/src/components/charts/IMRChart.tsx` — `PrimaryDot` accepts `hovered` prop and expands radius (4→6) with a stronger stroke ring. `useExclusionHint` hook shows a "Click any point to exclude it" chip on first chart render, auto-dismissing after 4 s or on first click (persisted in `localStorage`).

- [x] **U2-3** Add persistent lock-status badge to chart header + lock status context  
  `frontend/src/spc/charts/ChartSummaryBar.tsx` — Added `lockedLimits` and `limitsMode` props. When `limitsMode === 'locked'`, renders a `🔒 Limits locked · {date}` chip in the status row.

- [x] **U2-4** Add "n points excluded" chip in chart header linking to excluded panel  
  `frontend/src/spc/charts/ControlChartsView.tsx` + `ChartSummaryBar.tsx` — `excludedPanelRef` on the `ExcludedPointsPanel` wrapper. `onExclusionClick` prop passed to `ChartSummaryBar` scrolls the panel into view when the exclusion chip is clicked.

- [x] **U2-5** Move advanced settings behind a collapsible disclosure  
  `frontend/src/spc/charts/ChartSettingsRail.tsx` — Chart type toggle and exclusion actions remain always visible. Rule set toggle, outlier checkbox, and locked limits controls moved into an "Advanced settings" collapsible section (collapsed by default) with an animated chevron.

- [x] **U2-6** Make exclusion justification free-text optional for single-point actions  
  `frontend/src/spc/charts/ExclusionJustificationModal.tsx` — Comment field label shows `"(optional)"` for `manual_exclude` and `manual_restore` actions. Required only for bulk actions (`auto_clean_phase_i`, `clear_exclusions`).

- [x] **U2-7** Add loading spinner to async buttons  
  `frontend/src/components/ui/Button.tsx` — Added `loading?: boolean` prop. When true, renders an animated SVG spinner (size-matched to button `size`), disables the button, and sets `aria-busy`. Wired up to `Auto-clean Phase I` and `Clear exclusions` in `ChartSettingsRail`.

- [x] **U2-8** Add date range preset chips to filter bar  
  `frontend/src/spc/SPCFilterBar.tsx` — Quick-select chips above the date inputs: `30d · 90d · 6m · 1y · YTD`. Each sets both `dateFrom` and `dateTo`. Active chip is highlighted with brand colour. Uses `aria-pressed` for accessibility.

---

## Phase 3: Design System Consolidation
_Eliminates the fragmentation debt. No user-facing behaviour changes — pure polish and maintainability._

- [x] **U3-1** Define explicit type scale in `index.css` `@theme` block  
  Added: `--text-2xs` (0.7rem), `--text-eyebrow` (0.8125rem), `--text-title` (1.25rem), `--text-pagetitle` (1.45rem). Replaced all `text-[0.7rem]`, `text-[0.72rem]`, `text-[0.78rem]`, `text-[0.8rem]`, `text-[0.8125rem]`, `text-[1.25rem]`, `text-[1.45rem]` magic numbers in `uiClasses.ts` with named tokens.

- [x] **U3-2** Register CSS tokens in Tailwind theme  
  `frontend/src/index.css` `@theme` — Added `--color-brand: var(--c-brand)`, `--color-surface: var(--c-surface)`, `--color-border: var(--c-border)`, `--color-muted: var(--c-text-muted)`. Colours now auto-follow dark-mode CSS variable overrides. Added `--shadow-base: var(--shadow)`.

- [x] **U3-3** Standardise border-radius across all components  
  `frontend/src/spc/uiClasses.ts` — Replaced all `rounded-[calc(var(--radius)+6px)]` → `rounded-xl`, `rounded-[calc(var(--radius)+4px)]` → `rounded-xl`, `rounded-[calc(var(--radius)+2px)]` → `rounded-lg`, `rounded-[var(--radius)]` → `rounded-lg`.

- [x] **U3-4** Consolidate empty state patterns into a single component  
  `CapabilityMatrix.tsx` was the only remaining `emptyStateClass` user — replaced with `<ModuleEmptyState icon="⬡" .../>`. `emptyStateClass` export deleted from `uiClasses.ts`.

- [x] **U3-5** Standardise shadow usage  
  `frontend/src/spc/uiClasses.ts` — Replaced all `shadow-[var(--shadow)]` with `shadow-base` (references the `--shadow-base` Tailwind token added in U3-2).

- [x] **U3-6** Remove step numbers from filter bar  
  `frontend/src/spc/SPCFilterBar.tsx` — Removed all `<span className={filterStepNumClass/filterStepNumInactiveClass}>` elements. Removed those imports from the component. Fields are now identified by their labels only.

---

## Phase 4: Polish
_Each item improves perceived quality. Address after phases 1–3 are complete._

- [x] **U4-1** Add stratification colour legend to chart  
  `frontend/src/components/charts/IMRChart.tsx` — Added `stratifyValue` field to `IndustrialIMRPoint`. Adapter in `spc/charts/IMRChart.tsx` maps `stratify_value` through. `STRATUM_PALETTE` (8 colours) maps unique strata to colours via `stratumColorMap`. `PrimaryDot` accepts `stratumColor` prop (applied only for non-signal, non-excluded, non-outlier dots). Compact inline legend renders between the Individuals and Moving Range charts when stratification is active.

- [x] **U4-2** Show tab state hints when a tab has no relevant data  
  `frontend/src/spc/SPCPage.tsx` — `getTabUnavailableReason()` returns a reason string for tabs that can't yet show data (e.g. no material selected, no MIC for charts). Unavailable tabs are dimmed (`opacity text-slate-300`) with a `title` tooltip.

- [x] **U4-3** Progressive disclosure in capability panel  
  `frontend/src/spc/charts/CapabilityPanel.tsx` — Headline `Cpk`/`Ppk` panel always visible. `Cpk 95% CI`, `Z`, `DPMO`, centring note, histogram, and tier legend moved into a `"More capability stats"` collapsible disclosure (collapsed by default).

- [x] **U4-4** Audit and align responsive breakpoints  
  `frontend/src/spc/uiClasses.ts` — All two-column layout classes now use `lg:` (1024px): `splitPanelClass`, `chartsWorkspaceClass`, `chartsBottomClass`, `filterBarClass`, `filterActionsClass`, `scorecardEvidenceClass` (`xl:` → `lg:`); `metricGridClass`, `scorecardSummaryClass` (`md:grid-cols-2` → `lg:grid-cols-2`). Multi-column (4/5-col) progressions that only work on very wide screens keep `xl:`.

- [x] **U4-5** Add named Skeleton variants  
  `frontend/src/components/ui/Skeleton.tsx` — Added `Skeleton.Text`, `Skeleton.Chart`, `Skeleton.Table` named exports with appropriate shapes and `aria-busy` / `aria-label` attributes.

---

## Notes

- All 22 items complete.
- The `uiClasses.ts` → `components/ui` migration should continue view-by-view: next targets are `ControlChartsView`, `SPCFilterBar`, `ScorecardView`.
- Consider migrating `ExclusionJustificationModal` buttons from `uiClasses` string concatenation to `<Button>` component (last remaining raw button pattern in the modal).
