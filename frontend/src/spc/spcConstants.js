/**
 * SPC Control Chart Constants
 * Source: AIAG Statistical Process Control Reference Manual, 4th Edition.
 * Constants for subgroup charts are taken from the standard factor tables used
 * for Appendix B / control-chart constants (including the A2, d2, D3, D4
 * family referenced alongside Table III-4 usage throughout the manual).
 *
 * For each subgroup size n:
 *   d2  — expected value of range / sigma (used to estimate sigma_within from R-bar)
 *   d3  — std dev of range / sigma
 *   A2  — Xbar chart: UCL/LCL = Xbar-bar ± A2 * R-bar
 *   D3  — R chart LCL factor: LCL_R = D3 * R-bar  (0 for n ≤ 6)
 *   D4  — R chart UCL factor: UCL_R = D4 * R-bar
 *
 * For I-MR charts, n=2 is used (moving range of 2 consecutive values).
 */

export const SPC_CONSTANTS = {
  2:  { d2: 1.128, d3: 0.853, A2: 1.880, D3: 0,     D4: 3.267 },
  3:  { d2: 1.693, d3: 0.888, A2: 1.023, D3: 0,     D4: 2.574 },
  4:  { d2: 2.059, d3: 0.880, A2: 0.729, D3: 0,     D4: 2.282 },
  5:  { d2: 2.326, d3: 0.864, A2: 0.577, D3: 0,     D4: 2.114 },
  6:  { d2: 2.534, d3: 0.848, A2: 0.483, D3: 0,     D4: 2.004 },
  7:  { d2: 2.704, d3: 0.833, A2: 0.419, D3: 0.076, D4: 1.924 },
  8:  { d2: 2.847, d3: 0.820, A2: 0.373, D3: 0.136, D4: 1.864 },
  9:  { d2: 2.970, d3: 0.808, A2: 0.337, D3: 0.184, D4: 1.816 },
  10: { d2: 3.078, d3: 0.797, A2: 0.308, D3: 0.223, D4: 1.777 },
}

/**
 * Get constants for a given subgroup size. Clamps to the range [2, 10].
 * For n > 10 the app intentionally uses the n=10 constants today rather than
 * inventing an interpolation scheme without an AIAG-backed validation pass.
 * @param {number} n - subgroup size
 * @returns {{ d2, d3, A2, D3, D4 }}
 */
export function getConstants(n) {
  const clamped = Math.max(2, Math.min(10, Math.round(n)))
  return SPC_CONSTANTS[clamped]
}

/**
 * Cpk capability thresholds.
 * Matching values are defined in backend/utils/spc_thresholds.py.
 */
export const CPK_THRESHOLDS = {
  HIGHLY_CAPABLE: 1.67,
  CAPABLE: 1.33,
  MARGINAL: 1.00,
}
