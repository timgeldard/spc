import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import InfoBanner from '../components/InfoBanner'

describe('InfoBanner', () => {
  it('renders children', () => {
    render(<InfoBanner>Test message</InfoBanner>)
    expect(screen.getByText('Test message')).toBeInTheDocument()
  })

  it('variant=error uses role=alert for immediate announcement', () => {
    render(<InfoBanner variant="error">Error text</InfoBanner>)
    const el = screen.getByRole('alert')
    expect(el).toBeInTheDocument()
    expect(el).toHaveTextContent('Error text')
  })

  it('variant=warn uses role=status', () => {
    render(<InfoBanner variant="warn">Warning text</InfoBanner>)
    const el = screen.getByRole('status')
    expect(el).toBeInTheDocument()
  })

  it('variant=info uses role=status', () => {
    render(<InfoBanner variant="info">Info text</InfoBanner>)
    expect(screen.getByRole('status')).toBeInTheDocument()
  })

  it('default neutral variant renders without throwing', () => {
    render(<InfoBanner>Neutral</InfoBanner>)
    expect(screen.getByText('Neutral')).toBeInTheDocument()
  })
})
