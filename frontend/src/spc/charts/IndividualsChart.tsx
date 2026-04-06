import { useMemo } from 'react'
import ReactECharts from 'echarts-for-react'
import type { IndexedChartPoint, LockedLimits, SPCComputationResult, SPCSignal } from '../types'
import { chartHintClass, chartNClass, chartPaneClass, chartPaneTitleClass } from '../uiClasses.js'

interface IndividualsChartProps {
  spc: SPCComputationResult | null | undefined
  indexedPoints?: IndexedChartPoint[]
  signals?: SPCSignal[]
  excludedIndices?: Set<number>
  onPointClick?: (index: number) => void
  externalLimits?: LockedLimits | null
}

export default function IndividualsChart({ spc, indexedPoints, signals, onPointClick, externalLimits }: IndividualsChartProps) {
  const imr = spc?.imr

  const rulesByIndex = useMemo(() => {
    const map = new Map<number, string[]>()
    for (const sig of signals ?? []) {
      for (const idx of sig.indices) {
        if (!map.has(idx)) map.set(idx, [])
        map.get(idx)?.push(`Rule ${sig.rule}`)
      }
    }
    return map
  }, [signals])

  const option = useMemo(() => {
    if (!imr || !indexedPoints?.length) return null

    const xBar = externalLimits?.cl ?? imr.xBar
    const uclX = externalLimits?.ucl ?? imr.ucl_x
    const lclX = externalLimits?.lcl ?? imr.lcl_x
    const { sigma1, sigma2 } = imr
    const nominal = spc?.nominal
    const tolerance = spc?.tolerance
    const usl = nominal != null && tolerance != null ? nominal + tolerance : null
    const lsl = nominal != null && tolerance != null ? nominal - tolerance : null

    const categories = indexedPoints.map(p =>
      p.batch_date ? p.batch_date.substring(0, 10) : `#${p.batch_seq}`,
    )

    const seriesData = indexedPoints.map(p => {
      const rules = rulesByIndex.get(p.originalIndex) ?? []
      const isExcluded = p.excluded
      const isOoc = rules.includes('Rule 1')
      const isSignal = rules.length > 0 && !isOoc
      const isOutlier = Boolean(p.is_outlier && !isExcluded)

      let color = '#1B3A4B'
      let symbolSize = 5
      let symbol = 'circle'
      if (isExcluded) {
        color = '#9ca3af'
        symbolSize = 7
      } else if (isOoc) {
        color = '#ef4444'
        symbolSize = 9
      } else if (isSignal) {
        color = '#f59e0b'
        symbolSize = 7
      }
      if (isOutlier) {
        color = '#7c3aed'
        symbolSize = 10
        symbol = 'diamond'
      }

      return { value: p.value, itemStyle: { color }, symbolSize, symbol }
    })

    const allY = [uclX, lclX, usl, lsl].filter((v): v is number => v != null)
    const minY = Math.min(...allY)
    const maxY = Math.max(...allY)
    const yMin = minY - Math.abs(minY - lclX) * 0.15
    const yMax = maxY + Math.abs(uclX - maxY) * 0.15

    const markLineData: Array<Record<string, unknown>> = [
      { yAxis: uclX, lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 }, label: { formatter: `UCL ${uclX.toFixed(4)}`, position: 'end', color: '#ef4444', fontSize: 10 } },
      { yAxis: xBar, lineStyle: { color: '#1B3A4B', type: 'solid', width: 2 }, label: { formatter: `X̄ ${xBar.toFixed(4)}`, position: 'end', color: '#1B3A4B', fontSize: 10 } },
      { yAxis: lclX, lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 }, label: { formatter: `LCL ${lclX.toFixed(4)}`, position: 'end', color: '#ef4444', fontSize: 10 } },
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
        axisLabel: { fontSize: 10, color: '#6b7280', formatter: (v: number) => v.toFixed(3) },
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
        formatter: (params: { componentType?: string; dataIndex: number }) => {
          if (params.componentType !== 'series') return ''
          const p = indexedPoints[params.dataIndex]
          if (!p) return ''
          const rules = rulesByIndex.get(p.originalIndex) ?? []
          const deviation = p.nominal != null ? (p.value - p.nominal).toFixed(4) : null
          let html = `<strong>${p.batch_id ?? `Point ${params.dataIndex}`}</strong><br/>`
          if (p.batch_date) html += `Date: ${p.batch_date}<br/>`
          html += `Value: <strong>${p.value?.toFixed(4)}</strong><br/>`
          if (p.nominal != null) html += `Target: ${p.nominal.toFixed(4)}<br/>`
          if (deviation != null) html += `Deviation: ${deviation}<br/>`
          if (p.is_outlier) html += '<span style="color:#7c3aed">◆ ATTRIBUT outlier — marked by QA</span><br/>'
          if (rules.length > 0) html += `<span style="color:#f59e0b">⚠ ${rules.join('; ')}</span><br/>`
          if (p.excluded) html += '<span style="color:#9ca3af">Excluded from limits</span>'
          return html
        },
      },
      series: [{
        type: 'line',
        data: seriesData,
        lineStyle: { color: '#1B3A4B', width: 2 },
        showSymbol: true,
        markLine: { silent: true, symbol: ['none', 'none'], data: markLineData },
        markArea: {
          silent: true,
          data: [
            [{ yAxis: xBar - sigma1, itemStyle: { color: 'rgba(16,185,129,0.05)' } }, { yAxis: xBar + sigma1 }],
            [{ yAxis: xBar + sigma1, itemStyle: { color: 'rgba(245,158,11,0.06)' } }, { yAxis: xBar + sigma2 }],
            [{ yAxis: xBar - sigma2, itemStyle: { color: 'rgba(245,158,11,0.06)' } }, { yAxis: xBar - sigma1 }],
            [{ yAxis: xBar + sigma2, itemStyle: { color: 'rgba(239,68,68,0.06)' } }, { yAxis: uclX }],
            [{ yAxis: lclX, itemStyle: { color: 'rgba(239,68,68,0.06)' } }, { yAxis: xBar - sigma2 }],
          ],
        },
      }],
    }
  }, [imr, indexedPoints, rulesByIndex, spc, externalLimits])

  const onEvents = useMemo(() => ({
    click: (params: { componentType?: string; dataIndex: number }) => {
      if (!onPointClick || params.componentType !== 'series') return
      const p = indexedPoints?.[params.dataIndex]
      if (p != null) onPointClick(p.originalIndex)
    },
  }), [onPointClick, indexedPoints])

  if (!imr || !indexedPoints || !option) return null

  return (
    <div className={chartPaneClass}>
      <div className={chartPaneTitleClass}>
        Individuals Chart (X)
        <span className={chartNClass}>n = {indexedPoints.length}</span>
      </div>
      <ReactECharts option={option} style={{ height: 280 }} theme="spc" notMerge onEvents={onEvents} />
      <p className={chartHintClass}>
        Sigma estimator: {imr.sigmaMethod === 'mssd' ? 'MSSD (trend-aware / low-n)' : 'Moving range (MR̄ / d2)'}
      </p>
      {onPointClick && (
        <p className={chartHintClass}>Click any point to open the reviewed exclusion flow for control-limit calculation</p>
      )}
    </div>
  )
}
