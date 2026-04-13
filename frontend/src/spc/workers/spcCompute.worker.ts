import { computeAnalytics } from '../computeAnalytics'
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
  ewmaLambda: number
  ewmaL: number
  cusumK: number
  cusumH: number
}

interface ComputeResponse {
  requestId: number
  spc: SPCComputationResult | null
  trendData: RollingCapabilityPoint[]
  stratumSections: StratumSection[]
  error?: string | null
}

self.onmessage = (event: MessageEvent<ComputeRequest>) => {
  const { requestId, ...payload } = event.data
  try {
    const response: ComputeResponse = {
      requestId,
      ...computeAnalytics(payload),
      error: null,
    }
    self.postMessage(response)
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to compute SPC analytics.'
    self.postMessage({
      requestId,
      spc: null,
      trendData: [],
      stratumSections: [],
      error: message,
    } satisfies ComputeResponse)
  }
}
