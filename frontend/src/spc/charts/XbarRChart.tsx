import { useMemo } from 'react'
import { XbarRChart as IndustrialXbarRChart } from '../../components/charts'
import type { XbarRChartProps } from '../types'

export default function XbarRChart({ spc, signals = [], mrSignals = [], externalLimits, embedded = false }: XbarRChartProps) {
  const xbarR = spc?.xbarR

  const signalMap = useMemo(() => {
    const map = new Map<number, string[]>()
    for (const signal of signals) {
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
    for (const signal of mrSignals) {
      for (const idx of signal.indices) {
        const entries = map.get(idx) ?? []
        entries.push(`Range Rule ${signal.rule}: ${signal.description ?? 'Range signal detected'}`)
        map.set(idx, entries)
      }
    }
    return map
  }, [mrSignals])

  const chartData = useMemo(() => {
    if (!xbarR) return []
    return xbarR.subgroupStats.map((stat, index) => ({
      time: stat.batchDate ? stat.batchDate.substring(0, 10) : `#${stat.batchSeq}`,
      xbar: stat.xbar,
      range: stat.range,
      batchId: stat.batchId,
      subgroupSize: stat.n,
      isSignal: signalMap.has(index),
      isRangeSignal: mrSignalMap.has(index),
      signalSummary: signalMap.get(index)?.join(' • ') ?? mrSignalMap.get(index)?.join(' • ') ?? null,
      detailSummary: `Subgroup size ${stat.n}${stat.batchId ? ` • ${stat.batchId}` : ''}`,
      uclX: stat.ucl_x,
      lclX: stat.lcl_x,
    }))
  }, [mrSignalMap, signalMap, xbarR])

  if (!xbarR || !chartData.length) return null

  return (
    <IndustrialXbarRChart
      data={chartData}
      ucl={externalLimits?.ucl ?? xbarR.ucl_x}
      lcl={externalLimits?.lcl ?? xbarR.lcl_x}
      target={externalLimits?.cl ?? xbarR.grandMean}
      rangeUcl={externalLimits?.ucl_r ?? xbarR.ucl_r}
      rangeLcl={externalLimits?.lcl_r ?? xbarR.lcl_r}
      rangeTarget={xbarR.rBar}
      title="X-bar & R Chart"
      embedded={embedded}
    />
  )
}
