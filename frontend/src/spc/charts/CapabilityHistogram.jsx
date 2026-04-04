import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import { computeHistogram } from '../calculations.js'

export default function CapabilityHistogram({ spc }) {
  const option = useMemo(() => {
    if (!spc?.capability || !spc.values?.length) return null

    const { capability, values } = spc
    const { usl, lsl, xBar, sigmaOverall } = capability

    if (!sigmaOverall || sigmaOverall <= 0) return null

    const { bins, binWidth } = computeHistogram(values)
    if (!bins.length) return null

    const curveMin = Math.min(lsl ?? xBar - 4 * sigmaOverall, xBar - 4 * sigmaOverall)
    const curveMax = Math.max(usl ?? xBar + 4 * sigmaOverall, xBar + 4 * sigmaOverall)

    // Sample normal curve at 80 evenly-spaced points for smooth overlay
    const CURVE_STEPS = 80
    const step = (curveMax - curveMin) / CURVE_STEPS
    const curvePoints = Array.from({ length: CURVE_STEPS + 1 }, (_, i) => {
      const x = curveMin + i * step
      const y = (1 / (sigmaOverall * Math.sqrt(2 * Math.PI))) *
                Math.exp(-0.5 * ((x - xBar) / sigmaOverall) ** 2) *
                values.length * binWidth
      return [x, y]
    })

    const barData = bins.map(b => ({
      value: [b.midpoint, b.count],
      inSpec: (lsl == null || b.x0 >= lsl) && (usl == null || b.x1 <= usl),
    }))

    const maxCount  = Math.max(...bins.map(b => b.count), 1)
    const maxCurve  = Math.max(...curvePoints.map(p => p[1]), 1)
    const barWidthPx = Math.max(6, Math.min(50, Math.floor(480 / bins.length)))

    const markLineData = []
    if (usl != null) markLineData.push({ xAxis: usl, lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.5 }, label: { formatter: 'USL', position: 'insideEndTop', color: '#f59e0b', fontSize: 10 } })
    if (lsl != null) markLineData.push({ xAxis: lsl, lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.5 }, label: { formatter: 'LSL', position: 'insideEndTop', color: '#f59e0b', fontSize: 10 } })
    markLineData.push({ xAxis: xBar, lineStyle: { color: '#1B3A4B', type: 'solid', width: 2 }, label: { formatter: 'X̄', position: 'insideEndTop', color: '#1B3A4B', fontSize: 10 } })

    return {
      animation: false,
      grid: { top: 12, right: 48, bottom: 32, left: 44 },
      xAxis: {
        type: 'value',
        min: curveMin,
        max: curveMax,
        axisLabel: { fontSize: 9, color: '#6b7280', formatter: v => v.toFixed(3) },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e2e8f0' } },
        splitLine: { show: false },
      },
      yAxis: [
        {
          type: 'value',
          min: 0,
          max: maxCount * 1.1,
          axisLabel: { fontSize: 9, color: '#6b7280' },
          axisLine: { show: false },
          axisTick: { show: false },
          splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
        },
        {
          type: 'value',
          min: 0,
          max: maxCurve * 1.1,
          show: false,
        },
      ],
      tooltip: {
        trigger: 'item',
        confine: true,
        backgroundColor: 'rgba(255,255,255,0.97)',
        borderColor: '#e2e8f0',
        borderWidth: 1,
        padding: 8,
        textStyle: { fontSize: 12 },
        formatter: (params) => {
          if (params.seriesIndex === 0) {
            const bin = bins[params.dataIndex]
            return bin
              ? `Range: ${bin.x0.toFixed(3)} – ${bin.x1.toFixed(3)}<br/>Frequency: <strong>${bin.count}</strong>`
              : ''
          }
          return `Normal curve: ${params.value[1]?.toFixed(3)}`
        },
      },
      series: [
        {
          type: 'bar',
          yAxisIndex: 0,
          data: barData,
          barWidth: barWidthPx,
          itemStyle: {
            color: (params) => barData[params.dataIndex]?.inSpec
              ? 'rgba(27,58,75,0.65)'
              : 'rgba(239,68,68,0.65)',
          },
          markLine: {
            silent: true,
            symbol: ['none', 'none'],
            data: markLineData,
          },
        },
        {
          type: 'line',
          yAxisIndex: 1,
          data: curvePoints,
          lineStyle: { color: '#10b981', width: 2 },
          showSymbol: false,
          smooth: true,
          z: 10,
        },
      ],
    }
  }, [spc])

  if (!option) return null

  return (
    <div className="spc-chart-pane">
      <div className="spc-chart-pane-title">Capability Histogram</div>
      <ReactECharts option={option} style={{ height: 220 }} notMerge />
      <p className="spc-chart-hint">Blue = in spec · Red = outside spec · Green curve = normal distribution</p>
    </div>
  )
}
