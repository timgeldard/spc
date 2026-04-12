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

  it('SET_MATERIAL clears multivariate variable selections', () => {
    const next = reducer(
      { ...initialState, selectedMultivariateMicIds: ['TEMP', 'PRESS'] },
      { type: 'SET_MATERIAL', payload: { material_id: 'MAT-1', material_name: 'Material 1' } },
    )

    expect(next.selectedMultivariateMicIds).toEqual([])
  })

  it('SET_STRATIFY_BY clears exclusions', () => {
    const next = reducer(
      { ...initialState, excludedIndices: new Set([4, 5]) },
      { type: 'SET_STRATIFY_BY', payload: 'operation_id' },
    )

    expect([...next.excludedIndices]).toEqual([])
    expect(next.stratifyBy).toBe('operation_id')
  })

  it('SET_MULTIVARIATE_MIC_IDS stores the chosen multivariate variables', () => {
    const next = reducer(
      initialState,
      { type: 'SET_MULTIVARIATE_MIC_IDS', payload: ['TEMP', 'PRESS', 'FLOW'] },
    )

    expect(next.selectedMultivariateMicIds).toEqual(['TEMP', 'PRESS', 'FLOW'])
  })
})
