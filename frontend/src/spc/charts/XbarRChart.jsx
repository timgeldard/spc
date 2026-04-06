import XbarChart from './XbarChart.jsx'
import RangeChart from './RangeChart.jsx'
import { chartPairClass } from '../uiClasses.js'

export default function XbarRChart({ spc, signals, mrSignals, externalLimits }) {
  return (
    <div className={chartPairClass}>
      <XbarChart spc={spc} signals={signals} externalLimits={externalLimits} />
      <RangeChart spc={spc} mrSignals={mrSignals} externalUclR={externalLimits?.ucl_r} />
    </div>
  )
}
