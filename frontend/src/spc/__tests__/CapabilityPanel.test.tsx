import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import CapabilityPanel from '../charts/CapabilityPanel'
import React from 'react'

// Mock sub-components
vi.mock('./CapabilityHistogram', () => ({
  default: () => <div data-testid="capability-histogram" />
}))

vi.mock('../../components/charts/CapabilityPanel', () => ({
  CAPABILITY_TIERS: {
      HEALTHY: 'healthy',
      WARNING: 'warning',
      CRITICAL: 'critical'
  },
  CapabilityPanel: ({ cp, cpk, pp, ppk }: any) => (
      <div data-testid="industrial-capability-panel">
          <span data-testid="cp">{cp}</span>
          <span data-testid="cpk">{cpk}</span>
          <span data-testid="pp">{pp}</span>
          <span data-testid="ppk">{ppk}</span>
      </div>
  ),
  getCapabilityTier: () => 'healthy'
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
    dpmo: 63,
    spec_type: 'bilateral_symmetric',
    normality: { is_normal: true, p_value: 0.8 },
    capabilityMethod: 'parametric',
    isStable: true,
  },
  signals: [],
  mrSignals: []
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
        capability: { ...mockSpc.capability, isStable: false, instabilityReason: 'Out of control' },
        signals: [{ rule: 1, indices: [0] }]
    }
    render(<CapabilityPanel spc={unstableSpc} />)
    expect(screen.getByText('Capability indices suppressed')).toBeInTheDocument()
    expect(screen.getByText(/Out of control/)).toBeInTheDocument()
    expect(screen.queryByTestId('industrial-capability-panel')).not.toBeInTheDocument()
  })

  it('allows overriding suppression', () => {
    const unstableSpc = {
        ...mockSpc,
        capability: { ...mockSpc.capability, isStable: false },
        signals: [{ rule: 1, indices: [0] }]
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
            normality: { is_normal: false, p_value: 0.01 },
            capabilityMethod: 'non_parametric'
        }
    }
    render(<CapabilityPanel spc={nonNormalSpc} />)
    expect(screen.getByText(/Non-normal distribution/)).toBeInTheDocument()
    expect(screen.getByText(/Shapiro-Wilk p=0.0100/)).toBeInTheDocument()
  })

  it('toggles detailed stats', () => {
    render(<CapabilityPanel spc={mockSpc} />)
    const toggle = screen.getByText('More capability stats')
    fireEvent.click(toggle)
    expect(screen.getByText('Potential Capability (Cp)')).toBeInTheDocument()
    expect(screen.getByText('4.2')).toBeInTheDocument() // Z-score
  })
})
