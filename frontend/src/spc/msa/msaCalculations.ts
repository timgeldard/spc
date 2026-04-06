/**
 * Gauge R&R calculation helpers.
 *
 * Supports:
 * - AIAG Average & Range method (legacy/default path)
 * - Crossed ANOVA Gauge R&R with operator-by-part interaction
 *
 * Input `data`: 3D array [operator][part][replicate] = measurement value
 * `tolerance`: USL - LSL (for %GRR/tolerance calculation)
 */
import type { MSAResult } from '../types'

type MeasurementValue = number | null
type MeasurementCube = MeasurementValue[][][]
const isNumber = (value: MeasurementValue): value is number => value != null && !Number.isNaN(value)

interface FinalizeGRRArgs {
  method: 'average_range' | 'anova'
  tolerance: number
  repeatabilityVar: number
  reproducibilityVar: number
  partVar: number
  interactionVar?: number
  extra?: Record<string, unknown>
}

// AIAG K1 table: d2* by number of replicates
const K1_TABLE: Record<number, number> = { 2: 0.8862, 3: 0.5908, 4: 0.4857, 5: 0.4299 }

// AIAG K2 table: d2* by number of operators
const K2_TABLE: Record<number, number> = { 2: 0.7071, 3: 0.5231, 4: 0.4467, 5: 0.4030 }

// AIAG K3 table: d2* by number of parts
const K3_TABLE: Record<number, number> = {
  2: 0.7071, 3: 0.5231, 4: 0.4467, 5: 0.4030,
  6: 0.3742, 7: 0.3534, 8: 0.3375, 9: 0.3249, 10: 0.3146,
}

function round(v: number, d: number): number {
  const factor = 10 ** d
  return Math.round(v * factor) / factor
}

function flattenValid(data: MeasurementCube): number[] {
  return data.flatMap(op =>
    op.flatMap(part =>
      part.filter(isNumber)
    )
  )
}

function finalizeGRR({
  method,
  tolerance,
  repeatabilityVar,
  reproducibilityVar,
  partVar,
  interactionVar = 0,
  extra = {},
}: FinalizeGRRArgs): MSAResult {
  const ev = Math.sqrt(Math.max(0, repeatabilityVar))
  const av = Math.sqrt(Math.max(0, reproducibilityVar))
  const interaction = Math.sqrt(Math.max(0, interactionVar))
  const reproducibilityTotal = Math.sqrt(Math.max(0, reproducibilityVar + interactionVar))
  const grr = Math.sqrt(ev ** 2 + reproducibilityTotal ** 2)
  const pv = Math.sqrt(Math.max(0, partVar))
  const tv = Math.sqrt(grr ** 2 + pv ** 2)

  const grrPct = tv > 0 ? round((100 * grr) / tv, 1) : null
  const grrPctTol = tolerance > 0 ? round((100 * (grr * 5.15)) / tolerance, 1) : null
  const ndc = pv > 0 && grr > 0 ? Math.floor(1.41 * (pv / grr)) : null

  return {
    method,
    ev: round(ev, 4),
    av: round(av, 4),
    interaction: round(interaction, 4),
    grr: round(grr, 4),
    pv: round(pv, 4),
    tv: round(tv, 4),
    repeatability: round(ev, 4),
    reproducibility: round(av, 4),
    reproducibilityTotal: round(reproducibilityTotal, 4),
    interactionVariation: round(interaction, 4),
    grrPct,
    grrPctTol,
    ndc,
    ...extra,
  }
}

