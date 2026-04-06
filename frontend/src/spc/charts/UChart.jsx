import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { computeUChart } from '../calculations.js'
import { chartHintClass, chartOocClass, chartPaneClass, chartPaneTitleClass } from '../uiClasses.js'

export default function UChart({ points }) {
  // Map n_inspected → n_units for computeUChart (uses n_units as sample size)
  const mappedPoints = useMemo(
    () => points.map(p => ({ ...p, n_units: p.n_inspected ?? 1 })),
    [points]
  )
  const chart = useMemo(() => computeUChart(mappedPoints), [mappedPoints])

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
        formatter: (params) => {
          if (params.seriesName !== 'u') return ''
          const s = subgroupStats[params.dataIndex]
          if (!s) return ''
          const ooc = s.u > s.ucl || s.u < s.lcl
          let html = `<strong>${s.batch_id ?? categories[params.dataIndex]}</strong><br/>`
          if (s.batch_date) html += `Date: ${s.batch_date}<br/>`
          html += `u = <strong>${s.u.toFixed(3)}</strong> (${s.c} defects / n=${s.n})<br/>`
          html += `ū = ${uBar.toFixed(3)}  UCL = ${s.ucl.toFixed(3)}  LCL = ${Math.max(0, s.lcl).toFixed(3)}<br/>`
          if (ooc) html += `<span style="color:#ef4444">⚠ Beyond control limit</span>`
          return html
        },
      },
      series: [
        {
          name: 'u',
          type: 'line',
          data: subgroupStats.map(s => ({
            value: s.u,
            itemStyle: { color: (s.u > s.ucl || s.u < s.lcl) ? '#ef4444' : '#1B3A4B' },
          })),
          lineStyle: { color: '#1B3A4B', width: 2 },
          showSymbol: true,
          symbolSize: 5,
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            data: [
              { yAxis: uBar, lineStyle: { color: '#1B3A4B', type: 'solid', width: 2 }, label: { formatter: `ū ${uBar.toFixed(3)}`, position: 'end', fontSize: 10 } },
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
        },
        {
          name: 'LCL',
          type: 'line',
          data: subgroupStats.map(s => +(Math.max(0, s.lcl).toFixed(4))),
          lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 },
          symbol: 'none',
          tooltip: { show: false },
        },
      ],
    }
  }, [chart])

  if (!chart || !option) return null

  const oocCount = chart.signals?.length ?? 0

  return (
    <div className={chartPaneClass}>
      <div className={chartPaneTitleClass}>
        U Chart (Defects per Unit — variable subgroup size)
        {oocCount > 0 && (
          <span className={chartOocClass}>⚠ {oocCount} point{oocCount !== 1 ? 's' : ''} beyond limits</span>
        )}
      </div>
      <ReactECharts option={option} style={{ height: 280 }} theme="spc" notMerge />
      <p className={chartHintClass}>
        ū = {chart.uBar.toFixed(4)} · Variable limits per inspection unit count
      </p>
    </div>
  )
}
