import type { ReactNode } from 'react'
import { Tile } from '@carbon/react'

// Migration note: 'colorClass' (Tailwind string) is replaced by the typed 'tone' prop.
// Update all call sites: colorClass="border-red-200 bg-red-50 text-red-700" → tone="error"

type Tone = 'error' | 'warning' | 'success' | 'neutral'

interface MetricCardProps {
  label: string
  value: ReactNode
  meta?: string
  tone?: Tone
}

const toneToken: Record<Tone, string> = {
  success: 'var(--cds-support-success)',
  warning: 'var(--cds-support-warning)',
  error:   'var(--cds-support-error)',
  neutral: 'var(--cds-border-subtle-01)',
}

export default function MetricCard({ label, value, meta, tone = 'neutral' }: MetricCardProps) {
  const accentColor = toneToken[tone]

  return (
    <Tile
      style={{
        borderLeft: `4px solid ${accentColor}`,
        padding: '1rem',
        height: '100%',
      }}
    >
      <span
        style={{
          display: 'block',
          fontSize: '1.75rem',
          fontWeight: 700,
          lineHeight: 1,
          color: 'var(--cds-text-primary)',
          fontFamily: 'var(--cds-code-02-font-family, "IBM Plex Mono", monospace)',
        }}
      >
        {value}
      </span>
      <span
        style={{
          display: 'block',
          marginTop: '0.375rem',
          fontSize: '0.6875rem',
          fontWeight: 600,
          letterSpacing: '0.05em',
          textTransform: 'uppercase',
          color: 'var(--cds-text-secondary)',
        }}
      >
        {label}
      </span>
      {meta && (
        <span
          style={{
            display: 'block',
            marginTop: '0.375rem',
            fontSize: '0.75rem',
            color: 'var(--cds-text-secondary)',
          }}
        >
          {meta}
        </span>
      )}
    </Tile>
  )
}
