import XbarChart from './XbarChart'
import RangeChart from './RangeChart'
import { chartPairClass } from '../uiClasses'
import type { XbarRChartProps } from '../types'

export default function XbarRChart({ spc, signals = [], mrSignals = [], externalLimits }: XbarRChartProps) {
  return (
    <div className={chartPairClass}>
      <XbarChart spc={spc} signals={signals} externalLimits={externalLimits} />
      <RangeChart spc={spc} mrSignals={mrSignals} externalUclR={externalLimits?.ucl_r ?? null} />
    </div>
  )
}
