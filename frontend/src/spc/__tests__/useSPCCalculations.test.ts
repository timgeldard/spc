import { renderHook } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import { useSPCCalculations } from '../hooks/useSPCCalculations'
import React from 'react'

// Mock context and hooks
vi.mock('../SPCContext', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    useSPCSelector: vi.fn(),
  }
})

describe('useSPCCalculations', () => {
  it('returns null when data is missing', () => {
    const { result } = renderHook(() => useSPCCalculations(
        [],
        'imr',
        new Set()
    ))

    expect(result.current).toBeNull()
  })

  it('calculates SPC correctly for sample data', () => {
      const samplePoints = [
          { value: 10, timestamp: '2026-04-01', batch_seq: 1, sample_seq: 1 },
          { value: 10.2, timestamp: '2026-04-01', batch_seq: 2, sample_seq: 1 },
          { value: 9.8, timestamp: '2026-04-01', batch_seq: 3, sample_seq: 1 }
      ]
  
      const { result } = renderHook(() => useSPCCalculations(
          samplePoints as any,
          'imr',
          new Set(),
          'nelson'
      ))
  
      expect(result.current).not.toBeNull()
      // For IMR, the grand mean is in imr.xBar
      expect(result.current?.imr?.xBar).toBe(10.0)
  })
})
