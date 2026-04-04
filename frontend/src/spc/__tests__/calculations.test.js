import { describe, it, expect } from 'vitest'
import {
  mean,
  stddevPop,
  stddevSample,
  computeIMR,
  computeXbarR,
  groupIntoSubgroups,
  computeCapability,
  detectWECORules,
  detectNelsonRules,
} from '../calculations.js'
import { computeGRR } from '../msa/msaCalculations.js'

// ---------------------------------------------------------------------------
// mean
// ---------------------------------------------------------------------------
describe('mean', () => {
  it('returns null for empty array', () => {
    expect(mean([])).toBeNull()
  })

  it('returns null for null input', () => {
    expect(mean(null)).toBeNull()
  })

  it('computes mean of a single value', () => {
    expect(mean([5])).toBe(5)
  })

  it('computes mean of multiple values', () => {
    expect(mean([1, 2, 3, 4, 5])).toBe(3)
  })
})

// ---------------------------------------------------------------------------
// stddevPop
// ---------------------------------------------------------------------------
describe('stddevPop', () => {
  it('returns null for empty array', () => {
    expect(stddevPop([])).toBeNull()
  })

  it('returns null for single value', () => {
    expect(stddevPop([5])).toBeNull()
  })

  it('returns 0 for all identical values', () => {
    expect(stddevPop([3, 3, 3, 3])).toBe(0)
  })

  it('computes population stddev correctly', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] has mean=5, σ=2 (well-known example)
    const result = stddevPop([2, 4, 4, 4, 5, 5, 7, 9])
    expect(result).toBeCloseTo(2, 5)
  })
})

// ---------------------------------------------------------------------------
// computeIMR
// ---------------------------------------------------------------------------
describe('computeIMR', () => {
  it('returns null for fewer than 2 values', () => {
    expect(computeIMR([5])).toBeNull()
    expect(computeIMR([])).toBeNull()
  })

  it('returns an object with the expected keys', () => {
    const result = computeIMR([10, 11, 9, 10, 12])
    expect(result).toHaveProperty('xBar')
    expect(result).toHaveProperty('mrBar')
    expect(result).toHaveProperty('sigmaWithin')
    expect(result).toHaveProperty('ucl_x')
    expect(result).toHaveProperty('lcl_x')
    expect(result).toHaveProperty('ucl_mr')
    expect(result).toHaveProperty('movingRanges')
  })

  it('produces exactly n-1 moving ranges', () => {
    const values = [10, 11, 9, 10, 12]
    const result = computeIMR(values)
    expect(result.movingRanges).toHaveLength(values.length - 1)
  })

  it('UCL > xBar > LCL for well-separated data', () => {
    const values = [10, 11, 9, 10, 12, 10, 11, 9]
    const result = computeIMR(values)
    expect(result.ucl_x).toBeGreaterThan(result.xBar)
    expect(result.lcl_x).toBeLessThan(result.xBar)
  })

  it('computes xBar as the mean of input values', () => {
    const values = [8, 10, 12]
    const result = computeIMR(values)
    expect(result.xBar).toBeCloseTo(10, 5)
  })
})

// ---------------------------------------------------------------------------
// groupIntoSubgroups
// ---------------------------------------------------------------------------
describe('groupIntoSubgroups', () => {
  it('groups points by batch_seq', () => {
    const points = [
      { batch_seq: 1, batch_id: 'B1', batch_date: '2024-01-01', value: 10 },
      { batch_seq: 1, batch_id: 'B1', batch_date: '2024-01-01', value: 12 },
      { batch_seq: 2, batch_id: 'B2', batch_date: '2024-01-02', value: 11 },
    ]
    const groups = groupIntoSubgroups(points)
    expect(groups).toHaveLength(2)
    expect(groups[0].values).toEqual([10, 12])
    expect(groups[1].values).toEqual([11])
  })

  it('returns groups sorted by batchSeq', () => {
    const points = [
      { batch_seq: 3, batch_id: 'B3', batch_date: '2024-01-03', value: 5 },
      { batch_seq: 1, batch_id: 'B1', batch_date: '2024-01-01', value: 5 },
      { batch_seq: 2, batch_id: 'B2', batch_date: '2024-01-02', value: 5 },
    ]
    const groups = groupIntoSubgroups(points)
    expect(groups.map(g => g.batchSeq)).toEqual([1, 2, 3])
  })
})

