import type { ComponentType } from 'react'
import { Tile } from '@carbon/react'

interface KPICardProps {
  title: string
  value: string | number
  unit?: string
  change?: string
  status: 'good' | 'warning' | 'bad' | 'neutral'
  // Accepts any icon component with a size prop (Carbon icons, Lucide, etc.)
  icon: ComponentType<{ size?: number; style?: React.CSSProperties }>
}

// Maps semantic status to Carbon's design token layer for borders and icon colour.
// Background always stays on var(--cds-layer) so tiles remain readable in both themes.
const statusToken = {
  good:    'var(--cds-support-success)',
  warning: 'var(--cds-support-warning)',
  bad:     'var(--cds-support-error)',
  neutral: 'var(--cds-border-subtle-01)',
} as const

export default function KPICard({ title, value, unit, change, status, icon: Icon }: KPICardProps) {
  const accentColor = statusToken[status]

  return (
    <Tile
      style={{
        borderLeft: `4px solid ${accentColor}`,
        height: '100%',
        padding: '1.25rem',
      }}
    >
      {/* Header row: label + icon */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <p
          style={{
            fontSize: '0.6875rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--cds-text-secondary)',
            margin: 0,
          }}
        >
          {title}
        </p>
        <Icon size={20} style={{ color: accentColor, opacity: 0.8, flexShrink: 0 }} />
      </div>

      {/* Primary value */}
      <p
        style={{
          marginTop: '0.75rem',
          fontFamily: 'var(--cds-code-02-font-family, "IBM Plex Mono", monospace)',
          fontSize: '2.25rem',
          fontWeight: 600,
          lineHeight: 1,
          color: 'var(--cds-text-primary)',
          letterSpacing: '-0.01em',
        }}
      >
        {value}
        {unit && (
          <span
            style={{
              marginLeft: '0.25rem',
              fontSize: '1.25rem',
              fontWeight: 400,
              color: 'var(--cds-text-secondary)',
            }}
          >
            {unit}
          </span>
        )}
      </p>

      {/* Optional period-over-period change */}
      {change && (
        <p
          style={{
            marginTop: '0.75rem',
            fontSize: '0.75rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.25rem',
          }}
        >
          <span
            style={{
              color: change.startsWith('+')
                ? 'var(--cds-support-success)'
                : 'var(--cds-support-error)',
            }}
          >
            {change}
          </span>
          <span style={{ color: 'var(--cds-text-secondary)' }}>from last shift</span>
        </p>
      )}
    </Tile>
  )
}
