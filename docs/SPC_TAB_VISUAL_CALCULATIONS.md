# SPC Tab & Visual Calculations Reference

This document explains the calculations, thresholds, and derived values behind every SPC tab and major visual in the frontend.

It complements, but does not replace, [STATISTICAL_METHODS.md](./STATISTICAL_METHODS.md):

- Use this document for `where a number on screen comes from`
- Use `STATISTICAL_METHODS.md` for the formal statistical formulas

---

## Shared Scope and Conventions

Most SPC tabs inherit the same top-bar scope:

- `material`
- `plant` when selected
- `date_from`
- `date_to`
- `selected MIC` for chart-level analysis

Shared conventions:

- Capability headline prefers `Cpk`, then falls back to `Ppk` when short-term capability is unavailable.
- Long-term performance and short-term capability formulas are defined in [STATISTICAL_METHODS.md](./STATISTICAL_METHODS.md).
- Non-normal quantitative data switches long-term performance to the empirical percentile method when normality is known to be false.
- Visual-only transforms such as graph layout, truncation, sorting, and formatting are called out separately from business calculations.

---

## Overview Tab

Source data:

- `useSPCScorecard()` → `/api/spc/scorecard`
- `useSPCFlow()` → `/api/spc/process-flow`

### KPI Card: Process Health

Displayed in `OverviewPage.tsx` as a percentage.

What it shows:

- A single roll-up of how many scoped characteristics are both capable and behaving stably enough to be considered healthy.

Why it matters:

- This is the fastest “is this material broadly under control?” signal on the landing page and helps supervisors decide whether to stay high-level or jump into investigation.

Calculation:

- `healthyCharacteristics = count of scorecard rows where (cpk ?? ppk) >= 1.33 and ooc_rate <= 0.02`
- `processHealth = round(healthyCharacteristics / total scorecard rows * 100)`

Status color:

- `good` when `processHealth >= 85`
- `warning` when `65 <= processHealth < 85`
- `bad` when `< 65`

### KPI Card: Avg Cpk

What it shows:

- The average headline capability across all in-scope characteristics with usable capability values.

Why it matters:

- It provides a quick directional view of whether the scoped process is generally well-centered and capable, even before looking at the worst individual MICs.

Calculation:

- Collect `(cpk ?? ppk)` from each scorecard row
- Drop nulls
- `avgCpk = average of remaining values`, rounded to 2 decimals

Status color:

- `good` when `avgCpk >= 1.33`
- `warning` when `1.00 <= avgCpk < 1.33`
- `bad` when `< 1.00`

### KPI Card: Out of Control

This is not a raw sample-point count. It is the number of scorecard characteristics with any out-of-control rate.

What it shows:

- How many characteristics are currently carrying any out-of-control burden in the selected scope.

Why it matters:

- It helps teams distinguish “one isolated problem” from “many characteristics showing instability at once.”

Calculation:

- `oocPoints = count of scorecard rows where ooc_rate > 0`

Status color:

- `warning` when `oocPoints > 0`
- `good` when `oocPoints = 0`

### KPI Card: Affected Batches

This is a derived estimate from the scorecard, not a separately queried backend field.

What it shows:

- An approximate count of batches touched by out-of-control behavior across the scoped scorecard.

Why it matters:

- It translates statistical instability into operational impact, which is more useful for shift handover and escalation decisions than signal counts alone.

Calculation:

- For each scorecard row: `round(batch_count * ooc_rate)`
- Sum across all rows
- Negative values are clipped to `0`

### Visual: Process Flow Overview Mini Map

Source:

- `flowData` from `/api/spc/process-flow`

What it shows:

- A compact map of the material’s process path, with node health, estimated capability, and visible signal flags.

Why it matters:

- It gives users a fast spatial view of where risk sits in the flow before they open the full interactive process-flow tab.

Derived display logic:

- Node label is truncated to 18 characters for the minimap.
- Node status color comes from backend `status`.
- `hasSignal = Boolean(has_ooc_signal || last_ooc)`
- Mini node sublabel shows `estimated_cpk` when present.
- Red source nodes animate outgoing edges in the minimap.

