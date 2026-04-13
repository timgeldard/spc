import { useMemo } from 'react'
import EChart from './EChart'
import type { EventParamLike, SPCComputationResult, SPCSignal } from '../types'

interface SigmaChartProps {
  spc: SPCComputationResult | null
  mrSignals: SPCSignal[]
  externalUclS?: number | null
}

export default function SigmaChart({ spc, mrSignals, externalUclS }: SigmaChartProps) {
  const xbarS = spc?.xbarS

  const signalIndices = useMemo(() => {
    const set = new Set<number>()
    for (const sig of (mrSignals ?? [])) {
      for (const idx of sig.indices) set.add(idx)
    }
    return set
  }, [mrSignals])

  const option = useMemo(() => {
    if (!xbarS) return null

    const { sBar, ucl_s: computedUclS, lcl_s, subgroupStats } = xbarS
    const uclS = externalUclS ?? computedUclS

    const categories = subgroupStats.map(s =>
      s.batchDate ? s.batchDate.substring(0, 10) : `#${s.batchSeq}`,
    )

    const seriesData = subgroupStats.map((s, i) => {
      const isSignal = signalIndices.has(i)
      return {
        value: s.stddev ?? 0,
        itemStyle: { color: isSignal ? '#da1e28' : '#64748b' },
        symbolSize: isSignal ? 7 : 4,
      }
    })

    const yMax = Math.max(uclS, ...subgroupStats.map(s => s.stddev ?? 0)) * 1.15

    const markLineData = [
      { yAxis: uclS, lineStyle: { color: '#da1e28', type: 'dashed', width: 1.5 }, label: { formatter: `UCL ${uclS.toFixed(4)}`, position: 'end', color: '#da1e28', fontSize: 10 } },
      { yAxis: sBar, lineStyle: { color: '#0f62fe', type: 'solid', width: 2 }, label: { formatter: `S̄ ${sBar.toFixed(4)}`, position: 'end', color: '#0f62fe', fontSize: 10 } },
      { yAxis: 0, lineStyle: { color: '#94a3b8', type: 'solid', width: 1 }, label: { show: false } },
    ]
    if (lcl_s > 0) {
      markLineData.push({
        yAxis: lcl_s,
        lineStyle: { color: '#da1e28', type: 'dashed', width: 1.5 },
        label: { formatter: `LCL ${lcl_s.toFixed(4)}`, position: 'end', color: '#da1e28', fontSize: 10 },
      })
    }

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
        formatter: (params: EventParamLike) => {
          if (params.componentType !== 'series') return ''
          const s = subgroupStats[params.dataIndex]
          const value = typeof params.value === 'number' ? params.value : null
          return `<strong>${s?.batchId ?? `Point ${params.dataIndex}`}</strong><br/>S: <strong>${value?.toFixed(4) ?? '—'}</strong>`
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
  }, [xbarS, signalIndices, externalUclS])

  if (!xbarS || !option) return null

  return (
    <div style={{ marginBottom: '0.25rem', borderBottom: '1px solid var(--cds-border-subtle-01)', paddingBottom: '1rem' }}>
      <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--cds-text-secondary)' }}>S Chart (Subgroup Standard Deviation)</div>
      <EChart option={option} style={{ height: 180 }} theme="spc" notMerge ariaLabel="S chart — subgroup standard deviation" />
    </div>
  )
}
