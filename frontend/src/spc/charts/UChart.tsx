import { useMemo } from 'react'
import EChart from './EChart'
import { computeUChart } from '../calculations'
import type { ChartPaneProps, EventParamLike } from '../types'

interface UChartInputPoint {
  batch_id?: string | null
  batch_seq?: number | null
  batch_date?: string | null
  defect_count: number
  n_units: number
}

interface UChartSubgroupStat {
  batch_id?: string | null
  batch_seq?: number | null
  batch_date?: string | null
  c: number
  n: number
  u: number
  ucl: number
  lcl: number
}

interface UChartResult {
  uBar: number
  subgroupStats: UChartSubgroupStat[]
  signals?: unknown[]
}

interface UChartViewProps extends ChartPaneProps {
  embedded?: boolean
}

export default function UChart({ points, embedded = false }: UChartViewProps) {
  const mappedPoints = useMemo(
    () =>
      points.map(p => ({
        ...p,
        defect_count: Number(p.defect_count ?? 0),
        n_units: Number(p.n_inspected ?? 1),
      })) as UChartInputPoint[],
    [points],
  )
  const chart = useMemo(() => computeUChart(mappedPoints) as UChartResult | null, [mappedPoints])

  const option = useMemo(() => {
    if (!chart) return null
    const { uBar, subgroupStats } = chart

    const categories = subgroupStats.map(s =>
      s.batch_date ? s.batch_date.substring(0, 10) : `Batch ${s.batch_seq}`
    )

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
        name: 'Defects/Unit',
        axisLabel: { fontSize: 10, color: '#6b7280' },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      },
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (params: EventParamLike) => {
          if (params.seriesName !== 'u') return ''
          const s = subgroupStats[params.dataIndex]
          if (!s) return ''
          const ooc = s.u > s.ucl || s.u < s.lcl
          let html = `<strong>${s.batch_id ?? categories[params.dataIndex]}</strong><br/>`
          if (s.batch_date) html += `Date: ${s.batch_date}<br/>`
          html += `u = <strong>${s.u.toFixed(3)}</strong> (${s.c} defects / n=${s.n})<br/>`
          html += `ū = ${uBar.toFixed(3)}  UCL = ${s.ucl.toFixed(3)}  LCL = ${Math.max(0, s.lcl).toFixed(3)}<br/>`
          if (ooc) html += `<span style="color:#da1e28">⚠ Beyond control limit</span>`
          return html
        },
      },
      series: [
        {
          name: 'u',
          type: 'line',
          data: subgroupStats.map(s => ({
            value: s.u,
            itemStyle: { color: (s.u > s.ucl || s.u < s.lcl) ? '#da1e28' : '#0f62fe' },
          })),
          lineStyle: { color: '#0f62fe', width: 2.4 },
          showSymbol: true,
          symbolSize: 6,
          markPoint: {
            symbol: 'circle',
            symbolSize: 12,
            itemStyle: { color: '#da1e28' },
            data: subgroupStats
              .map((s, index) => (s.u > s.ucl || s.u < s.lcl ? { coord: [categories[index], s.u], value: s.u } : null))
              .filter(Boolean),
          },
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            data: [
              { yAxis: uBar, lineStyle: { color: '#0f62fe', type: 'solid', width: 2.2 }, label: { formatter: `ū ${uBar.toFixed(3)}`, position: 'end', fontSize: 10 } },
            ],
          },
        },
        {
          name: 'UCL',
          type: 'line',
          data: subgroupStats.map(s => +(s.ucl.toFixed(4))),
          lineStyle: { color: '#da1e28', type: 'dashed', width: 2.4 },
          symbol: 'none',
          tooltip: { show: false },
        },
        {
          name: 'LCL',
          type: 'line',
          data: subgroupStats.map(s => +(Math.max(0, s.lcl).toFixed(4))),
          lineStyle: { color: '#da1e28', type: 'dashed', width: 2.4 },
          symbol: 'none',
          tooltip: { show: false },
        },
      ],
    }
  }, [chart])

  if (!chart || !option) return null

  const oocCount = chart.signals?.length ?? 0

  const chartNode = <EChart option={option} style={{ height: 280 }} theme="spc" notMerge ariaLabel="U chart — defects per unit" />

  if (embedded) return chartNode

  return (
    <div style={{ marginBottom: '0.25rem', borderBottom: '1px solid var(--cds-border-subtle-01)', paddingBottom: '1rem' }}>
      <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--cds-text-secondary)' }}>
        U Chart (Defects per Unit — variable subgroup size)
        {oocCount > 0 && (
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-support-error)' }}>⚠ {oocCount} point{oocCount !== 1 ? 's' : ''} beyond limits</span>
        )}
      </div>
      {chartNode}
      <p style={{ marginTop: '0.25rem', fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--cds-text-secondary)' }}>
        ū = {chart.uBar.toFixed(4)} · Variable limits per inspection unit count
      </p>
    </div>
  )
}
