import IndividualsChart from './IndividualsChart'
import MovingRangeChart from './MovingRangeChart'
import { chartPairClass } from '../uiClasses'
import type { IMRChartProps } from '../types'

export default function IMRChart({
  spc,
  indexedPoints = [],
  signals = [],
  mrSignals = [],
  excludedIndices,
  onPointClick,
  externalLimits,
}: IMRChartProps) {
  return (
    <div className={chartPairClass}>
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
