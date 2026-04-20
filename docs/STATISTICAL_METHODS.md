# Statistical Methods Reference

This document provides the formal mathematical definitions, rationales, and implementation details for the statistical calculations used in the SPC Application.

---

## 1. Strategy: "Push Statistics to SQL"

The application follows a "Push Statistics to SQL" philosophy. Computationally heavy or recurring statistical logic is moved from the application layer into **Databricks Materialized Views (MVs)** and **Lakeflow Pipelines**.

*   **Performance**: Eliminates real-time window functions and NumPy pivots in the API.
*   **Consistency**: Ensures AI/BI tools (Genie, SQL Editor) use the same governed calculations as the UI.
*   **Observability**: Unity Catalog tracks the lineage of statistical outputs.

---

## 2. Process Stability (Control Charts)

Control limits distinguish between "common cause" and "special cause" variation.

### Individuals & Moving Range (I-MR)
Used for individual observations ($n=1$).
*   **CL (Center Line)**: $\bar{X} = \text{mean of all observations}$
*   **MR (Moving Range)**: $|X_i - X_{i-1}|$
*   **$\overline{MR}$**: Mean of moving ranges
*   **$\sigma_{within}$**: $\overline{MR} / d_2$ (where $d_2 = 1.128$ for $n=2$)
*   **UCL / LCL**: $\bar{X} \pm 3\sigma_{within}$

### X-bar & Range (X̄-R)
Used for subgrouped data ($n > 1$).
*   **$\bar{\bar{X}}$ (Grand Mean)**: Mean of subgroup means
*   **$\bar{R}$**: Mean of subgroup ranges
*   **$\sigma_{within}$**: $\bar{R} / d_2$ (using $d_2$ for the subgroup size $n$)
*   **UCL / LCL (X-bar)**: $\bar{\bar{X}} \pm A_2\bar{R}$

### Nelson & WECO Rule Sets
Out-of-control signals are detected using Western Electric (WECO) and Nelson rules. These are pre-computed in `spc_nelson_rule_flags_mv` using SQL window functions for high-performance scorecard rendering.

| Rule | Description | SQL Implementation (Window) |
|---|---|---|
| **Rule 1** | 1 point > 3$\sigma$ from center | `ABS(z_score) > 3` |
| **Rule 2** | 9 consecutive points on same side of center | `COUNT(sign) OVER (ROWS 8 PRECEDING)` |
| **Rule 3** | 6 consecutive points increasing or decreasing | `LAG` comparison over 5 rows |
| **Rule 4** | 14 consecutive points alternating up and down | `LAG` parity check over 13 rows |
| **Rule 5** | 2 of 3 consecutive points > 2$\sigma$ (Zone A) | `SUM(in_zone_a) OVER (ROWS 2 PRECEDING)` |
| **Rule 6** | 4 of 5 consecutive points > 1$\sigma$ (Zone B) | `SUM(in_zone_b) OVER (ROWS 4 PRECEDING)` |
| **Rule 7** | 15 consecutive points within 1$\sigma$ (Zone C) | `COUNT(in_zone_c) OVER (ROWS 14 PRECEDING)` |
| **Rule 8** | 8 consecutive points > 1$\sigma$ both sides | `COUNT(out_zone_c) OVER (ROWS 7 PRECEDING)` |

---

## 3. Process Capability

Capability measures the ability of a process to meet specifications (USL/LSL/Target).

### Indices (Cp, Cpk, Pp, Ppk)
*   **$C_p / P_p$**: Potential/Overall capability. $\frac{USL - LSL}{6\sigma}$
*   **$C_{pk} / P_{pk}$**: Actual capability. $\min\left(\frac{USL - \mu}{3\sigma}, \frac{\mu - LSL}{3\sigma}\right)$
*   **$\sigma$ Choice**: $C_p$ uses $\sigma_{within}$ (short-term); $P_p$ uses $\sigma_{overall}$ (long-term sample standard deviation).

### Taguchi Capability ($C_{pm}$)
Accounts for the "loss to society" when a process is off-target ($T$), even if stable.
$$C_{pm} = \frac{C_p}{\sqrt{1 + \left(\frac{\mu - T}{\sigma}\right)^2}}$$

### Capability Confidence Intervals (Montgomery)
95% confidence intervals are pre-computed in the gold layer (`spc_capability_detail_mv`) using the chi-squared distribution:
*   **Lower Bound**: $C_{pk} \cdot \sqrt{\frac{\chi^2_{\alpha/2, n-1}}{n-1}}$
*   **Upper Bound**: $C_{pk} \cdot \sqrt{\frac{\chi^2_{1-\alpha/2, n-1}}{n-1}}$

---

## 4. Measurement Systems Analysis (MSA / Gage R&R)

The MSA module (implemented in `backend/utils/msa.py`) evaluates the measurement system itself.

