# Carbon Strict Migration Plan

Strict migration plan for moving the frontend to the IBM Carbon Design System
with `@carbon/react`, `@carbon/icons-react`, and Carbon Sass as the only
design-system layer.

This plan is intentionally strict. The target end state is not "mostly Carbon"
or "Carbon-themed". The target is full Carbon adoption for shell, controls,
forms, tables, overlays, feedback, spacing, typography, and theming. Existing
charting and graph engines may remain, but only as renderers hosted inside
Carbon components and themed with Carbon tokens.

---

## Objective

Replace the current hybrid UI stack:

- Carbon React
- Tailwind utility classes
- custom `components/ui` primitives
- `uiClasses.ts`
- Radix overlays/tooltips
- bespoke CSS variables and inline visual styling

with a Carbon-only design-system foundation.

Success means:

- Carbon is the only approved UI component library.
- Carbon Sass is the only approved design-token/theme source.
- Tailwind is not required for active UI surfaces.
- Radix is removed from active UI code.
- Custom UI primitives are removed or reduced to thin Carbon wrappers.
- App chrome and feature modules follow Carbon structure and behavior.

---

## Current State Summary

The repo is already partially migrated:

- Carbon packages are installed in
  [frontend/package.json](/Users/timgeldard/spc-1/frontend/package.json).
- Carbon components already appear in:
  - [frontend/src/components/layout/SPCHeader.tsx](/Users/timgeldard/spc-1/frontend/src/components/layout/SPCHeader.tsx)
  - [frontend/src/spc/SPCFilterBar.tsx](/Users/timgeldard/spc-1/frontend/src/spc/SPCFilterBar.tsx)
  - [frontend/src/spc/overview/OverviewPage.tsx](/Users/timgeldard/spc-1/frontend/src/spc/overview/OverviewPage.tsx)
  - [frontend/src/spc/overview/RecentViolations.tsx](/Users/timgeldard/spc-1/frontend/src/spc/overview/RecentViolations.tsx)
  - [frontend/src/spc/charts/ChartCard.tsx](/Users/timgeldard/spc-1/frontend/src/spc/charts/ChartCard.tsx)
  - [frontend/src/spc/charts/ControlChartsView.tsx](/Users/timgeldard/spc-1/frontend/src/spc/charts/ControlChartsView.tsx)
  - [frontend/src/spc/scorecard/ScorecardView.tsx](/Users/timgeldard/spc-1/frontend/src/spc/scorecard/ScorecardView.tsx)

But the app is still hybrid because it also relies heavily on:

- Tailwind utility classes across `frontend/src`
- custom UI primitives in
  [frontend/src/components/ui](/Users/timgeldard/spc-1/frontend/src/components/ui)
- custom utility-class registry in
  [frontend/src/spc/uiClasses.ts](/Users/timgeldard/spc-1/frontend/src/spc/uiClasses.ts)
- Radix overlays in modal/tooltip components
- visual inline styles in Carbon components
- parallel CSS/theme systems in
  [frontend/src/App.css](/Users/timgeldard/spc-1/frontend/src/App.css) and
  [frontend/src/index.css](/Users/timgeldard/spc-1/frontend/src/index.css)

That means the migration is not a visual polish task. It is a system
replacement.

---

## Migration Rules

These rules apply from the first migration PR onward.

1. No new Tailwind utility classes may be introduced in active SPC UI code.
2. No new Radix components may be introduced.
3. No new custom button/card/modal/tooltip primitives may be introduced unless
   they are thin wrappers around Carbon.
4. Carbon layout, spacing, type, color, focus, and layering tokens must be used
   instead of bespoke CSS variables for all new work.
5. Existing charting and graph libraries are allowed only if their shell and
   controls are Carbon.
6. All migration PRs must remove legacy code in the same area when practical,
   not just add Carbon beside it.

---

## Allowed UI Stack After Migration

Approved:

- `@carbon/react`
- `@carbon/icons-react`
- `@carbon/styles`
- Sass entrypoints for Carbon theme composition
- ECharts, Recharts, XYFlow, ag-Grid only where Carbon has no renderer

Disallowed as active design-system layers:

- Tailwind utility styling for application UI
- Radix UI overlays/tooltips/dialogs
- bespoke `components/ui` kit
- `uiClasses.ts` as a visual system
- duplicate `.jsx` and `.tsx` UI variants that preserve pre-Carbon styling

---

## Phase 1 — Carbon Foundation and Sass Runtime

### Goal

Make Carbon Sass and Carbon theme providers the single styling foundation.

### Scope

