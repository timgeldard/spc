import { useMemo } from 'react'
import { XbarRChart as IndustrialXbarRChart } from '../../components/charts'
import type { XbarRChartProps } from '../types'

export default function XbarRChart({ spc, signals = [], mrSignals = [], externalLimits }: XbarRChartProps) {
  const xbarR = spc?.xbarR

  const signalIndexSet = useMemo(() => {
    const set = new Set<number>()
    for (const signal of signals) {
      for (const idx of signal.indices) set.add(idx)
    }
    return set
  }, [signals])

  const mrSignalIndexSet = useMemo(() => {
    const set = new Set<number>()
    for (const signal of mrSignals) {
      for (const idx of signal.indices) set.add(idx)
    }
    return set
  }, [mrSignals])

  const chartData = useMemo(() => {
    if (!xbarR) return []
    return xbarR.subgroupStats.map((stat, index) => ({
      time: stat.batchDate ? stat.batchDate.substring(0, 10) : `#${stat.batchSeq}`,
      xbar: stat.xbar,
      range: stat.range,
      batchId: stat.batchId,
      subgroupSize: stat.n,
      isSignal: signalIndexSet.has(index),
      isRangeSignal: mrSignalIndexSet.has(index),
      uclX: stat.ucl_x,
      lclX: stat.lcl_x,
    }))
  }, [mrSignalIndexSet, signalIndexSet, xbarR])

  if (!xbarR || !chartData.length) return null

  return (
    <IndustrialXbarRChart
      data={chartData}
      ucl={externalLimits?.ucl ?? xbarR.ucl_x}
      lcl={externalLimits?.lcl ?? xbarR.lcl_x}
      target={externalLimits?.cl ?? xbarR.grandMean}
      rangeUcl={externalLimits?.ucl_r ?? xbarR.ucl_r}
      rangeTarget={xbarR.rBar}
      title="X-bar & R Chart"
    />
  )
}