Not a business calculation:

- `layoutFlowGraph()` only computes screen positions.

### Visual: Recent Violations

Primary source:

- Process flow nodes, when any flow-level risk nodes exist

Fallback source:

- Scorecard rows

What it shows:

- The most investigation-worthy recent issues, preferring process-flow risk signals and falling back to scorecard trouble spots when flow-specific evidence is sparse.

Why it matters:

- It acts as the triage queue for the overview page, helping users move from “something is wrong” to “here is where to look next.”

Flow-priority selection logic:

- Include a node when any of the following is true:
- `last_ooc` present
- `has_ooc_signal = true`
- `estimated_cpk < 1`
- `rejection_rate_pct >= 2`
- Sort descending by `last_ooc`
- Take top 5

Fallback scorecard selection logic:

- Include rows where `ooc_rate > 0` or `(cpk ?? ppk) < 1.33`
- Sort by:
- highest `ooc_rate` first
- then lowest `(cpk ?? ppk)`
- Take top 5

CTA buttons:

- `Investigate Latest OOC Signal` and `Generate Shift Report` do not perform calculations; they switch tabs using the current scope.

---

## Process Flow Tab

Source data:

- `useSPCFlow()` → `/api/spc/process-flow`

### Node Metrics

Primary values come from the backend:

- `total_batches`
- `rejected_batches`
- `estimated_cpk`
- `mic_count`
- `status`
- `last_ooc`
- `has_ooc_signal`

Frontend-derived values:

- `rejection_rate_pct = rejected_batches / total_batches * 100`
- `inferredSignal = Boolean(last_ooc || has_ooc_signal || status === 'red' || estimated_cpk < 1)`

What the visual shows:

- Each node summarizes process-step health using rejection burden, capability signals, and recent out-of-control evidence.

Why it matters:

- This is the main “where in the process is risk accumulating?” view and is especially useful for tracing whether instability is local or propagating through dependent steps.

### Node Coloring and Urgency

The frontend trusts backend `status` as the main health color.

Additional urgency cues:

- Nodes with inferred signal are highlighted as active investigation candidates.
- `estimated_cpk < 1` is treated as weak capability.
- Elevated rejection rate is shown as process risk.

### Edge and Trace Interactions

These are graph operations, not statistical calculations:

- selecting a node
- tracing upstream/downstream paths
- highlighting connected edges

What they show:

- The selected material path and its immediate upstream/downstream neighborhood.

Why they matter:

- They let engineers connect a bad node to likely sources and downstream impact without re-running a separate lineage analysis.

### Layout

`layoutFlowGraph()` determines node coordinates only. It does not alter rejection, capability, or signal values.

---

## Control Charts Tab

Source data:

- Quantitative data: `/api/spc/chart-data`
- Attribute data: `/api/spc/p-chart-data` and `/api/spc/count-chart-data`
- Persisted exclusions
- Locked limits

Primary orchestration:

- `useControlChartsController()`

### Chart Family Selection

The chart family is determined from MIC context and subgroup structure:

- variable data uses `I-MR` when subgroup size is effectively `1`
- variable data uses `X̄-R` or `X̄-S` when subgroup size is greater than `1`
- the settings rail can override the subgroup companion chart between `R` and `S`
- the settings rail can also switch variable charts into `EWMA` or `CUSUM` for time-weighted monitoring
- attribute data uses the attribute chart type returned by the backend/controller path

The summary bar shows:

- `chartFamilyLabel`
- current rule set
- stratification mode
- capability mode

What it shows:

- The correct SPC lens for the current characteristic, including whether the user is looking at individual, subgroup-range, subgroup-sigma, or attribute behavior and whether the capability evidence is parametric or empirical.

Why it matters:

- Choosing the wrong chart family leads to misleading limits and signals, so this visual context is essential to interpreting everything else in the tab.

### Quantitative Control Chart Calculations

