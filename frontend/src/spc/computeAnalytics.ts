import { computeAll, computeRollingCapability } from './calculations'
import type {
  ChartDataPoint,
  GovernedControlLimits,
  NormalityResult,
  QuantChartType,
  RollingCapabilityPoint,
  RuleSet,
  SPCComputationResult,
  StratifyByKey,
} from './types'
import type { StratumSection } from './charts/StratificationPanel'

export interface ComputeAnalyticsInput {
  points: ChartDataPoint[]
  chartType: QuantChartType
  excludedIndices: number[]
  ruleSet: RuleSet
  excludeOutliers: boolean
  normality: NormalityResult | null
  stratifyBy: StratifyByKey | null
  rollingWindowSize: number
  ewmaLambda: number
  ewmaL: number
  cusumK: number
  cusumH: number
  governedLimits?: GovernedControlLimits | null
  useGovernedLimits?: boolean
}

export interface ComputeAnalyticsOutput {
  spc: SPCComputationResult | null
  trendData: RollingCapabilityPoint[]
  stratumSections: StratumSection[]
}

export function computeAnalytics({
  points,
  chartType,
  excludedIndices,
  ruleSet,
  excludeOutliers,
  normality,
  stratifyBy,
  rollingWindowSize,
  ewmaLambda,
  ewmaL,
  cusumK,
  cusumH,
  governedLimits = null,
  useGovernedLimits = false,
}: ComputeAnalyticsInput): ComputeAnalyticsOutput {
  const effectiveExclusions = new Set<number>(excludedIndices)
  if (excludeOutliers) {
    points.forEach((point, index) => {
      if (point.is_outlier) effectiveExclusions.add(index)
    })
  }

  const activePoints = points.filter((_, index) => !effectiveExclusions.has(index))
  if (!activePoints.length) {
    return { spc: null, trendData: [], stratumSections: [] }
  }

  const spc = computeAll(activePoints, chartType, ruleSet, {
    normality,
    ewmaLambda,
    ewmaL,
    cusumK,
    cusumH,
    governedLimits: useGovernedLimits ? governedLimits : null,
  })
  spc.filteredPointCount = activePoints.length
  spc.excludedPointCount = effectiveExclusions.size
  spc.indexedPoints = points.map((point, index) => ({
    ...point,
    originalIndex: index,
    excluded: effectiveExclusions.has(index),
  }))

  const trendData = spc.sorted
    ? computeRollingCapability(spc.sorted, rollingWindowSize, spc.specConfig ?? {})
    : []

  let stratumSections: StratumSection[] = []
  if (stratifyBy) {
    const grouped = new Map<string, ChartDataPoint[]>()
    activePoints.forEach(point => {
      const key = point.stratify_value ?? 'Unassigned'
      const nextGroup = grouped.get(key) ?? []
      nextGroup.push(point)
      grouped.set(key, nextGroup)
    })

    stratumSections = [...grouped.entries()]
      .map(([label, groupedPoints]) => ({
        label,
        pointCount: groupedPoints.length,
        spc: groupedPoints.length > 0
          ? computeAll(groupedPoints, chartType, ruleSet, {
              normality,
              ewmaLambda,
              ewmaL,
              cusumK,
              cusumH,
              governedLimits: useGovernedLimits ? governedLimits : null,
            })
          : null,
      }))
      .filter(section => (section.spc?.values?.length ?? 0) > 0)
      .sort((a, b) => a.label.localeCompare(b.label))
  }

  return { spc, trendData, stratumSections }
}
