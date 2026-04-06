/**
 * SPC Statistical Calculations
 *
 * All functions are pure — no side effects, no DOM, no API calls.
 * Control-limit factors follow AIAG SPC Reference Manual, 4th Edition
 * (Appendix B constant tables and chart-limit usage including Table III-4).
 * WECO rules follow the Western Electric SQC Handbook (1956).
 * Nelson rules follow Nelson (1984), Journal of Quality Technology.
 */

import { getConstants } from './spcConstants'
import type {
  AutoCleanPhaseIResult,
  CapabilityResult,
  ChartDataPoint,
  HistogramResult,
  IMRResult,
  IndexedChartPoint,
  NormalCurvePoint,
  NormalityResult,
  QuantChartType,
  RollingCapabilityPoint,
  RuleSet,
  SPCComputationResult,
  SPCSignal,
  SpecConfig,
  XbarRResult,
  XbarSubgroup,
  XbarSubgroupStat,
} from './types'

interface Limits {
  cl: number
  ucl: number
  lcl: number
  sigma1: number
  sigma2: number
}

interface CapabilityOptions {
  normality?: NormalityResult | null
}

interface PChartPoint {
  batch_id?: string | null
  batch_seq?: number | null
  batch_date?: string | null
  n_inspected: number
  n_nonconforming: number
  p_value: number
}

interface CountChartPoint {
  batch_id?: string | null
  batch_seq?: number | null
  batch_date?: string | null
  defect_count: number
}

interface UChartPoint extends CountChartPoint {
  n_units: number
}

interface NPChartPoint {
  batch_id?: string | null
  batch_seq?: number | null
  batch_date?: string | null
  n_nonconforming: number
  n_inspected: number
}

function round6(v: number): number {
  return Math.round(v * 1_000_000) / 1_000_000
}

function range(start: number, end: number): number[] {
  const arr: number[] = []
  for (let i = start; i <= end; i++) arr.push(i)
  return arr
}

