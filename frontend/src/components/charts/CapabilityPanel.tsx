import { Stack } from '~/lib/carbon-layout'
import { Card, CardContent, MetadataLabel, StatusBadge } from '../ui'

export const CAPABILITY_TIERS = [
  { min: 1.67, label: 'Highly Capable', badgeLabel: 'Excellent', status: 'healthy' as const },
  { min: 1.33, label: 'Capable', badgeLabel: 'Capable', status: 'warning' as const },
  { min: 0, label: 'Not Capable', badgeLabel: 'Not Capable', status: 'critical' as const },
] as const

export type CapabilityTier = (typeof CAPABILITY_TIERS)[number]

interface CapabilityPanelProps {
  cp?: number | null
  cpk?: number | null
  pp?: number | null
  ppk?: number | null
}

export function getCapabilityTier(value: number | null | undefined): CapabilityTier | null {
  if (value == null) return null
  for (const tier of CAPABILITY_TIERS) {
    if (value >= tier.min) return tier
  }
  return CAPABILITY_TIERS[CAPABILITY_TIERS.length - 1]
}

function CapabilityMetric({
  label,
  value,
  emphasis,
}: {
  label: string
  value?: number | null
  emphasis?: boolean
}) {
  const tier = getCapabilityTier(value)
  const numericLabel = value == null ? 'Unavailable' : tier?.badgeLabel ?? 'Not Capable'

  return (
    <div
      style={{
        borderRadius: '0.75rem',
        border: `1px solid ${emphasis ? 'var(--cds-border-inverse)' : 'var(--cds-border-subtle-01)'}`,
        padding: '1rem',
        background: emphasis ? 'var(--cds-layer-inverse)' : 'var(--cds-layer)',
        color: emphasis ? 'var(--cds-text-inverse)' : 'var(--cds-text-primary)',
        boxShadow: emphasis ? '0 12px 24px rgb(0 0 0 / 0.18)' : '0 1px 2px rgb(0 0 0 / 0.08)',
      }}
    >
      <MetadataLabel className={undefined}>{label}</MetadataLabel>
      <div
        style={{
          marginTop: '0.5rem',
          fontSize: '2.25rem',
          fontWeight: 600,
          fontVariantNumeric: 'tabular-nums',
          color: emphasis ? 'var(--cds-text-inverse)' : 'var(--cds-text-primary)',
        }}
      >
        {value == null ? '—' : value.toFixed(2)}
      </div>
      <div style={{ marginTop: '0.75rem' }}>
        {tier ? (
          <StatusBadge status={tier.status} label={numericLabel} />
        ) : (
          <span style={{ fontSize: '0.75rem', color: emphasis ? 'var(--cds-text-inverse)' : 'var(--cds-text-secondary)' }}>
            {numericLabel}
          </span>
        )}
      </div>
    </div>
  )
}

export function CapabilityPanel({ cp, cpk, pp, ppk }: CapabilityPanelProps) {
  return (
    <Card>
      <CardContent>
        <Stack gap={4}>
          <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(14rem, 1fr))' }}>
            <CapabilityMetric label="Cp" value={cp} />
            <CapabilityMetric label="Cpk" value={cpk} emphasis />
            <CapabilityMetric label="Pp" value={pp} />
            <CapabilityMetric label="Ppk" value={ppk} />
          </div>
        </Stack>
      </CardContent>
    </Card>
  )
}