// ---------------------------------------------------------------------------
// computeXbarR
// ---------------------------------------------------------------------------
describe('computeXbarR', () => {
  it('returns null for fewer than 2 subgroups', () => {
    expect(computeXbarR([{ batchSeq: 1, values: [10, 11] }])).toBeNull()
    expect(computeXbarR([])).toBeNull()
  })

  it('returns chart limits for valid subgroups', () => {
    const subgroups = [
      { batchSeq: 1, batchId: 'B1', batchDate: '2024-01-01', values: [10, 11, 9] },
      { batchSeq: 2, batchId: 'B2', batchDate: '2024-01-02', values: [10, 12, 11] },
      { batchSeq: 3, batchId: 'B3', batchDate: '2024-01-03', values: [9, 10, 11] },
    ]
    const result = computeXbarR(subgroups)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('grandMean')
    expect(result).toHaveProperty('ucl_x')
    expect(result).toHaveProperty('lcl_x')
    expect(result).toHaveProperty('ucl_r')
  })
})

// ---------------------------------------------------------------------------
// computeCapability
// ---------------------------------------------------------------------------
describe('computeCapability', () => {
  it('returns nulls when insufficient data', () => {
    const result = computeCapability([1, 2, 3], 10, 2, 0.5)
    expect(result.cp).toBeNull()
    expect(result.cpk).toBeNull()
  })

  it('returns nulls when tolerance is 0', () => {
    const values = Array.from({ length: 10 }, () => 10)
    const result = computeCapability(values, 10, 0, 0.3)
    expect(result.cp).toBeNull()
    expect(result.cpk).toBeNull()
  })

  it('computes capability indices for centred process', () => {
    // Process centred on nominal with sigmaWithin = 1, spec ±3 → Cp = Cpk = 1
    const values = Array.from({ length: 10 }, (_, i) => 10 + (i % 3) - 1) // near-centred
    const nominal = 10
    const tolerance = 3
    const sigmaWithin = 1
    const result = computeCapability(values, nominal, tolerance, sigmaWithin)
    expect(result.cp).toBeCloseTo(1, 0)
    expect(result.usl).toBe(13)
    expect(result.lsl).toBe(7)
  })

  it('Cpk < Cp when process is off-centre', () => {
    const values = [11, 11.5, 12, 11, 12.5, 11, 11, 12, 11.5, 12]
    const nominal = 10
    const tolerance = 3
    const sigmaWithin = 0.5
    const result = computeCapability(values, nominal, tolerance, sigmaWithin)
    expect(result.cpk).toBeLessThan(result.cp)
  })

  it('includes dpmo_convention field disclosing Motorola 1.5σ shift', () => {
    const values = Array.from({ length: 20 }, () => 10)
    const result = computeCapability(values, 10, 3, 1)
    expect(result.dpmo_convention).toBe('motorola_1.5sigma_shift')
  })

  it('uses sample stddev (N-1) for Pp/Ppk, not population stddev', () => {
    // Verify sigmaOverall uses stddevSample by comparing to manual calculation
    const values = [8, 9, 10, 11, 12]
    const expectedSigma = stddevSample(values) // N-1 denominator
    const result = computeCapability(values, 10, 3, 1)
    // Pp = (USL - LSL) / (6 * sigmaOverall)
    const usl = 13, lsl = 7
    const expectedPp = (usl - lsl) / (6 * expectedSigma)
    expect(result.pp).toBeCloseTo(expectedPp, 5)
  })
})

