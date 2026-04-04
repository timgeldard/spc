/**
 * SPC Statistical Calculations
 *
 * All functions are pure — no side effects, no DOM, no API calls.
 * Control limit formulas follow AIAG SPC Reference Manual 4th Edition.
 * Nelson rules follow the original Nelson (1984) formulation.
 */

import { getConstants } from './spcConstants.js'

// ---------------------------------------------------------------------------
// Basic statistics helpers
// ---------------------------------------------------------------------------

export function mean(values) {
  if (!values || values.length === 0) return null
  return values.reduce((s, v) => s + v, 0) / values.length
}

export function stddevPop(values) {
  const m = mean(values)
  if (m === null || values.length < 2) return null
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

// Sample standard deviation (N−1 denominator).
// Used for Pp/Ppk per AIAG SPC Reference Manual 4th Edition.
export function stddevSample(values) {
  const m = mean(values)
  if (m === null || values.length < 2) return null
  const variance = values.reduce((s, v) => s + (v - m) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

// ---------------------------------------------------------------------------
// I-MR Chart (Individuals + Moving Range)
// Use when avg samples per batch ≤ 1.5 (one measurement per batch)
// ---------------------------------------------------------------------------

/**
 * Compute I-MR control limits from an array of individual values.
 * Values must be in time order (batch_seq order).
 *
 * @param {number[]} values - individual measurements in time order
 * @returns {{
 *   xBar: number,         grand mean
 *   mrBar: number,        mean of moving ranges
 *   sigmaWithin: number,  estimated sigma_within = mrBar / d2(2)
 *   ucl_x: number,        UCL for individuals chart
 *   lcl_x: number,        LCL for individuals chart
 *   ucl_mr: number,       UCL for moving range chart
 *   sigma1: number,       1-sigma distance from centerline
 *   sigma2: number,       2-sigma distance from centerline
 *   movingRanges: number[], MR values (length = values.length - 1)
 * }}
 */
export function computeIMR(values) {
  if (!values || values.length < 2) return null

  const { d2, D4 } = getConstants(2) // n=2 for MR of consecutive pairs

  // Moving ranges: |x_i - x_{i-1}|
  const movingRanges = []
  for (let i = 1; i < values.length; i++) {
    movingRanges.push(Math.abs(values[i] - values[i - 1]))
  }

  const xBar = mean(values)
  const mrBar = mean(movingRanges)
  const sigmaWithin = mrBar / d2

  return {
    xBar,
    mrBar,
    sigmaWithin,
    ucl_x:  xBar + 3 * sigmaWithin,
    lcl_x:  xBar - 3 * sigmaWithin,
    ucl_mr: D4 * mrBar,
    lcl_mr: 0,                       // always 0 for n ≤ 6
    sigma1: sigmaWithin,
    sigma2: 2 * sigmaWithin,
    movingRanges,
  }
}

// ---------------------------------------------------------------------------
// X-bar / R Chart
// Use when avg samples per batch > 1.5 (multiple measurements per batch)
// ---------------------------------------------------------------------------

/**
 * Group raw chart-data points into subgroups by batch_seq.
 * @param {Array<{batch_seq: number, value: number, batch_id: string, batch_date: string}>} points
 * @returns {Array<{batchSeq: number, batchId: string, batchDate: string, values: number[]}>}
 */
export function groupIntoSubgroups(points) {
  const map = new Map()
  for (const pt of points) {
    const key = pt.batch_seq
    if (!map.has(key)) {
      map.set(key, {
        batchSeq: pt.batch_seq,
        batchId: pt.batch_id,
        batchDate: pt.batch_date,
        values: [],
      })
    }
    map.get(key).values.push(pt.value)
  }
  return Array.from(map.values()).sort((a, b) => a.batchSeq - b.batchSeq)
}

/**
 * Compute X-bar / R control limits from subgroups.
 *
 * @param {Array<{batchSeq, batchId, batchDate, values: number[]}>} subgroups
 * @returns {{
 *   grandMean: number,
 *   rBar: number,
 *   sigmaWithin: number,
 *   subgroupStats: Array<{batchSeq, batchId, batchDate, xbar, range, n, ucl_x, lcl_x, ucl_r, lcl_r}>,
 *   // When all subgroups same size:
 *   ucl_x: number,
 *   lcl_x: number,
 *   ucl_r: number,
 *   lcl_r: number,
 *   sigma1: number,
 *   sigma2: number,
 * }}
 */
export function computeXbarR(subgroups) {
  if (!subgroups || subgroups.length < 2) return null

  // Compute per-subgroup stats
  const subgroupStats = subgroups.map(sg => {
    const n = sg.values.length
    const xbar = mean(sg.values)
    const range = Math.max(...sg.values) - Math.min(...sg.values)
    return { ...sg, n, xbar, range }
  })

  const grandMean = mean(subgroupStats.map(s => s.xbar))
  const rBar = mean(subgroupStats.map(s => s.range))

  // Detect variable subgroup size
  const sizes = [...new Set(subgroupStats.map(s => s.n))]
  const constantN = sizes.length === 1 ? sizes[0] : null

  // Per-subgroup limits (handles variable subgroup sizes)
  const statsWithLimits = subgroupStats.map(s => {
    const { d2, A2, D3, D4 } = getConstants(s.n)
    const sigmaWithin = rBar / d2
    return {
      ...s,
      ucl_x: grandMean + A2 * rBar,
      lcl_x: grandMean - A2 * rBar,
      ucl_r: D4 * rBar,
      lcl_r: D3 * rBar,
      sigmaWithin,
    }
  })

  // Overall limits from constant n (used for reference lines)
  let ucl_x, lcl_x, ucl_r, lcl_r, sigmaWithin, sigma1, sigma2
  const refN = constantN ?? Math.round(mean(subgroupStats.map(s => s.n)))
  const { d2: refD2, A2: refA2, D3: refD3, D4: refD4 } = getConstants(refN)
  sigmaWithin = rBar / refD2
  ucl_x = grandMean + refA2 * rBar
  lcl_x = grandMean - refA2 * rBar
  ucl_r = refD4 * rBar
  lcl_r = refD3 * rBar
  sigma1 = sigmaWithin
  sigma2 = 2 * sigmaWithin

  return {
    grandMean,
    rBar,
    sigmaWithin,
    subgroupStats: statsWithLimits,
    ucl_x, lcl_x, ucl_r, lcl_r,
    sigma1, sigma2,
  }
}

// ---------------------------------------------------------------------------
// Normal CDF (Abramowitz & Stegun 26.2.17, max error 7.5e-8)
// Used for DPMO calculations and confidence intervals.
// ---------------------------------------------------------------------------

export function normalCDF(z) {
  const t = 1 / (1 + 0.2316419 * Math.abs(z))
  const poly = t * (0.319381530 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))))
  const base = 1 - (1 / Math.sqrt(2 * Math.PI)) * Math.exp(-0.5 * z * z) * poly
  return z >= 0 ? base : 1 - base
}

