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
}

interface IndustrialPChartProps {
  data: IndustrialPChartPoint[]
  title?: string
}

export function PChart({ data, title = 'P Chart' }: IndustrialPChartProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between">
          <CardTitle>{title}</CardTitle>
          <MetadataLabel>ATTRIBUTE PROPORTION</MetadataLabel>
        </div>
      </CardHeader>
      <CardContent className="h-[420px]">
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
                label={{ value: 'p̄', fill: '#64748b', fontSize: 11 }}
              />
            )}
            <Bar dataKey="proportion" name="Proportion" fill="#cbd5e1" radius={[10, 10, 0, 0]} />
            <Line type="monotone" dataKey="proportion" name="Observed p" stroke="#0f172a" strokeWidth={2.5} dot={false} />
            <Line type="monotone" dataKey="ucl" name="UCL" stroke="#e11d48" strokeDasharray="3 3" strokeWidth={1.5} dot={false} />
            <Line type="monotone" dataKey="lcl" name="LCL" stroke="#e11d48" strokeDasharray="3 3" strokeWidth={1.5} dot={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </CardContent>
    </Card>
  )
}
