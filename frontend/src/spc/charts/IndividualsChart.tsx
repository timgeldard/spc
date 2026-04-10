import { useMemo } from 'react'
import EChart from './EChart'
import type { IndexedChartPoint, LockedLimits, SPCComputationResult, SPCSignal } from '../types'

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

      let color = '#0f62fe'
      let symbolSize = 5
      let symbol = 'circle'
      if (isExcluded) {
        color = '#9ca3af'
        symbolSize = 7
      } else if (isOoc) {
        color = '#da1e28'
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

    const dataValues = seriesData.map(d => d.value as number)
    const allY = [...dataValues, uclX, lclX, usl, lsl].filter((v): v is number => v != null)
    const pad = Math.abs(uclX - lclX) * 0.15 || 1
    const yMin = Math.min(...allY) - pad
    const yMax = Math.max(...allY) + pad

    const markLineData: Array<Record<string, unknown>> = [
      { yAxis: uclX, lineStyle: { color: '#da1e28', type: 'dashed', width: 1.5 }, label: { formatter: `UCL ${uclX.toFixed(4)}`, position: 'end', color: '#da1e28', fontSize: 10 } },
      { yAxis: xBar, lineStyle: { color: '#0f62fe', type: 'solid', width: 2 }, label: { formatter: `X̄ ${xBar.toFixed(4)}`, position: 'end', color: '#0f62fe', fontSize: 10 } },
      { yAxis: lclX, lineStyle: { color: '#da1e28', type: 'dashed', width: 1.5 }, label: { formatter: `LCL ${lclX.toFixed(4)}`, position: 'end', color: '#da1e28', fontSize: 10 } },
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
        lineStyle: { color: '#0f62fe', width: 2 },
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
    <div style={{ marginBottom: '0.25rem', borderBottom: '1px solid var(--cds-border-subtle-01)', paddingBottom: '1rem' }}>
      <div style={{ marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.8125rem', fontWeight: 600, color: 'var(--cds-text-secondary)' }}>
        Individuals Chart (X)
        <span style={{ fontSize: '0.75rem', fontWeight: 400 }}>n = {indexedPoints.length}</span>
      </div>
      <EChart option={option} style={{ height: 280 }} theme="spc" notMerge onEvents={onEvents} ariaLabel="Individuals (I) control chart" />
      <p style={{ marginTop: '0.25rem', fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--cds-text-secondary)' }}>
        Sigma estimator: {imr.sigmaMethod === 'mssd' ? 'MSSD (trend-aware / low-n)' : 'Moving range (MR̄ / d2)'}
      </p>
      {onPointClick && (
        <p style={{ marginTop: '0.25rem', fontSize: '0.7rem', fontStyle: 'italic', color: 'var(--cds-text-secondary)' }}>Click any point to open the reviewed exclusion flow for control-limit calculation</p>
      )}
    </div>
  )
}
