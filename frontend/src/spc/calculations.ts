import * as calculations from './calculations.runtime.js'
import type { ChartDataPoint, ControlLimits, IndexedChartPoint, NormalityResult, SPCComputationResult, SpecConfig } from './types'

export type { ChartDataPoint, ControlLimits, NormalityResult, SpecConfig }

export interface CapabilityResult extends ControlLimits {
  cp?: number | null
  cpk?: number | null
  pp?: number | null
  ppk?: number | null
  zScore?: number | null
  dpmo?: number | null
  spec_type?: string | null
  normality?: NormalityResult | null
  normalityWarning?: string | null
  specWarning?: string | null
}

export interface AutoCleanPhaseIResult {
  stable: boolean
  cleanedIndices: Set<number>
  iterationLog: Array<{
    iteration: number
    removedCount: number
    removedOriginalIndices: number[]
    ucl?: number | null
    cl?: number | null
    lcl?: number | null
  }>
}

export const mean: (values: number[]) => number | null = calculations.mean
export const stddevPop: (values: number[]) => number | null = calculations.stddevPop
export const stddevSample: (values: number[]) => number | null = calculations.stddevSample
export const stddevMSSD: (values: number[]) => number | null = calculations.stddevMSSD
const computeAllBridge = calculations.computeAll as unknown as (
  points: ChartDataPoint[],
  chartType: string,
  ruleSet?: 'weco' | 'nelson',
  options?: { normality?: NormalityResult | null },
) => SPCComputationResult
export const computeAll = computeAllBridge
export const autoCleanPhaseI = calculations.autoCleanPhaseI as unknown as (
  points: IndexedChartPoint[],
  chartType: string,
  ruleSet?: 'weco' | 'nelson',
  specConfig?: SpecConfig,
) => AutoCleanPhaseIResult
export const computeRollingCapability = calculations.computeRollingCapability as unknown as (
  sortedPoints: ChartDataPoint[],
  windowSize?: number,
  specConfig?: SpecConfig,
) => Array<Record<string, unknown>>
