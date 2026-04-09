import { useMemo } from 'react'
import EChart from './EChart'
import type { CapabilityMatrixDatum, CorrelationMatrixProps, CorrelationPair, EventParamLike } from '../types'

/**
 * Bubble matrix of pairwise Pearson correlations.
 * Circle area encodes |r| (strength); colour encodes direction.
 * Positive r → navy (#1B3A4B), Negative r → red (#ef4444).
 * onCellClick(micAId, micBId, micAName, micBName)
 */

// Interpolate hex colour towards navy (positive) or red (negative)
function rToColor(r: number | null | undefined): string {
  if (r == null) return '#d1d5db'
  const abs = Math.abs(r)
  const [r1, g1, b1] = [209, 213, 219]       // #d1d5db — neutral grey
  const [r2, g2, b2] = r >= 0
    ? [27,  58,  75]                           // #1B3A4B — positive navy
    : [239, 68,  68]                           // #ef4444 — negative red
  return `rgb(${Math.round(r1 + (r2 - r1) * abs)},${Math.round(g1 + (g2 - g1) * abs)},${Math.round(b1 + (b2 - b1) * abs)})`
}

interface CorrelationBubbleDatum {
  value: [number, number, number | null, string, string, number | null]
  itemStyle?: { color: string }
}

function pairIdA(pair: CorrelationPair): string {
  return pair.mic_a_id
}

function pairIdB(pair: CorrelationPair): string {
  return pair.mic_b_id
}

export default function CorrelationMatrix({ pairs, mics, onCellClick }: CorrelationMatrixProps) {
  const { xLabels, yLabels, bgData, bubbleData } = useMemo(() => {
    const micIds = mics.map(m => m.mic_id)
    const labels  = mics.map(m => m.mic_name)

    const pairMap = new Map<string, CorrelationPair>()
    for (const p of pairs) {
      pairMap.set(`${pairIdA(p)}__${pairIdB(p)}`, p)
      pairMap.set(`${pairIdB(p)}__${pairIdA(p)}`, { ...p, pearson_r: p.pearson_r })
    }

    const bg: CorrelationBubbleDatum[] = []
    const bubble: CorrelationBubbleDatum[] = []

    for (let yi = 0; yi < micIds.length; yi++) {
      for (let xi = 0; xi < micIds.length; xi++) {
        const isDiag = xi === yi
        const key  = `${micIds[xi]}__${micIds[yi]}`
        const pair = isDiag ? null : pairMap.get(key)
        const r    = isDiag ? 1 : (pair?.pearson_r ?? null)
        const n    = pair?.shared_batches ?? null
        const item: CorrelationBubbleDatum['value'] = [xi, yi, r, micIds[xi], micIds[yi], n]

        bg.push({ value: item, itemStyle: isDiag ? { color: '#e2e8f0' } : undefined })
        if (r != null && !isDiag) bubble.push({ value: item })
      }
    }

    return { xLabels: labels, yLabels: labels, bgData: bg, bubbleData: bubble }
  }, [pairs, mics])

  // Scale factor: 80% of cell fills at |r|=1. Cell ~36px each.
  const MAX_BUBBLE = Math.min(30, Math.max(16, mics.length > 0 ? 240 / mics.length : 28))

  const option = useMemo(() => {
    if (!bgData.length) return null
    return {
      animation: false,
      grid: { left: 120, right: 20, top: 30, bottom: 120 },
      tooltip: {
        trigger: 'item',
        formatter: (params: EventParamLike & { value?: CorrelationBubbleDatum['value'] }) => {
          const [xi, yi, r, , , n] = (params.value as CorrelationBubbleDatum['value']) ?? []
          if (xi === yi) return `<strong>${xLabels[xi]}</strong>`
          if (r == null) return `${xLabels[xi]} × ${yLabels[yi]}<br/>No shared batches`
          const strength = Math.abs(r) >= 0.7 ? 'Strong' : Math.abs(r) >= 0.4 ? 'Moderate' : 'Weak'
          const dir = r > 0 ? 'positive' : 'negative'
          return [
            `${xLabels[xi]} × ${yLabels[yi]}`,
            `r = <strong>${r.toFixed(3)}</strong> · ${strength} ${dir}`,
            `n = ${n ?? '—'} batches`,
          ].join('<br/>')
        },
      },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLabel: { fontSize: 10, rotate: 45 },
        splitLine: { show: false },
      },
      yAxis: {
        type: 'category',
        data: yLabels,
        axisLabel: { fontSize: 10 },
        splitLine: { show: false },
      },
      series: [
        {
          // Uniform grey cell backgrounds
          type: 'heatmap',
          data: bgData,
          itemStyle: { color: '#f3f4f6', borderColor: '#e5e7eb', borderWidth: 1 },
          emphasis: { disabled: true },
          silent: true,
        },
        {
          // Bubbles: size = |r|, colour = direction
          type: 'scatter',
          data: bubbleData,
          symbolSize: (val: CorrelationBubbleDatum['value']) => Math.max(3, Math.abs((val[2] ?? 0)) * MAX_BUBBLE),
          itemStyle: {
            color: (params: EventParamLike & { value: CorrelationBubbleDatum['value'] }) => rToColor(params.value[2]),
            borderColor: 'rgba(255,255,255,0.5)',
            borderWidth: 1,
            opacity: 0.9,
          },
          emphasis: {
            scale: false,
            itemStyle: {
              borderColor: '#fff',
              borderWidth: 2,
              shadowBlur: 8,
              shadowColor: 'rgba(0,0,0,0.25)',
              opacity: 1,
            },
          },
          cursor: 'pointer',
        },
      ],
    }
  }, [bgData, bubbleData, xLabels, yLabels, MAX_BUBBLE])

  const onEvents = useMemo(() => ({
    click: (params: EventParamLike & { value?: CorrelationBubbleDatum['value'] }) => {
      if (!onCellClick || !params.value) return
      const [xi, yi, r, micAId, micBId] = params.value
      if (xi === yi || r == null) return
      const micA = mics.find(m => m.mic_id === micAId)
      const micB = mics.find(m => m.mic_id === micBId)
      onCellClick(micAId, micBId, micA?.mic_name ?? micAId, micB?.mic_name ?? micBId)
    },
  }), [onCellClick, mics])

  if (!option) return null

  const size = Math.max(300, mics.length * 36 + 200)

  return (
    <div>
      <EChart
        option={option}
        theme="spc"
        ariaLabel={`Pairwise Pearson correlation matrix — ${mics.length} characteristics`}
        style={{ height: size, width: '100%' }}
        onEvents={onEvents}
        notMerge
      />
      {/* Legend */}
      <div style={{ display: 'flex', gap: '1.5rem', justifyContent: 'center', fontSize: '0.75rem', color: '#6b7280', marginTop: '-0.5rem', marginBottom: '0.5rem' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#1B3A4B', display: 'inline-block' }} />
          Positive correlation
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#ef4444', display: 'inline-block' }} />
          Negative correlation
        </span>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
          Circle size = |r| strength · Click a bubble to see scatter plot
        </span>
      </div>
    </div>
  )
}
