import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CapabilityPanel from '../charts/CapabilityPanel'
import React from 'react'

// Mock sub-components
vi.mock('../charts/CapabilityHistogram', () => ({
  default: () => <div data-testid="capability-histogram" />
}))
vi.mock('../../components/charts/CapabilityPanel', () => ({
  CAPABILITY_TIERS: [
      { min: 1.67, label: 'Highly Capable', badgeLabel: 'Excellent', status: 'healthy' as const },
      { min: 1.33, label: 'Capable', badgeLabel: 'Capable', status: 'warning' as const },
      { min: 0, label: 'Not Capable', badgeLabel: 'Not Capable', status: 'critical' as const },
  ],
  CapabilityPanel: ({ cp, cpk, pp, ppk }: any) => (
      <div data-testid="industrial-capability-panel">
          <span data-testid="cp">{cp}</span>
          <span data-testid="cpk">{cpk}</span>
          <span data-testid="pp">{pp}</span>
          <span data-testid="ppk">{ppk}</span>
      </div>
  ),
  getCapabilityTier: (v: number) => {
    if (v >= 1.67) return { status: 'healthy' }
    if (v >= 1.33) return { status: 'warning' }
    return { status: 'critical' }
  }
}))

const mockSpc: any = {
  capability: {
    cp: 1.5,
    cpk: 1.4,
    pp: 1.2,
    ppk: 1.1,
    cpLower95: 1.4,
    cpUpper95: 1.6,
    cpkLower95: 1.3,
    cpkUpper95: 1.5,
    ppLower95: 1.1,
    ppUpper95: 1.3,
    ppkLower95: 1.0,
    ppkUpper95: 1.2,
    zScore: 4.2,
    dpmo: 15.3,
    spec_type: 'bilateral_symmetric',
    capabilityMethod: 'gaussian',
    isStable: true,
    normality: {
      is_normal: true,
      p_value: 0.5,
      method: 'shapiro'
    }
  },
  signals: [],
  mrSignals: [],
  data: []
}

describe('CapabilityPanel', () => {
  it('renders headline metrics when process is stable', () => {
    render(<CapabilityPanel spc={mockSpc} />)
    expect(screen.getByTestId('industrial-capability-panel')).toBeInTheDocument()
    expect(screen.getByTestId('cp')).toHaveTextContent('1.5')
    expect(screen.getByTestId('cpk')).toHaveTextContent('1.4')
  })

  it('suppresses capability metrics when process is unstable', () => {
    const unstableSpc = { 
      ...mockSpc, 
      signals: [{ type: 'rule1', index: 0 }],
      capability: { ...mockSpc.capability, isStable: false }
    }
    render(<CapabilityPanel spc={unstableSpc} />)
    expect(screen.queryByTestId('industrial-capability-panel')).not.toBeInTheDocument()
    expect(screen.getByText(/Process unstable/)).toBeInTheDocument()
  })

  it('allows overriding suppression', () => {
    const unstableSpc = { 
      ...mockSpc, 
      signals: [{ type: 'rule1', index: 0 }],
      capability: { ...mockSpc.capability, isStable: false }
    }
    render(<CapabilityPanel spc={unstableSpc} />)
    fireEvent.click(screen.getByText('Show capability anyway'))
    expect(screen.getByTestId('industrial-capability-panel')).toBeInTheDocument()
  })

  it('shows non-normal warning when normality is false', () => {
    const nonNormalSpc = { 
      ...mockSpc, 
      capability: { 
        ...mockSpc.capability, 
        normality: { is_normal: false, p_value: 0.01, method: 'shapiro' } 
      }
    }
    render(<CapabilityPanel spc={nonNormalSpc} />)
    expect(screen.getByText(/Non-normal distribution/)).toBeInTheDocument()
  })

  it('toggles detailed stats', () => {
      render(<CapabilityPanel spc={mockSpc} />)
      // Initially histogram is NOT showing (it's inside detailsOpen)
      expect(screen.queryByTestId('capability-histogram')).not.toBeInTheDocument()
      
      // Click toggle to open details
      fireEvent.click(screen.getByText('More capability stats'))
      
      // Now should show histogram (mocked) and cards
      expect(screen.getByTestId('capability-histogram')).toBeInTheDocument()
      expect(screen.getByText(/Z \(σ level\)/)).toBeInTheDocument()
      expect(screen.getByText('4.20')).toBeInTheDocument()
      expect(screen.getByText('DPMO')).toBeInTheDocument()
  })
})