Implemented in the SPC computation engine and documented formally in [STATISTICAL_METHODS.md](./STATISTICAL_METHODS.md):

- Individuals chart center line
- Moving ranges
- moving range mean
- within sigma from `MR-bar / d2`
- X̄ and R subgroup statistics
- X̄ and S subgroup statistics
- X̄ limits using `A2`
- R limits using `D3` and `D4`
- X̄-S limits using `A3`, `B3`, and `B4`
- EWMA dynamic limits using analyst-selected `λ` and `L`
- tabular two-sided CUSUM using analyst-selected `k` and `h`
- Nelson / WECO signal detection

### Attribute Chart Calculations

Used for `P`, `NP`, `C`, and `U` style charts, depending on data returned by the attribute endpoints.

Displayed values are driven by backend-provided counts and rates, then rendered as attribute control charts.

### Visual: Chart Summary Bar

Derived fields:

- `totalSignals = signals.length + mrSignals.length`
- `exclusionCount = excludedIndices.size`
- `capabilityHeadline = cpk if present else ppk`
- `capability mode = Empirical when quantNormality.is_normal === false, else Parametric`

What it shows:

- A one-row executive summary of the current chart: signal burden, exclusions, rule set, capability mode, and headline capability.

Why it matters:

- It helps users interpret the chart before reading individual points and makes it obvious when the chart is in a state that should be treated cautiously, such as non-normal capability or active exclusions.

Headline status chips:

- active signals: amber when `totalSignals > 0`, green otherwise
- capability headline: green when `>= 1.33`, amber when `>= 1.0`, neutral otherwise
- locked limits: informational chip only

### Visual: Capability Panel

Displayed metrics:

- `Cp`
- `Cpk`
- `Pp`
- `Ppk`
- `Cp 95% CI`
- `Cpk 95% CI`
- `Pp 95% CI`
- `Ppk 95% CI`
- `Z score`
- `DPMO`
- empirical `P0.135`, `P50`, `P99.865` when non-parametric mode is active

What it shows:

- The capability evidence for the selected characteristic, including short-term capability, long-term performance, sigma translation, confidence interval context, and non-normal percentile evidence when required.

Why it matters:

- This is the main answer to “is the process capable?” and “can I trust that answer?”, especially when the process is unstable, off-center, or non-normal.

Derived presentation logic:

- show stability warning when `signals.length + mrSignals.length > 0`
- show non-normal warning when `normality.is_normal === false`
- hide `Cp` and `Pp` for unilateral specs
- show off-center note when both `Cp` and `Cpk` exist and `abs(Cp - Cpk) > 0.05`
- show confidence-interval cards when the corresponding estimate has enough sample support

Capability tier thresholds:

- `>= 1.67` excellent
- `>= 1.33` capable
- `>= 1.00` marginal
- `< 1.00` poor

### Visual: Histogram / Empirical Evidence

The panel shows one of two secondary views:

- parametric mode: capability histogram
- non-parametric mode: empirical percentile cards

What it shows:

- Either the distribution shape against specification context or the empirical percentile evidence used for non-parametric performance.

Why it matters:

- It helps users validate whether the capability headline matches the actual shape of the data rather than treating the numeric index as a black box.

Histogram binning follows the Freedman-Diaconis rule documented in [STATISTICAL_METHODS.md](./STATISTICAL_METHODS.md).

### Visual: Chart Info Banners

These are operational state banners, not new statistical calculations:

- locked limits load/save errors
- exclusions audit errors
- exclusions audit loading state
- 10,000-point truncation warning
- persisted exclusion snapshot details

What they show:

- Analysis governance and data-quality conditions that affect interpretation, such as persisted exclusions, locked limits, truncation, or audit-loading problems.

Why they matter:

- They stop users from over-trusting a chart whose limits, exclusions, or sample completeness need contextual awareness.

### Visual: Signals Panel

Signals are generated by Nelson or WECO rule evaluation in the computation engine.

The panel is a categorized rendering of:

