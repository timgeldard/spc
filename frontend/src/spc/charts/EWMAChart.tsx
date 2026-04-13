import { useMemo } from 'react'
import EChart from './EChart'
import type { IndexedChartPoint, SPCComputationResult, SPCSignal } from '../types'

interface EWMAChartProps {
  spc: SPCComputationResult | null | undefined
  indexedPoints?: IndexedChartPoint[]
  signals?: SPCSignal[]
  onPointClick?: (index: number) => void
}

export default function EWMAChart({ spc, indexedPoints, signals, onPointClick }: EWMAChartProps) {
  const ewma = spc?.ewma

  const signalIndices = useMemo(() => {
    const set = new Set<number>()
    for (const sig of signals ?? []) {
      for (const idx of sig.indices) set.add(idx)
    }
    return set
  }, [signals])

  const option = useMemo(() => {
    if (!ewma?.points.length) return null
    const categories = ewma.points.map((point) =>
      point.batchDate ? point.batchDate.substring(0, 10) : `#${point.batchSeq ?? point.index + 1}`,
    )
    const ewmaValues = ewma.points.map((point) => point.ewma)
    const ucls = ewma.points.map((point) => point.ucl)
    const lcls = ewma.points.map((point) => point.lcl)
    const allY = [...ewmaValues, ...ucls, ...lcls]
    const pad = (Math.max(...allY) - Math.min(...allY)) * 0.15 || 1

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
        min: Math.min(...allY) - pad,
        max: Math.max(...allY) + pad,
        axisLabel: { fontSize: 10, color: '#6b7280', formatter: (v: number) => v.toFixed(3) },
        axisTick: { show: false },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      },
      tooltip: {
        trigger: 'axis',
        confine: true,
        formatter: (params: Array<{ dataIndex: number; seriesName: string; value: number }>) => {
          const point = ewma.points[params[0]?.dataIndex ?? 0]
          if (!point) return ''
          return `<strong>${point.batchId ?? `Point ${point.index + 1}`}</strong><br/>Value: ${point.value.toFixed(4)}<br/>EWMA: <strong>${point.ewma.toFixed(4)}</strong><br/>Limits: [${point.lcl.toFixed(4)}, ${point.ucl.toFixed(4)}]`
        },
      },
      series: [
        {
          name: 'UCL',
          type: 'line',
          data: ucls,
          showSymbol: false,
          lineStyle: { color: '#da1e28', type: 'dashed', width: 1.25 },
        },
        {
          name: 'CL',
          type: 'line',
          data: ewma.points.map(() => ewma.target),
          showSymbol: false,
          lineStyle: { color: '#0f62fe', width: 1.5 },
        },
        {
          name: 'LCL',
          type: 'line',
          data: lcls,
          showSymbol: false,
          lineStyle: { color: '#da1e28', type: 'dashed', width: 1.25 },
        },
        {
          name: 'EWMA',
          type: 'line',
          data: ewma.points.map((point) => ({
            value: point.ewma,
            itemStyle: { color: signalIndices.has(point.index) ? '#da1e28' : '#0f62fe' },
            symbolSize: signalIndices.has(point.index) ? 8 : 5,
          })),
          lineStyle: { color: '#0f62fe', width: 2 },
          showSymbol: true,
        },
      ],
    }
  }, [ewma, signalIndices])

  const onEvents = useMemo(() => ({
    click: (params: { componentType?: string; seriesName?: string; dataIndex: number }) => {
      if (!onPointClick || params.componentType !== 'series' || params.seriesName !== 'EWMA') return
      const p = indexedPoints?.[params.dataIndex]
      if (p != null) onPointClick(p.originalIndex)
    },
  }), [onPointClick, indexedPoints])

  if (!ewma || !option) return null

  return (
    <div style={{ marginBottom: '0.25rem', borderBottom: '1px solid var(--cds-border-subtle-01)', paddingBottom: '1rem' }}>
      <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--cds-text-secondary)' }}>
        EWMA Chart
        <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>λ={ewma.lambda.toFixed(2)} · L={ewma.L.toFixed(1)}</span>
      </div>
      <EChart option={option} style={{ height: 320 }} theme="spc" notMerge onEvents={onEvents} ariaLabel="EWMA control chart" />
    </div>
  )
}
