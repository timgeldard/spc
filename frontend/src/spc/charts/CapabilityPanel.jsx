import CapabilityHistogram from './CapabilityHistogram.jsx'

function StabilityWarning({ signals, mrSignals }) {
  const total = (signals?.length ?? 0) + (mrSignals?.length ?? 0)
  if (total === 0) return null
  return (
    <div className="spc-stability-warning">
      <span className="spc-stability-warning-icon">⚠</span>
      <span>
        <strong>Process unstable</strong> — {total} rule violation{total !== 1 ? 's' : ''} detected.
        Cpk may be unreliable until the assignable cause is identified and removed.
      </span>
    </div>
  )
}

const TIERS = [
  { min: 1.67, label: 'Highly Capable', color: '#059669', bg: '#d1fae5' },
  { min: 1.33, label: 'Capable', color: '#10b981', bg: '#ecfdf5' },
  { min: 1.00, label: 'Marginally Capable', color: '#d97706', bg: '#fffbeb' },
  { min: 0, label: 'Not Capable', color: '#dc2626', bg: '#fef2f2' },
]

function getTier(v) {
  if (v == null) return null
  for (const t of TIERS) {
    if (v >= t.min) return t
  }
  return TIERS[TIERS.length - 1]
}

function MetricCard({ label, value, tier, subtitle, note }) {
  const t = tier ?? getTier(value)
  const displayVal = value != null ? value.toFixed(2) : '—'
  return (
    <div
      className="rounded-lg p-3 flex flex-col gap-0.5 min-w-0"
      style={{ background: t?.bg ?? '#f9fafb', border: `1px solid ${t?.color ?? '#e5e7eb'}20` }}
    >
      <span className="text-xs font-medium" style={{ color: t?.color ?? '#6b7280' }}>{label}</span>
      <span className="text-2xl font-bold tabular-nums leading-none" style={{ color: t?.color ?? '#111827' }}>
        {displayVal}
      </span>
      {subtitle && <span className="text-xs" style={{ color: t?.color ?? '#6b7280' }}>{subtitle}</span>}
      {note && <span className="text-xs text-gray-400 mt-0.5">{note}</span>}
    </div>
  )
}

export default function CapabilityPanel({ spc }) {
  if (!spc?.capability) return null

  const { cp, cpk, pp, ppk, cpkLower95, cpkUpper95, zScore, dpmo, spec_type } = spc.capability
  const isUnilateral = spec_type === 'unilateral_upper' || spec_type === 'unilateral_lower'
  const cpkTier = getTier(cpk)

  return (
    <div className="spc-capability-panel">
      <div className="spc-capability-panel-title">Process Capability</div>
      <StabilityWarning signals={spc.signals} mrSignals={spc.mrSignals} />

      <div className="grid grid-cols-2 gap-2 mb-3" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))' }}>
        {!isUnilateral && <MetricCard label="Cp" value={cp} note="Short-term" />}
        <MetricCard
          label="Cpk"
          value={cpk}
          note={cpkLower95 != null ? `95% CI [${cpkLower95.toFixed(2)}, ${cpkUpper95.toFixed(2)}]` : 'Short-term'}
        />
        {!isUnilateral && <MetricCard label="Pp" value={pp} note="Long-term" />}
        <MetricCard label="Ppk" value={ppk} note="Long-term" />
        {zScore != null && (
          <MetricCard label="Z (σ level)" value={zScore} tier={null} note="Process sigma" />
        )}
        {dpmo != null && (
          <div className="rounded-lg p-3 flex flex-col gap-0.5 min-w-0" style={{ background: '#f9fafb', border: '1px solid #e5e7eb' }}>
            <span className="text-xs font-medium text-gray-500">DPMO</span>
            <span className="text-2xl font-bold tabular-nums leading-none text-gray-800">{dpmo.toLocaleString()}</span>
            <span className="text-xs text-gray-400">1.5σ shift</span>
          </div>
        )}
      </div>

      {cpkTier && cp != null && Math.abs(cp - cpk) > 0.05 && (
        <p className="text-xs text-gray-500 mb-2">
          Process is {cpk < cp ? 'off-centre' : 'centred'} — Cp {cp.toFixed(2)} vs Cpk {cpk.toFixed(2)}
        </p>
      )}
      {isUnilateral && (
        <p className="text-xs text-gray-400 mb-2">Cp / Pp not defined for one-sided specification</p>
      )}

      <CapabilityHistogram spc={spc} />

      <div className="spc-capability-legend">
        {TIERS.map((t, i) => (
          <span key={i} className="spc-capability-legend-item" style={{ color: t.color }}>
            {i < TIERS.length - 1 ? `≥ ${t.min.toFixed(2)} ${t.label}` : `< 1.00 ${t.label}`}
          </span>
        ))}
      </div>
    </div>
  )
}