- Add Sass support if missing.
- Create a Carbon Sass entrypoint such as:
  - `frontend/src/styles/carbon.scss`
- Import Carbon Sass once from:
  - [frontend/src/main.jsx](/Users/timgeldard/spc-1/frontend/src/main.jsx)
- Refactor:
  - [frontend/src/App.css](/Users/timgeldard/spc-1/frontend/src/App.css)
  - [frontend/src/index.css](/Users/timgeldard/spc-1/frontend/src/index.css)
  so they stop acting as parallel design systems.
- Decide and implement Carbon theme switching for light/dark mode.

### Required deliverables

- `sass` dependency added
- one Carbon Sass entrypoint
- one theme selection mechanism
- documentation for allowed global overrides

### Exit criteria

- Carbon theme tokens are globally available.
- App boots without relying on Tailwind for basic layout and typography.
- New Carbon surfaces no longer need ad hoc inline visual styles for basics.

---

## Phase 2 — Decommission the Custom UI Kit

### Goal

Remove the competing design-system abstraction layer.

### Primary targets

- [frontend/src/components/ui/Button.tsx](/Users/timgeldard/spc-1/frontend/src/components/ui/Button.tsx)
- [frontend/src/components/ui/Card.tsx](/Users/timgeldard/spc-1/frontend/src/components/ui/Card.tsx)
- [frontend/src/components/ui/Tooltip.tsx](/Users/timgeldard/spc-1/frontend/src/components/ui/Tooltip.tsx)
- [frontend/src/components/ui/index.ts](/Users/timgeldard/spc-1/frontend/src/components/ui/index.ts)
- [frontend/src/spc/uiClasses.ts](/Users/timgeldard/spc-1/frontend/src/spc/uiClasses.ts)

### Scope

- Replace imports from `components/ui` with Carbon equivalents.
- Replace utility-class composition with Carbon layout and spacing primitives.
- Keep only small non-visual helpers where necessary.

### Exit criteria

- Feature code no longer imports `components/ui/Button`, `Card`, or `Tooltip`.
- `uiClasses.ts` is either removed or reduced to a temporary compatibility shim.
- Carbon components own buttons, tiles, tags, tooltips, and notifications.

---

## Phase 3 — Shell, Header, Side Nav, and Filter Bar

### Goal

Convert the app frame into idiomatic Carbon structure.

### Primary targets

- [frontend/src/spc/SPCPage.tsx](/Users/timgeldard/spc-1/frontend/src/spc/SPCPage.tsx)
- [frontend/src/components/layout/SPCHeader.tsx](/Users/timgeldard/spc-1/frontend/src/components/layout/SPCHeader.tsx)
- [frontend/src/components/layout/Sidebar.tsx](/Users/timgeldard/spc-1/frontend/src/components/layout/Sidebar.tsx)
- [frontend/src/spc/SPCFilterBar.tsx](/Users/timgeldard/spc-1/frontend/src/spc/SPCFilterBar.tsx)
- [frontend/src/components/layout/AppShell.tsx](/Users/timgeldard/spc-1/frontend/src/components/layout/AppShell.tsx)

### Carbon targets

- `Header`
- `HeaderContainer`
- `SideNav`
- `Content`
- `Tabs`
- `Grid`
- `Column`
- `Search`
- `Dropdown`
- `ComboBox`
- `DatePicker`
- `Button`
- `Select`

### Notes

- Saved views panel must use Carbon form controls, not native `<select>` plus
  inline styling.
- Tab navigation should use Carbon tabs instead of bespoke pill buttons.
- Filter group layout should move to Carbon grid instead of utility classes.

### Exit criteria

- All shell navigation and global filter controls are Carbon-only.
- No Tailwind utility styling remains in shell/header/filter files.
- Dark mode uses Carbon theming rather than custom theme tokens.

---

## Phase 4 — Overview Module

### Goal

Make the landing dashboard fully Carbon-native.

### Primary targets

- [frontend/src/spc/overview/OverviewPage.tsx](/Users/timgeldard/spc-1/frontend/src/spc/overview/OverviewPage.tsx)
- [frontend/src/spc/overview/KPICard.tsx](/Users/timgeldard/spc-1/frontend/src/spc/overview/KPICard.tsx)
- [frontend/src/spc/overview/RecentViolations.tsx](/Users/timgeldard/spc-1/frontend/src/spc/overview/RecentViolations.tsx)
- [frontend/src/components/EmptyState.tsx](/Users/timgeldard/spc-1/frontend/src/components/EmptyState.tsx)

### Scope

