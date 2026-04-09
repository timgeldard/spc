import { useCallback, useMemo, useState } from 'react'
import {
  Button,
  DataTable,
  OverflowMenuItem,
  Pagination,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableHeader,
  TableRow,
  TableToolbar,
  TableToolbarContent,
  TableToolbarMenu,
  TableToolbarSearch,
  Tag,
} from '@carbon/react'
import { useSPC } from '../SPCContext'
import { useExport } from '../hooks/useExport'
import type { ScorecardRow } from '../types'

// ── Column definitions ─────────────────────────────────────────────────────

const HEADERS = [
  { key: 'mic_name',          header: 'Characteristic' },
  { key: 'batch_count',       header: 'Batches'        },
  { key: 'mean_value',        header: 'Mean'           },
  { key: 'stddev_overall',    header: 'Std Dev'        },
  { key: 'nominal_target',    header: 'Target'         },
  { key: 'pp',                header: 'Pp'             },
  { key: 'cpk',               header: 'Cpk'            },
  { key: 'ppk',               header: 'Ppk'            },
  { key: 'ooc_rate',          header: 'OOC Rate'       },
  { key: 'capability_status', header: 'Status'         },
] as const

type HeaderKey = (typeof HEADERS)[number]['key']
type SortDirection = 'ASC' | 'DESC' | 'NONE'

// Numeric columns receive right-aligned text
const NUMERIC_COLS = new Set<HeaderKey>([
  'batch_count', 'mean_value', 'stddev_overall',
  'nominal_target', 'pp', 'cpk', 'ppk', 'ooc_rate',
])

// ── CSV export (unchanged logic, no uiClasses dependency) ─────────────────

interface ColumnSpec { key: string; label: string; value: (row: ScorecardRow) => string | number }

const CSV_COLUMNS: ColumnSpec[] = [
  { key: 'mic_name',          label: 'Characteristic', value: r => r.mic_name            },
  { key: 'batch_count',       label: 'Batches',         value: r => r.batch_count         },
  { key: 'mean_value',        label: 'Mean',            value: r => r.mean_value    ?? '' },
  { key: 'stddev_overall',    label: 'Std Dev',         value: r => r.stddev_overall ?? '' },
  { key: 'nominal_target',    label: 'Target',          value: r => r.nominal_target ?? '' },
  { key: 'pp',                label: 'Pp',              value: r => r.pp            ?? '' },
  { key: 'cpk',               label: 'Cpk',             value: r => r.cpk           ?? '' },
  { key: 'ppk',               label: 'Ppk',             value: r => r.ppk           ?? '' },
  { key: 'ooc_rate',          label: 'OOC Rate',        value: r => r.ooc_rate      ?? '' },
  { key: 'capability_status', label: 'Status',          value: r => r.capability_status ?? '' },
]