export function computeGRR(data: MeasurementCube, tolerance: number): MSAResult {
  const nOperators = data.length
  const nParts = data[0]?.length ?? 0
  const nReplicates = data[0]?.[0]?.length ?? 0

  if (nOperators < 2 || nParts < 2 || nReplicates < 2) {
    return { error: 'Minimum: 2 operators, 2 parts, 2 replicates' }
  }

  const k1 = K1_TABLE[nReplicates]
  const k2 = K2_TABLE[nOperators]
  const k3 = K3_TABLE[nParts]

  if (!k1 || !k2 || !k3) {
    return { error: `Unsupported dimensions: ${nOperators} ops × ${nParts} parts × ${nReplicates} reps` }
  }

  const operatorRanges = data.map(opData =>
    opData.map(partData => {
      const vals = partData.filter(isNumber)
      if (!vals.length) return null
      return Math.max(...vals) - Math.min(...vals)
    }).filter(r => r != null)
  )
  const rBarsByOp = operatorRanges.map(rs => rs.reduce((s, r) => s + r, 0) / rs.length)
  const rBarBar = rBarsByOp.reduce((s, r) => s + r, 0) / nOperators

  const ev = rBarBar * k1

  const opMeans = data.map(opData => {
    const vals = opData.flatMap(pd => pd.filter(isNumber))
    return vals.reduce((s, v) => s + v, 0) / (vals.length || 1)
  })
  const xBarDiff = Math.max(...opMeans) - Math.min(...opMeans)

  const avRaw = (xBarDiff * k2) ** 2 - (ev ** 2) / (nParts * nReplicates)
  const av = Math.sqrt(Math.max(0, avRaw))
  const grr = Math.sqrt(ev ** 2 + av ** 2)

  const allPartMeans = Array.from({ length: nParts }, (_, pi) => {
    const vals = data.flatMap(op => op[pi] ?? []).filter(isNumber)
    return vals.reduce((s, v) => s + v, 0) / (vals.length || 1)
  })
  const rParts = Math.max(...allPartMeans) - Math.min(...allPartMeans)
  const pv = rParts * k3
  const tv = Math.sqrt(grr ** 2 + pv ** 2)

  const grrPct = tv > 0 ? round((100 * grr) / tv, 1) : null
  const grrPctTol = tolerance > 0 ? round((100 * (grr * 5.15)) / tolerance, 1) : null
  const ndc = pv > 0 && grr > 0 ? Math.floor(1.41 * (pv / grr)) : null

  const warning = avRaw < 0
    ? 'Negative variance detected: measurement system resolution may be insufficient.'
    : null

  return {
    method: 'average_range',
    ev: round(ev, 4),
    av: round(av, 4),
    grr: round(grr, 4),
    pv: round(pv, 4),
    tv: round(tv, 4),
    repeatability: round(ev, 4),
    reproducibility: round(av, 4),
    grrPct,
    grrPctTol,
    ndc,
    rBarBar: round(rBarBar, 4),
    xBarDiff: round(xBarDiff, 4),
    systemStabilityWarning: warning,
  }
}

function mean(values: number[]): number | null {
  if (!values.length) return null
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

function logGamma(z: number): number {
  const coeffs = [
    676.5203681218851,
    -1259.1392167224028,
    771.3234287776531,
    -176.6150291621406,
    12.507343278686905,
    -0.13857109526572012,
    9.984369578019572e-6,
    1.5056327351493116e-7,
  ]

  if (z < 0.5) {
    return Math.log(Math.PI) - Math.log(Math.sin(Math.PI * z)) - logGamma(1 - z)
  }

  let x = 0.9999999999998099
  const shifted = z - 1
  for (let i = 0; i < coeffs.length; i++) {
    x += coeffs[i] / (shifted + i + 1)
  }
  const t = shifted + coeffs.length - 0.5
  return 0.5 * Math.log(2 * Math.PI) + (shifted + 0.5) * Math.log(t) - t + Math.log(x)
}

function betacf(a: number, b: number, x: number): number {
  const maxIterations = 200
  const epsilon = 3e-7
  const fpMin = 1e-30

  let qab = a + b
  let qap = a + 1
  let qam = a - 1
  let c = 1
  let d = 1 - (qab * x) / qap
  if (Math.abs(d) < fpMin) d = fpMin
  d = 1 / d
  let h = d

  for (let m = 1; m <= maxIterations; m++) {
    const m2 = 2 * m
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2))
    d = 1 + aa * d
    if (Math.abs(d) < fpMin) d = fpMin
    c = 1 + aa / c
    if (Math.abs(c) < fpMin) c = fpMin
    d = 1 / d
    h *= d * c

    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2))
    d = 1 + aa * d
    if (Math.abs(d) < fpMin) d = fpMin
    c = 1 + aa / c
    if (Math.abs(c) < fpMin) c = fpMin
    d = 1 / d
    const del = d * c
    h *= del

    if (Math.abs(del - 1) < epsilon) break
  }

  return h
}

function regularizedIncompleteBeta(x: number, a: number, b: number): number {
  if (x <= 0) return 0
  if (x >= 1) return 1

  const bt = Math.exp(
    logGamma(a + b) - logGamma(a) - logGamma(b) +
    a * Math.log(x) +
    b * Math.log(1 - x),
  )

  if (x < (a + 1) / (a + b + 2)) {
    return (bt * betacf(a, b, x)) / a
  }
  return 1 - (bt * betacf(b, a, 1 - x)) / b
}

function fTestPValue(fValue: number, df1: number, df2: number): number | null {
  if (!(fValue >= 0) || df1 <= 0 || df2 <= 0) return null
  const x = (df1 * fValue) / (df1 * fValue + df2)
  return 1 - regularizedIncompleteBeta(x, df1 / 2, df2 / 2)
}

