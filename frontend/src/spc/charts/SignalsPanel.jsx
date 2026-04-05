import { useSPC } from '../SPCContext.jsx'

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
  severity: { 1: 'critical', 2: 'warning', 3: 'warning', 4: 'info', 5: 'warning', 6: 'warning', 7: 'info', 8: 'info' },
}

const SEVERITY_STYLE = {
  critical: { dot: '#dc2626', label: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  warning: { dot: '#d97706', label: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
  info: { dot: '#0284c7', label: '#0284c7', bg: '#f0f9ff', border: '#7dd3fc' },
}

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
      <div className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium"
        style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12"/>
        </svg>
        No {label} rule violations detected
      </div>
    )
  }

  return (
    <div className="spc-signals-panel">
      <div className="spc-signals-title">
        {label} Signals
        <span className="spc-signals-count">{allSignals.length} signal{allSignals.length !== 1 ? 's' : ''}</span>
      </div>

      <div className="relative ml-2 mt-2">
        <div className="absolute left-[7px] top-0 bottom-0 w-px bg-gray-200" />

        <div className="flex flex-col gap-3">
          {allSignals.map((s, i) => {
            const severity = rules.severity[s.rule] ?? 'info'
            const style = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.info
            const batchIds = s.indices
              .map(idx => indexedPoints[idx]?.batch_id)
              .filter(Boolean)
              .filter((v, j, a) => a.indexOf(v) === j)
              .slice(0, 3)

            return (
              <div key={i} className="relative pl-6">
                <div
                  className="absolute left-0 top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white"
                  style={{ background: style.dot, boxShadow: `0 0 0 2px ${style.dot}40` }}
                />
                <div
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ background: style.bg, border: `1px solid ${style.border}` }}
                >
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-bold" style={{ color: style.label }}>Rule {s.rule}</span>
                    <span className="text-xs rounded px-1.5 py-0.5 font-medium"
                      style={{ background: 'rgba(0,0,0,0.06)', color: style.label }}>
                      {s.chart} chart
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 leading-snug">{rules.desc[s.rule] ?? s.description}</p>
                  {batchIds.length > 0 && (
                    <p className="text-xs text-gray-400 mt-1">
                      Batches: {batchIds.join(', ')}{s.indices.length > 3 ? ` +${s.indices.length - 3} more` : ''}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <button
        className="spc-btn spc-btn--sm spc-btn--secondary"
        style={{ marginTop: 12 }}
        onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'correlation' })}
        title="Investigate whether correlated characteristics may share assignable causes"
      >
        Investigate Correlations
      </button>
    </div>
  )
}
