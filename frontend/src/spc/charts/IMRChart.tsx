import { useMemo } from 'react'
import { IMRChart as IndustrialIMRChart } from '../../components/charts'
import type { IMRChartProps } from '../types'

export default function IMRChart({
  spc,
  indexedPoints = [],
  signals = [],
  mrSignals = [],
  onPointClick,
  externalLimits,
}: IMRChartProps) {
  const imr = spc?.imr

  const signalIndexSet = useMemo(() => {
    const set = new Set<number>()
    for (const signal of signals ?? []) {
      for (const idx of signal.indices) set.add(idx)
    }
    return set
  }, [signals])

  const mrSignalIndexSet = useMemo(() => {
    const set = new Set<number>()
    for (const signal of mrSignals ?? []) {
      for (const idx of signal.indices) set.add(idx)
    }
    return set
  }, [mrSignals])

  const chartData = useMemo(() => {
    if (!indexedPoints?.length) return []
    return indexedPoints.map((point, index) => ({
      time: point.batch_date ? point.batch_date.substring(0, 10) : `#${point.batch_seq}`,
      value: point.value,
      mr: index > 0 ? imr?.movingRanges[index - 1] ?? null : null,
      batchId: point.batch_id,
      isSignal: signalIndexSet.has(point.originalIndex),
      isMrSignal: index > 0 ? mrSignalIndexSet.has(index - 1) : false,
      isExcluded: point.excluded,
      isOutlier: Boolean(point.is_outlier && !point.excluded),
      signalLabel: signalIndexSet.has(point.originalIndex) ? 'Signal' : null,
      onClickIndex: point.originalIndex,
      stratifyValue: point.stratify_value ?? null,
    }))
  }, [indexedPoints, imr?.movingRanges, mrSignalIndexSet, signalIndexSet])

  if (!imr || !chartData.length) return null

  return (
    <IndustrialIMRChart
      data={chartData}
      ucl={externalLimits?.ucl ?? imr.ucl_x}
      lcl={externalLimits?.lcl ?? imr.lcl_x}
      target={externalLimits?.cl ?? imr.xBar}
      mrUcl={externalLimits?.ucl_r ?? imr.ucl_mr}
      mrTarget={imr.mrBar}
      title="I-MR Chart"
      onPointClick={onPointClick}
    />
  )
}
