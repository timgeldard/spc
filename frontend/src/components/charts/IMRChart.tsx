import { useEffect, useMemo, useRef, useState } from 'react'
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, MetadataLabel } from '../ui'
import { CustomTooltip } from './CustomTooltip'

const HINT_KEY = 'spc.hint.exclusion_seen'

const STRATUM_PALETTE = [
  '#005776',
  '#289BA2',
  '#44CF93',
  '#FFC2B3',
  '#435F33',
  '#669AAD',
  '#7EC3C7',
  '#8FE2BE',
]

function useExclusionHint(hasInteractivePoints: boolean) {
  const [visible, setVisible] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!hasInteractivePoints) return
    if (typeof localStorage !== 'undefined' && localStorage.getItem(HINT_KEY)) return
    setVisible(true)
    timerRef.current = setTimeout(() => setVisible(false), 4000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [hasInteractivePoints])

  const dismiss = () => {
    setVisible(false)
    if (timerRef.current) clearTimeout(timerRef.current)
    if (typeof localStorage !== 'undefined') localStorage.setItem(HINT_KEY, '1')
  }

  return { visible, dismiss }
}

export interface IndustrialIMRPoint {
  time: string
  value: number
  mr?: number | null
  batchId?: string | null
  isSignal?: boolean
  isMrSignal?: boolean
  isExcluded?: boolean
  isOutlier?: boolean
  signalLabel?: string | null
  signalSummary?: string | null
  detailSummary?: string | null
  onClickIndex?: number
  stratifyValue?: string | null
}

interface IndustrialIMRChartProps {
  data: IndustrialIMRPoint[]
  ucl?: number | null
  lcl?: number | null
  target?: number | null
  mrUcl?: number | null
  mrTarget?: number | null
  title?: string
  onPointClick?: (index: number) => void
  embedded?: boolean
}

const chartTheme = {
  grid: 'var(--c-border)',
  muted: 'var(--c-text-muted)',
  danger: 'var(--c-status-red)',
  primary: 'var(--c-brand)',
  cl: 'var(--c-accent)',
  contrast: 'var(--c-surface)',
}

function PrimaryDot(props: {
  cx?: number
  cy?: number
  payload?: IndustrialIMRPoint
  hovered?: boolean
  stratumColor?: string
}) {
  const { cx, cy, payload, hovered, stratumColor } = props
  if (cx == null || cy == null || !payload) return null

  let fill = stratumColor ?? chartTheme.primary
  let stroke = chartTheme.contrast
  let size = 4.5

  if (payload.isExcluded) {
    fill = chartTheme.muted
    size = 5.5
  } else if (payload.isOutlier) {
    fill = '#7c3aed'
    size = 6.5
  } else if (payload.isSignal) {
    fill = chartTheme.danger
    size = 6
  }

  const interactive = payload.onClickIndex != null
  const displaySize = interactive && hovered ? size + 2 : size

  return (
    <circle
      cx={cx}
      cy={cy}
      r={displaySize}
      fill={fill}
      stroke={interactive && hovered ? chartTheme.primary : stroke}
      strokeWidth={interactive && hovered ? 2.4 : 1.6}
      style={{ transition: 'r 150ms ease, stroke-width 150ms ease' }}
      cursor={interactive ? 'pointer' : undefined}
    />
  )
}

function MrDot(props: {
  cx?: number
  cy?: number
  payload?: IndustrialIMRPoint
}) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload) return null
  const fill = payload.isMrSignal ? chartTheme.danger : chartTheme.muted
  const size = payload.isMrSignal ? 5 : 3.8
  return <circle cx={cx} cy={cy} r={size} fill={fill} stroke={chartTheme.contrast} strokeWidth={1.3} />
}

