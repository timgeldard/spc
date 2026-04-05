import { computeAll } from './calculations.js'

export function makeExclusionPointKey(point) {
  return [
    point?.batch_id ?? '',
    point?.sample_seq ?? '',
    point?.plant_id ?? '',
  ].join('::')
}

export function toExcludedPoints(points, excludedIndices) {
  return [...(excludedIndices ?? [])]
    .sort((a, b) => a - b)
    .map(index => {
      const point = points[index]
      if (!point) return null
      return {
        batch_id: point.batch_id,
        sample_seq: point.sample_seq,
        batch_seq: point.batch_seq ?? null,
        batch_date: point.batch_date ?? null,
        plant_id: point.plant_id ?? null,
        value: point.value ?? null,
        original_index: index,
      }
    })
    .filter(Boolean)
}

export function mapExcludedPointsToIndices(points, excludedPoints = []) {
  const byKey = new Map(points.map((point, index) => [makeExclusionPointKey(point), index]))
  return excludedPoints
    .map(point => byKey.get(makeExclusionPointKey(point)))
    .filter(index => index != null)
}

export function getLimitsSnapshot(spc) {
  if (!spc) return null
  if (spc.chartType === 'xbar_r') {
    return {
      cl: spc.xbarR?.grandMean ?? null,
      ucl: spc.xbarR?.ucl_x ?? null,
      lcl: spc.xbarR?.lcl_x ?? null,
      ucl_r: spc.xbarR?.ucl_r ?? null,
      lcl_r: spc.xbarR?.lcl_r ?? null,
      sigma_within: spc.xbarR?.sigmaWithin ?? null,
      point_count: spc.values?.length ?? null,
    }
  }
  return {
    cl: spc.imr?.xBar ?? null,
    ucl: spc.imr?.ucl_x ?? null,
    lcl: spc.imr?.lcl_x ?? null,
    ucl_r: spc.imr?.ucl_mr ?? null,
    lcl_r: spc.imr?.lcl_mr ?? null,
    sigma_within: spc.imr?.sigmaWithin ?? null,
    point_count: spc.values?.length ?? null,
  }
}

export function recomputeForExcludedSet(points, excludedIndices, chartType, ruleSet = 'weco', normality = null) {
  const excluded = new Set(excludedIndices)
  const activePoints = points.filter((_, index) => !excluded.has(index))
  return computeAll(activePoints, chartType, ruleSet, { normality })
}
