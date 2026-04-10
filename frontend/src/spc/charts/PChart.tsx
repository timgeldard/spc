import { useMemo } from 'react'
import EChart from './EChart'
import { computePChart } from '../calculations'
import type { ChartPaneProps, EventParamLike } from '../types'

interface PChartInputPoint {
  batch_id?: string | null
  batch_seq?: number | null
  batch_date?: string | null
  n_inspected: number
  n_nonconforming: number
  p_value?: number
}

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    () => computePChart(points as any) as PChartResult | null,
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
      itemStyle: { color: (s.p > s.ucl || s.p < s.lcl) ? '#da1e28' : '#0f62fe' },
    }))

    const nBar = Math.round(
      subgroupStats.reduce((sum, s) => sum + s.n, 0) / Math.max(subgroupStats.length, 1),
    )

    return {
      animation: false,
      legend: { show: false },
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
        name: 'Proportion',
        axisLabel: { fontSize: 10, color: '#6b7280', formatter: (v: number) => (v * 100).toFixed(1) + '%' },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        formatter: (params: EventParamLike | EventParamLike[]) => {
          const p = Array.isArray(params) ? params[0] : params
          if (!p) return ''
          const s = subgroupStats[p.dataIndex]
          if (!s) return ''
          const ooc = s.p > s.ucl || s.p < s.lcl
          let html = `<strong>${s.batch_id ?? categories[p.dataIndex]}</strong><br/>`
          if (s.batch_date) html += `Date: ${s.batch_date}<br/>`
          html += `p: <strong>${(s.p * 100).toFixed(2)}%</strong> (${s.n_nonconforming}/${s.n_inspected})<br/>`
          html += `p̄ = ${(pBar * 100).toFixed(2)}%<br/>`
          html += `UCL = ${(s.ucl * 100).toFixed(2)}%  LCL = ${(Math.max(0, s.lcl) * 100).toFixed(2)}%<br/>`
          if (ooc) html += `<span style="color:#da1e28">⚠ Beyond control limit</span>`
          return html
        },
      },
      series: [
        {
          name: 'p',
          type: 'line',
          data: seriesData,
          lineStyle: { color: '#0f62fe', width: 2.4 },
          showSymbol: true,
          symbolSize: 6,
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            data: [
              { yAxis: pBar, lineStyle: { color: '#0f62fe', type: 'solid', width: 2.2 }, label: { formatter: `p̄ ${(pBar * 100).toFixed(2)}%`, position: 'end', fontSize: 10 } },
            ],
          },
        },
        {
          name: 'UCL',
          type: 'line',
          data: subgroupStats.map(s => s.ucl),
          lineStyle: { color: '#da1e28', type: 'dashed', width: 1.5 },
          symbol: 'none',
          tooltip: { show: false },
          label: { show: false },
          endLabel: { show: true, formatter: `UCL`, color: '#da1e28', fontSize: 10 },
        },
        {
          name: 'LCL',
          type: 'line',
          data: subgroupStats.map(s => Math.max(0, s.lcl)),
          lineStyle: { color: '#da1e28', type: 'dashed', width: 1.5 },
          symbol: 'none',
          tooltip: { show: false },
          label: { show: false },
          endLabel: { show: true, formatter: `LCL`, color: '#da1e28', fontSize: 10 },
        },
      ],
    }
  }, [pChart])

  if (!pChart || !option) return null

  const oocCount = pChart.signals.length
  const nBar = Math.round(
    pChart.subgroupStats.reduce((sum, s) => sum + s.n, 0) / Math.max(pChart.subgroupStats.length, 1),
  )

  const chartNode = (
    <EChart option={option} style={{ height: 280 }} theme="spc" notMerge ariaLabel="P chart — proportion nonconforming" />
  )

  if (embedded) return chartNode

  return (
    <div style={{ marginBottom: '0.25rem', borderBottom: '1px solid var(--cds-border-subtle-01)', paddingBottom: '1rem' }}>
      <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--cds-text-secondary)' }}>
        P Chart (Proportion Nonconforming)
        <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>n̄ = {nBar}</span>
        {oocCount > 0 && (
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-support-error)' }}>⚠ {oocCount} point{oocCount !== 1 ? 's' : ''} beyond limits</span>
        )}
      </div>
      {chartNode}
      <p style={{ marginTop: '0.25rem', fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--cds-text-secondary)' }}>
        p̄ = {(pChart.pBar * 100).toFixed(2)}% overall nonconforming · Variable control limits shown per batch size
      </p>
    </div>
  )
}
