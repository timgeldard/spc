import { describe, expect, it } from 'vitest'

import {
  getLimitsSnapshot,
  mapExcludedPointsToIndices,
  recomputeForExcludedSet,
  toExcludedPoints,
} from '../exclusions.js'

describe('SPC exclusions helpers', () => {
  const points = [
    { batch_id: 'B1', batch_seq: 1, sample_seq: 1, batch_date: '2024-01-01', plant_id: 'P1', value: 10 },
    { batch_id: 'B1', batch_seq: 1, sample_seq: 2, batch_date: '2024-01-01', plant_id: 'P1', value: 14 },
    { batch_id: 'B2', batch_seq: 2, sample_seq: 1, batch_date: '2024-01-02', plant_id: 'P1', value: 10 },
    { batch_id: 'B2', batch_seq: 2, sample_seq: 2, batch_date: '2024-01-02', plant_id: 'P1', value: 10 },
  ]

  it('serializes excluded points with stable chart identifiers', () => {
    const excluded = toExcludedPoints(points, new Set([1, 3]))
    expect(excluded).toEqual([
      expect.objectContaining({ batch_id: 'B1', sample_seq: 2, original_index: 1 }),
      expect.objectContaining({ batch_id: 'B2', sample_seq: 2, original_index: 3 }),
    ])
  })

  it('maps persisted exclusions back to current point indices', () => {
    const excludedPoints = [
      { batch_id: 'B2', sample_seq: 2, plant_id: 'P1' },
      { batch_id: 'B1', sample_seq: 1, plant_id: 'P1' },
    ]
    expect(mapExcludedPointsToIndices(points, excludedPoints)).toEqual([3, 0])
  })

  it('recomputes control limits on the filtered point set', () => {
    const baseline = recomputeForExcludedSet(points, new Set(), 'imr', 'weco')
    const filtered = recomputeForExcludedSet(points, new Set([1]), 'imr', 'weco')

    expect(filtered.values).toHaveLength(3)
    expect(filtered.imr.xBar).not.toBe(baseline.imr.xBar)
  })

  it('extracts a persistable limits snapshot from an SPC result', () => {
    const spc = recomputeForExcludedSet(points, new Set([1]), 'imr', 'weco')
    expect(getLimitsSnapshot(spc)).toEqual(
      expect.objectContaining({
        cl: expect.any(Number),
        ucl: expect.any(Number),
        lcl: expect.any(Number),
        point_count: 3,
      }),
    )
  })
})
