import { useEffect, useState } from 'react'
import type { AttributeChartType } from '../charts/ChartSettingsRail'

interface AutoCleanLog {
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

export type { AutoCleanLog }

export interface ChartSettings {
  attrChartType: AttributeChartType
  setAttrChartType: (v: AttributeChartType) => void
  rollingWindowSize: number
  setRollingWindowSize: (v: number) => void
  autoCleanLog: AutoCleanLog | null
  setAutoCleanLog: (v: AutoCleanLog | null) => void
}

/**
 * Manages local UI state for the control charts view:
 * attribute chart type selection, rolling window size, and auto-clean log.
 */
export function useChartSettings(micId: string | null | undefined): ChartSettings {
  const [attrChartType, setAttrChartType] = useState<AttributeChartType>('p_chart')
  const [rollingWindowSize, setRollingWindowSize] = useState(20)
  const [autoCleanLog, setAutoCleanLog] = useState<AutoCleanLog | null>(null)

  // Reset attribute chart type when the selected MIC changes
  useEffect(() => {
    setAttrChartType('p_chart')
  }, [micId])

  return {
    attrChartType,
    setAttrChartType,
    rollingWindowSize,
    setRollingWindowSize,
    autoCleanLog,
    setAutoCleanLog,
  }
}
