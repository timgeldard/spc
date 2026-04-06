import { useSPC } from '../SPCContext'
import type { IndexedChartPoint, SPCSignal } from '../types'
import { buttonBaseClass, buttonSecondaryClass, buttonSmClass, heroCardDenseClass } from '../uiClasses'

const WECO_RULES = {
  desc: {
    1: 'One point beyond the 3σ control limit',
    2: '2 of 3 consecutive points beyond the 2σ limit (same side)',
    3: '4 of 5 consecutive points beyond the 1σ limit (same side)',
    4: '8 consecutive points on the same side of the centre line',
  },
  severity: { 1: 'critical', 2: 'warning', 3: 'warning', 4: 'warning' },
} as const

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
} as const

const SEVERITY_STYLE = {
  critical: { dot: '#dc2626', label: '#dc2626', bg: '#fef2f2', border: '#fca5a5' },
  warning: { dot: '#d97706', label: '#d97706', bg: '#fffbeb', border: '#fcd34d' },
  info: { dot: '#0284c7', label: '#0284c7', bg: '#f0f9ff', border: '#7dd3fc' },
} as const

type SeverityKey = keyof typeof SEVERITY_STYLE

interface TimelineSignal extends SPCSignal {
  chart: 'X' | 'MR'
}

interface SignalsPanelProps {
  signals?: SPCSignal[]
  mrSignals?: SPCSignal[]
  indexedPoints?: IndexedChartPoint[]
  ruleSet?: 'weco' | 'nelson'
}

export default function SignalsPanel({
  signals = [],
  mrSignals = [],
  indexedPoints = [],
  ruleSet = 'weco',
}: SignalsPanelProps) {
  const { dispatch } = useSPC()
  const rules = ruleSet === 'nelson' ? NELSON_RULES : WECO_RULES
  const label = ruleSet === 'nelson' ? 'Nelson' : 'WECO'

  const allSignals: TimelineSignal[] = [
    ...signals.map(signal => ({ ...signal, chart: 'X' as const })),
    ...mrSignals.map(signal => ({ ...signal, chart: 'MR' as const })),
  ]

  if (allSignals.length === 0) {
    return (
      <div
        role="status"
        aria-live="polite"
        className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium"
        style={{ background: '#ecfdf5', color: '#059669', border: '1px solid #a7f3d0' }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
          <polyline points="20 6 9 17 4 12" />
        </svg>
        No {label} rule violations detected
      </div>
    )
  }

  return (
    <div className={`${heroCardDenseClass} space-y-4`} aria-label={`${label} signal queue`}>
      <div>
        <div className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-[var(--c-text-muted)]">Signal queue</div>
        <div className="mt-1 flex items-center gap-2 text-sm font-bold text-[var(--c-text)]">
          {label} Signals
          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-xs font-semibold text-amber-600">
            {allSignals.length} signal{allSignals.length !== 1 ? 's' : ''}
          </span>
        </div>
        <p className="mt-1 text-sm text-[var(--c-text-muted)]">
          Signals are ordered evidence of instability. Resolve assignable causes before trusting capability.
        </p>
      </div>

      <div className="relative ml-2 mt-2">
        <div className="absolute bottom-0 top-0 left-[7px] w-px bg-gray-200" />

        <div className="flex flex-col gap-3">
          {allSignals.map((signal, index) => {
            const severity = (rules.severity[signal.rule as keyof typeof rules.severity] ?? 'info') as SeverityKey
            const style = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.info
            const batchIds = signal.indices
              .map(idx => indexedPoints[idx]?.batch_id)
              .filter((value): value is string => Boolean(value))
              .filter((value, valueIndex, all) => all.indexOf(value) === valueIndex)
              .slice(0, 3)

            return (
              <div key={`${signal.chart}-${signal.rule}-${index}`} className="relative pl-6">
                <div
                  className="absolute left-0 top-1.5 h-3.5 w-3.5 rounded-full border-2 border-white"
                  style={{ background: style.dot, boxShadow: `0 0 0 2px ${style.dot}40` }}
                />
                <div
                  className="rounded-lg px-3 py-2 text-sm"
                  style={{ background: style.bg, border: `1px solid ${style.border}` }}
                >
                  <div className="mb-0.5 flex items-center gap-2">
                    <span className="text-xs font-bold" style={{ color: style.label }}>Rule {signal.rule}</span>
                    <span
                      className="rounded px-1.5 py-0.5 text-xs font-medium"
                      style={{ background: 'rgba(0,0,0,0.06)', color: style.label }}
                    >
                      {signal.chart} chart
                    </span>
                  </div>
                  <p className="text-xs leading-snug text-gray-600">
                    {rules.desc[signal.rule as keyof typeof rules.desc] ?? signal.description}
                  </p>
                  {batchIds.length > 0 && (
                    <p className="mt-1 text-xs text-gray-400">
                      Batches: {batchIds.join(', ')}
                      {signal.indices.length > 3 ? ` +${signal.indices.length - 3} more` : ''}
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      <button
        className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
        style={{ marginTop: 12 }}
        onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'correlation' })}
        title="Investigate whether correlated characteristics may share assignable causes"
        aria-label="Open correlation analysis for signal investigation"
      >
        Investigate Correlations
      </button>
    </div>
  )
}
