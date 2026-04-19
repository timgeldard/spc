import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import SPCFilterBar from '../SPCFilterBar'
import type { SPCState } from '../types'

let mockState: Pick<
  SPCState,
  | 'selectedMaterial'
  | 'selectedPlant'
  | 'selectedMIC'
  | 'selectedMultivariateMicIds'
  | 'processFlowUpstreamDepth'
  | 'processFlowDownstreamDepth'
  | 'dateFrom'
  | 'dateTo'
  | 'stratifyBy'
>

const dispatch = vi.fn()

vi.mock('../SPCContext', () => ({
  shallowEqual: (a: unknown, b: unknown) => a === b,
  useSPCDispatch: () => dispatch,
  useSPCSelector: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}))

vi.mock('../hooks/useMaterials', () => ({
  useValidateMaterial: () => ({
    validateMaterial: vi.fn(),
    clearError: vi.fn(),
    validating: false,
    error: null,
  }),
}))

vi.mock('../hooks/usePlants', () => ({
  usePlants: () => ({
    plants: [
      { plant_id: 'PLANT-1', plant_name: 'Plant 1' },
      { plant_id: 'PLANT-2', plant_name: 'Plant 2' },
    ],
    loading: false,
  }),
}))

vi.mock('../hooks/useCharacteristics', () => ({
  useCharacteristics: () => ({
    characteristics: [
      { mic_id: 'MIC-1', mic_name: 'Moisture', chart_type: 'imr', operation_id: 'OP-1' },
      { mic_id: 'MIC-2', mic_name: 'Temperature', chart_type: 'imr', operation_id: 'OP-2' },
    ],
    attrCharacteristics: [],
    loading: false,
  }),
}))

vi.mock('../hooks/useRecentMaterials', () => ({
  getRecentMaterials: () => [],
  addRecentMaterial: vi.fn(),
}))

vi.mock('../components/FieldHelp', () => ({
  default: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('@carbon/icons-react/es/Edit.js', () => ({ default: () => null }))
vi.mock('@carbon/icons-react/es/Filter.js', () => ({ default: () => null }))

vi.mock('~/lib/carbon-layout', () => ({
  Stack: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Tag: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  Tile: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}))

vi.mock('~/lib/carbon-forms', () => {
  const Select = ({
    id,
    labelText,
    value,
    onChange,
    children,
    disabled,
  }: {
    id: string
    labelText: string
    value?: string
    onChange?: React.ChangeEventHandler<HTMLSelectElement>
    children: React.ReactNode
    disabled?: boolean
  }) => (
    <label htmlFor={id}>
      {labelText}
      <select id={id} aria-label={labelText} value={value ?? ''} onChange={onChange} disabled={disabled}>
        {children}
      </select>
    </label>
  )

  const SelectItem = ({ value, text }: { value: string; text: string }) => (
    <option value={value}>{text}</option>
  )

  const Button = ({
    children,
    onClick,
    disabled,
  }: {
    children: React.ReactNode
    onClick?: () => void
    disabled?: boolean
  }) => (
    <button type="button" onClick={onClick} disabled={disabled}>
      {children}
    </button>
  )

  const TextInput = ({
    id,
    labelText,
    value,
    onChange,
    onKeyDown,
    placeholder,
  }: {
    id: string
    labelText: string
    value?: string
    onChange?: React.ChangeEventHandler<HTMLInputElement>
    onKeyDown?: React.KeyboardEventHandler<HTMLInputElement>
    placeholder?: string
  }) => (
    <label htmlFor={id}>
      {labelText}
      <input
        id={id}
        aria-label={labelText}
        value={value ?? ''}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
      />
    </label>
  )

  const Search = ({
    id,
    labelText,
    value,
    onChange,
    placeHolderText,
  }: {
    id: string
    labelText: string
    value?: string
    onChange?: React.ChangeEventHandler<HTMLInputElement>
    placeHolderText?: string
  }) => (
    <label htmlFor={id}>
      {labelText}
      <input
        id={id}
        aria-label={labelText}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeHolderText}
      />
    </label>
  )

  const Checkbox = ({
    id,
    labelText,
    checked,
    disabled,
    onChange,
  }: {
    id: string
    labelText: string
    checked?: boolean
    disabled?: boolean
    onChange?: (_event: React.ChangeEvent<HTMLInputElement>, state: { checked: boolean }) => void
  }) => (
    <label htmlFor={id}>
      {labelText}
      <input
        id={id}
        type="checkbox"
        aria-label={labelText}
        checked={Boolean(checked)}
        disabled={disabled}
        onChange={event => onChange?.(event, { checked: event.target.checked })}
      />
    </label>
  )

  const DatePickerInput = ({
    id,
    labelText,
    value,
    onChange,
    placeholder,
  }: {
    id: string
    labelText: string
    value?: string
    onChange?: React.ChangeEventHandler<HTMLInputElement>
    placeholder?: string
  }) => (
    <label htmlFor={id}>
      {labelText}
      <input
        id={id}
        aria-label={labelText}
        value={value ?? ''}
        onChange={onChange}
        placeholder={placeholder}
      />
    </label>
  )

  const DatePicker = ({
    value,
    onChange,
    children,
  }: {
    value?: string
    onChange?: (dates: Date[]) => void
    children: React.ReactElement
  }) =>
    React.cloneElement(children, {
      value: value ?? '',
      onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextValue = event.target.value
        onChange?.(nextValue ? [new Date(`${nextValue}T00:00:00`)] : [])
      },
    })

  return { Button, Checkbox, DatePicker, DatePickerInput, Search, Select, SelectItem, TextInput }
})

describe('SPCFilterBar', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    dispatch.mockReset()
    mockState = {
      selectedMaterial: { material_id: 'MAT-1', material_name: 'Material 1' },
      selectedPlant: { plant_id: 'PLANT-1', plant_name: 'Plant 1' },
      selectedMIC: null,
      selectedMultivariateMicIds: [],
      processFlowUpstreamDepth: 4,
      processFlowDownstreamDepth: 3,
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      stratifyBy: null,
    }
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  it('debounces plant selection changes before dispatching', () => {
    render(<SPCFilterBar embedded />)
    dispatch.mockClear()

    fireEvent.change(screen.getByLabelText('Plant'), { target: { value: 'PLANT-2' } })

    expect(dispatch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(299)
    expect(dispatch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_PLANT',
      payload: { plant_id: 'PLANT-2', plant_name: 'Plant 2' },
    })
  })

  it('debounces date changes before dispatching', () => {
    render(<SPCFilterBar embedded />)
    dispatch.mockClear()

    fireEvent.change(screen.getByLabelText('From'), { target: { value: '2026-02-01' } })

    expect(dispatch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(299)
    expect(dispatch).not.toHaveBeenCalled()

    vi.advanceTimersByTime(1)
    expect(dispatch).toHaveBeenCalledWith({
      type: 'SET_DATE_FROM',
      payload: '2026-02-01',
    })
  })

  it('filters the MIC options with the search box', () => {
    render(<SPCFilterBar embedded />)

    fireEvent.change(screen.getByLabelText('Filter characteristics'), { target: { value: 'temp' } })

    expect(screen.getByRole('option', { name: /temperature/i })).toBeInTheDocument()
    expect(screen.queryByRole('option', { name: /moisture/i })).not.toBeInTheDocument()
  })
})