export function computeGRR_ANOVA(data: MeasurementCube, tolerance: number): MSAResult {
  const nOperators = data.length
  const nParts = data[0]?.length ?? 0
  const nReplicates = data[0]?.[0]?.length ?? 0

  if (nOperators < 2 || nParts < 2 || nReplicates < 2) {
    return { error: 'Minimum: 2 operators, 2 parts, 2 replicates' }
  }

  const values = flattenValid(data)
  if (!values.length) {
    return { error: 'No measurement values provided' }
  }

  const grandMean = mean(values) ?? 0
  const partMeans = Array.from({ length: nParts }, (_, partIndex) =>
    mean(data.flatMap(opData => opData[partIndex] ?? []).filter(isNumber)) ?? 0,
  )
  const operatorMeans = Array.from({ length: nOperators }, (_, operatorIndex) =>
    mean(data[operatorIndex].flatMap(partData => partData.filter(isNumber))) ?? 0,
  )
  const cellMeans = Array.from({ length: nOperators }, (_, operatorIndex) =>
    Array.from({ length: nParts }, (_, partIndex) =>
      mean((data[operatorIndex][partIndex] ?? []).filter(isNumber)) ?? 0,
    )
  )

  const ssPart = nOperators * nReplicates * partMeans.reduce(
    (sum, value) => sum + (value - grandMean) ** 2,
    0,
  )
  const ssOperator = nParts * nReplicates * operatorMeans.reduce(
    (sum, value) => sum + (value - grandMean) ** 2,
    0,
  )
  const ssInteraction = cellMeans.reduce((sum, operatorRow, operatorIndex) => (
    sum + operatorRow.reduce((cellSum, cellMean, partIndex) => (
      cellSum + ((cellMean - partMeans[partIndex] - operatorMeans[operatorIndex] + grandMean) ** 2)
    ), 0)
  ), 0) * nReplicates

  const ssRepeatability = data.reduce((sum, operatorRow, operatorIndex) => (
    sum + operatorRow.reduce((partSum, partRow, partIndex) => (
      partSum + partRow.reduce<number>((repSum, value) => {
        if (!isNumber(value)) return repSum
        return repSum + (value - cellMeans[operatorIndex][partIndex]) ** 2
      }, 0)
    ), 0)
  ), 0)

  const dfPart = nParts - 1
  const dfOperator = nOperators - 1
  const dfInteraction = dfPart * dfOperator
  const dfRepeatability = nParts * nOperators * (nReplicates - 1)

  const msPart = ssPart / dfPart
  const msOperator = ssOperator / dfOperator
  const msInteraction = ssInteraction / dfInteraction
  const msRepeatability = ssRepeatability / dfRepeatability

  const interactionPValue = fTestPValue(msInteraction / msRepeatability, dfInteraction, dfRepeatability)
  const interactionSignificant = interactionPValue != null ? interactionPValue <= 0.05 : true

  const rawInteractionVar = (msInteraction - msRepeatability) / nReplicates
  const rawOperatorVarWithInteraction = (msOperator - msInteraction) / (nParts * nReplicates)
  const rawPartVarWithInteraction = (msPart - msInteraction) / (nOperators * nReplicates)
  const pooledDf = dfInteraction + dfRepeatability
  const pooledMsError = (ssInteraction + ssRepeatability) / pooledDf
  const rawOperatorVarReduced = (msOperator - pooledMsError) / (nParts * nReplicates)
  const rawPartVarReduced = (msPart - pooledMsError) / (nOperators * nReplicates)

  let repeatabilityVar
  let reproducibilityVar
  let partVar
  let interactionVar = 0
  let model = 'reduced'
  let rawVarianceComponents = []

  if (interactionSignificant) {
    repeatabilityVar = msRepeatability
    interactionVar = Math.max(rawInteractionVar, 0)
    reproducibilityVar = Math.max(rawOperatorVarWithInteraction, 0)
    partVar = Math.max(rawPartVarWithInteraction, 0)
    model = 'interaction'
    rawVarianceComponents = [rawInteractionVar, rawOperatorVarWithInteraction, rawPartVarWithInteraction]
  } else {
    repeatabilityVar = pooledMsError
    reproducibilityVar = Math.max(rawOperatorVarReduced, 0)
    partVar = Math.max(rawPartVarReduced, 0)
    rawVarianceComponents = [rawOperatorVarReduced, rawPartVarReduced]
  }

  const result = finalizeGRR({
    method: 'anova',
    tolerance,
    repeatabilityVar,
    reproducibilityVar,
    partVar,
    interactionVar,
    extra: {
      model,
      interactionPValue: interactionPValue != null ? round(interactionPValue, 6) : null,
      interactionSignificant,
      systemStabilityWarning: rawVarianceComponents.some(v => v < 0)
        ? 'Negative variance detected: measurement system resolution may be insufficient.'
        : null,
      anova: {
        ssPart: round(ssPart, 6),
        ssOperator: round(ssOperator, 6),
        ssInteraction: round(ssInteraction, 6),
        ssRepeatability: round(ssRepeatability, 6),
        msPart: round(msPart, 6),
        msOperator: round(msOperator, 6),
        msInteraction: round(msInteraction, 6),
        msRepeatability: round(msRepeatability, 6),
      },
    },
  })

  if (!interactionSignificant) {
    result.modelWarning = 'Operator-part interaction was not significant; ANOVA results use the reduced additive model.'
  }

  return result
}