export function mean(values: number[] | null | undefined): number | null {
  if (!values?.length) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

export function stddevPop(values: number[] | null | undefined): number | null {
  const m = mean(values)
  if (m === null || !values || values.length < 2) return null
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

// Sample standard deviation (N−1 denominator).
// Used for Pp/Ppk per AIAG SPC Reference Manual 4th Edition.
export function stddevSample(values: number[] | null | undefined): number | null {
  const m = mean(values)
  if (m === null || !values || values.length < 2) return null
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

// Mean Square Successive Difference sigma estimator.
// For a stable independent process, E(MSSD) = 2σ², so σ = sqrt(MSSD / 2).
export function stddevMSSD(values: number[] | null | undefined): number | null {
  if (!values || values.length < 2) return null
  let sumSquares = 0
  for (let i = 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1]
    sumSquares += diff * diff
  }
  return Math.sqrt(sumSquares / (2 * (values.length - 1)))
}

function hasMonotonicTrend(values: number[], minRunLength = 6): boolean {
  if (values.length < minRunLength) return false
  for (let end = minRunLength - 1; end < values.length; end++) {
    const window = values.slice(end - minRunLength + 1, end + 1)
    const increasing = window.every((v, idx) => idx === 0 || v > window[idx - 1])
    const decreasing = window.every((v, idx) => idx === 0 || v < window[idx - 1])
    if (increasing || decreasing) return true
  }
  return false
}

export function computeIMR(values: number[]): IMRResult | null {
  if (values.length < 2) return null

  const { d2, D4 } = getConstants(2)
  const movingRanges: number[] = []
  for (let i = 1; i < values.length; i++) {
    movingRanges.push(Math.abs(values[i] - values[i - 1]))
  }

  const xBar = mean(values)
  const mrBar = mean(movingRanges)
  if (xBar === null || mrBar === null) return null

  const sigmaMR = mrBar / d2
  const sigmaMSSD = stddevMSSD(values)
  const useMSSD = values.length <= 8 || hasMonotonicTrend(values)
  const sigmaMethod: IMRResult['sigmaMethod'] =
    useMSSD && sigmaMSSD != null && sigmaMSSD > 0 ? 'mssd' : 'mr'
  const sigmaWithin = sigmaMethod === 'mssd' && sigmaMSSD != null ? sigmaMSSD : sigmaMR

  return {
    xBar,
    mrBar,
    sigmaWithin,
    sigmaMR,
    sigmaMSSD,
    sigmaMethod,
    ucl_x: xBar + 3 * sigmaWithin,
    lcl_x: xBar - 3 * sigmaWithin,
    ucl_mr: D4 * mrBar,
    lcl_mr: 0,
    sigma1: sigmaWithin,
    sigma2: 2 * sigmaWithin,
    movingRanges,
  }
}

export function groupIntoSubgroups(points: ChartDataPoint[]): XbarSubgroup[] {
  const map = new Map<number, XbarSubgroup>()
  for (const pt of points) {
    const key = pt.batch_seq
    const existing = map.get(key)
    if (existing) {
      existing.values.push(pt.value)
      continue
    }
    map.set(key, {
      batchSeq: pt.batch_seq,
      batchId: pt.batch_id,
      batchDate: pt.batch_date,
      values: [pt.value],
    })
  }
  return Array.from(map.values()).sort((a, b) => a.batchSeq - b.batchSeq)
}

export function computeXbarR(subgroups: XbarSubgroup[]): XbarRResult | null {
  if (subgroups.length < 2) return null

  const subgroupStats: XbarSubgroupStat[] = subgroups.map((sg) => {
    const n = sg.values.length
    const xbar = mean(sg.values) ?? 0
    const rangeValue = Math.max(...sg.values) - Math.min(...sg.values)
    const stddev = n > 1 ? stddevSample(sg.values) : null
    return { ...sg, n, xbar, range: rangeValue, stddev }
  })

  const grandMean = mean(subgroupStats.map((s) => s.xbar))
  const rBar = mean(subgroupStats.map((s) => s.range))
  if (grandMean === null || rBar === null) return null

  const sizes = [...new Set(subgroupStats.map((s) => s.n))]
  const constantN = sizes.length === 1 ? sizes[0] : null
  const mixedSubgroupSizes = constantN == null
  const averageSubgroupSize = mean(subgroupStats.map((s) => s.n))

  const statsWithLimits: XbarSubgroupStat[] = subgroupStats.map((s) => {
    const { d2, A2, D3, D4 } = getConstants(s.n)
    const sigmaWithin = s.n > 1 ? s.range / d2 : null
    return {
      ...s,
      ucl_x: grandMean + A2 * rBar,
      lcl_x: grandMean - A2 * rBar,
      ucl_r: D4 * rBar,
      lcl_r: D3 * rBar,
      sigmaWithin,
    }
  })

  const sigmaFromRangeValues = subgroupStats
    .filter((s) => s.n > 1)
    .map((s) => s.range / getConstants(s.n).d2)
  const sigmaFromRanges = sigmaFromRangeValues.length ? mean(sigmaFromRangeValues) : null

  const pooledVarianceNumerator = subgroupStats.reduce(
    (sum, s) => sum + (s.n > 1 && s.stddev != null ? (s.n - 1) * (s.stddev ** 2) : 0),
    0,
  )
  const pooledDegrees = subgroupStats.reduce((sum, s) => sum + Math.max(0, s.n - 1), 0)
  const pooledSigmaWithin = pooledDegrees > 0 ? Math.sqrt(pooledVarianceNumerator / pooledDegrees) : null

  let ucl_x: number
  let lcl_x: number
  let ucl_r: number
  let lcl_r: number
  let sigmaWithin: number
  let sigma1: number
  let sigma2: number
  let limitStrategy = 'constant_n_aiag'
  let referenceSubgroupSize: number | null = constantN

  if (constantN != null) {
    const { d2: refD2, A2: refA2, D3: refD3, D4: refD4 } = getConstants(constantN)
    sigmaWithin = rBar / refD2
    const sigmaXbarReference = sigmaWithin / Math.sqrt(constantN)
    ucl_x = grandMean + refA2 * rBar
    lcl_x = grandMean - refA2 * rBar
    ucl_r = refD4 * rBar
    lcl_r = refD3 * rBar
    sigma1 = sigmaXbarReference
    sigma2 = 2 * sigmaXbarReference
  } else {
    sigmaWithin = pooledSigmaWithin ?? sigmaFromRanges ?? 0
    const sigmaXbarReference =
      averageSubgroupSize != null && averageSubgroupSize > 0
        ? sigmaWithin / Math.sqrt(averageSubgroupSize)
        : 0
    ucl_x = grandMean + 3 * sigmaXbarReference
    lcl_x = grandMean - 3 * sigmaXbarReference
    ucl_r = mean(statsWithLimits.map((s) => s.ucl_r ?? 0)) ?? 0
    lcl_r = mean(statsWithLimits.map((s) => s.lcl_r ?? 0)) ?? 0
    sigma1 = sigmaXbarReference
    sigma2 = 2 * sigmaXbarReference
    limitStrategy = pooledSigmaWithin != null ? 'pooled_sigma_average_n' : 'range_sigma_average_n'
    referenceSubgroupSize = null
  }

  return {
    grandMean,
    rBar,
    sigmaWithin,
    pooledSigmaWithin,
    sigmaFromRanges,
    mixedSubgroupSizes,
    averageSubgroupSize,
    limitStrategy,
    referenceSubgroupSize,
    subgroupStats: statsWithLimits,
    ucl_x,
    lcl_x,
    ucl_r,
    lcl_r,
    sigma1,
    sigma2,
  }
}

export function normalCDF(z: number): number {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const poly =
    t *
    (0.31938153 +
      t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  const base = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly
  return z >= 0 ? base : 1 - base
}

function buildNormalityWarning(normality?: NormalityResult | null): string | null {
  return normality?.is_normal === false
    ? 'Warning: Data is non-normal. Cpk and DPMO estimates may be invalid.'
    : null
}

export function computeCapability(
  values: number[],
  specConfig: SpecConfig,
  sigmaWithin: number | null | undefined,
  options?: CapabilityOptions,
): CapabilityResult
export function computeCapability(
  values: number[],
  nominal: number | null | undefined,
  tolerance: number | null | undefined,
  sigmaWithin: number | null | undefined,
  options?: CapabilityOptions,
): CapabilityResult
export function computeCapability(
  values: number[],
  specConfigOrNominal: SpecConfig | number | null | undefined,
  toleranceOrSigmaWithin?: number | null,
  sigmaWithinIfOld?: number | CapabilityOptions | null,
  maybeOptions: CapabilityOptions = {},
): CapabilityResult {
  let specConfig: SpecConfig
  let sigmaWithin: number | null | undefined
  let options: CapabilityOptions

  if (
    typeof specConfigOrNominal === 'number' ||
    specConfigOrNominal == null
  ) {
    specConfig = {
      spec_type: 'bilateral_symmetric',
      nominal: specConfigOrNominal ?? null,
      tolerance: toleranceOrSigmaWithin ?? null,
    }
    sigmaWithin = typeof sigmaWithinIfOld === 'number' ? sigmaWithinIfOld : null
    options = maybeOptions
  } else {
    specConfig = specConfigOrNominal
    sigmaWithin = toleranceOrSigmaWithin
    options =
      sigmaWithinIfOld != null && typeof sigmaWithinIfOld === 'object'
        ? sigmaWithinIfOld
        : {}
  }

  const normality = options.normality ?? null
  const { spec_type = 'bilateral_symmetric', nominal, tolerance } = specConfig

  let usl = specConfig.usl ?? null
  let lsl = specConfig.lsl ?? null

  if (spec_type === 'bilateral_symmetric') {
    if (usl == null || lsl == null) {
      if (nominal == null || tolerance == null || tolerance <= 0) {
        return {
          cp: null,
          cpk: null,
          pp: null,
          ppk: null,
          usl: null,
          lsl: null,
          cpkLower95: null,
          cpkUpper95: null,
          zScore: null,
          dpmo: null,
          spec_type,
          normality,
          normalityWarning: buildNormalityWarning(normality),
        }
      }
      usl = nominal + tolerance
      lsl = nominal - tolerance
    }
  }

  const hasUsl = usl != null
  const hasLsl = lsl != null
  if (!hasUsl && !hasLsl) {
    return {
      cp: null,
      cpk: null,
      pp: null,
      ppk: null,
      usl,
      lsl,
      cpkLower95: null,
      cpkUpper95: null,
      zScore: null,
      dpmo: null,
      spec_type,
      normality,
      normalityWarning: buildNormalityWarning(normality),
    }
  }

  if (values.length < 5) {
    return {
      cp: null,
      cpk: null,
      pp: null,
      ppk: null,
      usl,
      lsl,
      cpkLower95: null,
      cpkUpper95: null,
      zScore: null,
      dpmo: null,
      spec_type,
      normality,
      normalityWarning: buildNormalityWarning(normality),
    }
  }

  const xBar = mean(values)
  const sigmaOverall = stddevSample(values)
  const n = values.length
  if (xBar == null) {
    return {
      cp: null,
      cpk: null,
      pp: null,
      ppk: null,
      usl,
      lsl,
      cpkLower95: null,
      cpkUpper95: null,
      zScore: null,
      dpmo: null,
      spec_type,
      normality,
      normalityWarning: buildNormalityWarning(normality),
    }
  }

  let cp: number | null = null
  let cpk: number | null = null
  let pp: number | null = null
  let ppk: number | null = null

  const upperSpec = hasUsl ? usl : null
  const lowerSpec = hasLsl ? lsl : null
  const specWidth = upperSpec != null && lowerSpec != null ? upperSpec - lowerSpec : null

  if (sigmaWithin != null && sigmaWithin > 0) {
    if (specWidth != null) cp = round6(specWidth / (6 * sigmaWithin))
    if (upperSpec != null && lowerSpec != null) {
      cpk = round6(Math.min((upperSpec - xBar) / (3 * sigmaWithin), (xBar - lowerSpec) / (3 * sigmaWithin)))
    } else if (upperSpec != null) {
      cpk = round6((upperSpec - xBar) / (3 * sigmaWithin))
    } else if (lowerSpec != null) {
      cpk = round6((xBar - lowerSpec) / (3 * sigmaWithin))
    }
  }

  if (sigmaOverall != null && sigmaOverall > 0) {
    if (specWidth != null) pp = round6(specWidth / (6 * sigmaOverall))
    if (upperSpec != null && lowerSpec != null) {
      ppk = round6(Math.min((upperSpec - xBar) / (3 * sigmaOverall), (xBar - lowerSpec) / (3 * sigmaOverall)))
    } else if (upperSpec != null) {
      ppk = round6((upperSpec - xBar) / (3 * sigmaOverall))
    } else if (lowerSpec != null) {
      ppk = round6((xBar - lowerSpec) / (3 * sigmaOverall))
    }
  }

  let cpkLower95: number | null = null
  let cpkUpper95: number | null = null
  if (cpk !== null && n >= 25) {
    const se = Math.sqrt(1 / (9 * n) + cpk ** 2 / (2 * (n - 1)))
    cpkLower95 = round6(cpk - 1.96 * se)
    cpkUpper95 = round6(cpk + 1.96 * se)
  }

  const zScore = cpk !== null ? round6(cpk * 3) : null
  const dpmo = zScore !== null ? Math.round(normalCDF(-(zScore - 1.5)) * 1_000_000) : null

  return {
    usl,
    lsl,
    cp,
    cpk,
    pp,
    ppk,
    sigmaOverall,
    xBar,
    cpkLower95,
    cpkUpper95,
    zScore,
    dpmo,
    spec_type,
    dpmo_convention: 'motorola_1.5sigma_shift',
    normality,
    normalityWarning: buildNormalityWarning(normality),
  }
}

export function detectWECORules(values: number[], limits: Limits): SPCSignal[] {
  if (values.length < 2) return []
  const { cl, ucl, lcl, sigma1, sigma2 } = limits
  const signals: SPCSignal[] = []
  const side = (v: number): number => (v > cl ? 1 : v < cl ? -1 : 0)

  for (let i = 0; i < values.length; i++) {
    if (values[i] > ucl || values[i] < lcl) {
      signals.push({ rule: 1, indices: [i], description: 'Point beyond 3σ control limit' })
    }
  }
  for (let i = 2; i < values.length; i++) {
    const w = values.slice(i - 2, i + 1)
    const aboveZoneA = w.filter((v) => v > cl + sigma2).length
    const belowZoneA = w.filter((v) => v < cl - sigma2).length
    if (aboveZoneA >= 2) {
      signals.push({ rule: 2, indices: range(i - 2, i), description: '2 of 3 consecutive points beyond +2σ (Zone A)' })
    } else if (belowZoneA >= 2) {
      signals.push({ rule: 2, indices: range(i - 2, i), description: '2 of 3 consecutive points beyond −2σ (Zone A)' })
    }
  }
  for (let i = 4; i < values.length; i++) {
    const w = values.slice(i - 4, i + 1)
    const aboveZoneB = w.filter((v) => v > cl + sigma1).length
    const belowZoneB = w.filter((v) => v < cl - sigma1).length
    if (aboveZoneB >= 4) {
      signals.push({ rule: 3, indices: range(i - 4, i), description: '4 of 5 consecutive points beyond +1σ (Zone B)' })
    } else if (belowZoneB >= 4) {
      signals.push({ rule: 3, indices: range(i - 4, i), description: '4 of 5 consecutive points beyond −1σ (Zone B)' })
    }
  }
  for (let i = 7; i < values.length; i++) {
    const w = values.slice(i - 7, i + 1)
    const s = side(w[0])
    if (s !== 0 && w.every((v) => side(v) === s)) {
      signals.push({
        rule: 4,
        indices: range(i - 7, i),
        description: `8 consecutive points ${s === 1 ? 'above' : 'below'} the centre line`,
      })
    }
  }
  return signals
}

export function detectNelsonRules(values: number[], limits: Limits): SPCSignal[] {
  if (values.length < 2) return []
  const { cl, ucl, lcl, sigma1, sigma2 } = limits
  const signals: SPCSignal[] = []
  const side = (v: number): number => (v > cl ? 1 : v < cl ? -1 : 0)

  for (let i = 0; i < values.length; i++) {
    if (values[i] > ucl || values[i] < lcl) {
      signals.push({ rule: 1, indices: [i], description: 'Point beyond 3σ control limit' })
    }
  }
  for (let i = 8; i < values.length; i++) {
    const w = values.slice(i - 8, i + 1)
    const s = side(w[0])
    if (s !== 0 && w.every((v) => side(v) === s)) {
      signals.push({ rule: 2, indices: range(i - 8, i), description: `9 consecutive points ${s === 1 ? 'above' : 'below'} the centre line` })
    }
  }
  for (let i = 5; i < values.length; i++) {
    const w = values.slice(i - 5, i + 1)
    const up = w.every((v, j) => j === 0 || v > w[j - 1])
    const down = w.every((v, j) => j === 0 || v < w[j - 1])
    if (up || down) {
      signals.push({ rule: 3, indices: range(i - 5, i), description: `6 consecutive points ${up ? 'increasing' : 'decreasing'} (trend)` })
    }
  }
  for (let i = 13; i < values.length; i++) {
    const w = values.slice(i - 13, i + 1)
    const alternating = w.every((v, j) => {
      if (j < 2) return true
      return (v - w[j - 1]) * (w[j - 1] - w[j - 2]) < 0
    })
    if (alternating) {
      signals.push({ rule: 4, indices: range(i - 13, i), description: '14 consecutive points alternating up/down' })
    }
  }
  for (let i = 2; i < values.length; i++) {
    const w = values.slice(i - 2, i + 1)
    const aboveA = w.filter((v) => v > cl + sigma2).length
    const belowA = w.filter((v) => v < cl - sigma2).length
    if (aboveA >= 2) signals.push({ rule: 5, indices: range(i - 2, i), description: '2 of 3 consecutive points beyond +2σ (Zone A)' })
    else if (belowA >= 2) signals.push({ rule: 5, indices: range(i - 2, i), description: '2 of 3 consecutive points beyond −2σ (Zone A)' })
  }
  for (let i = 4; i < values.length; i++) {
    const w = values.slice(i - 4, i + 1)
    const aboveB = w.filter((v) => v > cl + sigma1).length
    const belowB = w.filter((v) => v < cl - sigma1).length
    if (aboveB >= 4) signals.push({ rule: 6, indices: range(i - 4, i), description: '4 of 5 consecutive points beyond +1σ (Zone B)' })
    else if (belowB >= 4) signals.push({ rule: 6, indices: range(i - 4, i), description: '4 of 5 consecutive points beyond −1σ (Zone B)' })
  }
  for (let i = 14; i < values.length; i++) {
    const w = values.slice(i - 14, i + 1)
    if (w.every((v) => Math.abs(v - cl) <= sigma1)) {
      signals.push({ rule: 7, indices: range(i - 14, i), description: '15 consecutive points within Zone C (hugging centre line)' })
    }
  }
  for (let i = 7; i < values.length; i++) {
    const w = values.slice(i - 7, i + 1)
    const hasAbove = w.some((v) => v > cl + sigma1)
    const hasBelow = w.some((v) => v < cl - sigma1)
    if (hasAbove && hasBelow && w.every((v) => Math.abs(v - cl) > sigma1)) {
      signals.push({ rule: 8, indices: range(i - 7, i), description: '8 consecutive points outside Zone C (mixture pattern)' })
    }
  }
  return signals
}

export function detectRules(values: number[], limits: Limits, ruleSet: RuleSet = 'weco'): SPCSignal[] {
  return ruleSet === 'nelson' ? detectNelsonRules(values, limits) : detectWECORules(values, limits)
}

export function computeHistogram(values: number[], forceBins: number | null = null): HistogramResult {
  if (!values.length) return { bins: [], binWidth: 0 }

  const n = values.length
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const rangeValue = maxVal - minVal || 1

  let binWidth: number
  if (forceBins != null) {
    binWidth = rangeValue / forceBins
  } else {
    const sorted = [...values].sort((a, b) => a - b)
    const q1 = sorted[Math.floor(n * 0.25)]
    const q3 = sorted[Math.floor(n * 0.75)]
    const iqr = q3 - q1
    binWidth = iqr > 0 ? 2 * iqr * Math.pow(n, -1 / 3) : rangeValue / 10
  }

  const k = Math.max(1, Math.ceil(rangeValue / binWidth))
  const bins = Array.from({ length: k }, (_, i) => ({
    x0: minVal + i * binWidth,
    x1: minVal + (i + 1) * binWidth,
    midpoint: minVal + (i + 0.5) * binWidth,
    count: 0,
  }))

  for (const v of values) {
    const idx = Math.min(k - 1, Math.floor((v - minVal) / binWidth))
    if (idx >= 0) bins[idx].count += 1
  }

  return { bins, binWidth }
}

export function normalCurve(
  mu: number,
  sigma: number,
  minX: number,
  maxX: number,
  n: number,
  binWidth: number,
): NormalCurvePoint[] {
  if (sigma <= 0) return []
  const points: NormalCurvePoint[] = []
  const steps = 100
  const step = (maxX - minX) / steps
  for (let i = 0; i <= steps; i++) {
    const x = minX + i * step
    const y =
      (1 / (sigma * Math.sqrt(2 * Math.PI))) *
      Math.exp(-0.5 * ((x - mu) / sigma) ** 2) *
      n *
      binWidth
    points.push({ x: Math.round(x * 10000) / 10000, y: Math.round(y * 1000) / 1000 })
  }
  return points
}

export function computeAll(
  points: ChartDataPoint[],
  chartType: QuantChartType = 'imr',
  ruleSet: RuleSet = 'weco',
  options: CapabilityOptions = {},
): SPCComputationResult {
  if (!points.length) {
    return {
      chartType,
      ruleSet,
      values: [],
      sorted: [],
      imr: null,
      xbarR: null,
      subgroups: null,
      capability: null,
      signals: [],
      mrSignals: [],
      normality: options.normality ?? null,
    }
  }

  const sorted = [...points].sort((a, b) =>
    a.batch_seq !== b.batch_seq ? a.batch_seq - b.batch_seq : a.sample_seq - b.sample_seq,
  )

  const specCandidates = sorted.filter(
    (p) => p.usl != null || p.lsl != null || (p.nominal != null && p.tolerance != null && p.tolerance > 0),
  )
  const specPoint = specCandidates[specCandidates.length - 1] ?? sorted[sorted.length - 1]
  const specSignature = (p: ChartDataPoint | undefined): string =>
    JSON.stringify({
      usl: p?.usl ?? null,
      lsl: p?.lsl ?? null,
      nominal: p?.nominal ?? null,
      tolerance: p?.tolerance ?? null,
      spec_type: p?.spec_type ?? 'bilateral_symmetric',
    })
  const uniqueSpecCount = new Set(specCandidates.map(specSignature)).size
  const hasMixedSpec = uniqueSpecCount > 1

  const nominal = specPoint?.nominal ?? null
  const tolerance = specPoint?.tolerance ?? null
  const spec_type = specPoint?.spec_type ?? 'bilateral_symmetric'
  const specConfig: SpecConfig = {
    spec_type,
    nominal,
    tolerance,
    usl: specPoint?.usl ?? null,
    lsl: specPoint?.lsl ?? null,
    hasMixedSpec,
    specWarning: hasMixedSpec
      ? 'Capability uses the latest spec in the selected range because specifications changed across the time window.'
      : null,
  }

  const values = sorted.map((p) => p.value)

  if (chartType === 'xbar_r') {
    const subgroups = groupIntoSubgroups(sorted)
    if (subgroups.length < 2) return computeAll(points, 'imr', ruleSet, options)

    const xbarR = computeXbarR(subgroups)
    if (!xbarR) return computeAll(points, 'imr', ruleSet, options)
    const xbarValues = xbarR.subgroupStats.map((s) => s.xbar)
    const capability: CapabilityResult = {
      ...computeCapability(values, specConfig, xbarR.sigmaWithin, { normality: options.normality ?? null }),
      hasMixedSpec,
      specWarning: specConfig.specWarning,
    }

    const xbarLimits: Limits = {
      cl: xbarR.grandMean,
      ucl: xbarR.ucl_x,
      lcl: xbarR.lcl_x,
      sigma1: xbarR.sigma1,
      sigma2: xbarR.sigma2,
    }
    const rLimits: Limits = {
      cl: xbarR.rBar,
      ucl: xbarR.ucl_r,
      lcl: xbarR.lcl_r,
      sigma1: xbarR.rBar / 3,
      sigma2: (xbarR.rBar * 2) / 3,
    }

    return {
      chartType: 'xbar_r',
      ruleSet,
      values,
      sorted,
      imr: null,
      xbarR,
      subgroups,
      capability,
      signals: detectRules(xbarValues, xbarLimits, ruleSet),
      mrSignals: detectRules(xbarR.subgroupStats.map((s) => s.range), rLimits, ruleSet),
      nominal,
      tolerance,
      specConfig,
      normality: options.normality ?? null,
    }
  }

  const imr = computeIMR(values)
  if (!imr) {
    return {
      chartType: 'imr',
      ruleSet,
      values,
      sorted,
      imr: null,
      xbarR: null,
      subgroups: null,
      capability: null,
      signals: [],
      mrSignals: [],
    }
  }

  const capability: CapabilityResult = {
    ...computeCapability(values, specConfig, imr.sigmaWithin, { normality: options.normality ?? null }),
    hasMixedSpec,
    specWarning: specConfig.specWarning,
  }
  const xLimits: Limits = {
    cl: imr.xBar,
    ucl: imr.ucl_x,
    lcl: imr.lcl_x,
    sigma1: imr.sigma1,
    sigma2: imr.sigma2,
  }
  const mrLimits: Limits = {
    cl: imr.mrBar,
    ucl: imr.ucl_mr,
    lcl: imr.lcl_mr,
    sigma1: imr.mrBar / 3,
    sigma2: (imr.mrBar * 2) / 3,
  }

  return {
    chartType: 'imr',
    ruleSet,
    values,
    sorted,
    imr,
    xbarR: null,
    subgroups: null,
    capability,
    signals: detectRules(values, xLimits, ruleSet),
    mrSignals: detectRules(imr.movingRanges, mrLimits, ruleSet),
    nominal,
    tolerance,
    specConfig,
    normality: options.normality ?? null,
  }
}

export function computeRollingCapability(
  sortedPoints: ChartDataPoint[],
  windowSize = 20,
  specConfig: SpecConfig = {},
): RollingCapabilityPoint[] {
  if (sortedPoints.length < windowSize) return []
  const result: RollingCapabilityPoint[] = []
  for (let end = windowSize - 1; end < sortedPoints.length; end++) {
    const window = sortedPoints.slice(end - windowSize + 1, end + 1)
    const vals = window.map((p) => p.value).filter((v): v is number => v != null)
    const imr = computeIMR(vals)
    if (!imr) continue
    const cap = computeCapability(vals, specConfig, imr.sigmaWithin)
    result.push({
      windowEnd: end,
      batchSeq: window[window.length - 1].batch_seq,
      batchDate: window[window.length - 1].batch_date,
      n: windowSize,
      cpk: cap.cpk,
      cp: cap.cp,
      zScore: cap.zScore,
    })
  }
  return result
}

export function autoCleanPhaseI(
  indexedPoints: IndexedChartPoint[],
  chartType: QuantChartType = 'imr',
  ruleSet: RuleSet = 'weco',
  _specConfig: SpecConfig = {},
): AutoCleanPhaseIResult {
  const MAX_ITER = 10
  const cleaned = new Set<number>()
  const iterLog: AutoCleanPhaseIResult['iterationLog'] = []
  let stable = false

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const active = indexedPoints.filter((p) => !cleaned.has(p.originalIndex))
    if (active.length < 5) break

    const result = computeAll(active, chartType, ruleSet)
    const rule1 = (result.signals ?? []).filter((s) => s.rule === 1)
    const limits =
      result.imr != null
        ? { cl: result.imr.xBar, ucl: result.imr.ucl_x, lcl: result.imr.lcl_x }
        : result.xbarR != null
          ? { cl: result.xbarR.grandMean, ucl: result.xbarR.ucl_x, lcl: result.xbarR.lcl_x }
          : {}

    if (!rule1.length) {
      stable = true
      iterLog.push({ iteration: iter + 1, removedCount: 0, removedOriginalIndices: [], ...limits })
      break
    }

    const removed: number[] = []
    for (const sig of rule1) {
      for (const idx of sig.indices) {
        const origIdx = active[idx]?.originalIndex
        if (origIdx !== undefined && !cleaned.has(origIdx)) {
          cleaned.add(origIdx)
          removed.push(origIdx)
        }
      }
    }
    iterLog.push({
      iteration: iter + 1,
      removedCount: removed.length,
      removedOriginalIndices: removed,
      ...limits,
    })
  }

  return { cleanedIndices: cleaned, iterationLog: iterLog, stable }
}

export function computePChart(points: PChartPoint[]) {
  if (points.length < 2) return null
  const totalInspected = points.reduce((s, p) => s + p.n_inspected, 0)
  const totalNonconforming = points.reduce((s, p) => s + p.n_nonconforming, 0)
  const pBar = totalNonconforming / (totalInspected || 1)

  const subgroupStats = points.map((pt) => {
    const n = pt.n_inspected || 1
    const p = pt.p_value
    const ucl = Math.min(1, pBar + 3 * Math.sqrt((pBar * (1 - pBar)) / n))
    const lcl = Math.max(0, pBar - 3 * Math.sqrt((pBar * (1 - pBar)) / n))
    return { ...pt, p, n, ucl, lcl }
  })

  const ucl_avg = mean(subgroupStats.map((s) => s.ucl))
  const lcl_avg = mean(subgroupStats.map((s) => s.lcl))
  const signals = subgroupStats
    .map((s, i) => ({ ...s, index: i }))
    .filter((s) => s.p > s.ucl || s.p < s.lcl)
    .map((s) => ({ rule: 1, indices: [s.index], description: 'Proportion beyond control limit' }))

  return { pBar, subgroupStats, ucl_avg, lcl_avg, signals }
}

export function computeCChart(points: CountChartPoint[]) {
  if (points.length < 2) return null
  const counts = points.map((p) => p.defect_count)
  const cBar = mean(counts)
  if (cBar == null) return null
  const sigma = Math.sqrt(Math.max(cBar, 0))
  const ucl = Math.max(0, cBar + 3 * sigma)
  const lcl = Math.max(0, cBar - 3 * sigma)
  const signals = points
    .map((p, i) => ({ ...p, i }))
    .filter((p) => p.defect_count > ucl || p.defect_count < lcl)
    .map((p) => ({ rule: 1, indices: [p.i], description: 'Defect count beyond control limit' }))
  return { cBar, ucl, lcl, sigma, signals }
}

export function computeUChart(points: UChartPoint[]) {
  if (points.length < 2) return null
  const totalDefects = points.reduce((s, p) => s + p.defect_count, 0)
  const totalUnits = points.reduce((s, p) => s + (p.n_units || 1), 0)
  const uBar = totalDefects / (totalUnits || 1)

  const subgroupStats = points.map((pt, i) => {
    const n = pt.n_units || 1
    const u = pt.defect_count / n
    const ucl = uBar + 3 * Math.sqrt(uBar / n)
    const lcl = Math.max(0, uBar - 3 * Math.sqrt(uBar / n))
    return { ...pt, u, n, ucl, lcl, index: i }
  })
  const signals = subgroupStats
    .filter((s) => s.u > s.ucl || s.u < s.lcl)
    .map((s) => ({ rule: 1, indices: [s.index], description: 'Defects per unit beyond control limit' }))
  const ucl_avg = mean(subgroupStats.map((s) => s.ucl))
  const lcl_avg = mean(subgroupStats.map((s) => s.lcl))

  return { uBar, subgroupStats, ucl_avg, lcl_avg, signals }
}

export function computeNPChart(points: NPChartPoint[]) {
  if (points.length < 2) return null
  const totalInspected = points.reduce((s, p) => s + p.n_inspected, 0)
  const totalNonconforming = points.reduce((s, p) => s + p.n_nonconforming, 0)
  const pBar = totalNonconforming / (totalInspected || 1)
  const nBar = mean(points.map((p) => p.n_inspected))
  if (nBar == null) return null
  const npBar = pBar * nBar

  const ucl = npBar + 3 * Math.sqrt(npBar * (1 - pBar))
  const lcl = Math.max(0, npBar - 3 * Math.sqrt(npBar * (1 - pBar)))
  const signals = points
    .map((p, i) => ({ ...p, i }))
    .filter((p) => p.n_nonconforming > ucl || p.n_nonconforming < lcl)
    .map((p) => ({ rule: 1, indices: [p.i], description: 'Number nonconforming beyond control limit' }))

  return { npBar, pBar, nBar, ucl, lcl, signals }
}
