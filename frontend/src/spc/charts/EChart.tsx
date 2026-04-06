import type { ComponentProps } from 'react'
import ReactEChartsCore from 'echarts-for-react/lib/core'
import { echarts } from './echartsCore'

type BaseProps = ComponentProps<typeof ReactEChartsCore>

interface EChartProps extends BaseProps {
  ariaLabel?: string
}

export default function EChart({ ariaLabel, ...props }: EChartProps) {
  return (
    <div role="img" aria-label={ariaLabel}>
      <ReactEChartsCore echarts={echarts} {...props} />
    </div>
  )
}
