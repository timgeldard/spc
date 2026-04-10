import Activity from '@carbon/icons-react/es/Activity.js'
import Building from '@carbon/icons-react/es/Building.js'
import WarningAlt from '@carbon/icons-react/es/WarningAlt.js'

interface NodeTooltipProps {
  label: string
  plantName?: string | null
  rejectionRate?: number | null
  cpk?: number | null
  totalBatches?: number | null
  rejectedBatches?: number | null
  lastOoc?: string | null
  hasSignal?: boolean | null
  visible?: boolean
}

const statLabel: React.CSSProperties = {
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
  fontSize: '0.7rem',
  color: 'var(--cds-text-secondary)',
}

const statValue: React.CSSProperties = {
  marginTop: 4,
  fontSize: '0.875rem',
  fontWeight: 500,
  color: 'var(--cds-text-primary)',
}

export default function NodeTooltip({
  label,
  plantName,
  rejectionRate,
  cpk,
  totalBatches,
  rejectedBatches,
  lastOoc,
  hasSignal,
  visible = false,
}: NodeTooltipProps) {
  if (!visible) return null

  return (
    <div style={{
      pointerEvents: 'none',
      position: 'absolute',
      bottom: '100%',
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 30,
      marginBottom: '0.75rem',
      width: 256,
      borderRadius: '0.75rem',
      border: '1px solid var(--cds-border-subtle-01)',
      background: 'var(--cds-layer)',
      padding: '1rem',
      textAlign: 'left',
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
    }}>
      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>{label}</div>
      {plantName && (
        <div style={{
          marginTop: 4,
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          borderRadius: 999,
          background: 'var(--cds-layer-accent-01)',
          padding: '2px 10px',
          fontSize: '0.75rem',
          fontWeight: 500,
          color: 'var(--cds-text-secondary)',
        }}>
          <Building size={14} />
          {plantName}
        </div>
      )}

      <div style={{ marginTop: '0.75rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <div style={statLabel}>Rejection</div>
          <div style={statValue}>{rejectionRate != null ? `${rejectionRate.toFixed(1)}%` : 'Unavailable'}</div>
        </div>
        <div>
          <div style={statLabel}>Cpk</div>
          <div style={statValue}>{cpk != null ? cpk.toFixed(2) : 'Unavailable'}</div>
        </div>
        <div>
          <div style={statLabel}>Batches</div>
          <div style={statValue}>{totalBatches ?? 0}</div>
        </div>
        <div>
          <div style={statLabel}>Rejected</div>
          <div style={statValue}>{rejectedBatches ?? 0}</div>
        </div>
      </div>

      {(hasSignal || lastOoc) && (
        <div style={{
          marginTop: '0.75rem',
          display: 'inline-flex',
          alignItems: 'center',
          gap: 4,
          borderRadius: 999,
          padding: '2px 10px',
          fontSize: '0.75rem',
          fontWeight: 600,
          background: 'var(--cds-notification-background-error)',
          color: 'var(--cds-support-error)',
        }}>
          {lastOoc ? <WarningAlt size={14} /> : <Activity size={14} />}
          {lastOoc ? `Latest OOC ${lastOoc}` : 'OOC attention signal inferred'}
        </div>
      )}
    </div>
  )
}
