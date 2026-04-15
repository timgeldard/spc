import { describe, it, expect } from 'vitest'
import { computeAnalytics } from '../computeAnalytics'
import type { ChartDataPoint, QuantChartType, RuleSet } from '../types'

describe('computeAnalytics', () => {
  const mockPoints: ChartDataPoint[] = [
    { batch_id: 'B1', batch_date: '2024-01-01', avg_result: 10, std_dev: 1, is_outlier: false, stratify_value: 'Plant A' },
    { batch_id: 'B2', batch_date: '2024-01-02', avg_result: 12, std_dev: 1, is_outlier: true, stratify_value: 'Plant B' },
    { batch_id: 'B3', batch_date: '2024-01-03', avg_result: 11, std_dev: 1, is_outlier: false, stratify_value: 'Plant A' },
  ]

  const defaultInput = {
    points: mockPoints,
    chartType: 'individuals' as QuantChartType,
    excludedIndices: [],
    ruleSet: 'nelson' as RuleSet,
    excludeOutliers: false,
    normality: null,
    stratifyBy: null,
    rollingWindowSize: 5,
    ewmaLambda: 0.2,
    ewmaL: 3,
    cusumK: 0.5,
    cusumH: 5,
  }

  it('computes basic SPC analytics', () => {
    const result = computeAnalytics(defaultInput)
    expect(result.spc).not.toBeNull()
    expect(result.spc?.filteredPointCount).toBe(3)
    expect(result.spc?.excludedPointCount).toBe(0)
  })

  it('handles empty points', () => {
    const result = computeAnalytics({ ...defaultInput, points: [] })
    expect(result.spc).toBeNull()
    expect(result.trendData).toEqual([])
    expect(result.stratumSections).toEqual([])
  })

  it('handles all excluded points', () => {
    const result = computeAnalytics({ ...defaultInput, excludedIndices: [0, 1, 2] })
    expect(result.spc).toBeNull()
  })

  it('excludes outliers when requested', () => {
    const result = computeAnalytics({ ...defaultInput, excludeOutliers: true })
    expect(result.spc?.filteredPointCount).toBe(2) // B1 and B3
    expect(result.spc?.excludedPointCount).toBe(1) // B2 is outlier
  })

  it('handles stratification', () => {
    const result = computeAnalytics({ ...defaultInput, stratifyBy: 'plant_id' })
    expect(result.stratumSections.length).toBe(2)
    expect(result.stratumSections[0].label).toBe('Plant A')
    expect(result.stratumSections[0].pointCount).toBe(2)
    expect(result.stratumSections[1].label).toBe('Plant B')
    expect(result.stratumSections[1].pointCount).toBe(1)
  })

  it('sorts stratum sections alphabetically', () => {
    const pointsWithMixedStratum: ChartDataPoint[] = [
      { batch_id: 'B1', batch_date: '2024-01-01', avg_result: 10, stratify_value: 'Z' },
      { batch_id: 'B2', batch_date: '2024-01-02', avg_result: 12, stratify_value: 'A' },
    ]
    const result = computeAnalytics({ ...defaultInput, points: pointsWithMixedStratum, stratifyBy: 'plant_id' })
    expect(result.stratumSections[0].label).toBe('A')
    expect(result.stratumSections[1].label).toBe('Z')
  })
})
