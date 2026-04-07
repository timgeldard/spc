import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AgGridReact } from 'ag-grid-react'
import {
  ClientSideRowModelModule,
  CsvExportModule,
  ModuleRegistry,
  type ColDef,
  type CellKeyDownEvent,
  type ICellRendererParams,
  type RowClickedEvent,
} from 'ag-grid-community'
import 'ag-grid-community/styles/ag-grid.css'
import 'ag-grid-community/styles/ag-theme-quartz.css'
import { useSPC } from '../SPCContext'
import { useExport } from '../hooks/useExport'
import type { ScorecardRow } from '../types'
import {
  buttonBaseClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
  buttonSmClass,
  pillValueClass,
  scorecardCountClass,
  scorecardTableHeaderClass,
  scorecardTableWrapClass,
  statusPillClass,
} from '../uiClasses'

ModuleRegistry.registerModules([ClientSideRowModelModule, CsvExportModule])

// ── Status config with text labels + icons (no color-only meaning) ──────────
const STATUS_CONFIG = {
  excellent: { label: 'Excellent', icon: '✓✓', color: '#059669', bg: '#d1fae5' },
  good:      { label: 'Capable',   icon: '✓',  color: '#10b981', bg: '#ecfdf5' },
  marginal:  { label: 'Marginal',  icon: '⚠',  color: '#d97706', bg: '#fffbeb' },
  poor:      { label: 'Poor',      icon: '✕',  color: '#dc2626', bg: '#fef2f2' },
  out_of_spec_mean: { label: 'Mean OOS', icon: '✕✕', color: '#991b1b', bg: '#fee2e2' },
  grey:      { label: 'No Data',   icon: '—',  color: '#9ca3af', bg: '#f9fafb' },
} as const

type StatusKey = keyof typeof STATUS_CONFIG

function PpkCell({ value }: ICellRendererParams<ScorecardRow, number | null | undefined>) {
  if (value == null) return <span aria-label="No data">—</span>
  const status: StatusKey = value >= 1.67 ? 'excellent' : value >= 1.33 ? 'good' : value >= 1.0 ? 'marginal' : 'poor'
  const { color, bg, label } = STATUS_CONFIG[status]
  return (
    <span className={pillValueClass} style={{ color, background: bg }} title={label}>
      {value.toFixed(2)}
    </span>
  )
}

function OOCCell({ value }: ICellRendererParams<ScorecardRow, number | null | undefined>) {
  if (value == null) return <span aria-label="No data">—</span>
  const pct = (value * 100).toFixed(1)
  const isHigh = value > 0.1
  const isMedium = !isHigh && value > 0.02
  const color = isHigh ? '#dc2626' : isMedium ? '#d97706' : '#10b981'
  const label = isHigh ? 'High OOC rate' : isMedium ? 'Elevated OOC rate' : 'Low OOC rate'
  return (
    <span style={{ color, fontWeight: value > 0 ? 600 : 400 }} title={label}>
      {isHigh && <span aria-hidden="true">⚠ </span>}
      <span>{pct}%</span>
      <span className="sr-only"> ({label})</span>
    </span>
  )
}

function StatusCell({ value }: ICellRendererParams<ScorecardRow, ScorecardRow['capability_status']>) {
  const cfg = STATUS_CONFIG[(value as StatusKey) ?? 'grey'] ?? STATUS_CONFIG.grey
  return (
    <span className={statusPillClass} style={{ color: cfg.color, background: cfg.bg }}>
      <span aria-hidden="true">{cfg.icon} </span>
      {cfg.label}
    </span>
  )
}

function DPMOHeaderCell() {
  return (
    <span title="Defects Per Million Opportunities — Motorola 1.5σ long-term shift convention">
      DPMO (1.5σ) ℹ
    </span>
  )
}

function DPMOCell({ value }: ICellRendererParams<ScorecardRow, number | null | undefined>) {
  if (value == null) return <span aria-label="No data">—</span>
  return <span>{value.toLocaleString()}</span>
}

const number4 = (params: { value: number | null | undefined }) => params.value?.toFixed(4) ?? '—'
const number2 = (params: { value: number | null | undefined }) => params.value?.toFixed(2) ?? '—'

const columnDefs: Array<ColDef<ScorecardRow>> = [
  { field: 'mic_name', headerName: 'Characteristic', flex: 2, minWidth: 150 },
  { field: 'batch_count', headerName: 'Batches', width: 90, type: 'numericColumn' },
  { field: 'mean_value', headerName: 'Mean', width: 100, type: 'numericColumn', valueFormatter: number4 },
  { field: 'stddev_overall', headerName: 'Std Dev', width: 100, type: 'numericColumn', valueFormatter: number4 },
  { field: 'nominal_target', headerName: 'Target', width: 100, type: 'numericColumn', valueFormatter: number4, sortable: false },
  { field: 'pp', headerName: 'Pp', width: 80, type: 'numericColumn', valueFormatter: number2 },
  { field: 'cpk', headerName: 'Cpk', width: 90, cellRenderer: PpkCell },
  { field: 'ppk', headerName: 'Ppk', width: 90, cellRenderer: PpkCell },
  { field: 'z_score', headerName: 'Z (σ)', width: 80, type: 'numericColumn', valueFormatter: number2, hide: true },
  { field: 'dpmo', headerName: 'DPMO (1.5σ)', width: 110, cellRenderer: DPMOCell, headerComponent: DPMOHeaderCell, hide: true },
  { field: 'ooc_rate', headerName: 'OOC Rate', width: 100, cellRenderer: OOCCell },
  { field: 'capability_status', headerName: 'Status', width: 120, cellRenderer: StatusCell },
]