// ---------------------------------------------------------------------------
// Process Capability Indices
// ---------------------------------------------------------------------------

/**
 * Compute Cp, Cpk (within-subgroup), Pp, Ppk (overall), confidence intervals,
 * Z-score, and DPMO.
 *
 * Supports two calling conventions:
 *   NEW: computeCapability(values, specConfig, sigmaWithin)
 *     specConfig: { spec_type, usl, lsl, nominal, tolerance }
 *     spec_type: 'bilateral_symmetric' | 'bilateral_asymmetric' |
 *                'unilateral_upper' | 'unilateral_lower'
 *
 *   LEGACY (backward compat): computeCapability(values, nominal, tolerance, sigmaWithin)
 *
 * @returns {{ usl, lsl, cp, cpk, pp, ppk, sigmaOverall, xBar,
 *             cpkLower95, cpkUpper95, zScore, dpmo, spec_type }}
 */
export function computeCapability(values, specConfigOrNominal, toleranceOrSigmaWithin, sigmaWithinIfOld) {
  // Backward-compat shim: detect old (values, nominal, tolerance, sigmaWithin) signature
  let specConfig, sigmaWithin
  if (typeof specConfigOrNominal === 'number' || specConfigOrNominal === null || specConfigOrNominal === undefined) {
    const nominal   = specConfigOrNominal
    const tolerance = toleranceOrSigmaWithin
    sigmaWithin     = sigmaWithinIfOld
    specConfig      = { spec_type: 'bilateral_symmetric', nominal, tolerance }
  } else {
    specConfig  = specConfigOrNominal
    sigmaWithin = toleranceOrSigmaWithin
  }

  const { spec_type = 'bilateral_symmetric', nominal, tolerance } = specConfig ?? {}

  // Resolve USL / LSL based on spec type
  let usl = specConfig?.usl ?? null
  let lsl = specConfig?.lsl ?? null

  if (spec_type === 'bilateral_symmetric') {
    if (usl == null || lsl == null) {
      // Fall back to computing from nominal ± tolerance when direct limits not supplied
      if (nominal == null || tolerance == null || tolerance <= 0) {
        return { cp: null, cpk: null, pp: null, ppk: null, usl: null, lsl: null,
                 cpkLower95: null, cpkUpper95: null, zScore: null, dpmo: null, spec_type }
      }
      usl = nominal + tolerance
      lsl = nominal - tolerance
    }
  }
  // For other types, usl/lsl must be supplied directly in specConfig

  const hasUsl = usl != null
  const hasLsl = lsl != null
  if (!hasUsl && !hasLsl) {
    return { cp: null, cpk: null, pp: null, ppk: null, usl, lsl,
             cpkLower95: null, cpkUpper95: null, zScore: null, dpmo: null, spec_type }
  }

  if (!values || values.length < 5) {
    return { cp: null, cpk: null, pp: null, ppk: null, usl, lsl,
             cpkLower95: null, cpkUpper95: null, zScore: null, dpmo: null, spec_type }
  }

  const xBar        = mean(values)
  const sigmaOverall = stddevSample(values)  // N−1 per AIAG SPC 4th ed. for Pp/Ppk
  const n           = values.length

  let cp = null, cpk = null, pp = null, ppk = null

  const specWidth = (hasUsl && hasLsl) ? usl - lsl : null

  if (sigmaWithin && sigmaWithin > 0) {
    if (specWidth != null) cp = round3(specWidth / (6 * sigmaWithin))
    if (hasUsl && hasLsl) {
      cpk = round3(Math.min((usl - xBar) / (3 * sigmaWithin), (xBar - lsl) / (3 * sigmaWithin)))
    } else if (hasUsl) {
      cpk = round3((usl - xBar) / (3 * sigmaWithin))
    } else {
      cpk = round3((xBar - lsl) / (3 * sigmaWithin))
    }
  }

  if (sigmaOverall && sigmaOverall > 0) {
    if (specWidth != null) pp = round3(specWidth / (6 * sigmaOverall))
    if (hasUsl && hasLsl) {
      ppk = round3(Math.min((usl - xBar) / (3 * sigmaOverall), (xBar - lsl) / (3 * sigmaOverall)))
    } else if (hasUsl) {
      ppk = round3((usl - xBar) / (3 * sigmaOverall))
    } else {
      ppk = round3((xBar - lsl) / (3 * sigmaOverall))
    }
  }

  // 95% CI on Cpk — valid for n >= 25 (Montgomery 2009)
  let cpkLower95 = null, cpkUpper95 = null
  if (cpk !== null && n >= 25) {
    const se = Math.sqrt(1 / (9 * n) + cpk ** 2 / (2 * (n - 1)))
    cpkLower95 = round3(cpk - 1.96 * se)
    cpkUpper95 = round3(cpk + 1.96 * se)
  }

  // Z-score and DPMO (long-term, 1.5σ shift convention)
  const zScore = cpk !== null ? round3(cpk * 3) : null
  const dpmo   = zScore !== null ? Math.round(normalCDF(-(zScore - 1.5)) * 1_000_000) : null

  return { usl, lsl, cp, cpk, pp, ppk, sigmaOverall, xBar,
           cpkLower95, cpkUpper95, zScore, dpmo, spec_type,
           dpmo_convention: 'motorola_1.5sigma_shift' }
}

