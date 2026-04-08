import { Card, CardContent, MetadataLabel, StatusBadge } from '../ui'

interface CapabilityPanelProps {
  cp?: number | null
  cpk?: number | null
  pp?: number | null
  ppk?: number | null
}

function getStatus(value: number | null | undefined): 'healthy' | 'warning' | 'critical' {
  if ((value ?? Number.NEGATIVE_INFINITY) >= 1.67) return 'healthy'
  if ((value ?? Number.NEGATIVE_INFINITY) >= 1.33) return 'warning'
  return 'critical'
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
  const status = getStatus(value)
  const numericLabel =
    value == null ? 'Unavailable' : value >= 1.33 ? 'Capable' : 'Not Capable'

  return (
    <div className={`rounded-xl border p-4 ${emphasis ? 'bg-slate-900 text-white border-slate-800 shadow-xl' : 'bg-white border-slate-200 shadow-sm'}`}>
      <MetadataLabel className={emphasis ? 'text-slate-400' : undefined}>{label}</MetadataLabel>
      <div className={`mt-2 text-4xl font-semibold tabular-nums ${emphasis ? 'text-white' : 'text-slate-900'}`}>
        {value == null ? '—' : value.toFixed(2)}
      </div>
      <div className="mt-3">
        <StatusBadge status={status} label={numericLabel} />
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