- Use Carbon `Tile`, `ClickableTile`, `Grid`, `Button`, `InlineNotification`,
  and `SkeletonPlaceholder`.
- Replace remaining inline styles with Carbon spacing and token classes.
- Make empty states Carbon-aligned.

### Exit criteria

- Overview has no Tailwind utility classes.
- KPI cards and alert lists use Carbon surfaces and iconography consistently.

---

## Phase 5 — Control Charts Workspace

### Goal

Migrate the most complex workspace to Carbon without losing analysis power.

### Primary targets

- [frontend/src/spc/charts/ControlChartsView.tsx](/Users/timgeldard/spc-1/frontend/src/spc/charts/ControlChartsView.tsx)
- [frontend/src/spc/charts/ChartCard.tsx](/Users/timgeldard/spc-1/frontend/src/spc/charts/ChartCard.tsx)
- [frontend/src/spc/charts/ChartSettingsRail.tsx](/Users/timgeldard/spc-1/frontend/src/spc/charts/ChartSettingsRail.tsx)
- [frontend/src/spc/charts/ChartSummaryBar.tsx](/Users/timgeldard/spc-1/frontend/src/spc/charts/ChartSummaryBar.tsx)
- [frontend/src/spc/charts/ChartInfoBanners.tsx](/Users/timgeldard/spc-1/frontend/src/spc/charts/ChartInfoBanners.tsx)
- [frontend/src/spc/charts/SignalsPanel.tsx](/Users/timgeldard/spc-1/frontend/src/spc/charts/SignalsPanel.tsx)
- [frontend/src/spc/charts/ExcludedPointsPanel.tsx](/Users/timgeldard/spc-1/frontend/src/spc/charts/ExcludedPointsPanel.tsx)
- [frontend/src/spc/charts/CapabilityPanel.tsx](/Users/timgeldard/spc-1/frontend/src/spc/charts/CapabilityPanel.tsx)
- [frontend/src/spc/charts/StratificationPanel.tsx](/Users/timgeldard/spc-1/frontend/src/spc/charts/StratificationPanel.tsx)

### Scope

- Replace any remaining custom cards, buttons, and form controls.
- Standardize side rails and evidence panels on Carbon compositional patterns.
- Move settings toggles to Carbon controls.
- Convert informational banners to Carbon notifications.

### Exit criteria

- Control chart workflow surfaces use Carbon controls and layout exclusively.
- ECharts remains only as chart renderer.
- Visual hierarchy is Carbon-driven, not utility-class-driven.

---

## Phase 6 — Modals, Tooltips, and Feedback

### Goal

Remove Radix and unify overlays under Carbon.

### Primary targets

- [frontend/src/components/Modals/PointExclusionModal.tsx](/Users/timgeldard/spc-1/frontend/src/components/Modals/PointExclusionModal.tsx)
- [frontend/src/spc/charts/ExclusionJustificationModal.tsx](/Users/timgeldard/spc-1/frontend/src/spc/charts/ExclusionJustificationModal.tsx)
- all tooltip usage across charts and layout

### Carbon targets

- `ComposedModal`
- `Modal`
- `Tooltip`
- `Popover`
- `InlineNotification`
- `ToastNotification`

### Exit criteria

- `@radix-ui/react-dialog`, `@radix-ui/react-popover`, and
  `@radix-ui/react-tooltip` are no longer used in app code.
- Modal behavior, focus handling, and dismiss patterns are Carbon-only.

---

## Phase 7 — Scorecard and Structured Data Surfaces

### Goal

Migrate tables and structured review surfaces to Carbon patterns.

### Primary targets

- [frontend/src/spc/scorecard/ScorecardView.tsx](/Users/timgeldard/spc-1/frontend/src/spc/scorecard/ScorecardView.tsx)
- [frontend/src/spc/scorecard/ScorecardTable.tsx](/Users/timgeldard/spc-1/frontend/src/spc/scorecard/ScorecardTable.tsx)
- [frontend/src/spc/components/MetricCard.tsx](/Users/timgeldard/spc-1/frontend/src/spc/components/MetricCard.tsx)
- [frontend/src/spc/components/StatusPill.tsx](/Users/timgeldard/spc-1/frontend/src/spc/components/StatusPill.tsx)

### Scope

- Use Carbon `DataTable` where feasible.
- If ag-Grid remains, it must be wrapped in Carbon shell and themed with Carbon
  tokens only.
- Replace custom pills/tags with Carbon `Tag`.

### Exit criteria

- Scorecard surfaces no longer depend on custom metric/status primitives.
- Table and summary views feel native to Carbon.