const defaultColDef: ColDef<ScorecardRow> = { resizable: true, sortable: true }

interface ScorecardTableProps {
  rows: ScorecardRow[]
}

type SortMetric = 'ppk' | 'cpk' | 'ooc_rate'

export default function ScorecardTable({ rows }: ScorecardTableProps) {
  const { state, dispatch } = useSPC()
  const gridRef = useRef<AgGridReact<ScorecardRow>>(null)
  const { exportData, exporting } = useExport()
  const [dark, setDark] = useState(() => document.documentElement.getAttribute('data-theme') === 'dark')
  const [sortMetric, setSortMetric] = useState<SortMetric>('ppk')

  useEffect(() => {
    const obs = new MutationObserver(() => {
      setDark(document.documentElement.getAttribute('data-theme') === 'dark')
    })
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => obs.disconnect()
  }, [])

  /** Drill to control chart for a given scorecard row */
  const drillToChart = useCallback((row: ScorecardRow) => {
    dispatch({ type: 'SET_MIC', payload: { mic_id: row.mic_id, mic_name: row.mic_name, chart_type: 'imr' } })
    dispatch({ type: 'SET_ACTIVE_TAB', payload: 'charts' })
  }, [dispatch])

  const onRowClicked = useCallback((event: RowClickedEvent<ScorecardRow>) => {
    if (event.data) drillToChart(event.data)
  }, [drillToChart])

  /** Keyboard activation: Enter or Space on a focused cell triggers drill */
  const onCellKeyDown = useCallback((event: CellKeyDownEvent<ScorecardRow>) => {
    const key = (event.event as KeyboardEvent | undefined)?.key
    if ((key === 'Enter' || key === ' ') && event.data) {
      event.event?.preventDefault()
      drillToChart(event.data)
    }
  }, [drillToChart])

  const exportCSV = useCallback(() => {
    gridRef.current?.api.exportDataAsCsv({ fileName: 'spc_scorecard.csv' })
  }, [])

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
      if (sortMetric === 'ooc_rate') {
        return (bValue ?? -1) - (aValue ?? -1)
      }
      // cpk/ppk: lower = worse, so sort ascending; nulls go last
      return (aValue ?? Infinity) - (bValue ?? Infinity)
    })
    return next
  }, [rows, sortMetric])

  return (
    <div className={scorecardTableWrapClass}>
      <div className={scorecardTableHeaderClass}>
        <span className={scorecardCountClass}>{rows.length} characteristic{rows.length !== 1 ? 's' : ''}</span>
        <div className="mr-auto flex flex-wrap items-center gap-1 text-xs text-[var(--c-text-muted)]">
          <span>Worst first:</span>
          {(['ppk', 'cpk', 'ooc_rate'] as const).map(metric => (
            <button
              key={metric}
              className={`${buttonBaseClass} ${buttonSmClass} ${sortMetric === metric ? buttonPrimaryClass : buttonSecondaryClass}`}
              onClick={() => setSortMetric(metric)}
              aria-pressed={sortMetric === metric}
            >
              {metric === 'ooc_rate' ? 'OOC Rate' : metric.toUpperCase()}
            </button>
          ))}
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
      <p className="text-xs text-[var(--c-text-muted)]">
        Press <kbd className="rounded border border-[var(--c-border)] bg-slate-100 px-1 py-0.5 text-[0.65rem] font-mono">Enter</kbd> or{' '}
        <kbd className="rounded border border-[var(--c-border)] bg-slate-100 px-1 py-0.5 text-[0.65rem] font-mono">Space</kbd> on a row to open its control chart.
      </p>
      <div
        className={dark ? 'ag-theme-quartz-dark' : 'ag-theme-quartz'}
        style={{ height: 450, width: '100%' }}
        aria-label="SPC scorecard results table — use arrow keys to navigate, Enter to open chart"
      >
        <AgGridReact<ScorecardRow>
          ref={gridRef}
          rowData={sortedRows}
          columnDefs={columnDefs}
          defaultColDef={defaultColDef}
          onRowClicked={onRowClicked}
          onCellKeyDown={onCellKeyDown}
          rowStyle={{ cursor: 'pointer' }}
        />
      </div>
    </div>
  )
}
