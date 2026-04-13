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
  ewmaLambda: number
  setEwmaLambda: (v: number) => void
  ewmaL: number
  setEwmaL: (v: number) => void
  cusumK: number
  setCusumK: (v: number) => void
  cusumH: number
  setCusumH: (v: number) => void
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
  const [ewmaLambda, setEwmaLambda] = useState(0.2)
  const [ewmaL, setEwmaL] = useState(3)
  const [cusumK, setCusumK] = useState(0.5)
  const [cusumH, setCusumH] = useState(5)
  const [rollingWindowSize, setRollingWindowSize] = useState(20)
  const [autoCleanLog, setAutoCleanLog] = useState<AutoCleanLog | null>(null)

  // Reset attribute chart type when the selected MIC changes
  useEffect(() => {
    setAttrChartType('p_chart')
    setEwmaLambda(0.2)
    setEwmaL(3)
    setCusumK(0.5)
    setCusumH(5)
  }, [micId])

  return {
    attrChartType,
    setAttrChartType,
    ewmaLambda,
    setEwmaLambda,
    ewmaL,
    setEwmaL,
    cusumK,
    setCusumK,
    cusumH,
    setCusumH,
    rollingWindowSize,
    setRollingWindowSize,
    autoCleanLog,
    setAutoCleanLog,
  }
}
