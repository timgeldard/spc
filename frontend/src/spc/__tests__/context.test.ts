import { describe, expect, it } from 'vitest'

import { initialState, reducer } from '../SPCContext'


describe('SPC reducer', () => {
  it('SET_MATERIAL clears exclusions, chart override, and exclusion audit', () => {
    const next = reducer(
      {
        ...initialState,
        excludedIndices: new Set([1, 2]),
        chartTypeOverride: 'xbar_r',
        exclusionAudit: { excluded_count: 2 },
      },
      { type: 'SET_MATERIAL', payload: { material_id: 'MAT-1', material_name: 'Material 1' } },
    )

    expect([...next.excludedIndices]).toEqual([])
    expect(next.chartTypeOverride).toBeNull()
    expect(next.exclusionAudit).toBeNull()
  })

  it('SET_DATE_FROM clears excluded indices', () => {
    const next = reducer(
      { ...initialState, excludedIndices: new Set([3]) },
      { type: 'SET_DATE_FROM', payload: '2026-01-01' },
    )

    expect([...next.excludedIndices]).toEqual([])
    expect(next.dateFrom).toBe('2026-01-01')
  })

  it('SET_STRATIFY_BY clears exclusions', () => {
    const next = reducer(
      { ...initialState, excludedIndices: new Set([4, 5]) },
      { type: 'SET_STRATIFY_BY', payload: 'operation_id' },
    )

    expect([...next.excludedIndices]).toEqual([])
    expect(next.stratifyBy).toBe('operation_id')
  })
})
