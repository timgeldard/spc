import { useMemo } from 'react'
import EChart from '../charts/EChart'
import { emptyCardClass } from '../uiClasses'
import type { CompareScorecardMaterial, EventParamLike } from '../types'

const PALETTE = ['#1B3A4B', '#10b981', '#7c3aed']

function escapeHtml(value: unknown): string {
  return String(value)
    .split('&').join('&amp;')
    .split('<').join('&lt;')
    .split('>').join('&gt;')
    .split('"').join('&quot;')
    .split("'").join('&#39;')
}

interface GroupedBarChartProps {
  materials: CompareScorecardMaterial[]
  commonMics: Array<{ mic_id: string; mic_name: string }>
}

export default function GroupedBarChart({ materials, commonMics }: GroupedBarChartProps) {
  const option = useMemo(() => {
    if (!materials?.length || !commonMics?.length) return null

    const micNames = commonMics.map(m => m.mic_name)
    const series = materials.map((mat, i) => {
      const scoreMap = Object.fromEntries(mat.scorecard.map(r => [r.mic_id, r]))
      const ppkData = commonMics.map(m => {
        const row = scoreMap[m.mic_id]
        if (row?.ppk == null) return { value: null, itemStyle: { color: PALETTE[i] } }
        return {
          value: row.ppk,
          itemStyle: {
            color: row.ppk >= 1.33 ? PALETTE[i] : row.ppk >= 1.00 ? '#d97706' : '#dc2626',
          },
        }
      })
      return {
        name: mat.material_name ?? mat.material_id,
        type: 'bar',
        data: ppkData,
        label: { show: false },
      }
    })

    return {
      animation: false,
      legend: { top: 4, textStyle: { fontSize: 11 } },
      grid: { left: 50, right: 30, top: 40, bottom: 80 },
      tooltip: {
        trigger: 'axis',
        formatter: (params: Array<EventParamLike & { seriesName?: string; data?: { value?: number | null } }>) => {
          const micName = escapeHtml(micNames[params[0]?.dataIndex] ?? '')
          let html = `<strong>${micName}</strong><br/>`
          for (const p of params) {
            const d = p.data
            if (d?.value == null) continue
            html += `${escapeHtml(p.seriesName)}: <strong>${d.value.toFixed(3)}</strong><br/>`
          }
          return html
        },
      },
      xAxis: {
        type: 'category',
        data: micNames,
        axisLabel: { fontSize: 10, rotate: 30, interval: 0 },
      },
      yAxis: {
        type: 'value',
        name: 'Ppk',
        min: 0,
        axisLabel: { fontSize: 10 },
        splitLine: { lineStyle: { color: '#f1f5f9', type: 'dashed' } },
      },
      series: [
        ...series,
        {
          type: 'line',
          name: 'Ppk 1.33',
          data: Array(micNames.length).fill(1.33),
          lineStyle: { color: '#10b981', type: 'dashed', width: 1.5 },
          symbol: 'none',
          tooltip: { show: false },
        },
        {
          type: 'line',
          name: 'Ppk 1.00',
          data: Array(micNames.length).fill(1.00),
          lineStyle: { color: '#d97706', type: 'dashed', width: 1.5 },
          symbol: 'none',
          tooltip: { show: false },
        },
      ],
    }
  }, [materials, commonMics])

  if (!option) return <div className={emptyCardClass}><p>No common characteristics to compare.</p></div>

  return <EChart option={option} style={{ height: 380, width: '100%' }} theme="spc" notMerge />
}
