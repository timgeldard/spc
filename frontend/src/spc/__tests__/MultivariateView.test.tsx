import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import MultivariateView from '../multivariate/MultivariateView'
import type { MultivariateResult, SPCState } from '../types'

let mockState: Pick<SPCState, 'selectedMaterial' | 'selectedPlant' | 'dateFrom' | 'dateTo' | 'selectedMultivariateMicIds'>
const fetchMultivariate = vi.fn()
const clear = vi.fn()

const mockResult: MultivariateResult = {
  material_id: 'MAT-1',
  plant_id: 'PLANT-1',
  date_from: '2026-01-01',
  date_to: '2026-01-31',
  variables: [
    { mic_id: 'TEMP', mic_name: 'Temperature' },
    { mic_id: 'PRESS', mic_name: 'Pressure' },
  ],
  ucl: 5.4321,
  alpha: 0.0027,
  n_observations: 12,
  n_variables: 2,
  excluded_incomplete_batches: 1,
  points: [
    {
      index: 0,
      batch_id: 'B1',
      batch_date: '2026-01-02',
      t2: 7.25,
      is_anomaly: true,
      top_contributors: [
        { mic_id: 'TEMP', mic_name: 'Temperature', contribution: 1.5, share_abs: 0.6, value: 42 },
        { mic_id: 'PRESS', mic_name: 'Pressure', contribution: -1.0, share_abs: 0.4, value: 11 },
      ],
      contributions: [
        { mic_id: 'TEMP', mic_name: 'Temperature', contribution: 1.5, share_abs: 0.6, value: 42 },
        { mic_id: 'PRESS', mic_name: 'Pressure', contribution: -1.0, share_abs: 0.4, value: 11 },
      ],
      values: { TEMP: 42, PRESS: 11 },
    },
    {
      index: 1,
      batch_id: 'B2',
      batch_date: '2026-01-03',
      t2: 3.11,
      is_anomaly: false,
      top_contributors: [
        { mic_id: 'PRESS', mic_name: 'Pressure', contribution: 0.75, share_abs: 0.55, value: 13 },
        { mic_id: 'TEMP', mic_name: 'Temperature', contribution: -0.61, share_abs: 0.45, value: 39 },
      ],
      contributions: [
        { mic_id: 'PRESS', mic_name: 'Pressure', contribution: 0.75, share_abs: 0.55, value: 13 },
        { mic_id: 'TEMP', mic_name: 'Temperature', contribution: -0.61, share_abs: 0.45, value: 39 },
      ],
      values: { TEMP: 39, PRESS: 13 },
    },
  ],
  anomalies: [
    {
      index: 0,
      batch_id: 'B1',
      batch_date: '2026-01-02',
      t2: 7.25,
      summary: 'Temperature and pressure moved together outside the multivariate limit.',
      top_contributors: [
        { mic_id: 'TEMP', mic_name: 'Temperature', contribution: 1.5, share_abs: 0.6, value: 42 },
      ],
    },
    {
      index: 1,
      batch_id: 'B2',
      batch_date: '2026-01-03',
      t2: 6.12,
      summary: 'Pressure drift dominated the excursion.',
      top_contributors: [
        { mic_id: 'PRESS', mic_name: 'Pressure', contribution: 0.75, share_abs: 0.55, value: 13 },
      ],
    },
  ],
  correlation: {
    mics: [
      { mic_id: 'TEMP', mic_name: 'Temperature' },
      { mic_id: 'PRESS', mic_name: 'Pressure' },
    ],
    pairs: [
      { mic_a_id: 'TEMP', mic_b_id: 'PRESS', mic_a_name: 'Temperature', mic_b_name: 'Pressure', pearson_r: 0.81, n: 12 },
    ],
  },
}

vi.mock('../SPCContext', () => ({
  shallowEqual: (a: unknown, b: unknown) => a === b,
  useSPCSelector: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}))

vi.mock('../hooks/useMultivariate', () => ({
  useMultivariate: () => ({
    result: mockResult,
    loading: false,
    error: null,
    fetchMultivariate,
    clear,
  }),
}))

vi.mock('../charts/EChart', () => ({
  default: ({ ariaLabel }: { ariaLabel?: string }) => <div aria-label={ariaLabel ?? 'chart'}>chart</div>,
}))

vi.mock('../charts/CorrelationMatrix', () => ({
  default: () => <div data-testid="correlation-matrix">correlation-matrix</div>,
}))

describe('MultivariateView', () => {
  beforeEach(() => {
    fetchMultivariate.mockReset()
    clear.mockReset()
    mockState = {
      selectedMaterial: { material_id: 'MAT-1', material_name: 'Material 1' },
      selectedPlant: { plant_id: 'PLANT-1', plant_name: 'Plant 1' },
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      selectedMultivariateMicIds: ['TEMP', 'PRESS'],
    }
  })

  it('runs multivariate SPC for the current scope', async () => {
    const user = userEvent.setup()
    render(<MultivariateView />)

    await user.click(screen.getByRole('button', { name: /run multivariate spc/i }))

    expect(fetchMultivariate).toHaveBeenCalledWith({
      materialId: 'MAT-1',
      micIds: ['TEMP', 'PRESS'],
      plantId: 'PLANT-1',
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
    })
  })

  it('updates selected batch detail when an anomaly summary is clicked', async () => {
    const user = userEvent.setup()
    render(<MultivariateView />)

    expect(screen.getByText(/temperature and pressure moved together outside the multivariate limit/i)).toBeInTheDocument()
    expect(screen.getByText(/above multivariate limit/i)).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /2026-01-03/i }))

    expect(screen.getByText(/pressure drift dominated the excursion/i)).toBeInTheDocument()
    expect(screen.getByText(/within multivariate control/i)).toBeInTheDocument()
  })
})
