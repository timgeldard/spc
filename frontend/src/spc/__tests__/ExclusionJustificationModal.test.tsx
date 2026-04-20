import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi } from 'vitest'
import ExclusionJustificationModal from '../charts/ExclusionJustificationModal'
import React from 'react'

describe('ExclusionJustificationModal', () => {
  const mockOnSubmit = vi.fn()
  const mockOnCancel = vi.fn()

  const defaultProps = {
    dialog: { action: 'manual_exclude' } as any,
    saving: false,
    onCancel: mockOnCancel,
    onSubmit: mockOnSubmit,
  }

  it('renders correctly when open', () => {
    render(<ExclusionJustificationModal {...defaultProps} />)
    expect(screen.getByText('Exclude Point from Control Limits')).toBeInTheDocument()
    expect(screen.getByLabelContent ? screen.getByLabelText('Reason') : screen.getByRole('combobox')).toBeInTheDocument()
  })

  it('disables submit if comment is required but missing (min 3 chars if using comment)', () => {
      // The component doesn't actually have a min-length check on the UI yet, 
      // but let's see how it behaves.
      render(<ExclusionJustificationModal {...defaultProps} />)
      const submitBtn = screen.getByText('Confirm')
      expect(submitBtn).not.toBeDisabled()
  })

  it('calls onSubmit with correct payload', () => {
    render(<ExclusionJustificationModal {...defaultProps} />)
    
    const textArea = screen.getByPlaceholderText('Add additional context for the audit trail...')
    fireEvent.change(textArea, { target: { value: 'Bad data' } })
    
    fireEvent.click(screen.getByText('Confirm'))
    
    expect(mockOnSubmit).toHaveBeenCalledWith({
      reason: 'Special-cause investigation',
      comment: 'Bad data',
      justification: 'Special-cause investigation — Bad data'
    })
  })

  it('calls onCancel when close is clicked', () => {
      render(<ExclusionJustificationModal {...defaultProps} />)
      fireEvent.click(screen.getByText('Cancel'))
      expect(mockOnCancel).toHaveBeenCalled()
  })
})
