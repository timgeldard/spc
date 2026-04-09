import { useState, type ReactNode } from 'react'
import {
  Button,
  DefinitionTooltip,
  Tag,
  Tile,
} from '@carbon/react'
// Verify icon names against your installed @carbon/icons-react version
import { Download, Edit, Flag } from '@carbon/icons-react'
import PointExclusionModal from '../../components/Modals/PointExclusionModal'

interface ChartCardProps {
  title: string
  subtitle?: string
  children: ReactNode
  cpk?: number | null
  note?: ReactNode
  onExcludePoint?: () => void
  onExport?: () => void
  onAnnotate?: () => void
  exportLabel?: string
}

// Cpk thresholds → Carbon Tag type
function cpkTagType(cpk: number): 'green' | 'warm-gray' | 'red' {
  if (cpk >= 1.33) return 'green'
  if (cpk >= 1.0)  return 'warm-gray'
  return 'red'
}

export default function ChartCard({
  title,
  subtitle,
  children,
  cpk = null,
  note,
  onExcludePoint,
  onExport,
  onAnnotate,
  exportLabel = 'Export',
}: ChartCardProps) {
  const [showExclusionModal, setShowExclusionModal] = useState(false)

  return (
    <>
      <Tile style={{ padding: 0, overflow: 'hidden' }}>

        {/* Card header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: '1rem',
            padding: '1.25rem 1.5rem 1rem',
            borderBottom: '1px solid var(--cds-border-subtle-01)',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h3
              style={{
                margin: 0,
                fontSize: '1rem',
                fontWeight: 600,
                color: 'var(--cds-text-primary)',
              }}
            >
              {title}
            </h3>
            {subtitle && (
              <p
                style={{
                  margin: '0.125rem 0 0',
                  fontSize: '0.75rem',
                  color: 'var(--cds-text-secondary)',
                }}
              >
                {subtitle}
              </p>
            )}
          </div>

          {/* Cpk badge with definition tooltip */}
          {cpk != null && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
              <Tag type={cpkTagType(cpk)} size="md">
                Cpk {cpk.toFixed(2)}
              </Tag>
              <DefinitionTooltip
                definition="Cpk ≥ 1.33 is generally healthy, 1.00–1.32 needs attention, below 1.00 is high risk."
                openOnHover
                align="bottom-right"
              >
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    width: '1.25rem',
                    height: '1.25rem',
                    borderRadius: '50%',
                    border: '1px solid var(--cds-border-subtle-01)',
                    fontSize: '0.6875rem',
                    fontWeight: 600,
                    color: 'var(--cds-text-secondary)',
                    cursor: 'default',
                  }}
                  aria-label="About capability index"
                >
                  ?
                </span>
              </DefinitionTooltip>
            </div>
          )}
        </div>

        {/* Chart body — ECharts canvas renders here, untouched */}
        <div style={{ padding: '1rem' }}>{children}</div>

        {/* Optional action note */}
        {note && (
          <div
            style={{
              padding: '0.625rem 1.5rem',
              fontSize: '0.875rem',
              color: 'var(--cds-text-secondary)',
              borderTop: '1px solid var(--cds-border-subtle-01)',
            }}
          >
            {note}
          </div>
        )}

        {/* Action footer */}
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: '0.5rem',
            padding: '0.75rem 1rem',
            borderTop: '1px solid var(--cds-border-subtle-01)',
          }}
        >
          <Button
            kind="tertiary"
            size="sm"
            renderIcon={Edit}
            iconDescription="Exclude a data point"
            onClick={() => setShowExclusionModal(true)}
          >
            Exclude Point
          </Button>

          <Button
            kind="tertiary"
            size="sm"
            renderIcon={Download}
            iconDescription={exportLabel}
            disabled={!onExport}
            onClick={onExport}
          >
            {exportLabel}
          </Button>

          <Button
            kind="ghost"
            size="sm"
            renderIcon={Flag}
            iconDescription="Add annotation"
            hasIconOnly
            disabled={!onAnnotate}
            onClick={onAnnotate}
            aria-label="Add annotation"
          />
        </div>
      </Tile>

      <PointExclusionModal
        isOpen={showExclusionModal}
        onClose={() => setShowExclusionModal(false)}
        chartTitle={title}
        onConfirm={() => {
          setShowExclusionModal(false)
          onExcludePoint?.()
        }}
      />
    </>
  )
}
