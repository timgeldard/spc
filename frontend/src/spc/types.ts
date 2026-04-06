import type { Dispatch, ReactNode } from 'react'

export type RuleSet = 'weco' | 'nelson'
export type QuantChartType = 'imr' | 'xbar_r'
export type SpecType =
  | 'bilateral_symmetric'
  | 'bilateral_asymmetric'
  | 'unilateral_upper'
  | 'unilateral_lower'
  | string

export interface MaterialRef {
  material_id: string
  material_name?: string | null
}

export interface PlantRef {
  plant_id: string
  plant_name?: string | null
}

export interface MicRef {
  mic_id: string
  mic_name?: string | null
  chart_type?: string | null
  avg_samples_per_batch?: number | null
  inspection_method?: string | null
  batch_count?: number | null
}

export interface ValidateMaterialResult {
  valid: boolean
  material_id?: string
  material_name?: string | null
  [key: string]: unknown
}

export interface AttributeChartPoint {
  batch_id?: string | null
  batch_date?: string | null
  batch_seq?: number | null
  numerator?: number | null
  denominator?: number | null
  proportion?: number | null
  defects?: number | null
  opportunities?: number | null
  value?: number | null
  [key: string]: unknown
}

export interface ChartDataPoint {
  batch_id?: string | null
  batch_date?: string | null
  batch_seq: number
  sample_seq: number
  value: number
  nominal?: number | null
  tolerance?: number | null
  lsl?: number | null
  usl?: number | null
  valuation?: string | null
  plant_id?: string | null
  is_outlier?: boolean
  spec_type?: string | null
  originalIndex?: number
  excluded?: boolean
}

export interface IndexedChartPoint extends ChartDataPoint {
  originalIndex: number
  excluded: boolean
}

export interface NormalityResult {
  method: string
  p_value: number | null
  alpha: number
  is_normal: boolean | null
  warning: string | null
}

export interface SpecConfig {
  nominal?: number | null
  tolerance?: number | null
  usl?: number | null
  lsl?: number | null
  spec_type?: SpecType | null
  hasMixedSpec?: boolean
  specWarning?: string | null
}

export interface ControlLimits {
  cl?: number | null
  ucl?: number | null
  lcl?: number | null
  ucl_r?: number | null
  lcl_r?: number | null
  sigma_within?: number | null
}

export interface CapabilityMetrics {
  cp?: number | null
  cpk?: number | null
  pp?: number | null
  ppk?: number | null
  zScore?: number | null
  dpmo?: number | null
  spec_type?: SpecType | null
  normality?: NormalityResult | null
  normalityWarning?: string | null
  specWarning?: string | null
  cpkLower95?: number | null
  cpkUpper95?: number | null
  dpmo_convention?: string | null
  hasMixedSpec?: boolean
}

export interface CapabilityResult extends ControlLimits, CapabilityMetrics {
  usl?: number | null
  lsl?: number | null
  sigmaOverall?: number | null
  xBar?: number | null
}

export interface ExclusionAuditSnapshot {
  excluded_count?: number
  excluded_points?: ExcludedPoint[]
  before_limits?: ControlLimits | null
  after_limits?: ControlLimits | null
  user_id?: string | null
  event_ts?: string | null
  justification?: string | null
  event_id?: string | null
  [key: string]: unknown
}

export interface ExclusionDialogState {
  action: string
  point?: ChartDataPoint | null
  excludedCount?: number
  nextExcludedIndices?: number[]
  cleanedIndices?: Set<number>
  [key: string]: unknown
}

export interface ExcludedPoint {
  batch_id?: string | null
  sample_seq?: number | null
  batch_seq?: number | null
  batch_date?: string | null
  plant_id?: string | null
  value?: number | null
  original_index?: number | null
}

export interface SPCSignal {
  rule: number
  indices: number[]
  description?: string
  chart?: string
}

export interface AutoCleanPhaseIIteration {
  iteration: number
  removedCount: number
  removedOriginalIndices: number[]
  ucl?: number | null
  cl?: number | null
  lcl?: number | null
}

export interface AutoCleanPhaseIResult {
  stable: boolean
  cleanedIndices: Set<number>
  iterationLog: AutoCleanPhaseIIteration[]
}

export interface RollingCapabilityPoint {
  windowEnd: number
  batchSeq: number
  batchDate?: string | null
  n: number
  cpk?: number | null
  cp?: number | null
  zScore?: number | null
}

export interface IMRResult {
  xBar: number
  mrBar: number
  sigmaWithin: number
  sigmaMR?: number | null
  sigmaMSSD?: number | null
  sigmaMethod?: 'mr' | 'mssd'
  ucl_x: number
  lcl_x: number
  ucl_mr: number
  lcl_mr: number
  sigma1: number
  sigma2: number
  movingRanges: number[]
}

export interface XbarSubgroupStat {
  batchSeq: number
  batchId?: string | null
  batchDate?: string | null
  n: number
  xbar: number
  range: number
  stddev?: number | null
  ucl_x?: number | null
  lcl_x?: number | null
  ucl_r?: number | null
  lcl_r?: number | null
  sigmaWithin?: number | null
}

export interface XbarSubgroup {
  batchSeq: number
  batchId?: string | null
  batchDate?: string | null
  values: number[]
}

export interface XbarRResult {
  grandMean: number
  rBar: number
  sigmaWithin: number
  pooledSigmaWithin?: number | null
  sigmaFromRanges?: number | null
  sigma1: number
  sigma2: number
  ucl_x: number
  lcl_x: number
  ucl_r: number
  lcl_r: number
  mixedSubgroupSizes?: boolean
  averageSubgroupSize?: number | null
  limitStrategy?: string
  referenceSubgroupSize?: number | null
  subgroupStats: XbarSubgroupStat[]
}

