const WECO_RULES = {
  desc: {
    1: 'One point beyond the 3σ control limit',
    2: '2 of 3 consecutive points beyond the 2σ limit (same side)',
    3: '4 of 5 consecutive points beyond the 1σ limit (same side)',
    4: '8 consecutive points on the same side of the centre line',
  },
  severity: { 1: 'critical', 2: 'warning', 3: 'warning', 4: 'warning' },
}

const NELSON_RULES = {
  desc: {
    1: 'One point beyond the 3σ control limit',
    2: '9 consecutive points on the same side of the centre line',
    3: '6 consecutive points monotonically increasing or decreasing',
    4: '14 consecutive points alternating up/down',
    5: '2 of 3 consecutive points beyond the 2σ limit (same side)',
    6: '4 of 5 consecutive points beyond the 1σ limit (same side)',
    7: '15 consecutive points within Zone C (hugging centre line)',
    8: '8 consecutive points outside Zone C on both sides (mixture)',
  },
  severity: {
    1: 'critical',
    2: 'warning',
    3: 'warning',
    4: 'info',
    5: 'warning',
    6: 'warning',
    7: 'info',
    8: 'info',
  },
}

import { useSPC } from '../SPCContext.jsx'

export default function SignalsPanel({ signals = [], mrSignals = [], indexedPoints = [], ruleSet = 'weco' }) {
  const { dispatch } = useSPC()
  const rules = ruleSet === 'nelson' ? NELSON_RULES : WECO_RULES
  const label = ruleSet === 'nelson' ? 'Nelson' : 'WECO'

  const allSignals = [
    ...signals.map(s => ({ ...s, chart: 'X' })),
    ...mrSignals.map(s => ({ ...s, chart: 'MR' })),
  ]

  if (allSignals.length === 0) {
    return (
      <div className="spc-signals-panel spc-signals-panel--ok">
        <span className="spc-signals-ok-icon">✓</span>
        <span>No {label} rule violations detected</span>
      </div>
    )
  }

  return (
    <div className="spc-signals-panel">
      <div className="spc-signals-title">
        {label} Signals
        <span className="spc-signals-count">
          {allSignals.length} signal{allSignals.length !== 1 ? 's' : ''}
        </span>
      </div>
      <div className="spc-signals-list">
        {allSignals.map((s, i) => {
          const severity = rules.severity[s.rule] ?? 'info'
          const batchIds = s.indices
            .map(idx => indexedPoints[idx]?.batch_id)
            .filter(Boolean)
            .filter((v, j, a) => a.indexOf(v) === j)
            .slice(0, 3)

          return (
            <div key={i} className={`spc-signal spc-signal--${severity}`}>
              <div className="spc-signal-header">
                <span className={`spc-signal-rule spc-signal-rule--${severity}`}>Rule {s.rule}</span>
                <span className="spc-signal-chart-tag">{s.chart} chart</span>
              </div>
              <p className="spc-signal-desc">{rules.desc[s.rule] ?? s.description}</p>
              {batchIds.length > 0 && (
                <p className="spc-signal-batches">
                  Batches: {batchIds.join(', ')}{s.indices.length > 3 ? ` +${s.indices.length - 3} more` : ''}
                </p>
              )}
            </div>
          )
        })}
      </div>
      {allSignals.length > 0 && (
        <button
          className="spc-btn spc-btn--sm spc-btn--secondary"
          style={{ marginTop: 8 }}
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'correlation' })}
          title="Investigate whether correlated characteristics may share assignable causes"
        >
          Investigate Correlations
        </button>
      )}
    </div>
  )
}
