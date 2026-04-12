import { Button } from '~/lib/carbon-forms'
import { Tile } from '~/lib/carbon-layout'
import ArrowRight from '@carbon/icons-react/es/ArrowRight.js'
import WarningFilled from '@carbon/icons-react/es/WarningFilled.js'
import EmptyState from '../../components/EmptyState'
import { useSPCDispatch } from '../SPCContext'
import type { RecentViolationItem } from '../types'

interface RecentViolationsProps {
  hasMaterial: boolean
  violations: RecentViolationItem[]
}

export default function RecentViolations({ hasMaterial, violations }: RecentViolationsProps) {
  const dispatch = useSPCDispatch()

  return (
    <Tile style={{ height: '100%', padding: '1.5rem' }}>
      {/* Tile header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '1.25rem',
        }}
      >
        <h3
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            margin: 0,
            fontSize: '0.875rem',
            fontWeight: 600,
            color: 'var(--cds-text-primary)',
          }}
        >
          <WarningFilled size={20} style={{ color: 'var(--cds-support-warning)' }} />
          Recent Violations
        </h3>

        <Button
          kind="ghost"
          size="sm"
          renderIcon={ArrowRight}
          iconDescription="View all violations"
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'charts' })}
        >
          View All
        </Button>
      </div>

      {/* Violation list */}
      {hasMaterial && violations.length > 0 ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {violations.map((violation, index) => (
            <li
              key={violation.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 0',
                borderBottom:
                  index < violations.length - 1
                    ? '1px solid var(--cds-border-subtle-01)'
                    : 'none',
              }}
            >
              <div>
                <p
                  style={{
                    margin: 0,
                    fontSize: '0.875rem',
                    fontWeight: 500,
                    color: 'var(--cds-text-primary)',
                  }}
                >
                  {violation.rule}
                </p>
                <p
                  style={{
                    margin: '0.125rem 0 0',
                    fontSize: '0.75rem',
                    color: 'var(--cds-text-secondary)',
                  }}
                >
                  {violation.chart} · {violation.value}
                </p>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  color: 'var(--cds-text-secondary)',
                  textAlign: 'right',
                  flexShrink: 0,
                  marginLeft: '0.5rem',
                }}
              >
                {violation.time}
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState message="Recent SPC violations will appear here once signals are available for the selected scope." />
      )}
    </Tile>
  )
}
