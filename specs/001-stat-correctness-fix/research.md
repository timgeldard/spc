# Research: Statistical Correctness & Security Hardening

## Decision: AIAG MSA Calculation Correction
- **Rationale**: The quality review identified a critical inversion bug where R-bar was being divided by K constants instead of multiplied. AIAG MSA 4th Edition Appendix B specifies `EV = R-bar * K1`.
- **Alternatives considered**: None. Standard compliance is mandatory.

## Decision: Sample Standard Deviation for Performance Indices
- **Rationale**: Pp and Ppk are defined using the sample standard deviation ($s = \sqrt{\frac{\sum(x-\bar{x})^2}{n-1}}$). Using population stddev ($n$) understates variability, especially on small sample sizes.
- **Implementation**: Replace `STDDEV_POP` with `STDDEV_SAMP` in SQL and update JS `computeCapability` to use $n-1$.

## Decision: Within-Subgroup Sigma in Scorecard
- **Rationale**: Currently, Cp/Cpk are incorrectly calculated using overall stddev in the scorecard. To fix this without fetching all raw points, we will use a SQL window function to calculate ranges between sequential batches (subgroup size = 1 for individuals) or average ranges within batches (if subgroup size > 1).
- **Technique**: Use `LAG` to compute moving ranges in SQL CTEs.

## Decision: User-Scoped Cache Hashing
- **Rationale**: To prevent data leakage, the `x-forwarded-access-token` (or a unique claim from it like `sub`) will be hashed (SHA-256) and prepended to the cache key.
- **Security**: Hashing ensures the token itself isn't stored in plain text in the cache, while providing cryptographic isolation.

## Decision: Nelson Rule 4 (Oscillation)
- **Rationale**: The rule is "14 points in a row alternating up and down". The current logic failed if the first step was downward.
- **Fix**: Use a product-of-differences approach: `(x[i] - x[i-1]) * (x[i-1] - x[i-2]) < 0` for all $i$ in the 14-point window.
