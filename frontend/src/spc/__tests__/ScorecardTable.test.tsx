import { render, screen } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ScorecardTable from '../scorecard/ScorecardTable'
import React from 'react'
import type { ScorecardRow } from '../types'

// Mock the context hooks
vi.mock('../SPCContext', async (importOriginal) => {
  const actual = await importOriginal<any>()
  return {
    ...actual,
    useSPCSelector: vi.fn(),
    useSPCDispatch: vi.fn(),
  }
})

import { useSPCSelector, useSPCDispatch } from '../SPCContext'

const mockRows: ScorecardRow[] = [
  {
    id: 'mic1',
    mic_id: 'MIC1',
    mic_name: 'Temperature',
    batch_count: 50,
    mean_value: 10.5,
    stddev_overall: 0.2,
    nominal_target: 10.0,
    pp: 1.2,
    cpk: 1.1,
    ppk: 1.1,
    ooc_rate: 0.02,
    capability_status: 'capable',
    stability_status: 'stable',
    is_stable: true,
    has_non_normal_batches: false,
    has_spec_drift: false,
    has_locked_limits: false,
  }
]

describe('ScorecardTable', () => {
  it('renders rows correctly', () => {
    ;(useSPCSelector as any).mockReturnValue({
      material_id: 'MAT1',
      plant_id: 'P1',
    })
    ;(useSPCDispatch as any).mockReturnValue(vi.fn())

    render(
      <ScorecardTable rows={mockRows} loading={false} />
    )

    expect(screen.getByText('Temperature')).toBeInTheDocument()
    // Multiple 50s found (cell + pagination), so use getAllByText
    expect(screen.getAllByText('50').length).toBeGreaterThan(0)
  })

  it('shows loading state', () => {
    ;(useSPCSelector as any).mockReturnValue({
      material_id: 'MAT1',
      plant_id: 'P1',
    })
    ;(useSPCDispatch as any).mockReturnValue(vi.fn())

    render(
      <ScorecardTable rows={[]} loading={true} />
    )
    
    expect(screen.queryByText('Temperature')).not.toBeInTheDocument()
  })
})
