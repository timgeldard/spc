import { Stack, Tag, Tile } from '~/lib/carbon-layout'
import type { ReactNode } from 'react'
import type { StatusPillStatus } from './StatusPill'
import StatusPill from './StatusPill'

interface KPI {
  label: string
  value: ReactNode
}

interface StickyInsightHeaderProps {
  contextLine?: string
  status?: StatusPillStatus
  statusReason?: string
  kpis?: KPI[]
  actions?: ReactNode
}

export default function StickyInsightHeader({
  contextLine,
  status,
  statusReason,
  kpis = [],
  actions,
}: StickyInsightHeaderProps) {
  return (
    <Tile>
      <div
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: '0.75rem',
        }}
      >
        <Stack gap={3} style={{ minWidth: 0 }}>
          {contextLine && (
            <p
              style={{
                margin: 0,
                fontSize: '0.7rem',
                fontWeight: 600,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--cds-text-secondary)',
              }}
            >
              {contextLine}
            </p>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
            {status ? (
              <StatusPill status={status} />
            ) : (
              <Tag type="cool-gray" size="sm">
                No scope selected
              </Tag>
            )}
            {statusReason && (
              <span style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>{statusReason}</span>
            )}
          </div>
          {kpis.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
              {kpis.slice(0, 3).map((kpi) => (
                <div key={kpi.label} style={{ display: 'flex', alignItems: 'baseline', gap: '0.375rem' }}>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--cds-text-primary)' }}>{kpi.value}</span>
                  <span style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>{kpi.label}</span>
                </div>
              ))}
            </div>
          )}
        </Stack>
        {actions && (
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
            {actions}
          </div>
        )}
      </div>
    </Tile>
  )
}
