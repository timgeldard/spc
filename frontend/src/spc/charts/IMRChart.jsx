import IndividualsChart from './IndividualsChart.jsx'
import MovingRangeChart from './MovingRangeChart.jsx'

export default function IMRChart({ spc, indexedPoints, signals, mrSignals, excludedIndices, onPointClick, externalLimits }) {
  return (
    <div className="spc-chart-pair">
      <IndividualsChart
        spc={spc}
        indexedPoints={indexedPoints}
        signals={signals}
        excludedIndices={excludedIndices}
        onPointClick={onPointClick}
        externalLimits={externalLimits}
      />
      <MovingRangeChart
        spc={spc}
        indexedPoints={indexedPoints}
        mrSignals={mrSignals}
        externalUclMr={externalLimits?.ucl_r}
      />
    </div>
  )
}
