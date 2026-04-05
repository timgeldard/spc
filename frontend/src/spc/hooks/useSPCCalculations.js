import { useMemo } from 'react'
import { computeAll } from '../calculations.js'

/**
 * Wraps the pure SPC calculations in a memoized hook.
 * Persisted/manual exclusions are removed from the dataset before computing
 * limits and capability so the rendered state always reflects the filtered set.
 *
 * @param {Array} points              - raw points from useSPCChartData
 * @param {'imr'|'xbar_r'} chartType
 * @param {Set<number>} excludedIndices - 0-based indices to exclude from limit calc
 * @param {'weco'|'nelson'} ruleSet   - which out-of-control rule set to apply
 * @param {object|null} normality    - backend-provided normality metadata for the selected dataset
 * @returns {object} Full SPC computation result from computeAll()
 */
export function useSPCCalculations(points, chartType, excludedIndices, ruleSet = 'weco', excludeOutliers = false, normality = null) {
  // Convert the Set to a stable string so useMemo compares by content, not by reference.
  // A new Set object is created on every dispatch even if contents are unchanged,
  // which would defeat memoization if used directly in the dependency array.
  const excludedKey = [...(excludedIndices ?? [])].sort((a, b) => a - b).join(',')

  return useMemo(() => {
    if (!points || points.length === 0) return null

    const effectiveExclusions = new Set(excludedIndices)
    if (excludeOutliers) {
      points.forEach((pt, i) => {
        if (pt.is_outlier) effectiveExclusions.add(i)
      })
    }

    const activePoints = points.filter((_, i) => !effectiveExclusions.has(i))
    const result = computeAll(activePoints, chartType, ruleSet, { normality })
    result.filteredPointCount = activePoints.length
    result.excludedPointCount = effectiveExclusions.size

    result.indexedPoints = points.map((p, i) => ({
      ...p,
      originalIndex: i,
      excluded: effectiveExclusions.has(i),
    }))

    return result
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [points, chartType, excludedKey, ruleSet, excludeOutliers, normality])
}