### Components of Variation
*   **Repeatability (EV)**: Equipment variation within one appraiser.
*   **Reproducibility (AV)**: Variation between different appraisers.
*   **GRR**: Combined R&R variation. $GRR = \sqrt{EV^2 + AV^2}$
*   **Part-to-Part (PV)**: Actual product variation.
*   **Total Variation (TV)**: $\sqrt{GRR^2 + PV^2}$

### Acceptance Criteria
*   **%GRR < 10%**: Excellent.
*   **%GRR > 30%**: Unacceptable.
*   **NDC (Number of Distinct Categories)**: $1.41 \cdot \frac{PV}{GRR}$. Must be $\ge 5$.

### Methods
1.  **Average & Range**: Fast, uses $K$ factors ($d_2$ constants).
    *   **Current Reality (Technical Debt)**: As identified in `QUALITY_REVIEW_2026-04-03`, this bug exists in both the frontend implementation (`frontend/src/spc/msa/msaCalculations.ts`) and the backend module (`backend/utils/msa.py`). Both currently use division by K-constants ($1/d_2^*$) instead of the required multiplication. This results in standard deviations being used where variation widths (widths covering 99.73% or 99.0% of the distribution) are expected, yielding systematically incorrect %GRR and NDC values.
2.  **ANOVA**: Preferred; decomposes interaction effects between Operator and Part.

---

## 5. Multivariate SPC (Hotelling's T²)

Surfaces coordinated process drift across multiple MICs using **Hotelling's T²** (implemented in `backend/utils/multivariate.py`).

### Statistic
Given an observation vector $x_i \in \mathbb{R}^p$:
$$T_i^2 = (x_i - \mu)^T S^{-1} (x_i - \mu)$$
The implementation uses the **Moore-Penrose pseudo-inverse** for stability with correlated variables.

### Contribution Decomposition
Outliers are decomposed into variable-level signed contributions:
$$c_i = (x_i - \mu) \odot \left(S^{-1}(x_i - \mu)\right)$$

---

## 6. Handling Non-Gaussian Distributions

If data is non-normal, the engine falls back to the **ISO 22514-2** (Percentile Method).

### Normality Trigger
A **Shapiro-Wilk** test is executed ($N \le 5000$). If $p < 0.05$, the dataset is flagged.

### Non-Parametric Capability
*   **Bounds**: Replace $\pm 3\sigma$ with $P_{0.135}$ and $P_{99.865}$ percentiles.
*   **Median**: Replace mean with the median ($P_{50}$).
*   **$P_{pk}$ (Non-Parametric)**:
    $$\min\left(\frac{USL - P_{50}}{P_{99.865} - P_{50}}, \frac{P_{50} - LSL}{P_{50} - P_{0.135}}\right)$$

### Governed Metric-View Rule
The semantic layer (`spc_quality_metrics`) enforces safety for AI/BI consumers:
*   **`pp_gaussian` / `ppk_gaussian`**: Explicit parametric measures.
*   **`pp` / `ppk`**: Governed measures that switch based on `normality_type`.
*   If normality is unknown or mixed, the governed measure returns `NULL` to prevent misleading Gaussian results in Genie/GenAI responses.

---

## 7. Implementation Details & Known Debt

### Statistical Logic Gaps
As identified in the `QUALITY_REVIEW_2026-04-03` audit, the following critical gaps exist in the current implementation:

*   **$C_p$ vs $P_p$ Collapse**: In the scorecard and export modules, $C_p/C_{pk}$ and $P_p/P_{pk}$ are currently mathematically identical. This is because the implementation incorrectly uses the **Population Standard Deviation** ($\sigma_{overall}$) as a proxy for **Within-Subgroup Sigma** ($\sigma_{within}$). True $C_p$ requires an estimate from $R/d_2$ or pooled subgroup variance, which is not yet available in the aggregate scorecard paths.
*   **Population Denominator (N)**: $P_p/P_{pk}$ calculations currently use the $N$ (Population) denominator for standard deviation instead of the $N-1$ (Sample) standard required by AIAG. Using population standard deviation understates variability and artificially inflates capability indices, particularly for the small sample sizes common in batch manufacturing.

### Histogram Binning
Based on the **Freedman-Diaconis rule** ($2 \cdot IQR \cdot n^{-1/3}$) for robustness against skewed manufacturing data and heavy tails.

### Specification Drift
Monitors changes in `USL`, `LSL`, or `TARGET` across batches via `spc_spec_drift_v`. Alerts users if specs have changed within the chart's date window.

### Control Limit History
Visualizes the evolution of process limits by joining `spc_locked_limits` with calculated limits in `spc_control_limit_history_v`.
ndow.

### Control Limit History
Visualizes the evolution of process limits by joining `spc_locked_limits` with calculated limits in `spc_control_limit_history_v`.
