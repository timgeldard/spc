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
  onClickIndex?: number
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
}

const chartTheme = {
  grid: 'var(--c-border)',
  muted: 'var(--c-text-muted)',
  danger: 'var(--c-status-red)',
  primary: 'var(--c-text)',
  contrast: 'var(--c-surface)',
}

function PrimaryDot(props: {
  cx?: number
  cy?: number
  payload?: IndustrialIMRPoint
}) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload) return null

  let fill = chartTheme.primary
  let stroke = chartTheme.contrast
  let size = 4

  if (payload.isExcluded) {
    fill = chartTheme.muted
    size = 5
  } else if (payload.isOutlier) {
    fill = '#7c3aed'
    size = 6
  } else if (payload.isSignal) {
    fill = chartTheme.danger
    size = 5
  }

  return (
    <circle
      cx={cx}
      cy={cy}
      r={size}
      fill={fill}
      stroke={stroke}
      strokeWidth={1.5}
      className={payload.onClickIndex != null ? 'cursor-pointer' : undefined}
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
  const size = payload.isMrSignal ? 4.5 : 3.5
  return <circle cx={cx} cy={cy} r={size} fill={fill} stroke={chartTheme.contrast} strokeWidth={1.25} />
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
}: IndustrialIMRChartProps) {
  const movingRangeData = data
    .map((point, index) => ({ ...point, mrTime: point.time, mrIndex: index }))
    .filter((point, index) => index > 0 && point.mr != null)

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle>{title}</CardTitle>
          <MetadataLabel>INDIVIDUALS + MOVING RANGE</MetadataLabel>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="h-[280px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 20, right: 30, left: 8, bottom: 10 }}>
              <CartesianGrid vertical={false} stroke={chartTheme.grid} />
              <XAxis dataKey="time" tick={{ fill: chartTheme.muted, fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: chartTheme.muted, fontSize: 11 }} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              {ucl != null && <ReferenceLine y={ucl} stroke={chartTheme.danger} strokeDasharray="3 3" label={{ value: 'UCL', fill: chartTheme.danger, fontSize: 11 }} />}
              {lcl != null && <ReferenceLine y={lcl} stroke={chartTheme.danger} strokeDasharray="3 3" label={{ value: 'LCL', fill: chartTheme.danger, fontSize: 11 }} />}
              {target != null && <ReferenceLine y={target} stroke={chartTheme.muted} strokeDasharray="2 2" label={{ value: 'Target', fill: chartTheme.muted, fontSize: 11 }} />}
              <Line
                type="monotone"
                dataKey="value"
                stroke={chartTheme.primary}
                strokeWidth={2.5}
                dot={(props) => {
                  const payload = props.payload as IndustrialIMRPoint | undefined
                  return (
                    <g onClick={() => {
                      if (payload?.onClickIndex != null && onPointClick) onPointClick(payload.onClickIndex)
                    }}>
                      <PrimaryDot cx={props.cx} cy={props.cy} payload={payload} />
                    </g>
                  )
                }}
                activeDot={{ r: 6 }}
                name="Individual Value"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={movingRangeData} margin={{ top: 8, right: 30, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={chartTheme.grid} />
              <XAxis dataKey="mrTime" tick={{ fill: chartTheme.muted, fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: chartTheme.muted, fontSize: 11 }} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              {mrUcl != null && <ReferenceLine y={mrUcl} stroke={chartTheme.danger} strokeDasharray="3 3" label={{ value: 'MR UCL', fill: chartTheme.danger, fontSize: 11 }} />}
              {mrTarget != null && <ReferenceLine y={mrTarget} stroke={chartTheme.muted} strokeDasharray="2 2" label={{ value: 'MR̄', fill: chartTheme.muted, fontSize: 11 }} />}
              <Line
                type="monotone"
                dataKey="mr"
                stroke={chartTheme.muted}
                strokeWidth={1.75}
                dot={(props) => <MrDot cx={props.cx} cy={props.cy} payload={props.payload as IndustrialIMRPoint | undefined} />}
                activeDot={{ r: 5 }}
                name="Moving Range"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
