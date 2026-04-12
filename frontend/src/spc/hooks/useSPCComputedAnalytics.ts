import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
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

interface AnalyticsState {
  spc: SPCComputationResult | null
  trendData: RollingCapabilityPoint[]
  stratumSections: StratumSection[]
  analyticsLoading: boolean
}

interface UseSPCComputedAnalyticsArgs {
  points: ChartDataPoint[]
  chartType: QuantChartType | null
  excludedIndices: Set<number>
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

export function useSPCComputedAnalytics({
  points,
  chartType,
  excludedIndices,
  ruleSet,
  excludeOutliers,
  normality,
  stratifyBy,
  rollingWindowSize,
}: UseSPCComputedAnalyticsArgs): AnalyticsState {
  const workerRef = useRef<Worker | null>(null)
  const requestIdRef = useRef(0)
  const deferredPoints = useDeferredValue(points)
  const deferredNormality = useDeferredValue(normality)
  const deferredRollingWindowSize = useDeferredValue(rollingWindowSize)
  const excludedIndexList = useMemo(
    () => [...excludedIndices].sort((a, b) => a - b),
    [excludedIndices],
  )
  const deferredExcludedIndexList = useDeferredValue(excludedIndexList)
  const [state, setState] = useState<AnalyticsState>({
    spc: null,
    trendData: [],
    stratumSections: [],
    analyticsLoading: false,
  })

  useEffect(() => {
    if (typeof Worker === 'undefined') return
    workerRef.current = new Worker(new URL('../workers/spcCompute.worker.ts', import.meta.url), {
      type: 'module',
    })
    return () => {
      workerRef.current?.terminate()
      workerRef.current = null
    }
  }, [])

  useEffect(() => {
    if (!chartType || deferredPoints.length === 0) {
      setState({
        spc: null,
        trendData: [],
        stratumSections: [],
        analyticsLoading: false,
      })
      return
    }

    const worker = workerRef.current
    if (!worker) return

    const requestId = ++requestIdRef.current
    startTransition(() => {
      setState(prev => ({ ...prev, analyticsLoading: true }))
    })

    const handleMessage = (event: MessageEvent<ComputeResponse>) => {
      if (event.data.requestId !== requestId) return
      startTransition(() => {
        setState({
          spc: event.data.spc,
          trendData: event.data.trendData,
          stratumSections: event.data.stratumSections,
          analyticsLoading: false,
        })
      })
    }

    worker.addEventListener('message', handleMessage)
    worker.postMessage({
      requestId,
      points: deferredPoints,
      chartType,
      excludedIndices: deferredExcludedIndexList,
      ruleSet,
      excludeOutliers,
      normality: deferredNormality,
      stratifyBy,
      rollingWindowSize: deferredRollingWindowSize,
    })

    return () => {
      worker.removeEventListener('message', handleMessage)
    }
  }, [
    chartType,
    deferredExcludedIndexList,
    deferredNormality,
    deferredPoints,
    deferredRollingWindowSize,
    excludeOutliers,
    ruleSet,
    stratifyBy,
  ])

  return state
}
