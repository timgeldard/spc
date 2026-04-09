import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { Card, CardContent, CardHeader, CardTitle, MetadataLabel } from '../ui'
import { CustomTooltip } from './CustomTooltip'

export interface IndustrialPChartPoint {
  time: string
  proportion: number
  ucl: number
  lcl: number
  centerLine: number
  batchId?: string | null
  nInspected?: number
  nNonconforming?: number
  isSignal?: boolean
  signalSummary?: string | null
  detailSummary?: string | null
}

interface IndustrialPChartProps {
  data: IndustrialPChartPoint[]
  title?: string
  embedded?: boolean
}

function SignalDot(props: {
  cx?: number
  cy?: number
  payload?: IndustrialPChartPoint
}) {
  const { cx, cy, payload } = props
  if (cx == null || cy == null || !payload?.isSignal) return null
  return <circle cx={cx} cy={cy} r={5.5} fill="#dc2626" stroke="#ffffff" strokeWidth={1.6} />
}

export function PChart({ data, title = 'P Chart', embedded = false }: IndustrialPChartProps) {
  const header = (
    <div className="flex items-start justify-between">
      {!embedded && <CardTitle>{title}</CardTitle>}
      <MetadataLabel>ATTRIBUTE PROPORTION</MetadataLabel>
    </div>
  )

  const chart = (
    <div className="h-[420px]">
      {embedded && <div className="mb-4">{header}</div>}
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 20, right: 30, left: 8, bottom: 10 }}>
          <CartesianGrid vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          {data.length > 0 && (
            <ReferenceLine
              y={data[0].centerLine}
              stroke="#64748b"
              strokeDasharray="2 2"
              strokeWidth={2}
              label={{ value: 'p̄', fill: '#64748b', fontSize: 11 }}
            />
          )}
          <Bar dataKey="proportion" name="Proportion" fill="#cbd5e1" radius={[10, 10, 0, 0]} />
          <Line type="monotone" dataKey="proportion" name="Observed p" stroke="#0f172a" strokeWidth={2.8} dot={(props) => <SignalDot cx={props.cx} cy={props.cy} payload={props.payload as IndustrialPChartPoint | undefined} />} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="ucl" name="UCL" stroke="#e11d48" strokeDasharray="4 4" strokeWidth={2.4} dot={false} />
          <Line type="monotone" dataKey="lcl" name="LCL" stroke="#e11d48" strokeDasharray="4 4" strokeWidth={2.4} dot={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  )

  if (embedded) return chart

  return (
    <Card>
      <CardHeader>{header}</CardHeader>
      <CardContent>{chart}</CardContent>
    </Card>
  )
}
