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
  uclX?: number | null
  lclX?: number | null
}

interface IndustrialXbarRChartProps {
  data: IndustrialXbarRPoint[]
  ucl?: number | null
  lcl?: number | null
  target?: number | null
  rangeUcl?: number | null
  rangeTarget?: number | null
  title?: string
}

export function XbarRChart({
  data,
  ucl,
  lcl,
  target,
  rangeUcl,
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
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              {ucl != null && <ReferenceLine y={ucl} stroke="#e11d48" strokeDasharray="3 3" label={{ value: 'UCL', fill: '#e11d48', fontSize: 11 }} />}
              {lcl != null && <ReferenceLine y={lcl} stroke="#e11d48" strokeDasharray="3 3" label={{ value: 'LCL', fill: '#e11d48', fontSize: 11 }} />}
              {target != null && <ReferenceLine y={target} stroke="#64748b" strokeDasharray="2 2" label={{ value: 'Target', fill: '#64748b', fontSize: 11 }} />}
              <Line type="monotone" dataKey="xbar" stroke="#0f172a" strokeWidth={2.5} dot={false} activeDot={{ r: 5 }} name="Subgroup Mean" />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="h-[160px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data} margin={{ top: 8, right: 30, left: 8, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="#f1f5f9" />
              <XAxis dataKey="time" tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
              <YAxis tick={{ fill: '#64748b', fontSize: 11 }} tickLine={false} />
              <Tooltip content={<CustomTooltip />} />
              {rangeUcl != null && <ReferenceLine y={rangeUcl} stroke="#e11d48" strokeDasharray="3 3" label={{ value: 'R UCL', fill: '#e11d48', fontSize: 11 }} />}
              {rangeTarget != null && <ReferenceLine y={rangeTarget} stroke="#64748b" strokeDasharray="2 2" label={{ value: 'R̄', fill: '#64748b', fontSize: 11 }} />}
              <Line type="monotone" dataKey="range" stroke="#64748b" strokeWidth={1.75} dot={false} activeDot={{ r: 5 }} name="Subgroup Range" />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  )
}
