import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { computeCChart } from '../calculations.js'
import { chartHintClass, chartOocClass, chartPaneClass, chartPaneTitleClass } from '../uiClasses.js'

export default function CChart({ points }) {
  const chart = useMemo(() => computeCChart(points), [points])

  const subgroupStats = useMemo(() => points.map(p => ({ ...p, c: p.defect_count })), [points])

  const option = useMemo(() => {
    if (!chart) return null
    const { cBar, ucl, lcl } = chart

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
        name: 'Defects',
        axisLabel: { fontSize: 10, color: '#6b7280' },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      },
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (params) => {
          if (params.seriesName !== 'c') return ''
          const s = subgroupStats[params.dataIndex]
          if (!s) return ''
          const ooc = s.c > ucl || s.c < lcl
          let html = `<strong>${s.batch_id ?? categories[params.dataIndex]}</strong><br/>`
          if (s.batch_date) html += `Date: ${s.batch_date}<br/>`
          html += `Defects: <strong>${s.c}</strong><br/>`
          html += `c̄ = ${cBar.toFixed(3)}  UCL = ${ucl.toFixed(3)}  LCL = ${Math.max(0, lcl).toFixed(3)}<br/>`
          if (ooc) html += `<span style="color:#ef4444">⚠ Beyond control limit</span>`
          return html
        },
      },
      series: [
        {
          name: 'c',
          type: 'line',
          data: subgroupStats.map(s => ({
            value: s.c,
            itemStyle: { color: (s.c > ucl || s.c < lcl) ? '#ef4444' : '#1B3A4B' },
          })),
          lineStyle: { color: '#1B3A4B', width: 2 },
          showSymbol: true,
          symbolSize: 5,
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            data: [
              { yAxis: cBar, lineStyle: { color: '#1B3A4B', type: 'solid', width: 2 }, label: { formatter: `c̄ ${cBar.toFixed(2)}`, position: 'end', fontSize: 10 } },
              { yAxis: ucl,  lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 }, label: { formatter: `UCL ${ucl.toFixed(2)}`, position: 'end', fontSize: 10, color: '#ef4444' } },
              { yAxis: Math.max(0, lcl), lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 }, label: { formatter: `LCL ${Math.max(0, lcl).toFixed(2)}`, position: 'end', fontSize: 10, color: '#ef4444' } },
            ],
          },
        },
      ],
    }
  }, [chart, subgroupStats])

  if (!chart || !option) return null

  const oocCount = chart.signals?.length ?? 0

  return (
    <div className={chartPaneClass}>
      <div className={chartPaneTitleClass}>
        C Chart (Defects per Unit)
        {oocCount > 0 && (
          <span className={chartOocClass}>⚠ {oocCount} point{oocCount !== 1 ? 's' : ''} beyond limits</span>
        )}
      </div>
      <ReactECharts option={option} style={{ height: 280 }} theme="spc" notMerge />
      <p className={chartHintClass}>
        c̄ = {chart.cBar.toFixed(3)} · UCL = {chart.ucl.toFixed(3)} · LCL = {Math.max(0, chart.lcl).toFixed(3)}
      </p>
    </div>
  )
}