- point index
- violated rule
- zone / chart context
- whether the violation belongs to the primary or range chart

What it shows:

- A human-readable list of detected SPC rule breaches tied back to the chart context.

Why it matters:

- It converts dense visual signal markers into an actionable exception list that operators and engineers can discuss and audit.

### Visual: Capability Trend

Trend points are computed from rolling or segmented capability analysis over time in the controller/computation path.

Displayed intent:

- show whether capability is improving, stable, or deteriorating across the scoped history

Why it matters:

- A process can look acceptable in aggregate while trending in the wrong direction; the trend view helps catch slow deterioration and post-intervention improvement.

### Visual: Stratification Panel

The controller reruns SPC analytics on stratified subsets of the same scoped dataset.

Examples:

- by line
- by shift
- by lot
- by plant

The panel compares signal burden and capability across these subsets; the underlying formulas are the same as the main chart engine.

What it shows:

- How the same characteristic behaves across sub-populations such as line, shift, lot, or plant.

Why it matters:

- It helps identify hidden mixture effects where the overall chart looks noisy but the real issue sits in one slice of the process.

### Exclusions and Locked Limits

These are governance controls, not new formulas:

- exclusions remove selected points from recalculation after justification
- locked limits replace live control-limit calculation with persisted limits

---

## Scorecard Tab

Source data:

- `useSPCScorecard()` → `/api/spc/scorecard`

Each row represents a characteristic-level capability summary across the selected scope.

### Table Columns

Primary fields displayed:

- characteristic name
- batch count
- mean
- standard deviation
- target
- `Pp`
- `Cpk`
- `Ppk`
- `OOC rate`
- capability status

Definitions:

- `Pp`, `Ppk`, `Cp`, `Cpk`, `sigma_within`, `sigma_overall`, `z`, and `DPMO` follow [STATISTICAL_METHODS.md](./STATISTICAL_METHODS.md)
- `ooc_rate` is the backend-provided out-of-control share for the scoped characteristic

What the visual shows:

- A sortable, characteristic-by-characteristic summary of capability, performance, and control burden for the scoped material.

Why it matters:

- This is the main screening surface for identifying which MICs deserve chart-level investigation or escalation.

### Capability Status Tags

Thresholds used in the table and summary treatment:

- `>= 1.67` excellent
- `>= 1.33` capable
- `>= 1.00` marginal
- `< 1.00` poor

OOC tag thresholds:

- `> 10%` high-risk
- `> 2%` elevated
- `<= 2%` controlled

### Scorecard Summary Counts

The view groups rows by backend capability status:

- `excellent`
- `good`
- `marginal`
- `poor`

What they show:

- The distribution of characteristics across capability bands.

Why they matter:

- They summarize whether the scorecard problem is concentrated in a few MICs or spread broadly across the material.

### Triage Panel

The triage shortlist is a front-end prioritization view:

- sort rows by lowest `(cpk ?? ppk)`
- take the top 3 worst-performing characteristics

This is used to direct the next investigation step, not to calculate a new KPI.

What it shows:

- The three weakest characteristics in the current scorecard.

Why it matters:

- It reduces decision latency by turning a long table into an immediate action list.

---

## Compare Tab

Source data:

- `useCompareScorecard()` → `/api/spc/compare-scorecard`

Scope:

- 2 to 3 material IDs
- same plant filter
- same date filter

### Inclusion Logic

Only MICs present on all compared materials are shown.

Calculation:

- build the intersection of MIC IDs across all returned material scorecards

Why it matters:

- It keeps the comparison fair by ensuring the chart compares like with like instead of mixing partially overlapping characteristic sets.

### Visual: Grouped Bar Chart

Each bar is the compared material's `Ppk` for a common MIC.

Derived display logic:

- x-axis = common MIC names
- bar value = row `ppk`
- missing `ppk` renders as null

What it shows:

- A side-by-side long-term performance comparison across materials for the same shared characteristics.

Why it matters:

- It is useful for supplier comparison, process transfer, and formulation alternatives where the question is “which material behaves better on the same quality attributes?”