function round3(v) {
  return Math.round(v * 1000) / 1000
}

// ---------------------------------------------------------------------------
// WECO Rules (Western Electric Company Statistical Quality Control Handbook, 1956)
// The four canonical out-of-control tests applied to control charts.
// ---------------------------------------------------------------------------

/**
 * Detect WECO rule violations in a series of values.
 *
 * Rules (source: Western Electric SQC Handbook, 1956):
 *   1. Any single point beyond the 3σ control limits (UCL / LCL)
 *   2. Two of three consecutive points beyond the 2σ limit, same side of CL
 *   3. Four of five consecutive points beyond the 1σ limit, same side of CL
 *   4. Eight consecutive points on the same side of the centre line
 *
 * @param {number[]} values
 * @param {{
 *   cl:     number,   centre line
 *   ucl:    number,   upper control limit (CL + 3σ)
 *   lcl:    number,   lower control limit (CL − 3σ)
 *   sigma1: number,   1σ distance from CL
 *   sigma2: number,   2σ distance from CL
 * }} limits
 * @returns {Array<{rule: number, indices: number[], description: string}>}
 */
export function detectWECORules(values, limits) {
  if (!values || values.length < 2 || !limits) return []

  const { cl, ucl, lcl, sigma1, sigma2 } = limits
  const signals = []
  const n = values.length

  const side = (v) => v >= cl ? 1 : -1   // +1 above CL, -1 below CL

  // Rule 1: Single point outside ±3σ
  for (let i = 0; i < n; i++) {
    if (values[i] > ucl || values[i] < lcl) {
      signals.push({
        rule: 1,
        indices: [i],
        description: 'Point beyond 3σ control limit',
      })
    }
  }

  // Rule 2: 2 of 3 consecutive points beyond ±2σ (same side)
  for (let i = 2; i < n; i++) {
    const w = values.slice(i - 2, i + 1)
    const aboveZoneA = w.filter(v => v > cl + sigma2).length
    const belowZoneA = w.filter(v => v < cl - sigma2).length
    if (aboveZoneA >= 2) {
      signals.push({
        rule: 2,
        indices: range(i - 2, i),
        description: '2 of 3 consecutive points beyond +2σ (Zone A)',
      })
    } else if (belowZoneA >= 2) {
      signals.push({
        rule: 2,
        indices: range(i - 2, i),
        description: '2 of 3 consecutive points beyond −2σ (Zone A)',
      })
    }
  }

  // Rule 3: 4 of 5 consecutive points beyond ±1σ (same side)
  for (let i = 4; i < n; i++) {
    const w = values.slice(i - 4, i + 1)
    const aboveZoneB = w.filter(v => v > cl + sigma1).length
    const belowZoneB = w.filter(v => v < cl - sigma1).length
    if (aboveZoneB >= 4) {
      signals.push({
        rule: 3,
        indices: range(i - 4, i),
        description: '4 of 5 consecutive points beyond +1σ (Zone B)',
      })
    } else if (belowZoneB >= 4) {
      signals.push({
        rule: 3,
        indices: range(i - 4, i),
        description: '4 of 5 consecutive points beyond −1σ (Zone B)',
      })
    }
  }

  // Rule 4: 8 consecutive points on the same side of the centre line
  for (let i = 7; i < n; i++) {
    const w = values.slice(i - 7, i + 1)
    const s = side(w[0])
    if (w.every(v => side(v) === s)) {
      signals.push({
        rule: 4,
        indices: range(i - 7, i),
        description: `8 consecutive points ${s === 1 ? 'above' : 'below'} the centre line`,
      })
    }
  }

  return signals
}