---

## Phase 8 — Process Flow, Compare, Correlation, and MSA

### Goal

Finish Carbon adoption on secondary modules.

### Primary targets

- [frontend/src/spc/flow/ProcessFlowView.tsx](/Users/timgeldard/spc-1/frontend/src/spc/flow/ProcessFlowView.tsx)
- [frontend/src/spc/flow/ProcessNode.tsx](/Users/timgeldard/spc-1/frontend/src/spc/flow/ProcessNode.tsx)
- [frontend/src/spc/flow/ProcessFlowLegend.tsx](/Users/timgeldard/spc-1/frontend/src/spc/flow/ProcessFlowLegend.tsx)
- [frontend/src/spc/compare/CompareView.tsx](/Users/timgeldard/spc-1/frontend/src/spc/compare/CompareView.tsx)
- [frontend/src/spc/correlation/CorrelationView.tsx](/Users/timgeldard/spc-1/frontend/src/spc/correlation/CorrelationView.tsx)
- [frontend/src/spc/msa/MSAView.tsx](/Users/timgeldard/spc-1/frontend/src/spc/msa/MSAView.tsx)

### Scope

- Convert module headers, sidebars, empty states, controls, and support panels.
- Theme XYFlow node shells and legends with Carbon tokens.
- Remove remaining bespoke cards and button classes.

### Exit criteria

- These modules use Carbon shells and Carbon-aligned content structure.
- Remaining custom CSS exists only for renderer-specific needs.

---

## Phase 9 — Legacy Cleanup

### Goal

Delete the old system so the app cannot regress back into hybrid mode.

### Removal targets

- Tailwind dependency and config if no longer needed
- [frontend/src/lib/utils.ts](/Users/timgeldard/spc-1/frontend/src/lib/utils.ts) if only used for class merging
- [frontend/src/components/ui](/Users/timgeldard/spc-1/frontend/src/components/ui)
- [frontend/src/spc/uiClasses.ts](/Users/timgeldard/spc-1/frontend/src/spc/uiClasses.ts)
- duplicate legacy files such as mixed `.jsx` and `.tsx` UI variants
- stale custom theme variables in CSS

### Exit criteria

- Repo no longer ships a second design system.
- Carbon is the only visual foundation left in active code.

---

## Phase 10 — Enforcement

### Goal

Make Carbon compliance enforceable in CI.

### Required checks

- fail on imports from `components/ui`
- fail on imports from Radix packages in app code
- fail on active Tailwind utility usage in `frontend/src/spc` and
  `frontend/src/components/layout`
- fail on direct hard-coded design colors outside approved theme files

### Implementation options

- ESLint custom rules
- simple CI `rg` checks
- codemod-based cleanup scripts for migration waves

### Exit criteria

- Pull requests cannot reintroduce non-Carbon UI patterns.

---

## PR Structure

Recommended PR sequence:

1. Carbon Sass foundation
2. Shell and filter bar
3. Custom UI kit removal
4. Overview migration cleanup
5. Control charts workspace
6. Modals and tooltip replacement
7. Scorecard tables and tags
8. Flow and secondary modules
9. Tailwind and legacy cleanup
10. Enforcement and documentation

Each PR should end with:

- zero new Tailwind usage in touched files
- zero new inline visual styling in touched files
- screenshots for major surfaces
- updated migration checklist

---

## Working Definition of 100% Carbon

The migration is complete only when all of the following are true:

- Every navigation, layout, form, button, modal, tooltip, notification, tile,
  and table surface is Carbon.
- App-wide theming comes from Carbon Sass and Carbon tokens.
- Tailwind utility classes are absent from active SPC UI code.
- Radix packages are absent from active UI code.
- `components/ui` is gone or reduced to Carbon passthroughs only.
- `uiClasses.ts` is gone.
- Charts and flow use Carbon-themed shells and Carbon token colors.

If any of those are still false, the migration is not complete.

---

## Open Technical Decisions

These need to be resolved early:

1. Whether ag-Grid stays or is replaced by Carbon `DataTable`.
2. Whether dark mode uses Carbon White/Gray 10 or Gray 90/100 themes.
3. How much Carbon wrapper code is acceptable before it becomes a parallel UI
   system again.
4. Whether legacy non-SPC surfaces in `frontend/src/components/*.jsx` must also
   be migrated in the same program or treated as a separate track.

---

## Recommendation

Run this as a strict migration branch with explicit compliance gates after each
phase. The biggest failure mode is letting Carbon coexist with Tailwind and the
custom UI layer indefinitely. This plan is designed to prevent that.