Bar colors:

- material palette color when `ppk >= 1.33`
- amber when `1.00 <= ppk < 1.33`
- red when `ppk < 1.00`

Reference lines:

- dashed line at `Ppk = 1.33`
- dashed line at `Ppk = 1.00`

Interpretation:

- this view compares long-term performance across materials, not short-term `Cpk`

---

## MSA Tab

Primary computation files:

- `MSAView.tsx`
- `msaCalculations.ts`
- backend parity reference: `backend/utils/msa.py`
- backend calculation endpoint: `POST /api/spc/msa/calculate`

### Input Parsing

CSV format:

- `operator, part, replicate, value`

The parser writes measurements into a 3D cube:

- `data[operator][part][replicate]`

Why it matters:

- The MSA results are only trustworthy if operator, part, and replicate structure are preserved correctly; this cube is the basis for both GRR methods.

### Method 1: Average & Range

Used by `computeGRR()`.

Key calculations:

- `rBarBar = average of operator-level average part ranges`
- `EV = rBarBar * K1`
- operator means are compared with `xBarDiff = max(opMeans) - min(opMeans)`
- `AV_raw = (xBarDiff * K2)^2 - EV^2 / (nParts * nReplicates)`
- `AV = sqrt(max(0, AV_raw))`
- `GRR = sqrt(EV^2 + AV^2)`
- `PV = (max(part means) - min(part means)) * K3`
- `TV = sqrt(GRR^2 + PV^2)`
- `%GRR = GRR / TV * 100`
- `%Tolerance = (GRR * 5.15) / tolerance * 100`
- `NDC = floor(1.41 * PV / GRR)`

### Method 2: ANOVA Gauge R&R

Used by `computeGRR_ANOVA()`.

Key calculations:

- overall grand mean
- part means
- operator means
- cell means for each operator-part combination
- sums of squares:
- `SS_part`
- `SS_operator`
- `SS_interaction`
- `SS_repeatability`
- mean squares:
- `MS_part`
- `MS_operator`
- `MS_interaction`
- `MS_repeatability`
- F-test on operator-part interaction
- interaction-significant model keeps operator-part interaction as a separate variance component
- reduced model pools interaction into repeatability when interaction is not significant

Final reported values:

- `EV` repeatability
- `AV` reproducibility
- optional operator-part interaction variation
- `GRR`
- `PV`
- `TV`
- `%GRR`
- `%Tolerance`
- `NDC`

### Visual: MSA Results Table

Displayed sigma rows:

- Repeatability `(EV)`
- Reproducibility `(AV)`
- optional `Operator × Part Interaction`
- `GRR`
- `PV`
- `TV`

Displayed `% Contribution` values are rendered as sigma share of total variation:

- `EV / TV * 100`
- `AV / TV * 100`
- `interactionVariation / TV * 100` when present
- `PV / TV * 100`
- `GRR %` row uses the already computed `%GRR`
- `TV` is fixed to `100%`

What it shows:

- A decomposition of total observed variation into measurement-system noise versus real part-to-part variation.

Why it matters:

- It answers the core MSA question: “Are we seeing process variation, or mostly gauge variation?”
- The backend parity module gives the team a governed calculation reference so MSA browser math can be regression-tested rather than existing as an unverified frontend-only path.
- The live MSA view now calls the backend calculation endpoint, so the displayed result comes from the governed backend path rather than only from local browser math.

### MSA Verdict Thresholds

Used by `grrStatusClass()`:

- `< 10%` Acceptable
- `< 30%` Conditionally Acceptable
- `>= 30%` Not Acceptable

What the verdict shows:

- A practical acceptability judgment for the measurement system.

Why it matters:

- It turns raw GRR output into an operational go/no-go decision for using the gauge in process control and release decisions.

Additional warnings:

- negative variance components trigger a system stability warning
- `NDC < 5` triggers a discrimination warning
- ANOVA reduced-model warning appears when operator-part interaction is not significant

### Save Session

