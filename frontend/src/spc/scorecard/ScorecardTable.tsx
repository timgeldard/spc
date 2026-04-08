import { useCallback, useMemo, useState } from 'react'
import { useSPC } from '../SPCContext'
import { useExport } from '../hooks/useExport'
import type { ScorecardRow } from '../types'
import {
  buttonBaseClass,
  buttonSecondaryClass,
  buttonSmClass,
  pillValueClass,
  scorecardCountClass,
  scorecardTableHeaderClass,
  scorecardTableWrapClass,
  statusPillClass,
} from '../uiClasses'

const STATUS_CONFIG = {
  excellent: { label: 'Excellent', color: '#059669', bg: '#d1fae5' },
  good: { label: 'Capable', color: '#10b981', bg: '#ecfdf5' },
  marginal: { label: 'Marginal', color: '#d97706', bg: '#fffbeb' },
  poor: { label: 'Poor', color: '#dc2626', bg: '#fef2f2' },
  out_of_spec_mean: { label: 'Mean OOS', color: '#991b1b', bg: '#fee2e2' },
  grey: { label: 'No Data', color: '#9ca3af', bg: '#f9fafb' },
} as const

type StatusKey = keyof typeof STATUS_CONFIG
type SortMetric = 'ppk' | 'cpk' | 'ooc_rate'

interface ScorecardTableProps {
  rows: ScorecardRow[]
}

interface ColumnSpec {
  key: string
  label: string
  align?: 'left' | 'right'
  value: (row: ScorecardRow) => string | number
}

const CSV_COLUMNS: ColumnSpec[] = [
  { key: 'mic_name', label: 'Characteristic', value: row => row.mic_name },
  { key: 'batch_count', label: 'Batches', align: 'right', value: row => row.batch_count },
  { key: 'mean_value', label: 'Mean', align: 'right', value: row => row.mean_value ?? '' },
  { key: 'stddev_overall', label: 'Std Dev', align: 'right', value: row => row.stddev_overall ?? '' },
  { key: 'nominal_target', label: 'Target', align: 'right', value: row => row.nominal_target ?? '' },
  { key: 'pp', label: 'Pp', align: 'right', value: row => row.pp ?? '' },
  { key: 'cpk', label: 'Cpk', align: 'right', value: row => row.cpk ?? '' },
  { key: 'ppk', label: 'Ppk', align: 'right', value: row => row.ppk ?? '' },
  { key: 'ooc_rate', label: 'OOC Rate', align: 'right', value: row => row.ooc_rate ?? '' },
  { key: 'capability_status', label: 'Status', value: row => row.capability_status ?? '' },
]

function formatFixed(value: number | null | undefined, digits: number) {
  if (value == null) return '—'
  return value.toFixed(digits)
}

function formatPercent(value: number | null | undefined) {
  if (value == null) return '—'
  return `${(value * 100).toFixed(1)}%`
}

function downloadCsv(filename: string, columns: ColumnSpec[], rows: ScorecardRow[]) {
  const escapeCell = (value: string | number) => {
    const text = String(value ?? '')
    if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
    return text
  }

  const lines = [
    columns.map(column => escapeCell(column.label)).join(','),
    ...rows.map(row => columns.map(column => escapeCell(column.value(row))).join(',')),
  ]

  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  link.click()
  URL.revokeObjectURL(url)
}

function CapabilityValue({ value }: { value: number | null | undefined }) {
  if (value == null) return '—'
  const status: StatusKey = value >= 1.67 ? 'excellent' : value >= 1.33 ? 'good' : value >= 1.0 ? 'marginal' : 'poor'
  const { color, bg } = STATUS_CONFIG[status]
  return <span className={pillValueClass} style={{ color, background: bg }}>{value.toFixed(2)}</span>
}

function StatusValue({ value }: { value: ScorecardRow['capability_status'] }) {
  const cfg = STATUS_CONFIG[(value as StatusKey) ?? 'grey'] ?? STATUS_CONFIG.grey
  return <span className={statusPillClass} style={{ color: cfg.color, background: cfg.bg }}>{cfg.label}</span>
}

