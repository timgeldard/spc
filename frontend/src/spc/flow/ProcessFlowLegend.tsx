// Colours mirror ProcessNode STATUS — Carbon support tokens for Jade/Sunrise/Sunset
const items = [
  { label: 'Healthy (< 2% rejection)',   color: 'var(--cds-support-success)' },
  { label: 'Warning (2–10% rejection)',  color: 'var(--cds-support-warning)' },
  { label: 'Critical (≥ 10% rejection)', color: 'var(--cds-support-error)' },
  { label: 'OOC Signal Present',         color: 'var(--cds-support-error)' },
]

export default function ProcessFlowLegend() {
  return (
    <div style={{
      position: 'absolute',
      bottom: '1rem',
      right: '1rem',
      zIndex: 10,
      borderRadius: '0.75rem',
      border: '1px solid var(--cds-border-subtle-01)',
      background: 'var(--cds-layer)',
      padding: '1rem',
      boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
    }}>
      <p style={{ marginBottom: '0.75rem', fontSize: '0.75rem', fontWeight: 600, color: 'var(--cds-text-secondary)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
        NODE HEALTH
      </p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {items.map(item => (
          <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.875rem', color: 'var(--cds-text-primary)' }}>
            <div style={{ width: 16, height: 16, borderRadius: 3, backgroundColor: item.color, flexShrink: 0 }} />
            <span>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
