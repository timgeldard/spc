import CapabilityGauge from './CapabilityGauge.jsx'
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

const INTERPRETATION = [
  { min: 1.67, label: 'Highly Capable',     color: '#059669', bg: '#d1fae5' },
  { min: 1.33, label: 'Capable',            color: '#10b981', bg: '#ecfdf5' },
  { min: 1.00, label: 'Marginally Capable', color: '#d97706', bg: '#fffbeb' },
  { min: 0,    label: 'Not Capable',        color: '#dc2626', bg: '#fef2f2' },
]

function interpret(cpk) {
  if (cpk === null || cpk === undefined) return null
  for (const tier of INTERPRETATION) {
    if (cpk >= tier.min) return tier
  }
  return INTERPRETATION[INTERPRETATION.length - 1]
}

export default function CapabilityPanel({ spc }) {
  if (!spc?.capability) return null

  const { cp, cpk, pp, ppk, cpkLower95, cpkUpper95, zScore, dpmo, spec_type } = spc.capability
  const tier = interpret(cpk)

  const isUnilateral = spec_type === 'unilateral_upper' || spec_type === 'unilateral_lower'

  return (
    <div className="spc-capability-panel">
      <div className="spc-capability-panel-title">Process Capability</div>
      <StabilityWarning signals={spc.signals} mrSignals={spc.mrSignals} />

      {/* Verdict banner */}
      {tier && (
        <div className="spc-capability-verdict" style={{ background: tier.bg, borderColor: tier.color }}>
          <span className="spc-capability-verdict-label" style={{ color: tier.color }}>
            {tier.label}
          </span>
          {cp != null && cpk != null && Math.abs(cp - cpk) > 0.05 && (
            <span className="spc-capability-verdict-note">
              Process is {cpk < cp ? 'off-centre' : 'centred'} (Cp {cp.toFixed(2)} vs Cpk {cpk.toFixed(2)})
            </span>
          )}
        </div>
      )}

      {/* Gauges */}
      <div className="spc-gauge-row">
        <div className="spc-gauge-group">
          <div className="spc-gauge-group-label">Within-Subgroup (Short-term)</div>
          <div className="spc-gauge-pair">
            {!isUnilateral && <CapabilityGauge label="Cp" value={cp} />}
            <CapabilityGauge label="Cpk" value={cpk} lower95={cpkLower95} upper95={cpkUpper95} />
          </div>
          {isUnilateral && (
            <div className="spc-capability-note">Cp not defined for one-sided specification</div>
          )}
          {cpkLower95 != null && (
            <div className="spc-capability-note" style={{ color: '#6b7280', fontSize: '0.75rem' }}>
              95% CI on Cpk: [{cpkLower95.toFixed(2)}, {cpkUpper95.toFixed(2)}]
            </div>
          )}
        </div>
        <div className="spc-gauge-group">
          <div className="spc-gauge-group-label">Overall (Long-term)</div>
          <div className="spc-gauge-pair">
            {!isUnilateral && <CapabilityGauge label="Pp" value={pp} />}
            <CapabilityGauge label="Ppk" value={ppk} />
          </div>
        </div>
      </div>

      {/* Six Sigma metrics */}
      {(zScore != null || dpmo != null) && (
        <div className="spc-sixsigma-row">
          <div className="spc-sixsigma-item">
            <span className="spc-sixsigma-label">Process Z (σ level)</span>
            <span className="spc-sixsigma-value">{zScore?.toFixed(2) ?? '—'}</span>
          </div>
          <div className="spc-sixsigma-item">
            <span className="spc-sixsigma-label" title="Defects Per Million Opportunities — calculated using the Motorola 1.5σ long-term shift convention">DPMO (1.5σ) ℹ</span>
            <span className="spc-sixsigma-value">{dpmo != null ? dpmo.toLocaleString() : '—'}</span>
          </div>
        </div>
      )}

      {/* Histogram */}
      <CapabilityHistogram spc={spc} />

      {/* Reference table */}
      <div className="spc-capability-legend">
        {INTERPRETATION.map((t, i) => (
          <span key={i} className="spc-capability-legend-item" style={{ color: t.color }}>
            {i < INTERPRETATION.length - 1 ? `≥ ${INTERPRETATION[i].min.toFixed(2)} ${t.label}` : `< 1.00 ${t.label}`}
          </span>
        ))}
      </div>
    </div>
  )
}
