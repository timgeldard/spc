import { usePChartData } from './usePChartData'
import { useSPCChartData } from './useSPCChartData'
import { useCountChartData } from './useCountChartData'
import type { AttributeChartPoint, ChartDataPoint, NormalityResult } from '../types'
import type { AttributeChartType, QuantChartType } from '../charts/ChartSettingsRail'

function isQuantChartType(value: string | null | undefined): value is QuantChartType {
  return value === 'imr' || value === 'xbar_r'
}

export interface ChartDataResult {
  // Type flags
  isAttributeChart: boolean
  isPChart: boolean
  isCountChart: boolean
  isQuantitative: boolean
  effectiveChartType: QuantChartType | null

  // Data
  quantPoints: ChartDataPoint[]
  quantNormality: NormalityResult | null
  dataTruncated: boolean
  attrPoints: AttributeChartPoint[]
  countPoints: AttributeChartPoint[]
  points: Array<ChartDataPoint | AttributeChartPoint>
  loading: boolean
  error: string | null
}

/**
 * Coordinates all data fetching for the control charts view.
 * Determines chart type from MIC metadata + overrides, then calls the appropriate
 * data hooks (quantitative, P chart, or count chart).
 */
export function useChartData(
  materialId: string | null | undefined,
  micId: string | null | undefined,
  micName: string | null | undefined,
  micChartType: string | null | undefined,
  chartTypeOverride: QuantChartType | null,
  attrChartType: AttributeChartType,
  dateFrom: string,
  dateTo: string,
  plantId: string | null | undefined,
  stratifyBy: string | null,
): ChartDataResult {
  const isAttributeMIC = micChartType === 'p_chart'
  const isAttributeChart = isAttributeMIC
  const isPChart = isAttributeMIC && attrChartType === 'p_chart'
  const isCountChart = isAttributeMIC && ['c_chart', 'u_chart', 'np_chart'].includes(attrChartType)
  const isQuantitative = !isAttributeChart
  const baseChartType = isQuantChartType(micChartType) ? micChartType : 'imr'
  const effectiveChartType: QuantChartType | null = isQuantitative
    ? (chartTypeOverride ?? baseChartType)
    : null

  const {
    points: quantPoints,
    normality: quantNormality,
    dataTruncated,
    loading: quantLoading,
    error: quantError,
  } = useSPCChartData(
    isQuantitative ? materialId : null,
    micId,
    micName,
    dateFrom,
    dateTo,
    plantId,
    stratifyBy,
  )

  const { points: attrPoints, loading: attrLoading, error: attrError } = usePChartData(
    isPChart ? materialId : null,
    micId,
    micName,
    dateFrom,
    dateTo,
    plantId,
  )

  const countChartVariant = attrChartType === 'u_chart' ? 'u' : attrChartType === 'np_chart' ? 'np' : 'c'
  const { points: countPoints, loading: countLoading, error: countError } = useCountChartData(
    isCountChart ? materialId : null,
    micId,
    micName,
    dateFrom,
    dateTo,
    plantId,
    countChartVariant,
  )

  const points: Array<ChartDataPoint | AttributeChartPoint> = isPChart
    ? attrPoints
    : isCountChart
      ? countPoints
      : quantPoints
  const loading = isPChart ? attrLoading : isCountChart ? countLoading : quantLoading
  const error = isPChart ? attrError : isCountChart ? countError : quantError

  return {
    isAttributeChart,
    isPChart,
    isCountChart,
    isQuantitative,
    effectiveChartType,
    quantPoints,
    quantNormality,
    dataTruncated,
    attrPoints,
    countPoints,
    points,
    loading,
    error,
  }
}
