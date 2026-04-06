import { useMemo } from 'react'
import { computeAll } from '../calculations'
import type { ChartDataPoint, NormalityResult } from '../types'

export function useSPCCalculations(
  points: ChartDataPoint[],
  chartType: 'imr' | 'xbar_r' | string,
  excludedIndices: Set<number>,
  ruleSet: 'weco' | 'nelson' = 'weco',
  excludeOutliers = false,
  normality: NormalityResult | null = null,
) {
  const excludedKey = [...(excludedIndices ?? [])].sort((a, b) => a - b).join(',')

  return useMemo(() => {
    if (!points || points.length === 0) return null

    const effectiveExclusions = new Set<number>(excludedIndices)
    if (excludeOutliers) {
      points.forEach((pt, i) => {
        if (pt.is_outlier) effectiveExclusions.add(i)
      })
    }

    const activePoints = points.filter((_, i) => !effectiveExclusions.has(i))
    const result = computeAll(activePoints, chartType, ruleSet, { normality })
    result.filteredPointCount = activePoints.length
    result.excludedPointCount = effectiveExclusions.size

    result.indexedPoints = points.map((point, i) => ({
      ...point,
      originalIndex: i,
      excluded: effectiveExclusions.has(i),
    }))

    return result
  }, [points, chartType, excludedKey, ruleSet, excludeOutliers, normality])
}

