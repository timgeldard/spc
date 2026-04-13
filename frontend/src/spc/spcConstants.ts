/**
 * SPC Control Chart Constants
 * Source: AIAG Statistical Process Control Reference Manual, 4th Edition.
 * Constants for subgroup charts are taken from the standard factor tables used
 * for Appendix B / control-chart constants (including the A2, d2, D3, D4
 * family referenced alongside Table III-4 usage throughout the manual).
 */

export interface SPCConstantSet {
  d2: number
  d3: number
  c4: number
  A2: number
  A3: number
  D3: number
  D4: number
  B3: number
  B4: number
}

export const SPC_CONSTANTS: Record<number, SPCConstantSet> = {
  2: { d2: 1.128, d3: 0.853, c4: 0.7979, A2: 1.880, A3: 2.659, D3: 0, D4: 3.267, B3: 0, B4: 3.267 },
  3: { d2: 1.693, d3: 0.888, c4: 0.8862, A2: 1.023, A3: 1.954, D3: 0, D4: 2.574, B3: 0, B4: 2.568 },
  4: { d2: 2.059, d3: 0.880, c4: 0.9213, A2: 0.729, A3: 1.628, D3: 0, D4: 2.282, B3: 0, B4: 2.266 },
  5: { d2: 2.326, d3: 0.864, c4: 0.9400, A2: 0.577, A3: 1.427, D3: 0, D4: 2.114, B3: 0, B4: 2.089 },
  6: { d2: 2.534, d3: 0.848, c4: 0.9515, A2: 0.483, A3: 1.287, D3: 0, D4: 2.004, B3: 0.030, B4: 1.970 },
  7: { d2: 2.704, d3: 0.833, c4: 0.9594, A2: 0.419, A3: 1.182, D3: 0.076, D4: 1.924, B3: 0.118, B4: 1.882 },
  8: { d2: 2.847, d3: 0.820, c4: 0.9650, A2: 0.373, A3: 1.099, D3: 0.136, D4: 1.864, B3: 0.185, B4: 1.815 },
  9: { d2: 2.970, d3: 0.808, c4: 0.9693, A2: 0.337, A3: 1.032, D3: 0.184, D4: 1.816, B3: 0.239, B4: 1.761 },
  10: { d2: 3.078, d3: 0.797, c4: 0.9727, A2: 0.308, A3: 0.975, D3: 0.223, D4: 1.777, B3: 0.284, B4: 1.716 },
}

export function getConstants(n: number): SPCConstantSet {
  const clamped = Math.max(2, Math.min(10, Math.round(n)))
  return SPC_CONSTANTS[clamped]
}

export const CPK_THRESHOLDS = {
  HIGHLY_CAPABLE: 1.67,
  CAPABLE: 1.33,
  MARGINAL: 1.0,
} as const
