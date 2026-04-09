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
  return <circle cx={cx} cy={cy} r={5.5} fill="#da1e28" stroke="#ffffff" strokeWidth={1.6} />
}

export function PChart({ data, title = 'P Chart', embedded = false }: IndustrialPChartProps) {
  const header = (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.75rem' }}>
      {!embedded && <CardTitle>{title}</CardTitle>}
      <MetadataLabel>ATTRIBUTE PROPORTION</MetadataLabel>
    </div>
  )

  const chart = (
    <div style={{ height: '420px' }}>
      {embedded && <div style={{ marginBottom: '1rem' }}>{header}</div>}
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 20, right: 30, left: 8, bottom: 10 }}>
          <CartesianGrid vertical={false} stroke="#dde1e6" />
          <XAxis dataKey="time" tick={{ fill: '#697077', fontSize: 11 }} tickLine={false} />
          <YAxis tick={{ fill: '#697077', fontSize: 11 }} tickLine={false} />
          <Tooltip content={<CustomTooltip />} />
          {data.length > 0 && (
            <ReferenceLine
              y={data[0].centerLine}
              stroke="#697077"
              strokeDasharray="2 2"
              strokeWidth={2}
              label={{ value: 'p̄', fill: '#697077', fontSize: 11 }}
            />
          )}
          <Bar dataKey="proportion" name="Proportion" fill="#c1c7cd" radius={[10, 10, 0, 0]} />
          <Line type="monotone" dataKey="proportion" name="Observed p" stroke="#161616" strokeWidth={2.8} dot={(props) => <SignalDot cx={props.cx} cy={props.cy} payload={props.payload as IndustrialPChartPoint | undefined} />} activeDot={{ r: 6 }} />
          <Line type="monotone" dataKey="ucl" name="UCL" stroke="#da1e28" strokeDasharray="4 4" strokeWidth={2.4} dot={false} />
          <Line type="monotone" dataKey="lcl" name="LCL" stroke="#da1e28" strokeDasharray="4 4" strokeWidth={2.4} dot={false} />
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