// ---------------------------------------------------------------------------
// stddevSample
// ---------------------------------------------------------------------------
describe('stddevSample', () => {
  it('returns null for empty array', () => {
    expect(stddevSample([])).toBeNull()
  })

  it('returns null for single value', () => {
    expect(stddevSample([5])).toBeNull()
  })

  it('returns 0 for all identical values', () => {
    expect(stddevSample([3, 3, 3, 3])).toBe(0)
  })

  it('computes sample stddev with N-1 denominator', () => {
    // [2, 4, 4, 4, 5, 5, 7, 9] mean=5
    // sum of squared deviations = 9+1+1+1+0+0+4+16 = 32
    // sample variance = 32 / (8-1) ≈ 4.571
    // sample stddev ≈ 2.138
    const result = stddevSample([2, 4, 4, 4, 5, 5, 7, 9])
    expect(result).toBeCloseTo(2.138, 2)
  })

  it('is always >= stddevPop for the same data', () => {
    const values = [1, 3, 5, 7, 9, 11]
    expect(stddevSample(values)).toBeGreaterThan(stddevPop(values))
  })
})

// ---------------------------------------------------------------------------
// WECO rule detection
// ---------------------------------------------------------------------------
describe('detectWECORules', () => {
  const makeLimits = (cl, sigma) => ({
    cl,
    ucl: cl + 3 * sigma,
    lcl: cl - 3 * sigma,
    sigma1: sigma,
    sigma2: 2 * sigma,
  })

  it('returns empty array when no violations', () => {
    const values = [10, 10, 10, 10, 10, 10, 10, 10, 10, 10]
    const signals = detectWECORules(values, makeLimits(10, 1))
    expect(signals).toEqual([])
  })

  it('Rule 1: detects single point beyond ±3σ', () => {
    const cl = 10, sigma = 1
    const values = [10, 10, 14, 10, 10]  // 14 > ucl=13
    const signals = detectWECORules(values, makeLimits(cl, sigma))
    const r1 = signals.filter(s => s.rule === 1)
    expect(r1.length).toBeGreaterThan(0)
    expect(r1[0].indices).toContain(2)
  })

  it('Rule 2: detects 2 of 3 consecutive beyond +2σ', () => {
    const cl = 10, sigma = 1
    // points at indices 0,1,2: 12.5, 12.5, 10 — two beyond +2σ
    const values = [12.5, 12.5, 10, 10, 10]
    const signals = detectWECORules(values, makeLimits(cl, sigma))
    const r2 = signals.filter(s => s.rule === 2)
    expect(r2.length).toBeGreaterThan(0)
  })

  it('Rule 4: detects 8 consecutive points on the same side', () => {
    const cl = 10, sigma = 1
    // All 8 points above CL
    const values = [11, 11, 11, 11, 11, 11, 11, 11]
    const signals = detectWECORules(values, makeLimits(cl, sigma))
    const r4 = signals.filter(s => s.rule === 4)
    expect(r4.length).toBeGreaterThan(0)
    expect(r4[0].indices).toHaveLength(8)
  })

  it('Rule 4: detects 8 consecutive below CL', () => {
    const cl = 10, sigma = 1
    const values = [9, 9, 9, 9, 9, 9, 9, 9]
    const signals = detectWECORules(values, makeLimits(cl, sigma))
    const r4 = signals.filter(s => s.rule === 4)
    expect(r4.length).toBeGreaterThan(0)
  })
})