// ---------------------------------------------------------------------------
// Nelson Rules (Nelson, 1984 — Journal of Quality Technology)
// Extended set of 8 tests, superset of the 4 WECO rules.
// ---------------------------------------------------------------------------

/**
 * Detect Nelson rule violations in a series of values.
 *
 * Rules:
 *   1. One point beyond ±3σ
 *   2. Nine consecutive points same side of CL
 *   3. Six consecutive points monotonically increasing or decreasing
 *   4. Fourteen consecutive points alternating up/down
 *   5. Two of three consecutive points beyond ±2σ, same side
 *   6. Four of five consecutive points beyond ±1σ, same side
 *   7. Fifteen consecutive points within ±1σ (Zone C, hugging CL)
 *   8. Eight consecutive points outside ±1σ on both sides (mixture)
 *
 * @param {number[]} values
 * @param {{ cl, ucl, lcl, sigma1, sigma2 }} limits
 * @returns {Array<{rule: number, indices: number[], description: string}>}
 */
export function detectNelsonRules(values, limits) {
  if (!values || values.length < 2 || !limits) return []

  const { cl, ucl, lcl, sigma1, sigma2 } = limits
  const signals = []
  const n = values.length

  const side = (v) => v >= cl ? 1 : -1

  // Rule 1: Single point outside ±3σ
  for (let i = 0; i < n; i++) {
    if (values[i] > ucl || values[i] < lcl) {
      signals.push({ rule: 1, indices: [i], description: 'Point beyond 3σ control limit' })
    }
  }

  // Rule 2: 9 consecutive points same side of CL
  for (let i = 8; i < n; i++) {
    const w = values.slice(i - 8, i + 1)
    const s = side(w[0])
    if (w.every(v => side(v) === s)) {
      signals.push({ rule: 2, indices: range(i - 8, i), description: `9 consecutive points ${s === 1 ? 'above' : 'below'} the centre line` })
    }
  }

  // Rule 3: 6 consecutive points monotonically increasing or decreasing
  for (let i = 5; i < n; i++) {
    const w = values.slice(i - 5, i + 1)
    const up   = w.every((v, j) => j === 0 || v > w[j - 1])
    const down = w.every((v, j) => j === 0 || v < w[j - 1])
    if (up || down) {
      signals.push({ rule: 3, indices: range(i - 5, i), description: `6 consecutive points ${up ? 'increasing' : 'decreasing'} (trend)` })
    }
  }

  // Rule 4: 14 consecutive points alternating up/down (direction-agnostic sign-change check)
  for (let i = 13; i < n; i++) {
    const w = values.slice(i - 13, i + 1)
    const alternating = w.every((v, j) => {
      if (j < 2) return true
      return (v - w[j - 1]) * (w[j - 1] - w[j - 2]) < 0
    })
    if (alternating) {
      signals.push({ rule: 4, indices: range(i - 13, i), description: '14 consecutive points alternating up/down' })
    }
  }

  // Rule 5: 2 of 3 consecutive points beyond ±2σ, same side
  for (let i = 2; i < n; i++) {
    const w = values.slice(i - 2, i + 1)
    const aboveA = w.filter(v => v > cl + sigma2).length
    const belowA = w.filter(v => v < cl - sigma2).length
    if (aboveA >= 2) signals.push({ rule: 5, indices: range(i - 2, i), description: '2 of 3 consecutive points beyond +2σ (Zone A)' })
    else if (belowA >= 2) signals.push({ rule: 5, indices: range(i - 2, i), description: '2 of 3 consecutive points beyond −2σ (Zone A)' })
  }

  // Rule 6: 4 of 5 consecutive points beyond ±1σ, same side
  for (let i = 4; i < n; i++) {
    const w = values.slice(i - 4, i + 1)
    const aboveB = w.filter(v => v > cl + sigma1).length
    const belowB = w.filter(v => v < cl - sigma1).length
    if (aboveB >= 4) signals.push({ rule: 6, indices: range(i - 4, i), description: '4 of 5 consecutive points beyond +1σ (Zone B)' })
    else if (belowB >= 4) signals.push({ rule: 6, indices: range(i - 4, i), description: '4 of 5 consecutive points beyond −1σ (Zone B)' })
  }

  // Rule 7: 15 consecutive points within ±1σ (Zone C)
  for (let i = 14; i < n; i++) {
    const w = values.slice(i - 14, i + 1)
    if (w.every(v => Math.abs(v - cl) <= sigma1)) {
      signals.push({ rule: 7, indices: range(i - 14, i), description: '15 consecutive points within Zone C (hugging centre line)' })
    }
  }

  // Rule 8: 8 consecutive points outside ±1σ on both sides
  for (let i = 7; i < n; i++) {
    const w = values.slice(i - 7, i + 1)
    if (w.every(v => Math.abs(v - cl) > sigma1)) {
      signals.push({ rule: 8, indices: range(i - 7, i), description: '8 consecutive points outside Zone C (mixture pattern)' })
    }
  }

  return signals
}

