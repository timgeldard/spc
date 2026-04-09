import { Button } from '~/lib/carbon-forms'
import { Stack, Tag, Tile } from '~/lib/carbon-layout'
import { useSPC } from '../SPCContext'
import type { IndexedChartPoint, SPCSignal } from '../types'

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
  critical: { dot: '#da1e28', label: '#a2191f', bg: '#fff1f1', border: '#fa4d56' },
  warning: { dot: '#f1c21b', label: '#8e6a00', bg: '#fcf4d6', border: '#f1c21b' },
  info: { dot: '#0f62fe', label: '#0043ce', bg: '#edf5ff', border: '#78a9ff' },
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
      <Tile role="status" aria-live="polite" style={{ border: '1px solid var(--cds-support-success)', background: 'color-mix(in srgb, var(--cds-support-success) 10%, var(--cds-layer) 90%)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
          <span aria-hidden="true">OK</span>
          No {label} rule violations detected
        </div>
      </Tile>
    )
  }

  return (
    <Tile aria-label={`${label} signal queue`}>
      <Stack gap={5}>
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--cds-text-secondary)' }}>Signal queue</div>
          <div style={{ marginTop: '0.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', fontWeight: 700, color: 'var(--cds-text-primary)' }}>
            {label} Signals
            <Tag type="warm-gray" size="sm">
              {allSignals.length} signal{allSignals.length !== 1 ? 's' : ''}
            </Tag>
          </div>
          <p style={{ margin: '0.25rem 0 0', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
            Signals are ordered evidence of instability. Resolve assignable causes before trusting capability.
          </p>
        </div>

        <div style={{ position: 'relative', marginLeft: '0.5rem', marginTop: '0.5rem' }}>
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: '7px', width: '1px', background: 'var(--cds-border-subtle-01)' }} />

          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {allSignals.map((signal, index) => {
              const severity = (rules.severity[signal.rule as keyof typeof rules.severity] ?? 'info') as SeverityKey
              const style = SEVERITY_STYLE[severity] ?? SEVERITY_STYLE.info
              const batchIds = signal.indices
                .map(idx => indexedPoints[idx]?.batch_id)
                .filter((value): value is string => Boolean(value))
                .filter((value, valueIndex, all) => all.indexOf(value) === valueIndex)
                .slice(0, 3)

              return (
                <div key={`${signal.chart}-${signal.rule}-${index}`} style={{ position: 'relative', paddingLeft: '1.5rem' }}>
                  <div
                    style={{
                      position: 'absolute',
                      left: 0,
                      top: '0.375rem',
                      height: '0.875rem',
                      width: '0.875rem',
                      borderRadius: '999px',
                      border: '2px solid var(--cds-layer)',
                      background: style.dot,
                      boxShadow: `0 0 0 2px ${style.dot}40`,
                    }}
                  />
                  <div
                    style={{
                      borderRadius: '0.25rem',
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      background: style.bg,
                      border: `1px solid ${style.border}`,
                    }}
                  >
                    <div style={{ marginBottom: '0.125rem', display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: style.label }}>Rule {signal.rule}</span>
                      <span style={{ borderRadius: '0.25rem', padding: '0.125rem 0.375rem', fontSize: '0.75rem', fontWeight: 500, background: 'rgba(0,0,0,0.06)', color: style.label }}>
                        {signal.chart} chart
                      </span>
                    </div>
                    <p style={{ margin: 0, fontSize: '0.75rem', lineHeight: 1.4, color: 'var(--cds-text-secondary)' }}>
                      {rules.desc[signal.rule as keyof typeof rules.desc] ?? signal.description}
                    </p>
                    {batchIds.length > 0 && (
                      <p style={{ margin: '0.25rem 0 0', fontSize: '0.75rem', color: 'var(--cds-text-helper)' }}>
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

        <Button
          kind="secondary"
          size="sm"
          onClick={() => dispatch({ type: 'SET_ACTIVE_TAB', payload: 'correlation' })}
          title="Investigate whether correlated characteristics may share assignable causes"
          aria-label="Open correlation analysis for signal investigation"
        >
          Investigate Correlations
        </Button>
      </Stack>
    </Tile>
  )
}
