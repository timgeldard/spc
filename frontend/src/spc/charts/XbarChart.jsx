import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

export default function XbarChart({ spc, signals, externalLimits }) {
  const xbarR = spc?.xbarR

  const signalIndices = useMemo(() => {
    const map = new Map()
    for (const sig of (signals ?? [])) {
      for (const idx of sig.indices) {
        if (!map.has(idx)) map.set(idx, [])
        map.get(idx).push(`Rule ${sig.rule}`)
      }
    }
    return map
  }, [signals])

  const option = useMemo(() => {
    if (!xbarR) return null

    const { sigma1, sigma2, subgroupStats } = xbarR
    const grandMean = externalLimits?.cl  ?? xbarR.grandMean
    const ucl_x     = externalLimits?.ucl ?? xbarR.ucl_x
    const lcl_x     = externalLimits?.lcl ?? xbarR.lcl_x
    const nominal   = spc?.nominal
    const tolerance = spc?.tolerance
    const usl = (nominal != null && tolerance != null) ? nominal + tolerance : null
    const lsl = (nominal != null && tolerance != null) ? nominal - tolerance : null

    const categories = subgroupStats.map(s =>
      s.batchDate ? s.batchDate.substring(0, 10) : `#${s.batchSeq}`
    )

    const seriesData = subgroupStats.map((s, i) => {
      const rules = signalIndices.get(i) ?? []
      const isOOC   = rules.includes('Rule 1')
      const isSignal = rules.length > 0 && !isOOC
      let color = '#1B3A4B'
      let symbolSize = 5
      if (isOOC)    { color = '#ef4444'; symbolSize = 9 }
      else if (isSignal) { color = '#f59e0b'; symbolSize = 7 }
      return { value: s.xbar, itemStyle: { color }, symbolSize }
    })

    const allY = [ucl_x, lcl_x, usl, lsl].filter(v => v != null)
    const yPad = Math.abs(ucl_x - lcl_x) * 0.15
    const yMin = Math.min(...allY) - yPad
    const yMax = Math.max(...allY) + yPad

    const markLineData = [
      { yAxis: ucl_x,     lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 }, label: { formatter: `UCL ${ucl_x.toFixed(4)}`,       position: 'end', color: '#ef4444', fontSize: 10 } },
      { yAxis: grandMean, lineStyle: { color: '#1B3A4B', type: 'solid',  width: 2   }, label: { formatter: `X̄̄ ${grandMean.toFixed(4)}`, position: 'end', color: '#1B3A4B', fontSize: 10 } },
      { yAxis: lcl_x,     lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 }, label: { formatter: `LCL ${lcl_x.toFixed(4)}`,       position: 'end', color: '#ef4444', fontSize: 10 } },
    ]
    if (usl != null) markLineData.push({ yAxis: usl, lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.5 }, label: { formatter: `USL ${usl.toFixed(3)}`, position: 'end', color: '#f59e0b', fontSize: 10 } })
    if (lsl != null) markLineData.push({ yAxis: lsl, lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.5 }, label: { formatter: `LSL ${lsl.toFixed(3)}`, position: 'end', color: '#f59e0b', fontSize: 10 } })

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
        min: yMin,
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
          if (!s) return ''
          return `<strong>${s.batchId}</strong><br/>X̄: <strong>${s.xbar?.toFixed(4)}</strong><br/>n = ${s.n}`
        },
      },
      series: [{
        type: 'line',
        data: seriesData,
        lineStyle: { color: '#1B3A4B', width: 2 },
        showSymbol: true,
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          data: markLineData,
        },
        markArea: {
          silent: true,
          data: [
            [{ yAxis: grandMean - sigma1, itemStyle: { color: 'rgba(16,185,129,0.05)'  } }, { yAxis: grandMean + sigma1  }],
            [{ yAxis: grandMean + sigma1, itemStyle: { color: 'rgba(245,158,11,0.06)'  } }, { yAxis: grandMean + sigma2  }],
            [{ yAxis: grandMean - sigma2, itemStyle: { color: 'rgba(245,158,11,0.06)'  } }, { yAxis: grandMean - sigma1  }],
            [{ yAxis: grandMean + sigma2, itemStyle: { color: 'rgba(239,68,68,0.06)'   } }, { yAxis: ucl_x              }],
            [{ yAxis: lcl_x,              itemStyle: { color: 'rgba(239,68,68,0.06)'   } }, { yAxis: grandMean - sigma2  }],
          ],
        },
      }],
    }
  }, [xbarR, spc, signalIndices, externalLimits])

  if (!xbarR || !option) return null

  return (
    <div className="spc-chart-pane">
      <div className="spc-chart-pane-title">
        X̄ Chart (Subgroup Means)
        <span className="spc-chart-n">{xbarR.subgroupStats.length} subgroups</span>
      </div>
      <ReactECharts option={option} style={{ height: 280 }} notMerge />
    </div>
  )
}
