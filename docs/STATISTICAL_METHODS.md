# Statistical Methods Reference

This document provides the formal mathematical definitions and rationales for the statistical calculations used in the SPC Application.

---

## 1. Process Stability (Control Charts)

Control limits are calculated to distinguish between "common cause" and "special cause" variation.

### Individuals & Moving Range (I-MR)
Used when data is collected as individual observations ($n=1$).
*   **CL (Center Line)**: $\bar{X} = \text{mean of all observations}$
*   **MR (Moving Range)**: $|X_i - X_{i-1}|$
*   **$\overline{MR}$**: Mean of moving ranges
*   **$\sigma_{within}$**: $\overline{MR} / d_2$ (where $d_2 = 1.128$ for $n=2$)
*   **UCL / LCL**: $\bar{X} \pm 3\sigma_{within}$

### X-bar & Range (X̄-R)
Used when data is collected in subgroups ($n > 1$).
*   **$\bar{\bar{X}}$ (Grand Mean)**: Mean of subgroup means
*   **$\bar{R}$**: Mean of subgroup ranges
*   **$\sigma_{within}$**: $\bar{R} / d_2$ (using $d_2$ for the subgroup size $n$)
*   **UCL / LCL (X-bar)**: $\bar{\bar{X}} \pm A_2\bar{R}$
*   **UCL / LCL (Range)**: $D_4\bar{R}$ and $D_3\bar{R}$

---

## 2. Process Capability

Capability measures the ability of a process to meet customer specifications (USL/LSL).

### Long-term Performance ($P_p / P_{pk}$)
Measures "what the customer actually receives" over time.
*   **$\sigma_{overall}$**: Sample standard deviation ($s = \sqrt{\frac{\sum(X_i - \bar{X})^2}{N-1}}$)
*   **$P_p$**: $\frac{USL - LSL}{6\sigma_{overall}}$
*   **$P_{pk}$**: $\min\left(\frac{USL - \bar{X}}{3\sigma_{overall}}, \frac{\bar{X} - LSL}{3\sigma_{overall}}\right)$

### Short-term Capability ($C_p / C_{pk}$)
Measures the "potential" of the process if all special causes were removed.
*   **$\sigma_{within}$**: Derived from $\overline{MR}/d_2$ or $\bar{R}/d_2$
*   **$C_p$**: $\frac{USL - LSL}{6\sigma_{within}}$
*   **$C_{pk}$**: $\min\left(\frac{USL - \bar{X}}{3\sigma_{within}}, \frac{\bar{X} - LSL}{3\sigma_{within}}\right)$

---

## 3. Handling Non-Gaussian Distributions

When data is non-normal, the assumption that $99.73\%$ of data falls within $\mu \pm 3\sigma$ is false.

### Normality Trigger
The application executes a **Shapiro-Wilk** test on the dataset ($N \le 5000$).
*   If $p < 0.05$, the dataset is flagged as **Non-Normal**.
*   The UI displays a stability warning.

### Non-Parametric Capability Override
For non-normal data, the engine falls back to the **ISO 22514-2** (Percentile Method):
*   **Bounds**: Replace $\pm 3\sigma$ with the empirical $0.135\%$ and $99.865\%$ percentiles ($P_{0.135}, P_{99.865}$).
*   **Median**: Replace mean with the median ($P_{50}$).
*   **Non-Parametric $P_{pk}$**:
    $$\min\left(\frac{USL - P_{50}}{P_{99.865} - P_{50}}, \frac{P_{50} - LSL}{P_{50} - P_{0.135}}\right)$$

---

## 4. Nelson & WECO Rule Sets

The application detects out-of-control signals using standard rule sets.

| Rule | Description | Pattern Type |
|---|---|---|
| **Rule 1** | 1 point > 3$\sigma$ from center | Extreme outlier |
| **Rule 2** | 9 consecutive points on same side of center | Mean shift |
| **Rule 3** | 6 consecutive points increasing or decreasing | Trend |
| **Rule 4** | 14 consecutive points alternating up and down | Systematic variation |
| **Rule 5** | 2 of 3 consecutive points > 2$\sigma$ (Zone A) | Early shift warning |
| **Rule 6** | 4 of 5 consecutive points > 1$\sigma$ (Zone B) | Moderate shift warning |
| **Rule 7** | 15 consecutive points within 1$\sigma$ (Zone C) | Stratification / low variation |
| **Rule 8** | 8 consecutive points > 1$\sigma$ both sides | Mixture pattern |
