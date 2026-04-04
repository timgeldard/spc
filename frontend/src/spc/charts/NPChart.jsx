import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { computeNPChart } from '../calculations.js'

export default function NPChart({ points }) {
  const chart = useMemo(() => computeNPChart(points), [points])

  const subgroupStats = useMemo(
    () => points.map(p => ({ ...p, np: p.n_nonconforming, n: p.n_inspected })),
    [points]
  )

  const option = useMemo(() => {
    if (!chart) return null
    const { npBar, ucl, lcl } = chart

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
        name: 'Count',
        axisLabel: { fontSize: 10, color: '#6b7280' },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      },
      tooltip: {
        trigger: 'item',
        confine: true,
        formatter: (params) => {
          if (params.seriesName !== 'np') return ''
          const s = subgroupStats[params.dataIndex]
          if (!s) return ''
          const ooc = s.np > ucl || s.np < lcl
          let html = `<strong>${s.batch_id ?? categories[params.dataIndex]}</strong><br/>`
          if (s.batch_date) html += `Date: ${s.batch_date}<br/>`
          html += `Nonconforming: <strong>${s.np}</strong> / n=${s.n}<br/>`
          html += `n̄p̄ = ${npBar.toFixed(2)}  UCL = ${ucl.toFixed(2)}  LCL = ${Math.max(0, lcl).toFixed(2)}<br/>`
          if (ooc) html += `<span style="color:#ef4444">⚠ Beyond control limit</span>`
          return html
        },
      },
      series: [
        {
          name: 'np',
          type: 'line',
          data: subgroupStats.map(s => ({
            value: s.np,
            itemStyle: { color: (s.np > ucl || s.np < lcl) ? '#ef4444' : '#1B3A4B' },
          })),
          lineStyle: { color: '#1B3A4B', width: 2 },
          showSymbol: true,
          symbolSize: 5,
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            data: [
              { yAxis: npBar, lineStyle: { color: '#1B3A4B', type: 'solid', width: 2 }, label: { formatter: `n̄p̄ ${npBar.toFixed(2)}`, position: 'end', fontSize: 10 } },
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
    <div className="spc-chart-pane">
      <div className="spc-chart-pane-title">
        NP Chart (Number Nonconforming — constant subgroup size)
        {oocCount > 0 && (
          <span className="spc-chart-ooc">⚠ {oocCount} point{oocCount !== 1 ? 's' : ''} beyond limits</span>
        )}
      </div>
      <ReactECharts option={option} style={{ height: 280 }} theme="spc" notMerge />
      <p className="spc-chart-hint">
        n̄p̄ = {chart.npBar.toFixed(2)} · UCL = {chart.ucl.toFixed(2)} · LCL = {Math.max(0, chart.lcl).toFixed(2)}
      </p>
    </div>
  )
}