// ---------------------------------------------------------------------------
// Rule set dispatcher
// ---------------------------------------------------------------------------

export function detectRules(values, limits, ruleSet = 'weco') {
  return ruleSet === 'nelson'
    ? detectNelsonRules(values, limits)
    : detectWECORules(values, limits)
}

// Build array of indices [start..end] inclusive
function range(start, end) {
  const arr = []
  for (let i = start; i <= end; i++) arr.push(i)
  return arr
}

// ---------------------------------------------------------------------------
// Histogram helpers (for capability histogram)
// ---------------------------------------------------------------------------

/**
 * Compute histogram bins using the Freedman-Diaconis rule.
 * Bin width h = 2 * IQR * n^(-1/3).
 * Falls back to 10 bins when IQR = 0 (constant or near-constant data).
 * Sturges' formula (log₂ n + 1) underestimates bin count for skewed or
 * outlier-heavy distributions — common in manufacturing QM data — causing
 * broad bins that hide the true shape of the process.  Freedman-Diaconis
 * is robust to non-normality because it bases width on the IQR rather than
 * sample size alone.
 * @param {number[]} values
 * @param {number} [forceBins] - override bin count
 * @returns {{ bins: Array<{x0, x1, count}>, binWidth: number }}
 */
export function computeHistogram(values, forceBins = null) {
  if (!values || values.length === 0) return { bins: [], binWidth: 0 }

  const n = values.length
  const minVal = Math.min(...values)
  const maxVal = Math.max(...values)
  const range_ = maxVal - minVal || 1

  let binWidth
  if (forceBins != null) {
    binWidth = range_ / forceBins
  } else {
    const sorted = [...values].sort((a, b) => a - b)
    const q1 = sorted[Math.floor(n * 0.25)]
    const q3 = sorted[Math.floor(n * 0.75)]
    const iqr = q3 - q1
    if (iqr > 0) {
      binWidth = 2 * iqr * Math.pow(n, -1 / 3)
    } else {
      // IQR = 0: data is constant or has extreme outliers — fall back to 10 bins
      binWidth = range_ / 10
    }
  }

  const k = Math.max(1, Math.ceil(range_ / binWidth))

  const bins = Array.from({ length: k }, (_, i) => ({
    x0: minVal + i * binWidth,
    x1: minVal + (i + 1) * binWidth,
    midpoint: minVal + (i + 0.5) * binWidth,
    count: 0,
  }))

  for (const v of values) {
    const idx = Math.min(k - 1, Math.floor((v - minVal) / binWidth))
    if (idx >= 0) bins[idx].count++
  }

  return { bins, binWidth }
}

/**
 * Compute normal distribution curve points for overlay on histogram.
 * @param {number} mu     - mean
 * @param {number} sigma  - standard deviation
 * @param {number} minX
 * @param {number} maxX
 * @param {number} n      - sample size (for scaling curve to count scale)
 * @param {number} binWidth
 * @returns {Array<{x: number, y: number}>}
 */
