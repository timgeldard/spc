import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

export default function RangeChart({ spc, mrSignals }) {
  const xbarR = spc?.xbarR

  const signalIndices = useMemo(() => {
    const set = new Set()
    for (const sig of (mrSignals ?? [])) {
      for (const idx of sig.indices) set.add(idx)
    }
    return set
  }, [mrSignals])

  const option = useMemo(() => {
    if (!xbarR) return null

    const { rBar, ucl_r, lcl_r, subgroupStats } = xbarR

    const categories = subgroupStats.map(s =>
      s.batchDate ? s.batchDate.substring(0, 10) : `#${s.batchSeq}`
    )

    const seriesData = subgroupStats.map((s, i) => {
      const isSignal = signalIndices.has(i)
      return {
        value: s.range,
        itemStyle: { color: isSignal ? '#ef4444' : '#64748b' },
        symbolSize: isSignal ? 7 : 4,
      }
    })

    const yMax = Math.max(ucl_r, ...subgroupStats.map(s => s.range ?? 0)) * 1.15

    const markLineData = [
      { yAxis: ucl_r, lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 }, label: { formatter: `UCL ${ucl_r.toFixed(4)}`, position: 'end', color: '#ef4444', fontSize: 10 } },
      { yAxis: rBar,  lineStyle: { color: '#1B3A4B', type: 'solid',  width: 2   }, label: { formatter: `R̄ ${rBar.toFixed(4)}`,  position: 'end', color: '#1B3A4B', fontSize: 10 } },
      { yAxis: 0,     lineStyle: { color: '#94a3b8', type: 'solid',  width: 1   }, label: { show: false } },
    ]
    if (lcl_r > 0) markLineData.push({
      yAxis: lcl_r,
      lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 },
      label: { formatter: `LCL ${lcl_r.toFixed(4)}`, position: 'end', color: '#ef4444', fontSize: 10 },
    })

    return {
      animation: false,
      grid: { top: 8, right: 115, bottom: 28, left: 60 },
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
        max: yMax,
        axisLabel: { fontSize: 10, color: '#6b7280', formatter: v => v.toFixed(3) },
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
        formatter: (params) => {
          if (params.componentType !== 'series') return ''
          const s = subgroupStats[params.dataIndex]
          return `<strong>${s?.batchId ?? `Point ${params.dataIndex}`}</strong><br/>R: <strong>${params.value?.toFixed(4)}</strong>`
        },
      },
      series: [{
        type: 'line',
        data: seriesData,
        lineStyle: { color: '#64748b', width: 1.5 },
        showSymbol: true,
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          data: markLineData,
        },
      }],
    }
  }, [xbarR, signalIndices])

  if (!xbarR || !option) return null

  return (
    <div className="spc-chart-pane">
      <div className="spc-chart-pane-title">R Chart (Subgroup Range)</div>
      <ReactECharts option={option} style={{ height: 180 }} theme="spc" notMerge />
    </div>
  )
}