export function IMRChart({
  data,
  ucl,
  lcl,
  target,
  mrUcl,
  mrTarget,
  title = 'I-MR Chart',
  onPointClick,
  embedded = false,
}: IndustrialIMRChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null)
  const hasInteractivePoints = onPointClick != null && data.some((d) => d.onClickIndex != null)
  const { visible: hintVisible, dismiss: dismissHint } = useExclusionHint(hasInteractivePoints)

  const stratumColorMap = useMemo(() => {
    const strata = [...new Set(data.map((d) => d.stratifyValue).filter((v): v is string => v != null))]
    return new Map(strata.map((s, i) => [s, STRATUM_PALETTE[i % STRATUM_PALETTE.length]]))
  }, [data])
  const isStratified = stratumColorMap.size > 0

  const movingRangeData = data
    .map((point, index) => ({ ...point, mrTime: point.time, mrIndex: index }))
    .filter((point, index) => index > 0 && point.mr != null)

  const header = (
    <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {!embedded && <CardTitle>{title}</CardTitle>}
        <MetadataLabel>INDIVIDUALS + MOVING RANGE</MetadataLabel>
      </div>
      {hintVisible && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.375rem',
            borderRadius: '999px',
            border: '1px solid var(--cds-border-subtle-01)',
            background: 'var(--cds-layer-accent-01)',
            padding: '0.25rem 0.75rem',
            fontSize: '0.75rem',
            color: 'var(--cds-text-secondary)',
          }}
        >
          Click any point to exclude it
          <button
            onClick={dismissHint}
            aria-label="Dismiss hint"
            style={{ marginLeft: '0.25rem', border: 0, background: 'transparent', color: 'inherit', cursor: 'pointer' }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  )

  const body = (
    <>
      <div style={{ height: '280px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 20, right: 30, left: 8, bottom: 10 }}>
            <CartesianGrid vertical={false} stroke={chartTheme.grid} />
            <XAxis dataKey="time" tick={{ fill: chartTheme.muted, fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fill: chartTheme.muted, fontSize: 11 }} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            {ucl != null && <ReferenceLine y={ucl} stroke={chartTheme.danger} strokeDasharray="4 4" strokeWidth={2.5} label={{ value: 'UCL', fill: chartTheme.danger, fontSize: 11 }} />}
            {lcl != null && <ReferenceLine y={lcl} stroke={chartTheme.danger} strokeDasharray="4 4" strokeWidth={2.5} label={{ value: 'LCL', fill: chartTheme.danger, fontSize: 11 }} />}
            {target != null && <ReferenceLine y={target} stroke={chartTheme.cl} strokeDasharray="2 2" strokeWidth={2} label={{ value: 'CL', fill: chartTheme.cl, fontSize: 11 }} />}
            <Line
              type="monotone"
              dataKey="value"
              stroke={chartTheme.primary}
              strokeWidth={2.8}
              dot={(props) => {
                const payload = props.payload as IndustrialIMRPoint | undefined
                const isInteractive = payload?.onClickIndex != null && onPointClick != null
                const action = payload?.isExcluded ? 'Restore' : 'Exclude'
                const label = isInteractive
                  ? `${action} batch ${payload?.batchId ?? String(payload?.onClickIndex)}, value ${payload?.value}`
                  : undefined
                return (
                  <g
                    onClick={() => {
                      if (isInteractive) {
                        dismissHint()
                        onPointClick!(payload!.onClickIndex!)
                      }
                    }}
                    onMouseEnter={() => isInteractive && setHoveredIndex(payload!.onClickIndex!)}
                    onMouseLeave={() => setHoveredIndex(null)}
                    onKeyDown={(e) => {
                      if (isInteractive && (e.key === 'Enter' || e.key === ' ')) {
                        e.preventDefault()
                        dismissHint()
                        onPointClick!(payload!.onClickIndex!)
                      }
                    }}
                    role={isInteractive ? 'button' : undefined}
                    tabIndex={isInteractive ? 0 : undefined}
                    aria-label={label}
                    style={isInteractive ? { outline: 'none' } : undefined}
                  >
                    <PrimaryDot
                      cx={props.cx}
                      cy={props.cy}
                      payload={payload}
                      hovered={isInteractive && hoveredIndex === payload?.onClickIndex}
                      stratumColor={
                        payload?.stratifyValue != null && !payload.isExcluded && !payload.isSignal && !payload.isOutlier
                          ? stratumColorMap.get(payload.stratifyValue)
                          : undefined
                      }
                    />
                  </g>
                )
              }}
              activeDot={{ r: 6 }}
              name="Individual Value"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {isStratified && (
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            alignItems: 'center',
            gap: '0.25rem 1rem',
            borderTop: '1px solid var(--cds-border-subtle-01)',
            paddingTop: '0.5rem',
          }}
        >
          {[...stratumColorMap.entries()].map(([label, color]) => (
            <span key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
              <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
                <circle cx="5" cy="5" r="4.5" fill={color} />
              </svg>
              {label}
            </span>
          ))}
        </div>
      )}

      <div style={{ height: '160px' }}>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={movingRangeData} margin={{ top: 8, right: 30, left: 8, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke={chartTheme.grid} />
            <XAxis dataKey="mrTime" tick={{ fill: chartTheme.muted, fontSize: 11 }} tickLine={false} />
            <YAxis tick={{ fill: chartTheme.muted, fontSize: 11 }} tickLine={false} />
            <Tooltip content={<CustomTooltip />} />
            {mrUcl != null && <ReferenceLine y={mrUcl} stroke={chartTheme.danger} strokeDasharray="4 4" strokeWidth={2.5} label={{ value: 'MR UCL', fill: chartTheme.danger, fontSize: 11 }} />}
            {mrTarget != null && <ReferenceLine y={mrTarget} stroke={chartTheme.cl} strokeDasharray="2 2" strokeWidth={2} label={{ value: 'MR̄', fill: chartTheme.cl, fontSize: 11 }} />}
            <Line
              type="monotone"
              dataKey="mr"
              stroke={chartTheme.muted}
              strokeWidth={2}
              dot={(props) => <MrDot cx={props.cx} cy={props.cy} payload={props.payload as IndustrialIMRPoint | undefined} />}
              activeDot={{ r: 5 }}
              name="Moving Range"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </>
  )

  if (embedded) {
    return (
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        {header}
        {body}
      </div>
    )
  }

  return (
    <Card>
      <CardHeader>{header}</CardHeader>
      <CardContent>{body}</CardContent>
    </Card>
  )
}
