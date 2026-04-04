import XbarChart from './XbarChart.jsx'
import RangeChart from './RangeChart.jsx'

export default function XbarRChart({ spc, signals, mrSignals, externalLimits }) {
  return (
    <div className="spc-chart-pair">
      <XbarChart spc={spc} signals={signals} externalLimits={externalLimits} />
      <RangeChart spc={spc} mrSignals={mrSignals} externalUclR={externalLimits?.ucl_r} />
    </div>
  )
}
