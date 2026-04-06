import ReactEChartsCore from 'echarts-for-react/lib/core'
import { echarts } from './echartsCore'

type EChartProps = React.ComponentProps<typeof ReactEChartsCore>

export default function EChart(props: EChartProps) {
  return <ReactEChartsCore echarts={echarts} {...props} />
}