export interface HistogramBin {
  x0: number
  x1: number
  midpoint: number
  count: number
}

export interface HistogramResult {
  bins: HistogramBin[]
  binWidth: number
}

export interface NormalCurvePoint {
  x: number
  y: number
}

export interface SPCComputationResult {
  chartType: QuantChartType
  ruleSet?: RuleSet
  values?: number[]
  nominal?: number | null
  tolerance?: number | null
  specConfig?: SpecConfig
  capability?: CapabilityResult | null
  indexedPoints?: IndexedChartPoint[]
  filteredPointCount?: number
  excludedPointCount?: number
  signals?: SPCSignal[]
  mrSignals?: SPCSignal[]
  sorted?: ChartDataPoint[]
  imr?: IMRResult | null
  xbarR?: XbarRResult | null
  subgroups?: XbarSubgroup[] | null
  normality?: NormalityResult | null
  [key: string]: unknown
}

export interface LockedLimits extends ControlLimits {
  locked_at?: string | null
  locked_by?: string | null
}

export interface ScorecardRow {
  mic_id: string
  mic_name: string
  batch_count: number
  mean_value?: number | null
  stddev_overall?: number | null
  nominal_target?: number | null
  pp?: number | null
  cpk?: number | null
  ppk?: number | null
  z_score?: number | null
  dpmo?: number | null
  ooc_rate?: number | null
  capability_status?: 'excellent' | 'good' | 'marginal' | 'poor' | 'grey' | string
}

export interface ExportPayload {
  export_type: string
  export_scope: string
  material_id?: string | null
  mic_id?: string | null
  plant_id?: string | null
  date_from?: string | null
  date_to?: string | null
}

export interface CorrelationMic {
  mic_id: string
  mic_name: string
}

export interface CorrelationPair {
  mic_a_id: string
  mic_b_id: string
  mic_a_name?: string
  mic_b_name?: string
  r?: number | null
  n?: number | null
  [key: string]: unknown
}

export interface CorrelationResult {
  pair_count: number
  mics: CorrelationMic[]
  pairs: CorrelationPair[]
  [key: string]: unknown
}

export interface CorrelationScatterResult {
  points?: Array<Record<string, unknown>>
  mic_a_name?: string
  mic_b_name?: string
  [key: string]: unknown
}

export interface MSAResult {
  error?: string
  method?: 'average_range' | 'anova'
  grrPct?: number | null
  grrPctTol?: number | null
  ndc?: number | null
  ev?: number | null
  av?: number | null
  grr?: number | null
  pv?: number | null
  tv?: number | null
  interactionVariation?: number | null
  interactionPValue?: number | null
  modelWarning?: string | null
  systemStabilityWarning?: string | null
  repeatability?: number | null
  reproducibility?: number | null
  [key: string]: unknown
}

export interface SPCState {
  selectedMaterial: MaterialRef | null
  selectedPlant: PlantRef | null
  selectedMIC: MicRef | null
  dateFrom: string
  dateTo: string
  activeTab: 'flow' | 'charts' | 'scorecard' | 'compare' | 'msa' | 'correlation'
  chartTypeOverride: 'imr' | 'xbar_r' | null
  excludedIndices: Set<number>
  ruleSet: 'weco' | 'nelson'
  excludeOutliers: boolean
  limitsMode: 'live' | 'locked'
  stratifyAll: boolean
  exclusionAudit: ExclusionAuditSnapshot | null
  exclusionDialog: ExclusionDialogState | null
}

export type SPCAction =
  | { type: 'SET_MATERIAL'; payload: MaterialRef | null }
  | { type: 'SET_PLANT'; payload: PlantRef | null }
  | { type: 'SET_MIC'; payload: MicRef | null }
  | { type: 'SET_DATE_FROM'; payload: string }
  | { type: 'SET_DATE_TO'; payload: string }
  | { type: 'SET_ACTIVE_TAB'; payload: SPCState['activeTab'] }
  | { type: 'SET_CHART_TYPE_OVERRIDE'; payload: SPCState['chartTypeOverride'] }
  | { type: 'TOGGLE_EXCLUDE_INDEX'; payload: number }
  | { type: 'CLEAR_EXCLUSIONS' }
  | { type: 'OPEN_EXCLUSION_DIALOG'; payload: ExclusionDialogState }
  | { type: 'CLOSE_EXCLUSION_DIALOG' }
  | { type: 'SET_EXCLUSION_AUDIT'; payload: ExclusionAuditSnapshot | null }
  | { type: 'CLEAR_EXCLUSION_AUDIT' }
  | { type: 'SET_RULE_SET'; payload: SPCState['ruleSet'] }
  | { type: 'TOGGLE_EXCLUDE_OUTLIERS' }
  | { type: 'SET_EXCLUSIONS'; payload: number[] }
  | { type: 'SET_LIMITS_MODE'; payload: SPCState['limitsMode'] }
  | { type: 'TOGGLE_STRATIFY_ALL' }
  | { type: 'SELECT_MATERIAL_AND_CHARTS'; payload: MaterialRef | null }

export interface SPCContextValue {
  state: SPCState
  dispatch: Dispatch<SPCAction>
}

export interface SPCProviderProps {
  children: ReactNode
}

export interface UseSPCChartDataResult {
  points: ChartDataPoint[]
  normality: NormalityResult | null
  dataTruncated: boolean
  loading: boolean
  error: string | null
}
