import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import ControlChartsView from '../charts/ControlChartsView'
import type { SPCState } from '../types'

let mockState: Pick<
  SPCState,
  | 'selectedMaterial'
  | 'selectedMIC'
  | 'selectedPlant'
  | 'dateFrom'
  | 'dateTo'
  | 'excludedIndices'
  | 'exclusionDialog'
  | 'exclusionAudit'
  | 'chartTypeOverride'
  | 'excludeOutliers'
  | 'limitsMode'
  | 'roleMode'
  | 'ruleSet'
  | 'stratifyBy'
>

const dispatch = vi.fn()

vi.mock('../SPCContext', () => ({
  shallowEqual: (a: unknown, b: unknown) => a === b,
  useSPCDispatch: () => dispatch,
  useSPCSelector: (selector: (state: typeof mockState) => unknown) => selector(mockState),
}))

vi.mock('../hooks/useDataQuality', () => ({
  useDataQuality: () => ({
    summary: null,
    loading: false,
    error: null,
  }),
}))

vi.mock('../hooks/useControlChartsController', () => ({
  useControlChartsController: () => ({
    isAttributeChart: false,
    isPChart: false,
    isCountChart: false,
    isQuantitative: true,
    effectiveChartType: 'imr',
    attrChartType: 'p_chart',
    setAttrChartType: vi.fn(),
    ewmaLambda: 0.2,
    setEwmaLambda: vi.fn(),
    ewmaL: 3,
    setEwmaL: vi.fn(),
    cusumK: 0.5,
    setCusumK: vi.fn(),
    cusumH: 5,
    setCusumH: vi.fn(),
    quantPoints: [
      { batch_id: 'B1', batch_date: '2026-01-01', batch_seq: 1, sample_seq: 1, value: 10 },
      { batch_id: 'B2', batch_date: '2026-01-02', batch_seq: 2, sample_seq: 1, value: 11 },
    ],
    quantNormality: { method: 'governed_profile', p_value: null, alpha: 0.05, is_normal: true, warning: null },
    specDrift: null,
    dataTruncated: false,
    hydrating: false,
    attrPoints: [],
    countPoints: [],
    points: [
      { batch_id: 'B1', batch_date: '2026-01-01', batch_seq: 1, sample_seq: 1, value: 10 },
      { batch_id: 'B2', batch_date: '2026-01-02', batch_seq: 2, sample_seq: 1, value: 11 },
    ],
    loading: false,
    analyticsLoading: false,
    analyticsError: null,
    error: null,
    spc: {
      chartType: 'imr',
      indexedPoints: [],
      signals: [],
      mrSignals: [],
      capability: { cpk: 1.44, ppk: 1.31, isStable: true },
      imr: { xBar: 10.2, mrBar: 0.6, sigmaWithin: 0.4, ucl_x: 11.4, lcl_x: 9.0, ucl_mr: 1.8, lcl_mr: 0, sigma1: 0.4, sigma2: 0.8, movingRanges: [1] },
    },
    trendData: [],
    stratumSections: [],
    currentExcludedPoints: [],
    exclusionsSnapshot: null,
    exclusionsLoading: false,
    exclusionsSaving: false,
    exclusionsError: null,
    lockedLimits: null,
    lockedLimitsError: null,
    lockedLimitsWarning: null,
    externalLimits: null,
    governedLimits: { cl: 10.2, ucl: 11.4, lcl: 9.0, sigma_within: 0.4, cpk: 1.44, ppk: 1.31 },
    governedLimitsError: null,
    canLockLimits: true,
    totalSignals: 0,
    exclusionCount: 0,
    chartFamilyLabel: 'I-MR variable chart',
    capabilityHeadline: { label: 'Cpk', value: 1.44 },
    stratifyLabel: null,
    limitsSourceLabel: 'Governed',
    limitsSourceDetail: 'Live control limits and default capability values are sourced from governed Databricks metrics.',
    limitsSourceTone: 'info',
    rollingWindowSize: 20,
    setRollingWindowSize: vi.fn(),
    autoCleanLog: null,
    setAutoCleanLog: vi.fn(),
    exportData: vi.fn(),
    exporting: false,
    handlePointClick: vi.fn(),
    handleAutoClean: vi.fn(),
    handleRestoreAll: vi.fn(),
    handleRestorePoint: vi.fn(),
    handleDialogSubmit: vi.fn(),
    handleLockLimits: vi.fn(),
    handleDeleteLock: vi.fn(),
    closeDialog: vi.fn(),
  }),
}))

vi.mock('../charts/IndividualsChart', () => ({
  default: () => <div data-testid="individuals-chart">individuals-chart</div>,
}))

vi.mock('../charts/MovingRangeChart', () => ({
  default: () => <div data-testid="moving-range-chart">moving-range-chart</div>,
}))

describe('ControlChartsView', () => {
  beforeEach(() => {
    dispatch.mockReset()
    ;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    mockState = {
      selectedMaterial: { material_id: 'MAT-1', material_name: 'Material 1' },
      selectedMIC: { mic_id: 'MIC-1', mic_name: 'Moisture', inspection_method: 'NIR', chart_type: 'imr' },
      selectedPlant: { plant_id: 'PLANT-1', plant_name: 'Plant 1' },
      dateFrom: '2026-01-01',
      dateTo: '2026-01-31',
      excludedIndices: new Set<number>(),
      exclusionDialog: null,
      exclusionAudit: null,
      chartTypeOverride: null,
      excludeOutliers: false,
      limitsMode: 'live',
      roleMode: 'operator',
      ruleSet: 'weco',
      stratifyBy: null,
    }
  })

  it('renders the chart summary with governed limits source state', async () => {
    render(<ControlChartsView />)

    expect(screen.getByText(/limits: governed/i)).toBeInTheDocument()
    expect(screen.getByText(/live control limits and default capability values are sourced from governed databricks metrics/i)).toBeInTheDocument()
    expect(screen.getByText(/headline cpk 1.44/i)).toBeInTheDocument()
    expect(await screen.findByTestId('individuals-chart')).toBeInTheDocument()
  })
})
