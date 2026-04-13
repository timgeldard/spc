import { useState } from 'react'
import { calculateMSA } from '../../api/spc'
import type { MSAResult } from '../types'

interface UseMSACalculateResult {
  calculating: boolean
  error: string | null
  runCalculation: (
    measurementData: Array<Array<Array<number | null>>>,
    tolerance: number,
    method: 'average_range' | 'anova',
  ) => Promise<MSAResult>
}

export function useMSACalculate(): UseMSACalculateResult {
  const [calculating, setCalculating] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const runCalculation = async (
    measurementData: Array<Array<Array<number | null>>>,
    tolerance: number,
    method: 'average_range' | 'anova',
  ): Promise<MSAResult> => {
    setCalculating(true)
    setError(null)
    try {
      return await calculateMSA(measurementData, tolerance, method)
    } catch (error) {
      const message = error instanceof Error ? error.message : 'MSA calculation failed.'
      setError(message)
      return { error: message }
    } finally {
      setCalculating(false)
    }
  }

  return { calculating, error, runCalculation }
}