export function normalCurve(mu, sigma, minX, maxX, n, binWidth) {
  if (sigma <= 0) return []
  const points = []
  const steps = 100
  const step = (maxX - minX) / steps
  for (let i = 0; i <= steps; i++) {
    const x = minX + i * step
    const y = (1 / (sigma * Math.sqrt(2 * Math.PI))) *
              Math.exp(-0.5 * ((x - mu) / sigma) ** 2) *
              n * binWidth
    points.push({ x: Math.round(x * 10000) / 10000, y: Math.round(y * 1000) / 1000 })
  }
  return points
}

// ---------------------------------------------------------------------------
// Main orchestration helper
// ---------------------------------------------------------------------------

/**
 * From raw chart-data API points, compute everything needed to render charts.
 *
 * @param {Array<{batch_id, batch_seq, sample_seq, value, nominal, tolerance}>} points
 * @param {'imr'|'xbar_r'} chartType
 * @returns {{
 *   chartType: string,
 *   values: number[],               all individual values (time ordered)
 *   imr: object|null,               I-MR limits (if chartType=imr)
 *   xbarR: object|null,             X-bar/R limits (if chartType=xbar_r)
 *   subgroups: Array|null,          grouped subgroups (if chartType=xbar_r)
 *   capability: object,             Cp/Cpk/Pp/Ppk
 *   signals: Array,                 Nelson rule violations (on individual/xbar series)
 *   mrSignals: Array,               Nelson rule violations on MR chart
 *   nominal: number|null,
 *   tolerance: number|null,
 * }}
 */
export function computeAll(points, chartType = 'imr', ruleSet = 'weco') {
  if (!points || points.length === 0) {
    return { chartType, ruleSet, values: [], sorted: [], imr: null, xbarR: null, subgroups: null, capability: null, signals: [], mrSignals: [] }
  }

  // Find the first point that carries valid spec data; don't assume points[0] has it.
  // Early production batches may have no spec recorded, so scan all points.
  const specPoint = points.find(p => p.usl != null || p.lsl != null)
    ?? points.find(p => p.nominal != null && p.tolerance != null && p.tolerance > 0)
    ?? points[0]

  const nominal   = specPoint?.nominal   ?? null
  const tolerance = specPoint?.tolerance ?? null
  const spec_type = specPoint?.spec_type ?? 'bilateral_symmetric'
  const specConfig = {
    spec_type,
    nominal,
    tolerance,
    usl: specPoint?.usl ?? null,
    lsl: specPoint?.lsl ?? null,
  }

  const sorted = [...points].sort((a, b) =>
    a.batch_seq !== b.batch_seq ? a.batch_seq - b.batch_seq : a.sample_seq - b.sample_seq
  )

  const values = sorted.map(p => p.value)

  if (chartType === 'xbar_r') {
    const subgroups = groupIntoSubgroups(sorted)
    if (subgroups.length < 2) return computeAll(points, 'imr', ruleSet)

    const xbarR      = computeXbarR(subgroups)
    const xbarValues = xbarR.subgroupStats.map(s => s.xbar)
    const capability = computeCapability(values, specConfig, xbarR.sigmaWithin)

    const xbarLimits = { cl: xbarR.grandMean, ucl: xbarR.ucl_x, lcl: xbarR.lcl_x, sigma1: xbarR.sigma1, sigma2: xbarR.sigma2 }
    const rLimits    = { cl: xbarR.rBar, ucl: xbarR.ucl_r, lcl: xbarR.lcl_r, sigma1: xbarR.rBar / 3, sigma2: (xbarR.rBar * 2) / 3 }

    return {
      chartType: 'xbar_r',
      ruleSet,
      values,
      sorted,
      imr: null,
      xbarR,
      subgroups,
      capability,
      signals:   detectRules(xbarValues, xbarLimits, ruleSet),
      mrSignals: detectRules(xbarR.subgroupStats.map(s => s.range), rLimits, ruleSet),
      nominal,
      tolerance,
      specConfig,
    }
  }

  // Default: I-MR
  const imr = computeIMR(values)
  if (!imr) return { chartType: 'imr', ruleSet, values, sorted, imr: null, xbarR: null, subgroups: null, capability: null, signals: [], mrSignals: [] }

  const capability = computeCapability(values, specConfig, imr.sigmaWithin)

  const xLimits  = { cl: imr.xBar,  ucl: imr.ucl_x,  lcl: imr.lcl_x,  sigma1: imr.sigma1,   sigma2: imr.sigma2 }
  const mrLimits = { cl: imr.mrBar, ucl: imr.ucl_mr, lcl: imr.lcl_mr, sigma1: imr.mrBar / 3, sigma2: (imr.mrBar * 2) / 3 }

  return {
    chartType: 'imr',
    ruleSet,
    values,
    sorted,
    imr,
    xbarR: null,
    subgroups: null,
    capability,
    signals:   detectRules(values, xLimits, ruleSet),
    mrSignals: detectRules(imr.movingRanges, mrLimits, ruleSet),
    nominal,
    tolerance,
    specConfig,
  }
}

