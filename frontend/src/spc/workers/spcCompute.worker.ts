import { computeAll, computeRollingCapability } from '../calculations'
import type {
  ChartDataPoint,
  NormalityResult,
  QuantChartType,
  RollingCapabilityPoint,
  RuleSet,
  SPCComputationResult,
  StratifyByKey,
} from '../types'
import type { StratumSection } from '../charts/StratificationPanel'

interface ComputeRequest {
  requestId: number
  points: ChartDataPoint[]
  chartType: QuantChartType
  excludedIndices: number[]
  ruleSet: RuleSet
  excludeOutliers: boolean
  normality: NormalityResult | null
  stratifyBy: StratifyByKey | null
  rollingWindowSize: number
}

interface ComputeResponse {
  requestId: number
  spc: SPCComputationResult | null
  trendData: RollingCapabilityPoint[]
  stratumSections: StratumSection[]
}

function buildAnalytics({
  points,
  chartType,
  excludedIndices,
  ruleSet,
  excludeOutliers,
  normality,
  stratifyBy,
  rollingWindowSize,
}: Omit<ComputeRequest, 'requestId'>): Omit<ComputeResponse, 'requestId'> {
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

  const spc = computeAll(activePoints, chartType, ruleSet, { normality })
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
          ? computeAll(groupedPoints, chartType, ruleSet, { normality })
          : null,
      }))
      .filter(section => (section.spc?.values?.length ?? 0) > 0)
      .sort((a, b) => a.label.localeCompare(b.label))
  }

  return { spc, trendData, stratumSections }
}

self.onmessage = (event: MessageEvent<ComputeRequest>) => {
  const { requestId, ...payload } = event.data
  const response: ComputeResponse = {
    requestId,
    ...buildAnalytics(payload),
  }
  self.postMessage(response)
}
