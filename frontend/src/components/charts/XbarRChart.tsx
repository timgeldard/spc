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

export interface IndustrialXbarRPoint {
  time: string
  xbar: number
  range: number
  batchId?: string | null
  subgroupSize?: number
  isSignal?: boolean
  isRangeSignal?: boolean
  uclX?: number | null
  lclX?: number | null
}

interface IndustrialXbarRChartProps {
  data: IndustrialXbarRPoint[]
  ucl?: number | null
  lcl?: number | null
  target?: number | null
  rangeUcl?: number | null
  rangeLcl?: number | null
  rangeTarget?: number | null
  title?: string
}

// §4.7 SPC charts: data=Slate, centerline=Sage, violations=Sunset
const chartTheme = {
  grid: 'var(--c-border)',
  muted: 'var(--c-text-muted)',
  danger: 'var(--c-status-red)',   // Sunset — violations only
  primary: 'var(--c-brand)',        // Slate — data series
  cl: 'var(--c-accent)',            // Sage — centerline
  contrast: 'var(--c-surface)',
}

function PrimaryDot(props: {
  cx?: number
  cy?: number
  payload?: IndustrialXbarRPoint
}) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload?.isSignal) return null
  return <circle cx={cx} cy={cy} r={4.5} fill={chartTheme.danger} stroke={chartTheme.contrast} strokeWidth={1.5} />
}

function RangeDot(props: {
  cx?: number
  cy?: number
  payload?: IndustrialXbarRPoint
}) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload?.isRangeSignal) return null
  return <circle cx={cx} cy={cy} r={4} fill={chartTheme.danger} stroke={chartTheme.contrast} strokeWidth={1.25} />
}

export function XbarRChart({
  data,
  ucl,
  lcl,
  target,
  rangeUcl,
  rangeLcl,
  rangeTarget,
  title = 'X-bar & R Chart',
}: IndustrialXbarRChartProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle>{title}</CardTitle>
          <MetadataLabel>SUBGROUP MEAN + RANGE</MetadataLabel>
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
              {target != null && <ReferenceLine y={target} stroke={chartTheme.cl} strokeDasharray="2 2" label={{ value: 'CL', fill: chartTheme.cl, fontSize: 11 }} />}
              <Line type="monotone" dataKey="xbar" stroke={chartTheme.primary} strokeWidth={2.5} dot={(props) => <PrimaryDot cx={props.cx} cy={props.cy} payload={props.payload as IndustrialXbarRPoint | undefined} />} activeDot={{ r: 5 }} name="Subgroup Mean" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 30, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={chartTheme.grid} />
              <XAxis dataKey="time" tick={{ fill: chartTheme.muted, fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: chartTheme.muted, fontSize: 11 }} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              {rangeUcl != null && <ReferenceLine y={rangeUcl} stroke={chartTheme.danger} strokeDasharray="3 3" label={{ value: 'R UCL', fill: chartTheme.danger, fontSize: 11 }} />}
              {rangeLcl != null && <ReferenceLine y={rangeLcl} stroke={chartTheme.danger} strokeDasharray="3 3" label={{ value: 'R LCL', fill: chartTheme.danger, fontSize: 11 }} />}
              {rangeTarget != null && <ReferenceLine y={rangeTarget} stroke={chartTheme.cl} strokeDasharray="2 2" label={{ value: 'R̄', fill: chartTheme.cl, fontSize: 11 }} />}
              <Line type="monotone" dataKey="range" stroke={chartTheme.cl} strokeWidth={1.75} dot={(props) => <RangeDot cx={props.cx} cy={props.cy} payload={props.payload as IndustrialXbarRPoint | undefined} />} activeDot={{ r: 5 }} name="Subgroup Range" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
