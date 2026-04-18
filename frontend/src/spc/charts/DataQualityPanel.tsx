import type { DataQualitySummary } from '../../api/spc'

interface DataQualityPanelProps {
  summary: DataQualitySummary | null
  loading?: boolean
  error?: string | null
}

interface StatCardProps {
  label: string
  value: string
  tone?: 'neutral' | 'warning' | 'critical'
  hint?: string
}

function StatCard({ label, value, tone = 'neutral', hint }: StatCardProps) {
  const borderColor =
    tone === 'critical' ? 'var(--cds-support-error)'
    : tone === 'warning' ? 'var(--cds-support-warning)'
    : 'var(--cds-border-subtle-01)'
  const color =
    tone === 'critical' ? 'var(--cds-support-error)'
    : tone === 'warning' ? 'var(--cds-support-warning)'
    : 'var(--cds-text-primary)'
  return (
    <div
      style={{
        minWidth: 0,
        borderRadius: 4,
        padding: '0.75rem',
        background: 'var(--cds-layer)',
        border: `1px solid ${borderColor}`,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--cds-text-secondary)' }}>
          {label}
        </span>
        <span style={{ fontSize: '1.25rem', fontWeight: 700, lineHeight: 1, fontVariantNumeric: 'tabular-nums', color }}>
          {value}
        </span>
        {hint && <span style={{ fontSize: '0.6875rem', color: 'var(--cds-text-secondary)' }}>{hint}</span>}
      </div>
    </div>
  )
}

function formatPct(v: number): string {
  return `${(v * 100).toFixed(1)}%`
}

function formatNum(v: number): string {
  return v.toLocaleString()
}

function formatDays(v: number | null): string {
  return v == null ? '—' : `${v.toFixed(1)}d`
}

export default function DataQualityPanel({ summary, loading, error }: DataQualityPanelProps) {
  if (error) {
    return (
      <div
        role="alert"
        style={{
          borderRadius: 4,
          border: '1px solid var(--cds-support-error)',
          background: 'var(--cds-notification-background-error)',
          padding: '0.75rem 1rem',
          fontSize: '0.8125rem',
        }}
      >
        Data quality summary failed: {error}
      </div>
    )
  }
  if (loading && !summary) {
    return (
      <div style={{ padding: '0.75rem', fontSize: '0.8125rem', color: 'var(--cds-text-secondary)' }}>
        Computing data quality…
      </div>
    )
  }
  if (!summary) return null

  const missingTone: StatCardProps['tone'] =
    summary.pct_missing > 0.1 ? 'critical' : summary.pct_missing > 0.02 ? 'warning' : 'neutral'
  const outlierTone: StatCardProps['tone'] =
    summary.n_outliers_3sigma > 5 ? 'warning' : 'neutral'
  const gapTone: StatCardProps['tone'] =
    summary.p95_gap_days != null && summary.median_gap_days != null && summary.p95_gap_days > 4 * Math.max(summary.median_gap_days, 1)
      ? 'warning'
      : 'neutral'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div>
        <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--cds-text-secondary)' }}>
          Data quality
        </div>
        <div style={{ marginTop: 4, fontSize: '1rem', fontWeight: 700, color: 'var(--cds-text-primary)' }}>
          Population health
        </div>
      </div>
      <div style={{ display: 'grid', gap: '0.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
        <StatCard label="Batches" value={formatNum(summary.n_batches)} />
        <StatCard label="Samples" value={formatNum(summary.n_samples)} />
        <StatCard
          label="% Missing"
          value={formatPct(summary.pct_missing)}
          tone={missingTone}
          hint={summary.n_unparseable_values > 0 ? `${summary.n_unparseable_values} unparseable` : undefined}
        />
        <StatCard
          label="Outliers (3σ)"
          value={formatNum(summary.n_outliers_3sigma)}
          tone={outlierTone}
          hint="Beyond ±3σ of range mean"
        />
        <StatCard
          label="Median gap"
          value={formatDays(summary.median_gap_days)}
          hint={summary.p95_gap_days != null ? `p95 ${formatDays(summary.p95_gap_days)}` : undefined}
          tone={gapTone}
        />
        <StatCard
          label="Max gap"
          value={formatDays(summary.max_gap_days)}
          hint={gapTone === 'warning' ? 'Irregular sampling' : undefined}
          tone={gapTone}
        />
      </div>
      {summary.first_batch_date && summary.last_batch_date && (
        <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
          Range: {summary.first_batch_date} → {summary.last_batch_date}
        </p>
      )}
      {summary.disposition_breakdown && Object.keys(summary.disposition_breakdown).length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--cds-text-secondary)' }}>
            Disposition (SAP usage decision)
          </span>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', fontSize: '0.75rem' }}>
            {Object.entries(summary.disposition_breakdown).map(([code, count]) => (
              <span
                key={code}
                title="Upstream SAP QAVE usage-decision code"
                style={{
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'var(--cds-layer)',
                  border: '1px solid var(--cds-border-subtle-01)',
                  color: 'var(--cds-text-primary)',
                }}
              >
                {code === '__UNSET__' ? '(none)' : code}: {count.toLocaleString()}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