// ---------------------------------------------------------------------------
// Rolling Capability Trend (Feature 9)
// ---------------------------------------------------------------------------

/**
 * Compute Cpk in a rolling window across time-ordered points.
 *
 * @param {Array} sortedPoints   - points in batch_seq order (from computeAll.sorted)
 * @param {number} windowSize    - minimum 10, default 20
 * @param {object} specConfig    - { spec_type, usl, lsl, nominal, tolerance }
 * @returns {Array<{ windowEnd, batchSeq, batchDate, n, cpk, cp, zScore }>}
 */
export function computeRollingCapability(sortedPoints, windowSize = 20, specConfig = {}) {
  if (!sortedPoints || sortedPoints.length < windowSize) return []
  const result = []
  for (let end = windowSize - 1; end < sortedPoints.length; end++) {
    const window   = sortedPoints.slice(end - windowSize + 1, end + 1)
    const vals     = window.map(p => p.value).filter(v => v != null)
    const imr      = computeIMR(vals)
    if (!imr) continue
    const cap      = computeCapability(vals, specConfig, imr.sigmaWithin)
    result.push({
      windowEnd: end,
      batchSeq:  window[window.length - 1].batch_seq,
      batchDate: window[window.length - 1].batch_date,
      n:         windowSize,
      cpk:       cap.cpk,
      cp:        cap.cp,
      zScore:    cap.zScore,
    })
  }
  return result
}

// ---------------------------------------------------------------------------
// Phase I Auto-Clean (Feature 10)
// ---------------------------------------------------------------------------

/**
 * Iteratively remove Rule 1 (3σ) OOC points until the process is stable.
 * Maximum 10 iterations to prevent infinite loops.
 *
 * @param {Array} indexedPoints - points with `originalIndex` field (from useSPCCalculations)
 * @param {'imr'|'xbar_r'} chartType
 * @param {'weco'|'nelson'} ruleSet
 * @param {object} specConfig
 * @returns {{
 *   cleanedIndices: Set<number>,
 *   iterationLog: Array<{ iteration, removedCount, removedOriginalIndices, ucl, lcl, cl }>,
 *   stable: boolean,
 * }}
 */
export function autoCleanPhaseI(indexedPoints, chartType = 'imr', ruleSet = 'weco', specConfig = {}) {
  const MAX_ITER   = 10
  const cleaned    = new Set()
  const iterLog    = []
  let   stable     = false

  for (let iter = 0; iter < MAX_ITER; iter++) {
    const active = indexedPoints.filter(p => !cleaned.has(p.originalIndex))
    if (active.length < 5) break

    const result    = computeAll(active, chartType, ruleSet)
    const rule1     = result.signals.filter(s => s.rule === 1)

    const limits = result.imr
      ? { cl: result.imr.xBar, ucl: result.imr.ucl_x, lcl: result.imr.lcl_x }
      : result.xbarR
        ? { cl: result.xbarR.grandMean, ucl: result.xbarR.ucl_x, lcl: result.xbarR.lcl_x }
        : {}

    if (rule1.length === 0) {
      stable = true
      iterLog.push({ iteration: iter + 1, removedCount: 0, removedOriginalIndices: [], ...limits })
      break
    }

    const removed = []
    for (const sig of rule1) {
      for (const idx of sig.indices) {
        const origIdx = active[idx]?.originalIndex
        if (origIdx !== undefined && !cleaned.has(origIdx)) {
          cleaned.add(origIdx)
          removed.push(origIdx)
        }
      }
    }
    iterLog.push({ iteration: iter + 1, removedCount: removed.length, removedOriginalIndices: removed, ...limits })
  }

  return { cleanedIndices: cleaned, iterationLog: iterLog, stable }
}

// ---------------------------------------------------------------------------
// P-chart (Proportion Nonconforming)
// Use for attribute data where each batch has n_inspected and n_nonconforming
// ---------------------------------------------------------------------------

/**
 * Compute P-chart control limits using variable control limits (per-batch n).
 *
 * @param {Array<{batch_id, batch_seq, batch_date, n_inspected, n_nonconforming, p_value}>} points
 * @returns {{
 *   pBar: number,
 *   subgroupStats: Array<{batch_id, batch_seq, batch_date, p, n, ucl, lcl}>,
 *   ucl_avg: number,
 *   lcl_avg: number,
 *   signals: Array,
 * }}
 */
