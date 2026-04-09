import { useMemo } from 'react'
import { PChart as IndustrialPChart } from '../../components/charts'
import { computePChart } from '../calculations'
import { chartHintClass, chartNClass, chartOocClass, chartPaneClass, chartPaneTitleClass } from '../uiClasses'
import type { ChartPaneProps } from '../types'

interface PChartSubgroupStat {
  batch_id?: string | null
  batch_seq?: number | null
  batch_date?: string | null
  n_nonconforming: number
  n_inspected: number
  n: number
  p: number
  ucl: number
  lcl: number
}

interface PChartResult {
  pBar: number
  signals: unknown[]
  subgroupStats: PChartSubgroupStat[]
}

interface PChartViewProps extends ChartPaneProps {
  embedded?: boolean
}

export default function PChart({ points, embedded = false }: PChartViewProps) {
  const pChart = useMemo(
    () =>
      computePChart(
        points as Array<{
          batch_id?: string | null
          batch_seq?: number | null
          batch_date?: string | null
          n_inspected: number
          n_nonconforming: number
          p_value: number
        }>,
      ) as PChartResult | null,
    [points],
  )
  if (!pChart) return null

  const oocCount = pChart.signals.length
  const chartData = pChart.subgroupStats.map((stat) => ({
    time: stat.batch_date ? stat.batch_date.substring(0, 10) : `Batch ${stat.batch_seq}`,
    proportion: stat.p,
    ucl: stat.ucl,
    lcl: Math.max(0, stat.lcl),
    centerLine: pChart.pBar,
    batchId: stat.batch_id,
    nInspected: stat.n_inspected,
    nNonconforming: stat.n_nonconforming,
    isSignal: stat.p > stat.ucl || stat.p < stat.lcl,
    signalSummary: stat.p > stat.ucl || stat.p < stat.lcl ? 'Point beyond control limits' : null,
    detailSummary: `Inspected ${stat.n_inspected}, nonconforming ${stat.n_nonconforming}`,
  }))

  const chart = (
    <IndustrialPChart data={chartData} embedded={embedded} />
  )

  if (embedded) return chart

  return (
    <div className={chartPaneClass}>
      <div className={chartPaneTitleClass}>
        P Chart (Proportion Nonconforming)
        <span className={chartNClass}>n̄ = {Math.round(pChart.subgroupStats.reduce((s, g) => s + g.n, 0) / Math.max(pChart.subgroupStats.length, 1))}</span>
        {oocCount > 0 && (
          <span className={chartOocClass}>⚠ {oocCount} point{oocCount !== 1 ? 's' : ''} beyond limits</span>
        )}
      </div>
      {chart}
      <p className={chartHintClass}>
        p̄ = {(pChart.pBar * 100).toFixed(2)}% overall nonconforming · Variable control limits shown per batch size
      </p>
    </div>
  )
}
