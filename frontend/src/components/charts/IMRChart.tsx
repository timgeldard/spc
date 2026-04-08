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

function PrimaryDot(props: {
  cx?: number
  cy?: number
  payload?: IndustrialIMRPoint
}) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload) return null

  let fill = '#0f172a'
  let stroke = '#ffffff'
  let size = 4

  if (payload.isExcluded) {
    fill = '#94a3b8'
    size = 5
  } else if (payload.isOutlier) {
    fill = '#7c3aed'
    size = 6
  } else if (payload.isSignal) {
    fill = '#e11d48'
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
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              {ucl != null && <ReferenceLine y={ucl} stroke="#e11d48" strokeDasharray="3 3" label={{ value: 'UCL', fill: '#e11d48', fontSize: 11 }} />}
              {lcl != null && <ReferenceLine y={lcl} stroke="#e11d48" strokeDasharray="3 3" label={{ value: 'LCL', fill: '#e11d48', fontSize: 11 }} />}
              {target != null && <ReferenceLine y={target} stroke="#64748b" strokeDasharray="2 2" label={{ value: 'Target', fill: '#64748b', fontSize: 11 }} />}
              <Line
                type="monotone"
                dataKey="value"
                stroke="#0f172a"
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
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="mrTime" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              {mrUcl != null && <ReferenceLine y={mrUcl} stroke="#e11d48" strokeDasharray="3 3" label={{ value: 'MR UCL', fill: '#e11d48', fontSize: 11 }} />}
              {mrTarget != null && <ReferenceLine y={mrTarget} stroke="#64748b" strokeDasharray="2 2" label={{ value: 'MR̄', fill: '#64748b', fontSize: 11 }} />}
              <Line
                type="monotone"
                dataKey="mr"
                stroke="#64748b"
                strokeWidth={1.75}
                dot={false}
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
