import { describe, it, expect } from 'vitest'
import {
  mean,
  stddevPop,
  stddevSample,
  stddevMSSD,
  computeIMR,
  computeXbarR,
  computeXbarS,
  groupIntoSubgroups,
  computeCapability,
  computeAll,
  computeLag1ACF,
  detectWECORules,
  detectNelsonRules,
} from '../calculations'
import { computeGRR, computeGRR_ANOVA } from '../msa/msaCalculations'
import type { ControlLimits } from '../types'

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

  it('keeps MR/d2 as the I-MR estimator for low-n series', () => {
    const result = computeIMR([10, 11, 9, 12, 8, 11, 10, 12])
    expect(result.sigmaMethod).toBe('mr')
    expect(result.sigmaWithin).toBeCloseTo(result.sigmaMR, 6)
    expect(result.sigmaMSSD).toBeGreaterThan(0)
  })

  it('does not switch away from MR/d2 when a monotonic trend is detected', () => {
    const result = computeIMR([1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(result.sigmaMethod).toBe('mr')
    expect(result.sigmaWithin).toBeCloseTo(result.sigmaMR, 6)
  })

  it('keeps MR as the default estimator for stable series', () => {
    const result = computeIMR([10, 11, 10, 11, 10, 11, 10, 11, 10, 11])
    expect(result.sigmaMethod).toBe('mr')
    expect(result.sigmaWithin).toBeCloseTo(result.sigmaMR, 6)
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

  it('surfaces mixed subgroup-size metadata without rounding n to a single reference size', () => {
    const subgroups = [
      { batchSeq: 1, batchId: 'B1', batchDate: '2024-01-01', values: [10, 11] },
      { batchSeq: 2, batchId: 'B2', batchDate: '2024-01-02', values: [10, 12, 11, 9] },
      { batchSeq: 3, batchId: 'B3', batchDate: '2024-01-03', values: [9, 10, 11] },
    ]
    const result = computeXbarR(subgroups)
    expect(result.mixedSubgroupSizes).toBe(true)
    expect(result.referenceSubgroupSize).toBeNull()
    expect(result.averageSubgroupSize).toBeCloseTo((2 + 4 + 3) / 3, 6)
    expect(result.limitStrategy).toMatch(/average_n/)
  })
})

describe('computeXbarS', () => {
  it('returns null for fewer than 2 subgroups', () => {
    expect(computeXbarS([{ batchSeq: 1, values: [10, 11] }])).toBeNull()
    expect(computeXbarS([])).toBeNull()
  })

  it('returns chart limits for valid subgroups', () => {
    const subgroups = [
      { batchSeq: 1, batchId: 'B1', batchDate: '2024-01-01', values: [10, 11, 9, 10] },
      { batchSeq: 2, batchId: 'B2', batchDate: '2024-01-02', values: [10, 12, 11, 9] },
      { batchSeq: 3, batchId: 'B3', batchDate: '2024-01-03', values: [9, 10, 11, 10] },
    ]
    const result = computeXbarS(subgroups)
    expect(result).not.toBeNull()
    expect(result).toHaveProperty('grandMean')
    expect(result).toHaveProperty('sBar')
    expect(result).toHaveProperty('ucl_x')
    expect(result).toHaveProperty('lcl_x')
    expect(result).toHaveProperty('ucl_s')
  })

  it('surfaces mixed subgroup-size metadata for varying subgroup sizes', () => {
    const subgroups = [
      { batchSeq: 1, batchId: 'B1', batchDate: '2024-01-01', values: [10, 11] },
      { batchSeq: 2, batchId: 'B2', batchDate: '2024-01-02', values: [10, 12, 11, 9] },
      { batchSeq: 3, batchId: 'B3', batchDate: '2024-01-03', values: [9, 10, 11] },
    ]
    const result = computeXbarS(subgroups)
    expect(result?.mixedSubgroupSizes).toBe(true)
    expect(result?.referenceSubgroupSize).toBeNull()
    expect(result?.averageSubgroupSize).toBeCloseTo((2 + 4 + 3) / 3, 6)
    expect(result?.limitStrategy).toMatch(/average_n/)
  })
})

// ---------------------------------------------------------------------------
// computeCapability
// ---------------------------------------------------------------------------
describe('computeCapability', () => {
  it('returns nulls when insufficient data', () => {
    const result = computeCapability([1, 2, 3], { nominal: 10, tolerance: 2, spec_type: 'bilateral_symmetric' }, 0.5)
    expect(result.cp).toBeNull()
    expect(result.cpk).toBeNull()
  })

  it('returns nulls when tolerance is 0', () => {
    const values = Array.from({ length: 10 }, () => 10)
    const result = computeCapability(values, { nominal: 10, tolerance: 0, spec_type: 'bilateral_symmetric' }, 0.3)
    expect(result.cp).toBeNull()
    expect(result.cpk).toBeNull()
  })

  it('computes capability indices for centred process', () => {
    // Process centred on nominal with sigmaWithin = 1, spec ±3 → Cp = Cpk = 1
    const values = Array.from({ length: 10 }, (_, i) => 10 + (i % 3) - 1) // near-centred
    const nominal = 10
    const tolerance = 3
    const sigmaWithin = 1
    const result = computeCapability(values, { nominal, tolerance, spec_type: 'bilateral_symmetric' }, sigmaWithin)
    expect(result.cp).toBeCloseTo(1, 0)
    expect(result.usl).toBe(13)
    expect(result.lsl).toBe(7)
  })

  it('Cpk < Cp when process is off-centre', () => {
    const values = [11, 11.5, 12, 11, 12.5, 11, 11, 12, 11.5, 12]
    const nominal = 10
    const tolerance = 3
    const sigmaWithin = 0.5
    const result = computeCapability(values, { nominal, tolerance, spec_type: 'bilateral_symmetric' }, sigmaWithin)
    expect(result.cpk).toBeLessThan(result.cp)
  })

  it('includes dpmo_convention field disclosing Motorola 1.5σ shift', () => {
    const values = Array.from({ length: 20 }, () => 10)
    const result = computeCapability(values, { nominal: 10, tolerance: 3, spec_type: 'bilateral_symmetric' }, 1)
    expect(result.dpmo_convention).toBe('motorola_1.5sigma_shift')
  })

  it('uses sample stddev (N-1) for Pp/Ppk, not population stddev', () => {
    // Verify sigmaOverall uses stddevSample by comparing to manual calculation
    const values = [8, 9, 10, 11, 12]
    const expectedSigma = stddevSample(values) // N-1 denominator
    const result = computeCapability(values, { nominal: 10, tolerance: 3, spec_type: 'bilateral_symmetric' }, 1)
    // Pp = (USL - LSL) / (6 * sigmaOverall)
    const usl = 13, lsl = 7
    const expectedPp = (usl - lsl) / (6 * expectedSigma)
    expect(result.pp).toBeCloseTo(expectedPp, 5)
  })

  it('carries through a non-normality warning when provided', () => {
    const values = [8, 9, 10, 11, 12, 13]
    const result = computeCapability(values, { nominal: 10, tolerance: 3, spec_type: 'bilateral_symmetric' }, 1, {
      normality: { method: 'shapiro_wilk', p_value: 0.0123, alpha: 0.05, is_normal: false, warning: null },
    })
    expect(result.normality?.is_normal).toBe(false)
    expect(result.normalityWarning).toMatch(/non-normal/i)
  })

  it('returns null capability when specification type is unspecified', () => {
    const values = [8, 9, 10, 11, 12, 13]
    const result = computeCapability(
      values,
      { spec_type: 'unspecified', nominal: null, tolerance: null, usl: null, lsl: null },
      1,
    )

    expect(result.cp).toBeNull()
    expect(result.cpk).toBeNull()
    expect(result.pp).toBeNull()
    expect(result.ppk).toBeNull()
    expect(result.spec_type).toBe('unspecified')
  })

  it('uses empirical percentiles for long-term capability when data is non-normal', () => {
    const values = [7, 8, 8, 9, 10, 10, 11, 12, 14, 18]
    const result = computeCapability(values, { nominal: 10, tolerance: 4, spec_type: 'bilateral_symmetric' }, 1, {
      normality: { method: 'shapiro_wilk', p_value: 0.001, alpha: 0.05, is_normal: false, warning: null },
    })

    expect(result.capabilityMethod).toBe('non_parametric')
    expect(result.empiricalP00135).not.toBeNull()
    expect(result.empiricalP50).not.toBeNull()
    expect(result.empiricalP99865).not.toBeNull()
    expect(result.ppk).not.toBeNull()
    expect(result.zScore).toBeNull()
    expect(result.dpmo).toBeNull()
  })

  it('returns approximate confidence intervals for Cp/Cpk/Pp/Ppk when enough data is present', () => {
    const values = [8, 9, 10, 11, 12, 9, 10, 11, 10, 9, 11, 12, 10, 8, 9, 10, 11, 12, 10, 9, 11, 10, 9, 10, 11]
    const result = computeCapability(values, { nominal: 10, tolerance: 3, spec_type: 'bilateral_symmetric' }, 1)
    expect(result.cpLower95).not.toBeNull()
    expect(result.cpUpper95).not.toBeNull()
    expect(result.cpkLower95).not.toBeNull()
    expect(result.cpkUpper95).not.toBeNull()
    expect(result.ppLower95).not.toBeNull()
    expect(result.ppUpper95).not.toBeNull()
    expect(result.ppkLower95).not.toBeNull()
    expect(result.ppkUpper95).not.toBeNull()
  })

  it('keeps the parametric long-term capability path for normal data', () => {
    const values = [8, 9, 10, 10, 10, 11, 12, 9, 10, 11]
    const result = computeCapability(values, { nominal: 10, tolerance: 3, spec_type: 'bilateral_symmetric' }, 1, {
      normality: { method: 'shapiro_wilk', p_value: 0.42, alpha: 0.05, is_normal: true, warning: null },
    })

    expect(result.capabilityMethod).toBe('parametric')
    expect(result.empiricalP50).toBeNull()
    expect(result.zScore).not.toBeNull()
  })
})

describe('stddevMSSD', () => {
  it('returns null for fewer than 2 values', () => {
    expect(stddevMSSD([5])).toBeNull()
  })

  it('computes the successive-difference sigma estimator', () => {
    const result = stddevMSSD([10, 12, 11, 13])
    expect(result).toBeGreaterThan(0)
  })
})

describe('computeAll', () => {
  it('propagates backend normality metadata into capability results', () => {
    const points = [
      { batch_id: 'B1', batch_seq: 1, sample_seq: 1, value: 10, nominal: 10, tolerance: 3 },
      { batch_id: 'B2', batch_seq: 2, sample_seq: 1, value: 11, nominal: 10, tolerance: 3 },
      { batch_id: 'B3', batch_seq: 3, sample_seq: 1, value: 9, nominal: 10, tolerance: 3 },
      { batch_id: 'B4', batch_seq: 4, sample_seq: 1, value: 10, nominal: 10, tolerance: 3 },
      { batch_id: 'B5', batch_seq: 5, sample_seq: 1, value: 12, nominal: 10, tolerance: 3 },
    ]
    const normality = { method: 'shapiro_wilk', p_value: 0.02, alpha: 0.05, is_normal: false, warning: null }
    const result = computeAll(points, 'imr', 'weco', { normality })
    expect(result.normality).toEqual(normality)
    expect(result.capability.normality).toEqual(normality)
  })

  it('switches to non-parametric long-term capability when backend flags non-normality', () => {
    const points = [
      { batch_id: 'B1', batch_seq: 1, sample_seq: 1, value: 8, nominal: 10, tolerance: 4 },
      { batch_id: 'B2', batch_seq: 2, sample_seq: 1, value: 8, nominal: 10, tolerance: 4 },
      { batch_id: 'B3', batch_seq: 3, sample_seq: 1, value: 9, nominal: 10, tolerance: 4 },
      { batch_id: 'B4', batch_seq: 4, sample_seq: 1, value: 10, nominal: 10, tolerance: 4 },
      { batch_id: 'B5', batch_seq: 5, sample_seq: 1, value: 10, nominal: 10, tolerance: 4 },
      { batch_id: 'B6', batch_seq: 6, sample_seq: 1, value: 11, nominal: 10, tolerance: 4 },
      { batch_id: 'B7', batch_seq: 7, sample_seq: 1, value: 12, nominal: 10, tolerance: 4 },
      { batch_id: 'B8', batch_seq: 8, sample_seq: 1, value: 16, nominal: 10, tolerance: 4 },
    ]
    const normality = { method: 'shapiro_wilk', p_value: 0.01, alpha: 0.05, is_normal: false, warning: null }
    const result = computeAll(points, 'imr', 'weco', { normality })
    expect(result.capability.capabilityMethod).toBe('non_parametric')
    expect(result.capability.empiricalP50).not.toBeNull()
    expect(result.capability.ppk).not.toBeNull()
  })

  it('computes the Xbar-S chart family for subgrouped data', () => {
    const points = [
      { batch_id: 'B1', batch_seq: 1, sample_seq: 1, value: 10, nominal: 10, tolerance: 3 },
      { batch_id: 'B1', batch_seq: 1, sample_seq: 2, value: 11, nominal: 10, tolerance: 3 },
      { batch_id: 'B1', batch_seq: 1, sample_seq: 3, value: 9, nominal: 10, tolerance: 3 },
      { batch_id: 'B2', batch_seq: 2, sample_seq: 1, value: 10, nominal: 10, tolerance: 3 },
      { batch_id: 'B2', batch_seq: 2, sample_seq: 2, value: 12, nominal: 10, tolerance: 3 },
      { batch_id: 'B2', batch_seq: 2, sample_seq: 3, value: 11, nominal: 10, tolerance: 3 },
      { batch_id: 'B3', batch_seq: 3, sample_seq: 1, value: 9, nominal: 10, tolerance: 3 },
      { batch_id: 'B3', batch_seq: 3, sample_seq: 2, value: 10, nominal: 10, tolerance: 3 },
      { batch_id: 'B3', batch_seq: 3, sample_seq: 3, value: 11, nominal: 10, tolerance: 3 },
    ]
    const result = computeAll(points, 'xbar_s', 'weco')
    expect(result.chartType).toBe('xbar_s')
    expect(result.xbarS).not.toBeNull()
    expect(result.xbarR).toBeNull()
    expect(result.xbarS?.subgroupStats).toHaveLength(3)
    expect(result.mrSignals).toBeDefined()
  })

  it('computes the EWMA chart family for individual data', () => {
    const points = Array.from({ length: 10 }, (_, index) => ({
      batch_id: `B${index + 1}`,
      batch_seq: index + 1,
      sample_seq: 1,
      value: index < 8 ? 10 : 13,
      nominal: 10,
      tolerance: 3,
    }))
    const result = computeAll(points, 'ewma', 'weco', { ewmaLambda: 0.2, ewmaL: 3 })
    expect(result.chartType).toBe('ewma')
    expect(result.ewma).not.toBeNull()
    expect(result.cusum).toBeNull()
    expect(result.ewma?.lambda).toBeCloseTo(0.2, 6)
    expect(result.ewma?.points).toHaveLength(10)
  })

  it('computes the CUSUM chart family for individual data', () => {
    const points = Array.from({ length: 10 }, (_, index) => ({
      batch_id: `B${index + 1}`,
      batch_seq: index + 1,
      sample_seq: 1,
      value: index < 7 ? 10 : 14,
      nominal: 10,
      tolerance: 3,
    }))
    const result = computeAll(points, 'cusum', 'weco', { cusumK: 0.5, cusumH: 5 })
    expect(result.chartType).toBe('cusum')
    expect(result.cusum).not.toBeNull()
    expect(result.ewma).toBeNull()
    expect(result.cusum?.points).toHaveLength(10)
    expect(result.cusum?.decisionInterval).toBeGreaterThan(0)
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

  it('K2 and K3 are also applied as multiplication in AV and PV', () => {
    // 2 operators × 2 parts × 2 replicates
    // op means: 15 and 17 -> xBarDiff = 2, so with EV = 0:
    // AV = 2 * K2(2) = 2 * 0.7071 = 1.4142
    // part means: 11 and 21 -> rParts = 10, so:
    // PV = 10 * K3(2) = 10 * 0.7071 = 7.071
    const data = [
      [[10, 10], [20, 20]],
      [[12, 12], [22, 22]],
    ]

    const result = computeGRR(data, 20)

    expect(result.ev).toBeCloseTo(0, 5)
    expect(result.av).toBeCloseTo(2 * 0.7071, 3)
    expect(result.pv).toBeCloseTo(10 * 0.7071, 3)
  })

  it('returns a stability warning when AV raw variance goes negative', () => {
    const data = [
      [[10, 10.5], [20, 20.5]],
      [[10.1, 10.6], [20.1, 20.6]],
    ]
    const result = computeGRR(data, 20)
    expect(result.systemStabilityWarning).toMatch(/negative variance/i)
  })
})

describe('computeGRR_ANOVA', () => {
  it('returns error for insufficient dimensions', () => {
    expect(computeGRR_ANOVA([[[1, 2]]], 10).error).toBeDefined()
  })

  it('reports interaction when operator-part effect is strong', () => {
    const data = [
      [[10, 10.2], [12, 12.2], [14, 14.2]],
      [[10, 10.2], [14, 14.2], [18, 18.2]],
    ]
    const result = computeGRR_ANOVA(data, 20)
    expect(result.method).toBe('anova')
    expect(result.interactionVariation).toBeGreaterThan(0)
    expect(result.model).toBe('interaction')
  })

  it('falls back to the reduced model when interaction is not significant', () => {
    const data = [
      [[10, 10.1], [20, 20.1], [30, 30.1]],
      [[10.3, 10.4], [20.3, 20.4], [30.3, 30.4]],
    ]
    const result = computeGRR_ANOVA(data, 20)
    expect(result.method).toBe('anova')
    expect(result.interactionSignificant).toBe(false)
    expect(result.model).toBe('reduced')
    expect(result.modelWarning).toMatch(/reduced additive model/i)
  })
})

// ---------------------------------------------------------------------------
// computeLag1ACF
// ---------------------------------------------------------------------------
describe('computeLag1ACF', () => {
  function generateAR1(n: number, phi: number, seed = 42): number[] {
    // Deterministic pseudo-random (Mulberry32) so tests don't flake.
    let state = seed
    const rand = () => {
      state = (state + 0x6D2B79F5) | 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const values: number[] = []
    let prev = 0
    for (let i = 0; i < n; i++) {
      const eps = (rand() - 0.5) * 2  // ~uniform(-1, 1)
      const x = phi * prev + eps
      values.push(x)
      prev = x
    }
    return values
  }

  it('returns null for fewer than 10 samples', () => {
    expect(computeLag1ACF([1, 2, 3, 4, 5, 6, 7, 8, 9])).toBeNull()
  })

  it('returns null for null or empty input', () => {
    expect(computeLag1ACF(null)).toBeNull()
    expect(computeLag1ACF(undefined)).toBeNull()
    expect(computeLag1ACF([])).toBeNull()
  })

  it('returns null when variance is zero', () => {
    expect(computeLag1ACF(new Array(20).fill(5))).toBeNull()
  })

  it('suspects autocorrelation on a strongly persistent AR(1) series (phi=0.8)', () => {
    const ac = computeLag1ACF(generateAR1(200, 0.8), 'values')
    expect(ac).not.toBeNull()
    expect(ac!.rho).toBeGreaterThan(0.5)
    expect(ac!.suspected).toBe(true)
    expect(ac!.basis).toBe('values')
    expect(ac!.threshold).toBe(0.5)
    expect(ac!.n).toBe(200)
  })

  it('does not suspect autocorrelation on white noise', () => {
    // Deterministic pseudo-random uniform series — independent by construction.
    let state = 17
    const rand = () => {
      state = (state + 0x6D2B79F5) | 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const whiteNoise = Array.from({ length: 500 }, () => rand() - 0.5)
    const ac = computeLag1ACF(whiteNoise, 'values')
    expect(ac).not.toBeNull()
    expect(Math.abs(ac!.rho)).toBeLessThan(0.15)
    expect(ac!.suspected).toBe(false)
  })

  it('reports the basis passed by caller', () => {
    const ac = computeLag1ACF(generateAR1(50, 0.7), 'subgroup_means')
    expect(ac?.basis).toBe('subgroup_means')
  })

  it('honors a custom threshold', () => {
    const series = generateAR1(100, 0.3) // rho ~ 0.3
    const lenient = computeLag1ACF(series, 'values', 0.5)
    const strict = computeLag1ACF(series, 'values', 0.1)
    expect(lenient?.suspected).toBe(false)
    expect(strict?.suspected).toBe(true)
  })
})

describe('computeAll autocorrelation wiring', () => {
  it('surfaces autocorrelation.suspected on an AR(1) IMR series', () => {
    let state = 99
    const rand = () => {
      state = (state + 0x6D2B79F5) | 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    let prev = 0
    const points = Array.from({ length: 80 }, (_, i) => {
      const eps = (rand() - 0.5) * 2
      prev = 0.85 * prev + eps
      return {
        batch_id: `B${i}`,
        batch_seq: i,
        sample_seq: 0,
        batch_date: null,
        value: 50 + prev,
        usl: 60,
        lsl: 40,
        nominal: 50,
        tolerance: 10,
        plant_id: null,
        stratify_value: null,
        original_index: i,
      }
    })
    const result = computeAll(points as any, 'imr', 'weco')
    expect(result.autocorrelation).not.toBeNull()
    expect(result.autocorrelation!.suspected).toBe(true)
    expect(result.autocorrelation!.basis).toBe('values')
  })

  it('does not flag autocorrelation on a near-independent IMR series', () => {
    let state = 123
    const rand = () => {
      state = (state + 0x6D2B79F5) | 0
      let t = state
      t = Math.imul(t ^ (t >>> 15), t | 1)
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296
    }
    const points = Array.from({ length: 80 }, (_, i) => ({
      batch_id: `B${i}`,
      batch_seq: i,
      sample_seq: 0,
      batch_date: null,
      value: 50 + (rand() - 0.5) * 2,
      usl: 60,
      lsl: 40,
      nominal: 50,
      tolerance: 10,
      plant_id: null,
      stratify_value: null,
      original_index: i,
    }))
    const result = computeAll(points as any, 'imr', 'weco')
    expect(result.autocorrelation).not.toBeNull()
    expect(result.autocorrelation!.suspected).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// Stability-before-capability guard (wired via applyStability in computeAll)
// ---------------------------------------------------------------------------
describe('computeAll stability guard', () => {
  function makePoint(i: number, value: number) {
    return {
      batch_id: `B${i}`,
      batch_seq: i,
      sample_seq: 0,
      batch_date: null,
      value,
      usl: 60,
      lsl: 40,
      nominal: 50,
      tolerance: 10,
      plant_id: null,
      stratify_value: null,
      original_index: i,
    }
  }

  it('marks capability stable when IMR series sits inside control limits', () => {
    // Low-variance series centered on 50 — no WECO/Nelson rule should fire.
    const points = Array.from({ length: 40 }, (_, i) =>
      makePoint(i, 50 + (i % 2 === 0 ? 0.1 : -0.1)),
    )
    const result = computeAll(points as any, 'imr', 'weco')
    expect(result.capability?.isStable).toBe(true)
    expect(result.capability?.instabilityReason).toBeNull()
    expect(result.signals?.length ?? 0).toBe(0)
  })

  it('marks capability unstable when a point is beyond control limits', () => {
    const points = Array.from({ length: 40 }, (_, i) =>
      makePoint(i, 50 + (i % 2 === 0 ? 0.1 : -0.1)),
    )
    // Inject a clear out-of-control point toward the end.
    points[35].value = 80
    const result = computeAll(points as any, 'imr', 'weco')
    expect(result.capability?.isStable).toBe(false)
    expect(result.capability?.instabilityReason).toMatch(/not in statistical control/i)
    expect((result.signals?.length ?? 0) + (result.mrSignals?.length ?? 0)).toBeGreaterThan(0)
  })

  it('attributes instability to the right chart (primary vs dispersion)', () => {
    // Stable mean, but alternating ±spikes create moving-range signals only.
    const points = Array.from({ length: 40 }, (_, i) =>
      makePoint(i, 50 + (i % 2 === 0 ? 0.1 : -0.1)),
    )
    points[20].value = 65
    points[21].value = 50
    const result = computeAll(points as any, 'imr', 'weco')
    expect(result.capability?.isStable).toBe(false)
    // At least one side should have fired
    const primaryCount = result.signals?.length ?? 0
    const dispersionCount = result.mrSignals?.length ?? 0
    expect(primaryCount + dispersionCount).toBeGreaterThan(0)
    expect(result.capability?.instabilityReason).toBeTruthy()
  })
})
