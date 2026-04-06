import { useMemo } from 'react'
import EChart from './EChart'
import type { LockedLimits, SPCComputationResult, SPCSignal } from '../types'
import { chartHintClass, chartNClass, chartPaneClass, chartPaneTitleClass } from '../uiClasses.js'

interface XbarChartProps {
  spc: SPCComputationResult | null | undefined
  signals?: SPCSignal[]
  externalLimits?: LockedLimits | null
}

export default function XbarChart({ spc, signals, externalLimits }: XbarChartProps) {
  const xbarR = spc?.xbarR

  const signalIndices = useMemo(() => {
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
    if (!xbarR) return null

    const { sigma1, sigma2, subgroupStats, mixedSubgroupSizes } = xbarR
    const grandMean = externalLimits?.cl ?? xbarR.grandMean
    const uclX = externalLimits?.ucl ?? xbarR.ucl_x
    const lclX = externalLimits?.lcl ?? xbarR.lcl_x
    const nominal = spc?.nominal
    const tolerance = spc?.tolerance
    const usl = nominal != null && tolerance != null ? nominal + tolerance : null
    const lsl = nominal != null && tolerance != null ? nominal - tolerance : null

    const categories = subgroupStats.map(s =>
      s.batchDate ? s.batchDate.substring(0, 10) : `#${s.batchSeq}`,
    )

    const seriesData = subgroupStats.map((s, i) => {
      const rules = signalIndices.get(i) ?? []
      const isOoc = rules.includes('Rule 1')
      const isSignal = rules.length > 0 && !isOoc
      let color = '#1B3A4B'
      let symbolSize = 5
      if (isOoc) {
        color = '#ef4444'
        symbolSize = 9
      } else if (isSignal) {
        color = '#f59e0b'
        symbolSize = 7
      }
      return { value: s.xbar, itemStyle: { color }, symbolSize }
    })

    const allY = [uclX, lclX, usl, lsl].filter((v): v is number => v != null)
    const yPad = Math.abs(uclX - lclX) * 0.15
    const yMin = Math.min(...allY) - yPad
    const yMax = Math.max(...allY) + yPad

    const markLineData: Array<Record<string, unknown>> = [
      { yAxis: grandMean, lineStyle: { color: '#1B3A4B', type: 'solid', width: 2 }, label: { formatter: `X̄̄ ${grandMean.toFixed(4)}`, position: 'end', color: '#1B3A4B', fontSize: 10 } },
    ]
    if (!mixedSubgroupSizes) {
      markLineData.unshift({ yAxis: uclX, lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 }, label: { formatter: `UCL ${uclX.toFixed(4)}`, position: 'end', color: '#ef4444', fontSize: 10 } })
      markLineData.push({ yAxis: lclX, lineStyle: { color: '#ef4444', type: 'dashed', width: 1.5 }, label: { formatter: `LCL ${lclX.toFixed(4)}`, position: 'end', color: '#ef4444', fontSize: 10 } })
    }
    if (usl != null) markLineData.push({ yAxis: usl, lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.5 }, label: { formatter: `USL ${usl.toFixed(3)}`, position: 'end', color: '#f59e0b', fontSize: 10 } })
    if (lsl != null) markLineData.push({ yAxis: lsl, lineStyle: { color: '#f59e0b', type: 'dashed', width: 1.5 }, label: { formatter: `LSL ${lsl.toFixed(3)}`, position: 'end', color: '#f59e0b', fontSize: 10 } })

    const series: Array<Record<string, unknown>> = [{
      type: 'line',
      data: seriesData,
      lineStyle: { color: '#1B3A4B', width: 2 },
      showSymbol: true,
      markLine: { silent: true, symbol: ['none', 'none'], data: markLineData },
      markArea: {
        silent: true,
        data: [
          [{ yAxis: grandMean - sigma1, itemStyle: { color: 'rgba(16,185,129,0.05)' } }, { yAxis: grandMean + sigma1 }],
          [{ yAxis: grandMean + sigma1, itemStyle: { color: 'rgba(245,158,11,0.06)' } }, { yAxis: grandMean + sigma2 }],
          [{ yAxis: grandMean - sigma2, itemStyle: { color: 'rgba(245,158,11,0.06)' } }, { yAxis: grandMean - sigma1 }],
          [{ yAxis: grandMean + sigma2, itemStyle: { color: 'rgba(239,68,68,0.06)' } }, { yAxis: uclX }],
          [{ yAxis: lclX, itemStyle: { color: 'rgba(239,68,68,0.06)' } }, { yAxis: grandMean - sigma2 }],
        ],
      },
    }]

    if (mixedSubgroupSizes) {
      series.unshift(
        {
          type: 'line',
          data: subgroupStats.map(s => s.ucl_x),
          showSymbol: false,
          silent: true,
          tooltip: { show: false },
          lineStyle: { color: '#ef4444', width: 1.25, type: 'dashed', opacity: 0.55 },
        },
        {
          type: 'line',
          data: subgroupStats.map(s => s.lcl_x),
          showSymbol: false,
          silent: true,
          tooltip: { show: false },
          lineStyle: { color: '#ef4444', width: 1.25, type: 'dashed', opacity: 0.55 },
        },
      )
    }

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
          const s = subgroupStats[params.dataIndex]
          if (!s) return ''
          return `<strong>${s.batchId}</strong><br/>X̄: <strong>${s.xbar?.toFixed(4)}</strong><br/>n = ${s.n}`
        },
      },
      series,
    }
  }, [xbarR, spc, signalIndices, externalLimits])

  if (!xbarR || !option) return null

  return (
    <div className={chartPaneClass}>
      <div className={chartPaneTitleClass}>
        X̄ Chart (Subgroup Means)
        <span className={chartNClass}>{xbarR.subgroupStats.length} subgroups</span>
      </div>
      <EChart option={option} style={{ height: 280 }} theme="spc" notMerge />
      {xbarR.mixedSubgroupSizes && (
        <p className={chartHintClass}>
          Subgroup sizes vary. Dashed red limits are calculated per subgroup; the centre band uses pooled σ with average n for reference.
        </p>
      )}
    </div>
  )
}