export default function ScorecardTable({ rows }: ScorecardTableProps) {
  const { state, dispatch } = useSPC()
  const { exportData, exporting } = useExport()
  const [sortMetric, setSortMetric] = useState<SortMetric>('ppk')

  const openChart = useCallback((row: ScorecardRow) => {
    dispatch({ type: 'SET_MIC', payload: { mic_id: row.mic_id, mic_name: row.mic_name, chart_type: 'imr' } })
    dispatch({ type: 'SET_ACTIVE_TAB', payload: 'charts' })
  }, [dispatch])

  const exportCSV = useCallback(() => {
    downloadCsv('spc_scorecard.csv', CSV_COLUMNS, rows)
  }, [rows])

  const exportExcel = useCallback(() => {
    void exportData({
      export_type: 'excel',
      export_scope: 'scorecard',
      material_id: state.selectedMaterial?.material_id,
      plant_id: state.selectedPlant?.plant_id ?? null,
      date_from: state.dateFrom || null,
      date_to: state.dateTo || null,
    })
  }, [exportData, state.dateFrom, state.dateTo, state.selectedMaterial?.material_id, state.selectedPlant?.plant_id])

  const sortedRows = useMemo(() => {
    const next = [...rows]
    next.sort((a, b) => {
      const aValue = a[sortMetric]
      const bValue = b[sortMetric]
      if (sortMetric === 'ooc_rate') return (bValue ?? -1) - (aValue ?? -1)
      return (bValue ?? Number.NEGATIVE_INFINITY) - (aValue ?? Number.NEGATIVE_INFINITY)
    })
    return next
  }, [rows, sortMetric])

  return (
    <div className={scorecardTableWrapClass}>
      <div className={scorecardTableHeaderClass}>
        <span className={scorecardCountClass}>{rows.length} characteristic{rows.length !== 1 ? 's' : ''}</span>
        <div className="mr-auto flex flex-wrap items-center gap-1 text-xs text-[var(--c-text-muted)]">
          <span>Sort by:</span>
          <button className={`${buttonBaseClass} ${buttonSmClass} ${sortMetric === 'ppk' ? '' : buttonSecondaryClass}`} onClick={() => setSortMetric('ppk')}>Ppk</button>
          <button className={`${buttonBaseClass} ${buttonSmClass} ${sortMetric === 'cpk' ? '' : buttonSecondaryClass}`} onClick={() => setSortMetric('cpk')}>Cpk</button>
          <button className={`${buttonBaseClass} ${buttonSmClass} ${sortMetric === 'ooc_rate' ? '' : buttonSecondaryClass}`} onClick={() => setSortMetric('ooc_rate')}>OOC Rate</button>
        </div>
        <button
          className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
          onClick={exportCSV}
          aria-label="Export scorecard table as CSV"
        >
          Export CSV
        </button>
        <button
          className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
          disabled={exporting}
          onClick={exportExcel}
          aria-label="Export scorecard table as Excel"
        >
          {exporting ? 'Exporting…' : 'Export Excel'}
        </button>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900">
        <table className="min-w-full border-separate border-spacing-0 text-sm">
          <thead className="bg-slate-50 dark:bg-slate-950/70">
            <tr>
              <th className="sticky left-0 z-10 border-b border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:border-slate-700 dark:bg-slate-950/70 dark:text-slate-400">
                Characteristic
              </th>
              {[
                'Batches',
                'Mean',
                'Std Dev',
                'Target',
                'Pp',
                'Cpk',
                'Ppk',
                'OOC Rate',
                'Status',
              ].map(label => (
                <th
                  key={label}
                  className="border-b border-slate-200 px-4 py-3 text-right text-xs font-semibold uppercase tracking-[0.05em] text-slate-500 dark:border-slate-700 dark:text-slate-400"
                >
                  {label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sortedRows.map(row => (
              <tr
                key={row.mic_id}
                tabIndex={0}
                onClick={() => openChart(row)}
                onKeyDown={event => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault()
                    openChart(row)
                  }
                }}
                className="cursor-pointer transition-colors hover:bg-slate-50 focus:bg-slate-50 focus:outline-none dark:hover:bg-slate-800/60 dark:focus:bg-slate-800/60"
                aria-label={`Open control chart for ${row.mic_name}`}
              >
                <td className="sticky left-0 z-10 border-b border-slate-100 bg-white px-4 py-3 font-medium text-slate-900 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-100">
                  {row.mic_name}
                </td>
                <td className="border-b border-slate-100 px-4 py-3 text-right tabular-nums text-slate-700 dark:border-slate-800 dark:text-slate-300">{row.batch_count}</td>
                <td className="border-b border-slate-100 px-4 py-3 text-right tabular-nums text-slate-700 dark:border-slate-800 dark:text-slate-300">{formatFixed(row.mean_value, 4)}</td>
                <td className="border-b border-slate-100 px-4 py-3 text-right tabular-nums text-slate-700 dark:border-slate-800 dark:text-slate-300">{formatFixed(row.stddev_overall, 4)}</td>
                <td className="border-b border-slate-100 px-4 py-3 text-right tabular-nums text-slate-700 dark:border-slate-800 dark:text-slate-300">{formatFixed(row.nominal_target, 4)}</td>
                <td className="border-b border-slate-100 px-4 py-3 text-right tabular-nums text-slate-700 dark:border-slate-800 dark:text-slate-300">{formatFixed(row.pp, 2)}</td>
                <td className="border-b border-slate-100 px-4 py-3 text-right dark:border-slate-800"><CapabilityValue value={row.cpk} /></td>
                <td className="border-b border-slate-100 px-4 py-3 text-right dark:border-slate-800"><CapabilityValue value={row.ppk} /></td>
                <td className="border-b border-slate-100 px-4 py-3 text-right tabular-nums text-slate-700 dark:border-slate-800 dark:text-slate-300">{formatPercent(row.ooc_rate)}</td>
                <td className="border-b border-slate-100 px-4 py-3 text-right dark:border-slate-800"><StatusValue value={row.capability_status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
