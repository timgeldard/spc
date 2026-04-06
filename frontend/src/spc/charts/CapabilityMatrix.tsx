import { useMemo } from 'react'
import EChart from './EChart'
import { useSPC } from '../SPCContext'
import { chartHintClass, emptyStateClass, surfacePanelClass } from '../uiClasses'
import type { CapabilityMatrixDatum, CapabilityMatrixProps, EventParamLike, ScorecardRow } from '../types'

/**
 * Bubble chart: X = Ppk, Y = stability (1 - ooc_rate), size = batch_count.
 * Quadrant lines at Ppk=1.33, stability=0.98.
 * On click: dispatch SET_MIC + SET_ACTIVE_TAB: 'charts'.
 */
export default function CapabilityMatrix({ rows }: CapabilityMatrixProps) {
  const { dispatch } = useSPC()

  const data = useMemo(
    () => rows
      .filter(r => r.ppk != null)
      .map(r => ({
        value: [
          r.ppk,
          parseFloat((1 - (r.ooc_rate ?? 0)).toFixed(4)),
          r.batch_count ?? 10,
        ],
        mic_id: r.mic_id,
        mic_name: r.mic_name,
        ppk: r.ppk,
        ooc_rate: r.ooc_rate,
        batch_count: r.batch_count,
      })) as CapabilityMatrixDatum[],
    [rows]
  )

  const option = useMemo(() => {
    if (!data.length) return null

    const maxBatch = Math.max(...data.map(d => d.batch_count ?? 10))

    return {
      animation: false,
      grid: { left: 60, right: 30, top: 40, bottom: 50 },
      tooltip: {
        trigger: 'item',
        formatter: (params: EventParamLike & { data?: CapabilityMatrixDatum }) => {
          const d = params.data
          if (!d?.mic_name) return ''
          let html = `<strong>${d.mic_name}</strong><br/>`
          html += `Ppk: <strong>${d.ppk.toFixed(3)}</strong>`
          html += `<br/>OOC Rate: ${(((d.ooc_rate ?? 0) * 100)).toFixed(1)}%<br/>`
          html += `Batches: ${d.batch_count}`
          return html
        },
      },
      xAxis: {
        type: 'value',
        name: 'Ppk',
        nameLocation: 'middle',
        nameGap: 30,
        min: 0,
        max: Math.max(2.0, Math.ceil(Math.max(...data.map(d => d.ppk)) * 10) / 10 + 0.2),
        axisLabel: { fontSize: 11 },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      },
      yAxis: {
        type: 'value',
        name: 'Stability (1 – OOC Rate)',
        nameLocation: 'middle',
        nameGap: 45,
        min: 0,
        max: 1,
        axisLabel: { fontSize: 11, formatter: (v: number) => (v * 100).toFixed(0) + '%' },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      },
      series: [
        {
          type: 'scatter',
          data,
          symbolSize: (d: CapabilityMatrixDatum['value'] | CapabilityMatrixDatum) => {
            const batch = Array.isArray(d) ? d[2] : d?.value?.[2] ?? 10
            return Math.max(10, Math.min(40, Math.sqrt(batch / maxBatch) * 40 + 8))
          },
          itemStyle: {
            color: (params: EventParamLike & { value: CapabilityMatrixDatum['value'] }) => {
              const [ppk, stability] = params.value
              if (ppk >= 1.33 && stability >= 0.98) return '#059669'
              if (ppk >= 1.33) return '#10b981'
              if (stability >= 0.98) return '#d97706'
              return '#dc2626'
            },
            opacity: 0.8,
          },
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { type: 'dashed', color: '#10b981', width: 1 },
            data: [
              { xAxis: 1.33, label: { formatter: 'Ppk 1.33', position: 'end', fontSize: 10, color: '#10b981' } },
              { yAxis: 0.98, label: { formatter: '98% stable', position: 'end', fontSize: 10, color: '#10b981' } },
            ],
          },
          markArea: {
            silent: true,
            data: [
              [
                { coord: [1.33, 0.98], itemStyle: { color: 'rgba(5,150,105,0.04)' } },
                { coord: [99, 1] },
              ],
              [
                { coord: [0, 0], itemStyle: { color: 'rgba(220,38,38,0.04)' } },
                { coord: [1.33, 0.98] },
              ],
            ],
          },
        },
      ],
    }
  }, [data])

  const onEvents = useMemo(() => ({
    click: (params: EventParamLike & { data?: CapabilityMatrixDatum }) => {
      if (!params.data?.mic_id) return
      dispatch({ type: 'SET_MIC', payload: { mic_id: params.data.mic_id, mic_name: params.data.mic_name, chart_type: 'imr' } })
      dispatch({ type: 'SET_ACTIVE_TAB', payload: 'charts' })
    },
  }), [dispatch])

  if (!data.length || !option) {
    return <div className={emptyStateClass}><p>No capability data available for matrix view.</p></div>
  }

  return (
    <div className={surfacePanelClass}>
      <EChart option={option} style={{ height: 500, width: '100%' }} theme="spc" onEvents={onEvents} notMerge />
      <p className={chartHintClass}>
        Bubble size = batch count · Click a bubble to open the control chart · Green = Capable &amp; Stable
      </p>
    </div>
  )
}
