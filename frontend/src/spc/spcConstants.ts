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
  A2: number
  D3: number
  D4: number
}

export const SPC_CONSTANTS: Record<number, SPCConstantSet> = {
  2: { d2: 1.128, d3: 0.853, A2: 1.880, D3: 0, D4: 3.267 },
  3: { d2: 1.693, d3: 0.888, A2: 1.023, D3: 0, D4: 2.574 },
  4: { d2: 2.059, d3: 0.880, A2: 0.729, D3: 0, D4: 2.282 },
  5: { d2: 2.326, d3: 0.864, A2: 0.577, D3: 0, D4: 2.114 },
  6: { d2: 2.534, d3: 0.848, A2: 0.483, D3: 0, D4: 2.004 },
  7: { d2: 2.704, d3: 0.833, A2: 0.419, D3: 0.076, D4: 1.924 },
  8: { d2: 2.847, d3: 0.820, A2: 0.373, D3: 0.136, D4: 1.864 },
  9: { d2: 2.970, d3: 0.808, A2: 0.337, D3: 0.184, D4: 1.816 },
  10: { d2: 3.078, d3: 0.797, A2: 0.308, D3: 0.223, D4: 1.777 },
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
