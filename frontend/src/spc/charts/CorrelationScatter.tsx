import { useMemo } from 'react'
import EChart from './EChart'
import { loadingClass, spinnerClass, surfacePanelClass } from '../uiClasses'
import type { CorrelationScatterPoint, CorrelationScatterProps, EventParamLike } from '../types'

interface RegressionLine {
  slope: number
  intercept: number
}

function linearRegression(points: CorrelationScatterPoint[]): RegressionLine | null {
  const n = points.length
  if (n < 2) return null
  const sumX  = points.reduce((s, p) => s + p.x, 0)
  const sumY  = points.reduce((s, p) => s + p.y, 0)
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0)
  const sumX2 = points.reduce((s, p) => s + p.x * p.x, 0)
  const denom = n * sumX2 - sumX * sumX
  if (denom === 0) return null
  const slope     = (n * sumXY - sumX * sumY) / denom
  const intercept = (sumY - slope * sumX) / n
  return { slope, intercept }
}

export default function CorrelationScatter({ result, loading, error }: CorrelationScatterProps) {
  const option = useMemo(() => {
    if (!result?.points?.length) return null

    const { points, mic_a_name, mic_b_name, pearson_r, n } = result
    const xs = points.map(p => p.x)
    const ys = points.map(p => p.y)
    const xMin = Math.min(...xs)
    const xMax = Math.max(...xs)

    const reg = linearRegression(points)
    const regLine = reg
      ? [[xMin, reg.slope * xMin + reg.intercept], [xMax, reg.slope * xMax + reg.intercept]]
      : []

    const rLabel = pearson_r != null ? `r = ${pearson_r.toFixed(3)}` : ''
    const strength =
      pearson_r == null ? '' :
      Math.abs(pearson_r) >= 0.7 ? ' · Strong' :
      Math.abs(pearson_r) >= 0.4 ? ' · Moderate' : ' · Weak'

    return {
      animation: false,
      title: {
        text: `${mic_a_name} × ${mic_b_name}`,
        subtext: `${rLabel}${strength}  ·  n = ${n} batches`,
        left: 'center',
        textStyle: { fontSize: 13 },
        subtextStyle: { fontSize: 11, color: '#6b7280' },
      },
      tooltip: {
        trigger: 'item',
        formatter: (params: EventParamLike & { data?: CorrelationScatterPoint }) => {
          if (params.seriesIndex === 1) return ''
          const { batch_id, batch_date, x, y } = params.data ?? { x: 0, y: 0 }
          return [
            `<strong>Batch ${batch_id}</strong>`,
            batch_date ? `Date: ${batch_date}` : '',
            `${mic_a_name}: ${x}`,
            `${mic_b_name}: ${y}`,
          ].filter(Boolean).join('<br/>')
        },
      },
      grid: { left: 60, right: 20, top: 80, bottom: 50 },
      xAxis: {
        type: 'value',
        name: mic_a_name,
        nameLocation: 'middle',
        nameGap: 30,
        nameTextStyle: { fontSize: 11 },
        axisLabel: { fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        name: mic_b_name,
        nameLocation: 'middle',
        nameGap: 45,
        nameTextStyle: { fontSize: 11 },
        axisLabel: { fontSize: 10 },
      },
      series: [
        {
          type: 'scatter',
          data: points.map(p => ({ ...p, value: [p.x, p.y] })),
          symbolSize: 8,
          itemStyle: { color: '#3b82f6', opacity: 0.75 },
        },
        {
          type: 'line',
          data: regLine,
          lineStyle: { color: '#ef4444', width: 1.5, type: 'dashed' },
          symbol: 'none',
          silent: true,
        },
      ],
    }
  }, [result])

  if (loading) {
    return (
      <div className={`${loadingClass} min-h-[120px]`}>
        <div className={spinnerClass} />
        <p>Loading scatter data…</p>
      </div>
    )
  }

  if (error) {
    return <div className="banner banner--error">{error}</div>
  }

  if (!option) return null

  return (
    <div className={surfacePanelClass}>
      <EChart option={option} style={{ height: 380, width: '100%' }} theme="spc" notMerge />
    </div>
  )
}