// ---------------------------------------------------------------------------
// Nelson Rule 4 — both directions
// ---------------------------------------------------------------------------
describe('detectNelsonRules Rule 4 (alternating up/down)', () => {
  const makeLimits = (cl, sigma) => ({
    cl,
    ucl: cl + 3 * sigma,
    lcl: cl - 3 * sigma,
    sigma1: sigma,
    sigma2: 2 * sigma,
  })

  it('detects up-first alternating pattern', () => {
    // up-first: 11, 9, 11, 9, 11, 9, 11, 9, 11, 9, 11, 9, 11, 9
    const cl = 10, sigma = 1
    const values = [11,9,11,9,11,9,11,9,11,9,11,9,11,9]
    const signals = detectNelsonRules(values, makeLimits(cl, sigma))
    const r4 = signals.filter(s => s.rule === 4)
    expect(r4.length).toBeGreaterThan(0)
  })

  it('detects down-first alternating pattern', () => {
    // down-first: 9, 11, 9, 11, 9, 11, 9, 11, 9, 11, 9, 11, 9, 11
    const cl = 10, sigma = 1
    const values = [9,11,9,11,9,11,9,11,9,11,9,11,9,11]
    const signals = detectNelsonRules(values, makeLimits(cl, sigma))
    const r4 = signals.filter(s => s.rule === 4)
    expect(r4.length).toBeGreaterThan(0)
  })

  it('does NOT flag a non-alternating sequence', () => {
    const cl = 10, sigma = 1
    // flat then alternating — less than 14 consecutive alternating points
    const values = [10, 10, 10, 11, 9, 11, 9, 11, 9, 11, 9, 11, 9, 11]
    const signals = detectNelsonRules(values, makeLimits(cl, sigma))
    // The last 13 could not be 14 alternating from start
    // Check that we don't have a false positive starting at index 0
    const r4 = signals.filter(s => s.rule === 4)
    // indices 0-13 include [10,10,10,...] which breaks alternation
    r4.forEach(sig => {
      expect(sig.indices[0]).toBeGreaterThan(0)
    })
  })
})

// ---------------------------------------------------------------------------
// MSA Gauge R&R — numerical accuracy
// ---------------------------------------------------------------------------
describe('computeGRR', () => {
  // Standard AIAG MSA example: 3 operators × 10 parts × 2 replicates
  // Hand-calculated expected values for a synthetic dataset

  it('returns error for insufficient dimensions', () => {
    const result = computeGRR([[[1, 2]]], 5)  // only 1 operator
    expect(result.error).toBeDefined()
  })

  it('computes EV, AV, GRR, PV components for 2op × 2part × 2rep', () => {
    // Operator A: part1=[10,10], part2=[20,20]; Operator B: part1=[10,10], part2=[20,20]
    // R̄ per op = 0 for all (identical replicates), so EV = 0
    const data = [
      [[10, 10], [20, 20]],  // operator A
      [[10, 10], [20, 20]],  // operator B
    ]
    const result = computeGRR(data, 20)
    expect(result.error).toBeUndefined()
    expect(result.ev).toBeCloseTo(0, 5)  // no within-replicate variation
    expect(result.av).toBeCloseTo(0, 5)  // operators identical
    expect(result.grr).toBeCloseTo(0, 5)
    expect(result.pv).toBeGreaterThan(0)  // parts differ (10 vs 20)
  })

  it('EV increases with replicate spread', () => {
    // Operator A: large replicate spread; Operator B: same
    const data = [
      [[10, 12], [20, 22]],  // R=2 per part
      [[10, 12], [20, 22]],
    ]
    const zeroData = [
      [[10, 10], [20, 20]],
      [[10, 10], [20, 20]],
    ]
    const result1 = computeGRR(data, 20)
    const result0 = computeGRR(zeroData, 20)
    expect(result1.ev).toBeGreaterThan(result0.ev)
  })

  it('AV increases with operator mean difference', () => {
    // Operators reading the same parts differently
    const dataLowBias = [
      [[10, 10], [20, 20]],  // op A mean = 15
      [[11, 11], [21, 21]],  // op B mean = 16
    ]
    const dataHighBias = [
      [[10, 10], [20, 20]],  // op A mean = 15
      [[15, 15], [25, 25]],  // op B mean = 20
    ]
    const r1 = computeGRR(dataLowBias, 20)
    const r2 = computeGRR(dataHighBias, 20)
    expect(r2.av).toBeGreaterThan(r1.av)
  })

  it('K constants are applied as multiplication (not division)', () => {
    // K1(2 reps) = 0.8862. With rBarBar=2: EV should be 2*0.8862 ≈ 1.7724
    // If division were used: EV = 2/0.8862 ≈ 2.257 — clearly different
    const data = [
      [[10, 12], [20, 22]],  // R=2 per part, rBarBar=2
      [[10, 12], [20, 22]],
    ]
    const result = computeGRR(data, 20)
    // rBarBar = 2, K1(2 reps) = 0.8862
    expect(result.ev).toBeCloseTo(2 * 0.8862, 3)
  })
})
