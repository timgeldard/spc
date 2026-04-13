import { computeAll } from './calculations'
import type {
  ChartDataPoint,
  ExcludedPoint,
  NormalityResult,
  QuantChartType,
  RuleSet,
  SPCComputationResult,
} from './types'

export function makeExclusionPointKey(point: Partial<ExcludedPoint> | Partial<ChartDataPoint> | null | undefined): string {
  return [
    point?.batch_id ?? '',
    point?.sample_seq ?? '',
    point?.plant_id ?? '',
    point?.stratify_value ?? '',
  ].join('::')
}

export function toExcludedPoints(points: ChartDataPoint[], excludedIndices: Set<number> | number[]): ExcludedPoint[] {
  return [...(excludedIndices ?? [])]
    .sort((a, b) => a - b)
    .map((index): ExcludedPoint | null => {
      const point = points[index]
      if (!point) return null
      return {
        batch_id: point.batch_id,
        sample_seq: point.sample_seq,
        batch_seq: point.batch_seq ?? null,
        batch_date: point.batch_date ?? null,
        plant_id: point.plant_id ?? null,
        stratify_value: point.stratify_value ?? null,
        value: point.value ?? null,
        original_index: index,
      }
    })
    .filter((point): point is ExcludedPoint => point != null)
}

export function mapExcludedPointsToIndices(points: ChartDataPoint[], excludedPoints: ExcludedPoint[] = []): number[] {
  const byKey = new Map<string, number>(points.map((point, index) => [makeExclusionPointKey(point), index]))
  return excludedPoints
    .map((point) => byKey.get(makeExclusionPointKey(point)))
    .filter((index): index is number => index != null)
}

export function getLimitsSnapshot(spc: SPCComputationResult | null | undefined) {
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
  if (spc.chartType === 'xbar_s') {
    return {
      cl: spc.xbarS?.grandMean ?? null,
      ucl: spc.xbarS?.ucl_x ?? null,
      lcl: spc.xbarS?.lcl_x ?? null,
      ucl_r: spc.xbarS?.ucl_s ?? null,
      lcl_r: spc.xbarS?.lcl_s ?? null,
      sigma_within: spc.xbarS?.sigmaWithin ?? null,
      point_count: spc.values?.length ?? null,
    }
  }
  if (spc.chartType === 'ewma') {
    const ewmaPoints = spc.ewma?.points ?? []
    const lastPoint = ewmaPoints.length ? ewmaPoints[ewmaPoints.length - 1] : null
    return {
      cl: spc.ewma?.target ?? null,
      ucl: lastPoint?.ucl ?? null,
      lcl: lastPoint?.lcl ?? null,
      ucl_r: null,
      lcl_r: null,
      sigma_within: spc.ewma?.sigmaWithin ?? null,
      point_count: spc.values?.length ?? null,
    }
  }
  if (spc.chartType === 'cusum') {
    return {
      cl: spc.cusum?.target ?? null,
      ucl: spc.cusum?.decisionInterval ?? null,
      lcl: spc.cusum?.decisionInterval != null ? -spc.cusum.decisionInterval : null,
      ucl_r: null,
      lcl_r: null,
      sigma_within: spc.cusum?.sigmaWithin ?? null,
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

export function recomputeForExcludedSet(
  points: ChartDataPoint[],
  excludedIndices: Iterable<number>,
  chartType: QuantChartType,
  ruleSet: RuleSet = 'weco',
  normality: NormalityResult | null = null,
): SPCComputationResult {
  const excluded = new Set<number>(excludedIndices)
  const activePoints = points.filter((_, index) => !excluded.has(index))
  return computeAll(activePoints, chartType, ruleSet, { normality })
}
