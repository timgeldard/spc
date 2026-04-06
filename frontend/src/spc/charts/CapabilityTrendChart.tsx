import { useMemo } from 'react'
import EChart from './EChart'
import { emptyCardClass } from '../uiClasses'
import type { CapabilityTrendChartProps, EventParamLike } from '../types'

/**
 * Rolling capability trend line chart.
 * Props:
 *   trendData: Array<{ windowEnd, batchSeq, batchDate, n, cpk, cp, zScore }>
 *   windowSize: number
 */
export default function CapabilityTrendChart({ trendData, windowSize }: CapabilityTrendChartProps) {
  const option = useMemo(() => {
    if (!trendData?.length) return null

    const xLabels = trendData.map(d => d.batchDate ?? `Batch ${d.batchSeq}`)
    const cpkSeries = trendData.map(d => d.cpk != null ? parseFloat(d.cpk.toFixed(3)) : null)

    return {
      animation: false,
      grid: { left: 50, right: 20, top: 30, bottom: 50 },
      tooltip: {
        trigger: 'axis',
        formatter(params: EventParamLike[]) {
          const d = trendData[params[0]?.dataIndex]
          if (!d) return ''
          const cpkVal = d.cpk != null ? d.cpk.toFixed(3) : '—'
          const cpVal  = d.cp  != null ? d.cp.toFixed(3)  : '—'
          const zVal   = d.zScore != null ? d.zScore.toFixed(2) : '—'
          return `<b>${xLabels[params[0].dataIndex]}</b><br/>` +
            `Cpk: ${cpkVal}<br/>Cp: ${cpVal}<br/>Z: ${zVal}<br/>n=${d.n}`
        },
      },
      visualMap: {
        show: false,
        type: 'piecewise',
        dimension: 1,
        pieces: [
          { gte: 1.67, color: '#059669' },
          { gte: 1.33, lt: 1.67, color: '#10b981' },
          { gte: 1.00, lt: 1.33, color: '#d97706' },
          { lt: 1.00, color: '#dc2626' },
        ],
        seriesIndex: 0,
      },
      xAxis: {
        type: 'category',
        data: xLabels,
        axisLabel: { fontSize: 10, rotate: 30 },
      },
      yAxis: {
        type: 'value',
        min: 0,
        max: Math.max(2.0, Math.ceil(Math.max(...cpkSeries.filter(v => v != null)) * 10) / 10 + 0.2),
        name: 'Cpk',
        nameTextStyle: { fontSize: 10 },
        axisLabel: { fontSize: 10 },
      },
      series: [
        {
          type: 'line',
          data: cpkSeries,
          smooth: true,
          lineStyle: { width: 2 },
          symbol: 'circle',
          symbolSize: 4,
          markLine: {
            silent: true,
            symbol: 'none',
            lineStyle: { type: 'dashed' },
            data: [
              { yAxis: 1.67, label: { formatter: '1.67', position: 'end', fontSize: 10 }, lineStyle: { color: '#059669', type: 'dashed' } },
              { yAxis: 1.33, label: { formatter: '1.33', position: 'end', fontSize: 10 }, lineStyle: { color: '#10b981' } },
              { yAxis: 1.00, label: { formatter: '1.00', position: 'end', fontSize: 10 }, lineStyle: { color: '#d97706' } },
            ],
          },
        },
      ],
    }
  }, [trendData])

  if (!option) {
    return (
      <div className={emptyCardClass} style={{ minHeight: 180 }}>
        <p>Not enough data for rolling window of {windowSize}.</p>
      </div>
    )
  }

  return <EChart option={option} style={{ height: 220, width: '100%' }} theme="spc" />
}