Saving is operational only. It persists the computed study linked to the selected material and MIC when available.

---

## Correlation Tab

Source data:

- `useCorrelation()` → `/api/spc/correlation`
- `useCorrelationScatter()` → `/api/spc/correlation-scatter`

### Matrix Inclusion Rule

The user selects `min_batches`.

Only characteristic pairs with at least that many shared batch observations are returned.

### Core Statistic

The matrix is based on pairwise Pearson correlation:

- `pearson_r`

The frontend does not recompute correlation; it renders the backend result and ranks it.

What it shows:

- The strength and direction of linear co-movement between characteristic pairs across shared batches.

Why it matters:

- It helps users find likely coupled variables, hidden drivers, and candidate surrogate indicators before they run deeper root-cause work.

### Visual: Driver Ranking

Calculation:

- take all returned pairs with non-null `pearson_r`
- sort by `abs(pearson_r)` descending
- take top `n`, default `5`

Strength labels:

- `|r| >= 0.70` strong
- `0.40 <= |r| < 0.70` moderate
- `|r| < 0.40` weak

What it shows:

- The strongest correlation candidates in the current scope, ranked for fast scanning.

Why it matters:

- It saves users from reading the full matrix when they just need the most likely relationships to test first.

### Visual: Correlation Matrix

Each cell represents backend `pearson_r` for one MIC pair.

Visual interpretation:

- sign indicates positive or negative linear relationship
- magnitude drives color intensity
- click opens scatter validation for that pair
- when the backend reports `pair_count >= 500`, the UI warns that only the top 500 pairs by `|r|` are shown

Why it matters:

- It gives a broad map of the multivariate quality system, which is often the quickest way to spot clusters of related characteristics.

### Visual: Scatter Plot

Source:

- `/api/spc/correlation-scatter` for the selected pair

Purpose:

- validate whether a high correlation reflects a consistent operational relationship or an artifact such as drift, clustering, or outliers

The frontend renders the returned paired observations and does not derive a new statistic from them.

What it shows:

- The actual paired batch observations behind a selected correlation cell.

Why it matters:

- Correlation can be misleading; the scatter plot is the reality check that shows whether a relationship is usable or just statistically convenient.

---

## Ask Genie Tab

Primary behavior:

- sends the current SPC scope and user question to the backend Genie path
- renders message history, pending state, and starter prompts

No frontend statistical calculations occur in this tab.

What it shows:

- A conversational layer over the governed SPC data model scoped to the user’s current material, plant, MIC, and time window.

Why it matters:

- It lowers the barrier to investigation by letting users ask for trends, capability, drift, and off-condition summaries in natural language instead of navigating each visual manually.

Important semantic rule:

- Genie answers should rely on governed backend / semantic-layer measures, not on ad hoc frontend recomputation

This is especially important for:

- normal vs non-normal performance switching
- off-target vs out-of-spec vs out-of-control language
- governed capability metrics exposed through the metric layer

---

## Visuals That Are Rendering-Only

These pieces change presentation, not business meaning:

- `layoutFlowGraph()` node positioning
- ECharts axis formatting, tooltips, and color ramps
- React Flow trace highlighting
- label truncation in minimap and ranking lists
- tab navigation buttons and empty states

---

## Source of Truth Map

Use this when updating calculations:

- formal SPC formulas: [STATISTICAL_METHODS.md](./STATISTICAL_METHODS.md)
- chart computation engine: `frontend/src/spc/computeAnalytics.ts`
- chart orchestration: `frontend/src/spc/hooks/useControlChartsController.ts`
- scorecard summaries: `frontend/src/spc/scorecard/*`
- overview rollups: `frontend/src/spc/overview/OverviewPage.tsx`
- process-flow rendering: `frontend/src/spc/flow/*`
- comparison logic: `frontend/src/spc/compare/*`
- MSA math: `frontend/src/spc/msa/msaCalculations.ts`
- correlation analysis rendering: `frontend/src/spc/correlation/*` and `frontend/src/spc/charts/Correlation*.tsx`
