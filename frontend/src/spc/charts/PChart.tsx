import { useMemo } from 'react'
import EChart from './EChart'
import { computePChart } from '../calculations'
import { chartHintClass, chartNClass, chartOocClass, chartPaneClass, chartPaneTitleClass } from '../uiClasses'
import type { ChartPaneProps, EventParamLike } from '../types'

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

export default function PChart({ points }: ChartPaneProps) {
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

  const option = useMemo(() => {
    if (!pChart) return null
    const { pBar, subgroupStats } = pChart

    const categories = subgroupStats.map(s =>
      s.batch_date ? s.batch_date.substring(0, 10) : `Batch ${s.batch_seq}`
    )

    const seriesData = subgroupStats.map(s => ({
      value: s.p,
      itemStyle: { color: (s.p > s.ucl || s.p < s.lcl) ? '#ef4444' : '#1B3A4B' },
    }))

    return {
      animation: false,
      grid: { top: 12, right: 115, bottom: 28, left: 60 },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: { fontSize: 10, color: '#6b7280', interval: 'auto', rotate: categories.length > 20 ? 30 : 0 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: 1,
        name: 'Proportion',
        axisLabel: { fontSize: 10, color: '#6b7280', formatter: (v: number) => (v * 100).toFixed(0) + '%' },
        axisLine: { show: false },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      },
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: 'rgba(255,255,255,0.97)',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        padding: 8,
        textStyle: { fontSize: 12 },
        formatter: (params: EventParamLike) => {
          if (params.componentType !== 'series' || params.seriesName !== 'p') return ''
          const s = subgroupStats[params.dataIndex]
          if (!s) return ''
          const ooc = s.p > s.ucl || s.p < s.lcl
          let html = `<strong>${s.batch_id ?? categories[params.dataIndex]}</strong><br/>`
          if (s.batch_date) html += `Date: ${s.batch_date}<br/>`
          html += `Nonconforming: <strong>${s.n_nonconforming} / ${s.n_inspected}</strong><br/>`
          html += `p = <strong>${(s.p * 100).toFixed(2)}%</strong><br/>`
          html += `UCL = ${(s.ucl * 100).toFixed(2)}%  LCL = ${(s.lcl * 100).toFixed(2)}%<br/>`
          if (ooc) html += `<span style="color:#ef4444">⚠ Beyond control limit</span>`
          return html
        },
      },
      series: [
        {
          name: 'p',
          type: 'line',
          data: seriesData,
          lineStyle: { color: '#1B3A4B', width: 2 },
          showSymbol: true,
          symbolSize: 5,
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            data: [
              { yAxis: pBar, lineStyle: { color: '#1B3A4B', type: 'solid', width: 2 }, label: { formatter: `p̄ ${(pBar * 100).toFixed(2)}%`, position: 'end', color: '#1B3A4B', fontSize: 10 } },
            ],
          },
        },
        {
          name: 'UCL',
          type: 'line',
          data: subgroupStats.map(s => +(s.ucl.toFixed(4))),
          lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 },
          symbol: 'none',
          tooltip: { show: false },
          label: { show: false },
        },
        {
          name: 'LCL',
          type: 'line',
          data: subgroupStats.map(s => +(Math.max(0, s.lcl).toFixed(4))),
          lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 },
          symbol: 'none',
          tooltip: { show: false },
          label: { show: false },
        },
      ],
    }
  }, [pChart])

  if (!pChart || !option) return null

  const oocCount = pChart.signals.length

  return (
    <div className={chartPaneClass}>
      <div className={chartPaneTitleClass}>
        P Chart (Proportion Nonconforming)
        <span className={chartNClass}>n̄ = {Math.round(pChart.subgroupStats.reduce((s, g) => s + g.n, 0) / Math.max(pChart.subgroupStats.length, 1))}</span>
        {oocCount > 0 && (
          <span className={chartOocClass}>⚠ {oocCount} point{oocCount !== 1 ? 's' : ''} beyond limits</span>
        )}
      </div>
      <EChart option={option} style={{ height: 280 }} theme="spc" notMerge />
      <p className={chartHintClass}>
        p̄ = {(pChart.pBar * 100).toFixed(2)}% overall nonconforming · Variable control limits shown per batch size
      </p>
    </div>
  )
}
