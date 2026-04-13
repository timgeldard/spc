import { startTransition, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
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

interface AnalyticsState {
  spc: SPCComputationResult | null
  trendData: RollingCapabilityPoint[]
  stratumSections: StratumSection[]
  analyticsLoading: boolean
  analyticsError: string | null
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

export function useSPCComputedAnalytics({
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
    analyticsError: null,
  })

  useEffect(() => {
    if (typeof Worker === 'undefined') return
    try {
      workerRef.current = new Worker(new URL('../workers/spcCompute.worker.ts', import.meta.url), {
        type: 'module',
      })
    } catch {
      workerRef.current = null
    }
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
        analyticsError: null,
      })
      return
    }

    const worker = workerRef.current
    const requestId = ++requestIdRef.current
    const payload = {
      points: deferredPoints,
      chartType,
      excludedIndices: deferredExcludedIndexList,
      ruleSet,
      excludeOutliers,
      normality: deferredNormality,
      stratifyBy,
      rollingWindowSize: deferredRollingWindowSize,
      ewmaLambda,
      ewmaL,
      cusumK,
      cusumH,
    }

    startTransition(() => {
      setState(prev => ({ ...prev, analyticsLoading: true, analyticsError: null }))
    })

    const applySuccess = (event: ComputeResponse) => {
      startTransition(() => {
        setState({
          spc: event.spc,
          trendData: event.trendData,
          stratumSections: event.stratumSections,
          analyticsLoading: false,
          analyticsError: null,
        })
      })
    }

    const applyFailure = (message: string) => {
      startTransition(() => {
        setState(prev => ({
          ...prev,
          analyticsLoading: false,
          analyticsError: message,
        }))
      })
    }

    if (!worker) {
      try {
        applySuccess({
          requestId,
          ...computeAnalytics(payload),
          error: null,
        })
      } catch (error) {
        applyFailure(error instanceof Error ? error.message : 'Failed to compute SPC analytics.')
      }
      return
    }

    const handleMessage = (event: MessageEvent<ComputeResponse>) => {
      if (event.data.requestId !== requestId) return
      if (event.data.error) {
        applyFailure(event.data.error)
        return
      }
      applySuccess(event.data)
    }
    const handleWorkerError = () => {
      applyFailure('SPC analytics worker failed. Try refreshing the chart or narrowing the scope.')
    }
    const handleWorkerMessageError = () => {
      applyFailure('SPC analytics worker could not process chart data.')
    }

    worker.addEventListener('message', handleMessage)
    worker.addEventListener('error', handleWorkerError)
    worker.addEventListener('messageerror', handleWorkerMessageError)
    try {
      worker.postMessage({
        requestId,
        ...payload,
      })
    } catch (error) {
      applyFailure(error instanceof Error ? error.message : 'Failed to start SPC analytics.')
    }

    return () => {
      worker.removeEventListener('message', handleMessage)
      worker.removeEventListener('error', handleWorkerError)
      worker.removeEventListener('messageerror', handleWorkerMessageError)
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
    ewmaLambda,
    ewmaL,
    cusumK,
    cusumH,
  ])

  return state
}
