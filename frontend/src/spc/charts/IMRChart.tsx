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
  embedded = false,
}: IMRChartProps) {
  const imr = spc?.imr

  const signalMap = useMemo(() => {
    const map = new Map<number, string[]>()
    for (const signal of signals ?? []) {
      for (const idx of signal.indices) {
        const entries = map.get(idx) ?? []
        entries.push(`Rule ${signal.rule}: ${signal.description ?? 'Signal detected'}`)
        map.set(idx, entries)
      }
    }
    return map
  }, [signals])

  const mrSignalMap = useMemo(() => {
    const map = new Map<number, string[]>()
    for (const signal of mrSignals ?? []) {
      for (const idx of signal.indices) {
        const entries = map.get(idx) ?? []
        entries.push(`MR Rule ${signal.rule}: ${signal.description ?? 'Moving range signal detected'}`)
        map.set(idx, entries)
      }
    }
    return map
  }, [mrSignals])

  const chartData = useMemo(() => {
    if (!indexedPoints?.length) return []
    return indexedPoints.map((point, index) => ({
      time: point.batch_date ? point.batch_date.substring(0, 10) : `#${point.batch_seq}`,
      value: point.value,
      mr: index > 0 ? imr?.movingRanges[index - 1] ?? null : null,
      batchId: point.batch_id,
      isSignal: signalMap.has(point.originalIndex),
      isMrSignal: index > 0 ? mrSignalMap.has(index - 1) : false,
      isExcluded: point.excluded,
      isOutlier: Boolean(point.is_outlier && !point.excluded),
      signalLabel: signalMap.has(point.originalIndex) ? 'Signal' : null,
      signalSummary: signalMap.get(point.originalIndex)?.join(' • ') ?? (index > 0 ? mrSignalMap.get(index - 1)?.join(' • ') ?? null : null),
      detailSummary: point.batch_id ? `Batch ${point.batch_id}${point.stratify_value ? ` • ${point.stratify_value}` : ''}` : null,
      onClickIndex: point.originalIndex,
      stratifyValue: point.stratify_value ?? null,
    }))
  }, [indexedPoints, imr?.movingRanges, mrSignalMap, signalMap])

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
      embedded={embedded}
    />
  )
}
