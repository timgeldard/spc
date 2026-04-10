import { useMemo } from 'react'
import EChart from './EChart'
import type { EventParamLike, IndexedChartPoint, SPCComputationResult, SPCSignal } from '../types'

interface MovingRangeChartProps {
  spc: SPCComputationResult | null
  indexedPoints: IndexedChartPoint[]
  mrSignals: SPCSignal[]
  externalUclMr?: number | null
}

export default function MovingRangeChart({ spc, indexedPoints, mrSignals, externalUclMr }: MovingRangeChartProps) {
  const imr = spc?.imr

  const signalIndices = useMemo(() => {
    const set = new Set<number>()
    for (const sig of (mrSignals ?? [])) {
      for (const idx of sig.indices) set.add(idx)
    }
    return set
  }, [mrSignals])

  const option = useMemo(() => {
    if (!imr || !indexedPoints?.length) return null

    const { mrBar, movingRanges } = imr
    const ucl_mr = externalUclMr ?? imr.ucl_mr

    const mrData = indexedPoints.slice(1).map((p, i) => {
      const mr = movingRanges[i]
      const isSignal = signalIndices.has(i)
      return {
        value: mr,
        itemStyle: { color: isSignal ? '#da1e28' : '#64748b' },
        symbolSize: isSignal ? 7 : 4,
      }
    })

    const categories = indexedPoints.slice(1).map(p =>
      p.batch_date ? p.batch_date.substring(0, 10) : `#${p.batch_seq}`
    )

    const yMax = Math.max(ucl_mr, ...movingRanges) * 1.15

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
          const p = indexedPoints.slice(1)[params.dataIndex]
          const value = typeof params.value === 'number' ? params.value : null
          return `${p?.batch_id ?? `Point ${params.dataIndex}`}<br/>MR: <strong>${value?.toFixed(4) ?? '—'}</strong>`
        },
      },
      series: [{
        type: 'line',
        data: mrData,
        lineStyle: { color: '#64748b', width: 1.5 },
        showSymbol: true,
        markLine: {
          silent: true,
          symbol: ['none', 'none'],
          data: [
            { yAxis: ucl_mr, lineStyle: { color: '#da1e28', type: 'dashed', width: 1.5 }, label: { formatter: `UCL ${ucl_mr.toFixed(4)}`, position: 'end', color: '#da1e28', fontSize: 10 } },
            { yAxis: mrBar,  lineStyle: { color: '#0f62fe', type: 'solid',  width: 2   }, label: { formatter: `MR̄ ${mrBar.toFixed(4)}`,  position: 'end', color: '#0f62fe', fontSize: 10 } },
            { yAxis: 0,      lineStyle: { color: '#94a3b8', type: 'solid',  width: 1   }, label: { show: false } },
          ],
        },
      }],
    }
  }, [imr, indexedPoints, signalIndices, externalUclMr])

  if (!imr || !indexedPoints || !option) return null

  return (
    <div style={{ marginBottom: '0.25rem', borderBottom: '1px solid var(--cds-border-subtle-01)', paddingBottom: '1rem' }}>
      <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--cds-text-secondary)' }}>Moving Range Chart (MR)</div>
      <EChart option={option} style={{ height: 180 }} theme="spc" notMerge ariaLabel="Moving range (MR) control chart" />
    </div>
  )
}