export function computePChart(points) {
  if (!points || points.length < 2) return null

  const totalInspected     = points.reduce((s, p) => s + p.n_inspected, 0)
  const totalNonconforming = points.reduce((s, p) => s + p.n_nonconforming, 0)
  const pBar = totalNonconforming / (totalInspected || 1)

  const subgroupStats = points.map(pt => {
    const n   = pt.n_inspected || 1
    const p   = pt.p_value
    const ucl = Math.min(1, pBar + 3 * Math.sqrt((pBar * (1 - pBar)) / n))
    const lcl = Math.max(0, pBar - 3 * Math.sqrt((pBar * (1 - pBar)) / n))
    return { ...pt, p, n, ucl, lcl }
  })

  const ucl_avg = mean(subgroupStats.map(s => s.ucl))
  const lcl_avg = mean(subgroupStats.map(s => s.lcl))

  const signals = subgroupStats
    .map((s, i) => ({ ...s, index: i }))
    .filter(s => s.p > s.ucl || s.p < s.lcl)
    .map(s => ({ rule: 1, indices: [s.index], description: 'Proportion beyond control limit' }))

  return { pBar, subgroupStats, ucl_avg, lcl_avg, signals }
}

// ---------------------------------------------------------------------------
// C-chart (Count of Defects, constant inspection unit size) — Feature 11
// ---------------------------------------------------------------------------

/**
 * @param {Array<{batch_id, batch_seq, batch_date, defect_count: number}>} points
 */
export function computeCChart(points) {
  if (!points || points.length < 2) return null
  const counts = points.map(p => p.defect_count)
  const cBar   = mean(counts)
  if (cBar == null) return null
  const sigma  = Math.sqrt(Math.max(cBar, 0))
  const ucl    = Math.max(0, cBar + 3 * sigma)
  const lcl    = Math.max(0, cBar - 3 * sigma)
  const signals = points
    .map((p, i) => ({ ...p, i }))
    .filter(p => p.defect_count > ucl || p.defect_count < lcl)
    .map(p => ({ rule: 1, indices: [p.i], description: 'Defect count beyond control limit' }))
  return { cBar, ucl, lcl, sigma, signals }
}

// ---------------------------------------------------------------------------
// U-chart (Defects per Unit, variable inspection unit size) — Feature 11
// ---------------------------------------------------------------------------

/**
 * @param {Array<{batch_id, batch_seq, batch_date, defect_count: number, n_units: number}>} points
 */
export function computeUChart(points) {
  if (!points || points.length < 2) return null
  const totalDefects = points.reduce((s, p) => s + p.defect_count, 0)
  const totalUnits   = points.reduce((s, p) => s + (p.n_units || 1), 0)
  const uBar = totalDefects / (totalUnits || 1)

  const subgroupStats = points.map((pt, i) => {
    const n   = pt.n_units || 1
    const u   = pt.defect_count / n
    const ucl = uBar + 3 * Math.sqrt(uBar / n)
    const lcl = Math.max(0, uBar - 3 * Math.sqrt(uBar / n))
    return { ...pt, u, n, ucl, lcl, index: i }
  })

  const signals = subgroupStats
    .filter(s => s.u > s.ucl || s.u < s.lcl)
    .map(s => ({ rule: 1, indices: [s.index], description: 'Defects per unit beyond control limit' }))

  const ucl_avg = mean(subgroupStats.map(s => s.ucl))
  const lcl_avg = mean(subgroupStats.map(s => s.lcl))

  return { uBar, subgroupStats, ucl_avg, lcl_avg, signals }
}

// ---------------------------------------------------------------------------
// NP-chart (Number Nonconforming, constant sample size) — Feature 11
// ---------------------------------------------------------------------------

/**
 * @param {Array<{batch_id, batch_seq, batch_date, n_nonconforming: number, n_inspected: number}>} points
 */
export function computeNPChart(points) {
  if (!points || points.length < 2) return null
  const totalInspected     = points.reduce((s, p) => s + p.n_inspected, 0)
  const totalNonconforming = points.reduce((s, p) => s + p.n_nonconforming, 0)
  const pBar = totalNonconforming / (totalInspected || 1)
  const nBar = mean(points.map(p => p.n_inspected))  // average n
  const npBar = pBar * nBar

  const ucl = npBar + 3 * Math.sqrt(npBar * (1 - pBar))
  const lcl = Math.max(0, npBar - 3 * Math.sqrt(npBar * (1 - pBar)))

  const signals = points
    .map((p, i) => ({ ...p, i }))
    .filter(p => p.n_nonconforming > ucl || p.n_nonconforming < lcl)
    .map(p => ({ rule: 1, indices: [p.i], description: 'Number nonconforming beyond control limit' }))

  return { npBar, pBar, nBar, ucl, lcl, signals }
}