function downloadCsv(filename: string, columns: ColumnSpec[], rows: ScorecardRow[]) {
  const escapeCell = (value: string | number) => {
    const text = String(value ?? '')
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    if (/[",\r\n]/.test(safe)) return `"${safe.replace(/"/g, '""')}"`
    return safe
  }
  const lines = [
    columns.map(c => escapeCell(c.label)).join(','),
    ...rows.map(row => columns.map(c => escapeCell(c.value(row))).join(',')),
  ]
  const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

function fmt(value: number | null | undefined, digits: number): string {
  return value == null ? '—' : value.toFixed(digits)
}

// ── Carbon Tag cell renderers ──────────────────────────────────────────────

// Cpk / Ppk / Pp — threshold-coloured Tag with numeric label
function CapabilityTag({ value }: { value: number | null | undefined }) {
  if (value == null) return <span aria-label="No data">—</span>
  const { type, title } = value >= 1.67
    ? { type: 'green'     as const, title: 'Excellent' }
    : value >= 1.33
    ? { type: 'teal'      as const, title: 'Capable'   }
    : value >= 1.0
    ? { type: 'warm-gray' as const, title: 'Marginal'  }
    : { type: 'red'       as const, title: 'Poor'      }
  return <Tag type={type} size="sm" title={title}>{value.toFixed(2)}</Tag>
}

// OOC Rate — severity-coloured Tag
function OOCTag({ value }: { value: number | null | undefined }) {
  if (value == null) return <span aria-label="No data">—</span>
  const pct = (value * 100).toFixed(1)
  if (value > 0.1)  return <Tag type="red"       size="sm" title="High OOC rate">⚠ {pct}%</Tag>
  if (value > 0.02) return <Tag type="warm-gray"  size="sm" title="Elevated OOC rate">{pct}%</Tag>
  return               <Tag type="green"      size="sm" title="Low OOC rate">{pct}%</Tag>
}

// Capability status — named semantic Tag
const STATUS_TAG: Record<string, { type: 'green' | 'teal' | 'warm-gray' | 'red' | 'gray'; label: string }> = {
  excellent:        { type: 'green',     label: 'Excellent' },
  good:             { type: 'teal',      label: 'Capable'   },
  marginal:         { type: 'warm-gray', label: 'Marginal'  },
  poor:             { type: 'red',       label: 'Poor'      },
  out_of_spec_mean: { type: 'red',       label: 'Mean OOS'  },
  grey:             { type: 'gray',      label: 'No Data'   },
}

function StatusTag({ value }: { value: string | null | undefined }) {
  const cfg = STATUS_TAG[value ?? 'grey'] ?? STATUS_TAG.grey
  return <Tag type={cfg.type} size="sm">{cfg.label}</Tag>
}

// ── Main component ─────────────────────────────────────────────────────────

interface ScorecardTableProps { rows: ScorecardRow[] }

export default function ScorecardTable({ rows }: ScorecardTableProps) {
  const { state, dispatch } = useSPC()
  const { exportData, exporting } = useExport()

  const [sortKey,       setSortKey]       = useState<HeaderKey>('cpk')
  const [sortDirection, setSortDirection] = useState<SortDirection>('ASC')
  const [searchTerm,    setSearchTerm]    = useState('')
  const [page,          setPage]          = useState(1)
  const [pageSize,      setPageSize]      = useState(10)

  // ── Navigation ───────────────────────────────────────────────────────────
  const openChart = useCallback((row: ScorecardRow) => {
    dispatch({ type: 'SET_MIC',        payload: { mic_id: row.mic_id, mic_name: row.mic_name, chart_type: 'imr' } })
    dispatch({ type: 'SET_ACTIVE_TAB', payload: 'charts' })
  }, [dispatch])

  // ── Export ───────────────────────────────────────────────────────────────
  const exportExcel = useCallback(() => {
    void exportData({
      export_type:  'excel',
      export_scope: 'scorecard',
      material_id:  state.selectedMaterial?.material_id,
      plant_id:     state.selectedPlant?.plant_id ?? null,
      date_from:    state.dateFrom || null,
      date_to:      state.dateTo  || null,
    })
  }, [exportData, state.dateFrom, state.dateTo, state.selectedMaterial, state.selectedPlant])

  // ── External sort (applies across all pages before slicing) ──────────────
  const handleSort = useCallback((key: HeaderKey) => {
    if (sortKey === key) {
      setSortDirection(d => d === 'ASC' ? 'DESC' : d === 'DESC' ? 'NONE' : 'ASC')
    } else {
      setSortKey(key)
      setSortDirection('ASC')
    }
    setPage(1)
  }, [sortKey])

  const sortedRows = useMemo(() => {
    if (sortDirection === 'NONE') return [...rows]
    return [...rows].sort((a, b) => {
      const av = a[sortKey as keyof ScorecardRow] as number | string | null | undefined
      const bv = b[sortKey as keyof ScorecardRow] as number | string | null | undefined
      if (av == null && bv == null) return 0
      if (av == null) return 1
      if (bv == null) return -1
      const mul = sortDirection === 'ASC' ? 1 : -1
      if (typeof av === 'string' && typeof bv === 'string') return av.localeCompare(bv) * mul
      return ((av as number) - (bv as number)) * mul
    })
  }, [rows, sortKey, sortDirection])

  // ── Filter by mic_name ────────────────────────────────────────────────────
  const filteredRows = useMemo(() => {
    if (!searchTerm.trim()) return sortedRows
    const lower = searchTerm.toLowerCase()
    return sortedRows.filter(r => r.mic_name.toLowerCase().includes(lower))
  }, [sortedRows, searchTerm])

  // ── Pagination slice ──────────────────────────────────────────────────────
  const pageStart = (page - 1) * pageSize
  const pageRows  = filteredRows.slice(pageStart, pageStart + pageSize)

  // ── Transform to Carbon DataTable row format ──────────────────────────────
  const tableRows = useMemo(() =>
    pageRows.map(r => ({
      id:                r.mic_id,
      mic_name:          r.mic_name,
      batch_count:       r.batch_count,
      mean_value:        r.mean_value         ?? null,
      stddev_overall:    r.stddev_overall     ?? null,
      nominal_target:    r.nominal_target     ?? null,
      pp:                r.pp                 ?? null,
      cpk:               r.cpk                ?? null,
      ppk:               r.ppk                ?? null,
      ooc_rate:          r.ooc_rate           ?? null,
      capability_status: r.capability_status  ?? null,
    })),
  [pageRows])

  // Lookup original ScorecardRow by mic_id for the openChart handler
  const rowLookup = useMemo(() => new Map(rows.map(r => [r.mic_id, r])), [rows])

  const exportCSV = useCallback(() => downloadCsv('spc_scorecard.csv', CSV_COLUMNS, filteredRows), [filteredRows])

  // ── Custom cell renderer ──────────────────────────────────────────────────
  function renderCell(
    cell: { value: unknown; info: { header: string } },
    original: ScorecardRow | undefined,
  ) {
    const key = cell.info.header as HeaderKey
    const val = cell.value

    switch (key) {
      case 'mic_name':
        return (
          <Button
            kind="ghost"
            size="sm"
            onClick={() => original && openChart(original)}
            style={{ padding: 0, textAlign: 'left', minHeight: 'unset', lineHeight: 'inherit' }}
          >
            {val as string}
          </Button>
        )
      case 'cpk':
      case 'ppk':
      case 'pp':
        return <CapabilityTag value={val as number | null} />
      case 'ooc_rate':
        return <OOCTag value={val as number | null} />
      case 'capability_status':
        return <StatusTag value={val as string | null} />
      case 'mean_value':
      case 'stddev_overall':
      case 'nominal_target':
        return fmt(val as number | null, 4)
      default:
        return val != null ? String(val) : '—'
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    // DataTable manages its own internal selection/expansion state;
    // sort is disabled (isSortable absent) — handled externally above.
    <DataTable rows={tableRows} headers={[...HEADERS]}>
      {({ rows: dtRows, headers, getTableProps, getRowProps, getTableContainerProps }) => (
        <TableContainer {...getTableContainerProps()}>

          <TableToolbar>
            <TableToolbarContent>
              {/* Characteristic-name search — drives the external filteredRows state */}
              <TableToolbarSearch
                placeholder="Filter by characteristic name…"
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setSearchTerm(e.target.value)
                  setPage(1)
                }}
                persistent
              />

              {/* Row count indicator */}
              <span
                style={{
                  alignSelf: 'center',
                  padding: '0 0.75rem',
                  fontSize: '0.75rem',
                  color: 'var(--cds-text-secondary)',
                  whiteSpace: 'nowrap',
                }}
              >
                {filteredRows.length} characteristic{filteredRows.length !== 1 ? 's' : ''}
              </span>

              {/* Export overflow menu */}
              <TableToolbarMenu iconDescription="Export options">
                <OverflowMenuItem itemText="Export CSV"   onClick={exportCSV} />
                <OverflowMenuItem itemText="Export Excel" onClick={exportExcel} disabled={exporting} />
              </TableToolbarMenu>
            </TableToolbarContent>
          </TableToolbar>

          <Table {...getTableProps()} size="md" useZebraStyles>
            <TableHead>
              <TableRow>
                {headers.map(header => (
                  <TableHeader
                    key={header.key}
                    onClick={() => handleSort(header.key as HeaderKey)}
                    isSortHeader={sortKey === header.key}
                    sortDirection={sortKey === header.key ? sortDirection : 'NONE'}
                    style={
                      NUMERIC_COLS.has(header.key as HeaderKey)
                        ? { textAlign: 'right' }
                        : undefined
                    }
                  >
                    {header.header}
                  </TableHeader>
                ))}
              </TableRow>
            </TableHead>

            <TableBody>
              {dtRows.map(row => {
                const original = rowLookup.get(row.id)
                return (
                  <TableRow key={row.id} {...getRowProps({ row })}>
                    {row.cells.map(cell => (
                      <TableCell
                        key={cell.id}
                        style={
                          NUMERIC_COLS.has(cell.info.header as HeaderKey)
                            ? { textAlign: 'right' }
                            : undefined
                        }
                      >
                        {renderCell(cell, original)}
                      </TableCell>
                    ))}
                  </TableRow>
                )
              })}
            </TableBody>
          </Table>

          {/* Pagination operates on the globally sorted+filtered set */}
          <Pagination
            totalItems={filteredRows.length}
            pageSize={pageSize}
            pageSizes={[10, 25, 50]}
            page={page}
            onChange={({ page: p, pageSize: ps }) => {
              setPage(p)
              setPageSize(ps)
            }}
          />
        </TableContainer>
      )}
    </DataTable>
  )
}
