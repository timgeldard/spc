import { useMemo } from 'react'
import EChart from './EChart'
import type { IndexedChartPoint, SPCComputationResult, SPCSignal } from '../types'

interface CUSUMChartProps {
  spc: SPCComputationResult | null | undefined
  indexedPoints?: IndexedChartPoint[]
  signals?: SPCSignal[]
  onPointClick?: (index: number) => void
}

export default function CUSUMChart({ spc, indexedPoints, signals, onPointClick }: CUSUMChartProps) {
  const cusum = spc?.cusum

  const signalIndices = useMemo(() => {
    const set = new Set<number>()
    for (const sig of signals ?? []) {
      for (const idx of sig.indices) set.add(idx)
    }
    return set
  }, [signals])

  const option = useMemo(() => {
    if (!cusum?.points.length) return null
    const categories = cusum.points.map((point) =>
      point.batchDate ? point.batchDate.substring(0, 10) : `#${point.batchSeq ?? point.index + 1}`,
    )
    const positives = cusum.points.map((point) => point.cPlus)
    const negatives = cusum.points.map((point) => -point.cMinus)
    const h = cusum.decisionInterval
    const maxMagnitude = Math.max(h, ...positives, ...negatives.map((value) => Math.abs(value)))

    return {
      animation: false,
      grid: { top: 12, right: 48, bottom: 28, left: 60 },
      xAxis: {
        type: 'category',
        data: categories,
        axisLabel: { fontSize: 10, color: '#6b7280', interval: 'auto', rotate: categories.length > 20 ? 30 : 0 },
        axisTick: { show: false },
        axisLine: { lineStyle: { color: '#e2e8f0' } },
      },
      yAxis: {
        type: 'value',
        min: -(maxMagnitude * 1.15),
        max: maxMagnitude * 1.15,
        axisLabel: { fontSize: 10, color: '#6b7280', formatter: (v: number) => v.toFixed(3) },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        formatter: (params: Array<{ dataIndex: number }>) => {
          const point = cusum.points[params[0]?.dataIndex ?? 0]
          if (!point) return ''
          return `<strong>${point.batchId ?? `Point ${point.index + 1}`}</strong><br/>Value: ${point.value.toFixed(4)}<br/>C+: <strong>${point.cPlus.toFixed(4)}</strong><br/>C-: <strong>${point.cMinus.toFixed(4)}</strong><br/>Decision interval: ${cusum.decisionInterval.toFixed(4)}`
        },
      },
      series: [
        {
          name: 'Upper H',
          type: 'line',
          data: cusum.points.map(() => h),
          showSymbol: false,
          lineStyle: { color: '#da1e28', type: 'dashed', width: 1.25 },
        },
        {
          name: 'Zero',
          type: 'line',
          data: cusum.points.map(() => 0),
          showSymbol: false,
          lineStyle: { color: '#0f62fe', width: 1.5 },
        },
        {
          name: 'Lower H',
          type: 'line',
          data: cusum.points.map(() => -h),
          showSymbol: false,
          lineStyle: { color: '#da1e28', type: 'dashed', width: 1.25 },
        },
        {
          name: 'C+',
          type: 'line',
          data: cusum.points.map((point) => ({
            value: point.cPlus,
            itemStyle: { color: signalIndices.has(point.index) && point.cPlus > h ? '#da1e28' : '#0f62fe' },
            symbolSize: signalIndices.has(point.index) && point.cPlus > h ? 8 : 5,
          })),
          lineStyle: { color: '#0f62fe', width: 2 },
          showSymbol: true,
        },
        {
          name: 'C-',
          type: 'line',
          data: cusum.points.map((point) => ({
            value: -point.cMinus,
            itemStyle: { color: signalIndices.has(point.index) && point.cMinus > h ? '#da1e28' : '#64748b' },
            symbolSize: signalIndices.has(point.index) && point.cMinus > h ? 8 : 5,
          })),
          lineStyle: { color: '#64748b', width: 2 },
          showSymbol: true,
        },
      ],
    }
  }, [cusum, signalIndices])

  const onEvents = useMemo(() => ({
    click: (params: { componentType?: string; seriesName?: string; dataIndex: number }) => {
      if (!onPointClick || params.componentType !== 'series' || (params.seriesName !== 'C+' && params.seriesName !== 'C-')) return
      const p = indexedPoints?.[params.dataIndex]
      if (p != null) onPointClick(p.originalIndex)
    },
  }), [onPointClick, indexedPoints])

  if (!cusum || !option) return null

  return (
    <div style={{ marginBottom: '0.25rem', borderBottom: '1px solid var(--cds-border-subtle-01)', paddingBottom: '1rem' }}>
      <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--cds-text-secondary)' }}>
        CUSUM Chart
        <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>k={cusum.k.toFixed(2)} · h={cusum.h.toFixed(1)}</span>
      </div>
      <EChart option={option} style={{ height: 320 }} theme="spc" notMerge onEvents={onEvents} ariaLabel="CUSUM control chart" />
    </div>
  )
}
