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
    <div className={`rounded-xl border p-4 ${emphasis ? 'bg-slate-900 text-white border-slate-800 shadow-xl' : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-700 shadow-sm'}`}>
      <MetadataLabel className={emphasis ? 'text-slate-400' : undefined}>{label}</MetadataLabel>
      <div className={`mt-2 text-4xl font-semibold tabular-nums ${emphasis ? 'text-white' : 'text-slate-900 dark:text-slate-100'}`}>
        {value == null ? '—' : value.toFixed(2)}
      </div>
      <div className="mt-3">
        {tier ? <StatusBadge status={tier.status} label={numericLabel} /> : <span className="text-xs text-slate-500 dark:text-slate-400">{numericLabel}</span>}
      </div>
    </div>
  )
}

export function CapabilityPanel({ cp, cpk, pp, ppk }: CapabilityPanelProps) {
  return (
    <Card>
      <CardContent className="grid gap-4 md:grid-cols-2">
        <CapabilityMetric label="Cp" value={cp} />
        <CapabilityMetric label="Cpk" value={cpk} emphasis />
        <CapabilityMetric label="Pp" value={pp} />
        <CapabilityMetric label="Ppk" value={ppk} />
      </CardContent>
    </Card>
  )
}
