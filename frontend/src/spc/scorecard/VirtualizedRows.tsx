import { useCallback, useMemo, useRef, useState } from 'react'

interface VirtualizedRowsProps<T> {
  rows: T[]
  rowHeightPx: number
  viewportHeightPx: number
  overscan?: number
  renderRow: (row: T, absoluteIndex: number) => React.ReactNode
  ariaLabel?: string
  emptyState?: React.ReactNode
}

/**
 * Simple scroll-windowed list. Renders only rows near the viewport; uses
 * padding blocks above and below to preserve scroll-bar geometry. Chosen
 * over @tanstack/react-virtual to avoid a new dependency.
 *
 * Suitable for fixed-row-height layouts — which is what the SPC scorecard
 * uses (every row is a single MIC summary, no wrapping).
 */
export default function VirtualizedRows<T>({
  rows,
  rowHeightPx,
  viewportHeightPx,
  overscan = 8,
  renderRow,
  ariaLabel,
  emptyState,
}: VirtualizedRowsProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [scrollTop, setScrollTop] = useState(0)

  const onScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    setScrollTop(e.currentTarget.scrollTop)
  }, [])

  const { startIndex, endIndex, topPad, bottomPad } = useMemo(() => {
    const visible = Math.max(1, Math.ceil(viewportHeightPx / rowHeightPx))
    const rawStart = Math.floor(scrollTop / rowHeightPx) - overscan
    const start = Math.max(0, rawStart)
    const end = Math.min(rows.length, start + visible + 2 * overscan)
    return {
      startIndex: start,
      endIndex: end,
      topPad: start * rowHeightPx,
      bottomPad: Math.max(0, (rows.length - end) * rowHeightPx),
    }
  }, [scrollTop, rows.length, rowHeightPx, viewportHeightPx, overscan])

  if (rows.length === 0) {
    return <>{emptyState ?? null}</>
  }

  const visibleRows = rows.slice(startIndex, endIndex)

  return (
    <div
      ref={containerRef}
      role="rowgroup"
      aria-label={ariaLabel}
      onScroll={onScroll}
      style={{
        height: viewportHeightPx,
        overflowY: 'auto',
        border: '1px solid var(--cds-border-subtle-01)',
        borderRadius: 2,
        background: 'var(--cds-layer)',
      }}
    >
      <div style={{ height: topPad }} aria-hidden="true" />
      {visibleRows.map((row, i) => (
        <div
          key={startIndex + i}
          role="row"
          style={{
            height: rowHeightPx,
            display: 'flex',
            alignItems: 'center',
            borderBottom: '1px solid var(--cds-border-subtle-01)',
            padding: '0 0.75rem',
          }}
        >
          {renderRow(row, startIndex + i)}
        </div>
      ))}
      <div style={{ height: bottomPad }} aria-hidden="true" />
    </div>
  )
}
