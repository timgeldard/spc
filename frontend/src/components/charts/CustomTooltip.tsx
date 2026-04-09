interface CustomTooltipEntry {
  color?: string
  name?: string
  value?: string | number | null
  payload?: Record<string, unknown>
}

interface CustomTooltipProps {
  active?: boolean
  payload?: CustomTooltipEntry[]
  label?: string
}

export function CustomTooltip({ active, payload, label }: CustomTooltipProps) {
  if (!active || !payload || payload.length === 0) return null

  const pointPayload = payload[0]?.payload ?? {}
  const signalSummary = typeof pointPayload.signalSummary === 'string' ? pointPayload.signalSummary : null
  const detailSummary = typeof pointPayload.detailSummary === 'string' ? pointPayload.detailSummary : null
  const batchId = typeof pointPayload.batchId === 'string' ? pointPayload.batchId : null

  return (
    <div
      style={{
        minWidth: '220px',
        borderRadius: '0.75rem',
        border: '1px solid var(--cds-border-subtle-01)',
        background: 'var(--cds-layer)',
        padding: '0.75rem 1rem',
        fontSize: '0.875rem',
        boxShadow: '0 8px 24px rgb(0 0 0 / 0.18)',
      }}
    >
      {label ? <div style={{ marginBottom: '0.5rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{label}</div> : null}
      {batchId ? <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--cds-text-secondary)' }}>{batchId}</div> : null}

      {payload.map((entry, index) => (
        <div key={index} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', padding: '0.25rem 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div
              style={{ height: '0.625rem', width: '0.625rem', borderRadius: '999px', backgroundColor: entry.color ?? 'var(--cds-icon-primary)' }}
            />
            <span style={{ color: 'var(--cds-text-secondary)' }}>{entry.name}</span>
          </div>
          <span style={{ fontVariantNumeric: 'tabular-nums', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
            {entry.value == null ? '—' : entry.value}
          </span>
        </div>
      ))}

      {detailSummary ? (
        <div style={{ marginTop: '0.75rem', borderTop: '1px solid var(--cds-border-subtle-01)', paddingTop: '0.75rem', fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
          {detailSummary}
        </div>
      ) : null}

      {signalSummary ? (
        <div style={{ marginTop: '0.75rem', borderRadius: '0.5rem', background: 'color-mix(in srgb, var(--cds-support-error) 10%, var(--cds-layer) 90%)', padding: '0.5rem 0.75rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
          {signalSummary}
        </div>
      ) : null}
    </div>
  )
}
