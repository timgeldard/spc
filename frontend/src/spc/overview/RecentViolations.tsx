import { Button, Tile } from '@carbon/react'
// Verify icon names against your installed @carbon/icons-react version:
// https://carbondesignsystem.com/elements/icons/library/
import { ArrowRight, WarningFilled } from '@carbon/icons-react'
import EmptyState from '../../components/EmptyState'
import { useSPC } from '../SPCContext'

export default function RecentViolations() {
  const { state, dispatch } = useSPC()

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
      {state.selectedMaterial && state.recentViolations.length > 0 ? (
        <ul style={{ margin: 0, padding: 0, listStyle: 'none' }}>
          {state.recentViolations.map((violation, index) => (
            <li
              key={violation.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.75rem 0',
                borderBottom:
                  index < state.recentViolations.length - 1
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
