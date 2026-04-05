import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'

export default function IndividualsChart({ spc, indexedPoints, signals, excludedIndices, onPointClick, externalLimits }) {
  const imr = spc?.imr

  const rulesByIndex = useMemo(() => {
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
    if (!imr || !indexedPoints?.length) return null

    const xBar  = externalLimits?.cl   ?? imr.xBar
    const ucl_x = externalLimits?.ucl  ?? imr.ucl_x
    const lcl_x = externalLimits?.lcl  ?? imr.lcl_x
    const { sigma1, sigma2 } = imr
    const nominal  = spc?.nominal
    const tolerance = spc?.tolerance
    const usl = (nominal != null && tolerance != null) ? nominal + tolerance : null
    const lsl = (nominal != null && tolerance != null) ? nominal - tolerance : null

    const categories = indexedPoints.map(p =>
      p.batch_date ? p.batch_date.substring(0, 10) : `#${p.batch_seq}`
    )

    const seriesData = indexedPoints.map(p => {
      const rules = rulesByIndex.get(p.originalIndex) ?? []
      const isExcluded = p.excluded
      const isOOC = rules.includes('Rule 1')
      const isSignal = rules.length > 0 && !isOOC
      const isOutlier = p.is_outlier && !isExcluded

      let color = '#1B3A4B'
      let symbolSize = 5
      let symbol = 'circle'
      if (isExcluded)       { color = '#9ca3af'; symbolSize = 7 }
      else if (isOOC)       { color = '#ef4444'; symbolSize = 9 }
      else if (isSignal)    { color = '#f59e0b'; symbolSize = 7 }
      if (isOutlier)        { color = '#7c3aed'; symbolSize = 10; symbol = 'diamond' }

      return { value: p.value, itemStyle: { color }, symbolSize, symbol }
    })

    const allY = [ucl_x, lcl_x, usl, lsl].filter(v => v != null)
    const yMin = Math.min(...allY) - Math.abs(Math.min(...allY) - lcl_x) * 0.15
    const yMax = Math.max(...allY) + Math.abs(ucl_x - Math.max(...allY)) * 0.15

    const markLineData = [
      { yAxis: ucl_x, lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 }, label: { formatter: `UCL ${ucl_x.toFixed(4)}`, position: 'end', color: '#ef4444', fontSize: 10 } },
      { yAxis: xBar,  lineStyle: { color: '#1B3A4B', type: 'solid',  width: 2   }, label: { formatter: `X̄ ${xBar.toFixed(4)}`,  position: 'end', color: '#1B3A4B', fontSize: 10 } },
      { yAxis: lcl_x, lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 }, label: { formatter: `LCL ${lcl_x.toFixed(4)}`, position: 'end', color: '#ef4444', fontSize: 10 } },
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
          const p = indexedPoints[params.dataIndex]
          if (!p) return ''
          const rules = rulesByIndex.get(p.originalIndex) ?? []
          const deviation = p.nominal != null ? (p.value - p.nominal).toFixed(4) : null
          let html = `<strong>${p.batch_id ?? `Point ${params.dataIndex}`}</strong><br/>`
          if (p.batch_date) html += `Date: ${p.batch_date}<br/>`
          html += `Value: <strong>${p.value?.toFixed(4)}</strong><br/>`
          if (p.nominal != null) html += `Target: ${p.nominal?.toFixed(4)}<br/>`
          if (deviation != null) html += `Deviation: ${deviation}<br/>`
          if (p.is_outlier) html += `<span style="color:#7c3aed">◆ ATTRIBUT outlier — marked by QA</span><br/>`
          if (rules.length > 0) html += `<span style="color:#f59e0b">⚠ ${rules.join('; ')}</span><br/>`
          if (p.excluded) html += `<span style="color:#9ca3af">Excluded from limits</span>`
          return html
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
            [{ yAxis: xBar - sigma1, itemStyle: { color: 'rgba(16,185,129,0.05)'  } }, { yAxis: xBar + sigma1  }],
            [{ yAxis: xBar + sigma1, itemStyle: { color: 'rgba(245,158,11,0.06)'  } }, { yAxis: xBar + sigma2  }],
            [{ yAxis: xBar - sigma2, itemStyle: { color: 'rgba(245,158,11,0.06)'  } }, { yAxis: xBar - sigma1  }],
            [{ yAxis: xBar + sigma2, itemStyle: { color: 'rgba(239,68,68,0.06)'   } }, { yAxis: ucl_x          }],
            [{ yAxis: lcl_x,         itemStyle: { color: 'rgba(239,68,68,0.06)'   } }, { yAxis: xBar - sigma2  }],
          ],
        },
      }],
    }
  }, [imr, indexedPoints, rulesByIndex, spc, externalLimits])

  const onEvents = useMemo(() => ({
    click: (params) => {
      if (!onPointClick || params.componentType !== 'series') return
      const p = indexedPoints?.[params.dataIndex]
      if (p != null) onPointClick(p.originalIndex)
    },
  }), [onPointClick, indexedPoints])

  if (!imr || !indexedPoints || !option) return null

  return (
    <div className="spc-chart-pane">
      <div className="spc-chart-pane-title">
        Individuals Chart (X)
        <span className="spc-chart-n">n = {indexedPoints.length}</span>
      </div>
      <ReactECharts option={option} style={{ height: 280 }} theme="spc" notMerge onEvents={onEvents} />
      {onPointClick && (
        <p className="spc-chart-hint">Click any point to open the reviewed exclusion flow for control-limit calculation</p>
      )}
    </div>
  )
}
