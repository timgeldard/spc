import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import ModuleEmptyState from '../components/ModuleEmptyState'

describe('ModuleEmptyState', () => {
  it('renders title and description', () => {
    render(
      <ModuleEmptyState
        title="No data found"
        description="Try a different date range."
      />
    )
    expect(screen.getByText('No data found')).toBeInTheDocument()
    expect(screen.getByText('Try a different date range.')).toBeInTheDocument()
  })

  it('renders icon when provided', () => {
    render(<ModuleEmptyState icon="⬡" title="Empty" />)
    expect(screen.getByText('⬡')).toBeInTheDocument()
  })

  it('does not render icon when not provided', () => {
    render(<ModuleEmptyState title="Empty" />)
    // Icon is only rendered when the `icon` prop is provided
    expect(screen.queryByText('⬡')).toBeNull()
  })

  it('renders action button when action prop is provided', async () => {
    const handleClick = vi.fn()
    render(
      <ModuleEmptyState
        title="Empty"
        action={<button onClick={handleClick}>Retry</button>}
      />
    )
    const btn = screen.getByRole('button', { name: 'Retry' })
    expect(btn).toBeInTheDocument()
    await userEvent.click(btn)
    expect(handleClick).toHaveBeenCalledOnce()
  })

  it('does not render action button when action prop is absent', () => {
    render(<ModuleEmptyState title="Empty" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
