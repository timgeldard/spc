import type { Dispatch, ReactNode } from 'react'

export type RuleSet = 'weco' | 'nelson'
export type QuantChartType = 'imr' | 'xbar_r' | 'xbar_s' | 'ewma' | 'cusum'
export type StratifyByKey = 'plant_id' | 'inspection_lot_id' | 'operation_id'
export type SpecType =
  | 'bilateral_symmetric'
  | 'bilateral_asymmetric'
  | 'unilateral_upper'
  | 'unilateral_lower'
  | 'unspecified'
  | (string & {})

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
  operation_id?: string | null
  mic_name?: string | null
  mic_name_normalized?: string | null
  chart_type?: string | null
  avg_samples_per_batch?: number | null
  inspection_method?: string | null
  batch_count?: number | null
  unified_mic_key?: string | null
  routing_conflict?: boolean | null
}

export interface SpecDriftWarning {
  detected: boolean
  distinct_signatures: number
  total_batches: number
  signature_set: string[]
  message: string
  // Optional engineering-change-order references for each spec regime.
  // Populated once upstream gold view exposes a spec_change_reference column
  // (see docs/DATA_CONTRACT.md Phase 2.3 extension procedure). Null today.
  change_references?: string[] | null
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

export interface EventParamLike {
  dataIndex: number
  seriesIndex?: number
  seriesName?: string
  componentType?: string
  value?: unknown
  data?: Record<string, unknown>
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
  stratify_value?: string | null
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
  capabilityMethod?: 'parametric' | 'non_parametric'
  empiricalP00135?: number | null
  empiricalP50?: number | null
  empiricalP99865?: number | null
  zScore?: number | null
  dpmo?: number | null
  spec_type?: SpecType | null
  normality?: NormalityResult | null
  normalityWarning?: string | null
  specWarning?: string | null
  cpkLower95?: number | null
  cpkUpper95?: number | null
  cpLower95?: number | null
  cpUpper95?: number | null
  ppLower95?: number | null
  ppUpper95?: number | null
  ppkLower95?: number | null
  ppkUpper95?: number | null
  dpmo_convention?: string | null
  hasMixedSpec?: boolean
  isStable?: boolean
  instabilityReason?: string | null
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
  stratify_by?: StratifyByKey | null
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
  stratify_value?: string | null
  value?: number | null
  original_index?: number | null
}

export interface SPCSignal {
  rule: number
  indices: number[]
  description?: string
  chart?: string
}

export interface AutocorrelationResult {
  rho: number
  n: number
  suspected: boolean
  threshold: number
  basis: 'values' | 'subgroup_means'
}

export interface AutoCleanPhaseIIterationLog {
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
  iterationLog: AutoCleanPhaseIIterationLog[]
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
  ucl_s?: number | null
  lcl_s?: number | null
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

export interface XbarSResult {
  grandMean: number
  sBar: number
  sigmaWithin: number
  pooledSigmaWithin?: number | null
  sigmaFromStddevs?: number | null
  sigma1: number
  sigma2: number
  ucl_x: number
  lcl_x: number
  ucl_s: number
  lcl_s: number
  mixedSubgroupSizes?: boolean
  averageSubgroupSize?: number | null
  limitStrategy?: string
  referenceSubgroupSize?: number | null
  subgroupStats: XbarSubgroupStat[]
}

export interface EWMAChartPoint {
  index: number
  batchSeq?: number | null
  batchId?: string | null
  batchDate?: string | null
  value: number
  ewma: number
  ucl: number
  lcl: number
}

export interface EWMAResult {
  lambda: number
  L: number
  target: number
  sigmaWithin: number
  points: EWMAChartPoint[]
}

export interface CUSUMChartPoint {
  index: number
  batchSeq?: number | null
  batchId?: string | null
  batchDate?: string | null
  value: number
  cPlus: number
  cMinus: number
}

export interface CUSUMResult {
  k: number
  h: number
  target: number
  sigmaWithin: number
  decisionInterval: number
  referenceValue: number
  points: CUSUMChartPoint[]
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
  xbarS?: XbarSResult | null
  ewma?: EWMAResult | null
  cusum?: CUSUMResult | null
  subgroups?: XbarSubgroup[] | null
  normality?: NormalityResult | null
  autocorrelation?: AutocorrelationResult | null
  [key: string]: unknown
}

export interface LockedLimits extends ControlLimits {
  locked_at?: string | null
  locked_by?: string | null
  unified_mic_key?: string | null
  mic_origin?: string | null
  spec_signature?: string | null
  locking_note?: string | null
  stale_spec?: boolean
  live_spec_signature?: string | null
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
  capability_status?: 'excellent' | 'good' | 'marginal' | 'poor' | 'grey' | 'out_of_spec_mean' | string
  is_stable?: boolean
  stability_basis?: string | null
}

export interface ExportPayload {
  export_type: string
  export_scope: string
  material_id?: string | null
  mic_id?: string | null
  plant_id?: string | null
  operation_id?: string | null
  chart_type?: string | null
  date_from?: string | null
  date_to?: string | null
}

export interface CorrelationMic {
  mic_id: string
  mic_name: string
}

export interface CorrelationPair {
  mic_a?: string
  mic_a_id: string
  mic_b?: string
  mic_b_id: string
  mic_a_name?: string
  mic_b_name?: string
  r?: number | null
  n?: number | null
  pearson_r?: number | null
  shared_batches?: number | null
  [key: string]: unknown
}

export interface CorrelationResult {
  pair_count: number
  mics: CorrelationMic[]
  pairs: CorrelationPair[]
  [key: string]: unknown
}

export interface CorrelationScatterResult {
  points?: CorrelationScatterPoint[]
  mic_a_name?: string
  mic_b_name?: string
  pearson_r?: number | null
  n?: number | null
  [key: string]: unknown
}

export interface CorrelationScatterPoint {
  x: number
  y: number
  batch_id?: string | null
  batch_date?: string | null
  [key: string]: unknown
}

export interface MultivariateContribution {
  mic_id: string
  mic_name: string
  contribution?: number | null
  share_abs?: number | null
  value?: number | null
}

export interface MultivariatePoint {
  index: number
  batch_id?: string | null
  batch_date?: string | null
  t2?: number | null
  is_anomaly: boolean
  top_contributors: MultivariateContribution[]
  contributions: MultivariateContribution[]
  values: Record<string, number | null>
}

export interface MultivariateAnomaly {
  index: number
  batch_id?: string | null
  batch_date?: string | null
  t2?: number | null
  summary: string
  top_contributors: MultivariateContribution[]
}

export interface MultivariateMeanVectorEntry {
  mic_id: string
  mic_name: string
  mean?: number | null
}

export interface MultivariateResult {
  material_id?: string | null
  plant_id?: string | null
  date_from?: string | null
  date_to?: string | null
  variables: CorrelationMic[]
  ucl?: number | null
  alpha?: number | null
  n_observations: number
  n_variables: number
  excluded_incomplete_batches?: number | null
  points: MultivariatePoint[]
  anomalies: MultivariateAnomaly[]
  correlation: CorrelationResult
  mean_vector: MultivariateMeanVectorEntry[]
}

export interface CompareScorecardMaterial {
  material_id: string
  material_name?: string | null
  scorecard: ScorecardRow[]
}

export interface CompareScorecardResult {
  materials: CompareScorecardMaterial[]
  common_mics: Array<{
    mic_id: string
    mic_name: string
  }>
  [key: string]: unknown
}

export interface CapabilityMatrixDatum {
  value: [number, number, number]
  mic_id: string
  mic_name: string
  ppk: number
  ooc_rate?: number | null
  batch_count?: number | null
}

export interface AttributeChartStatsPoint extends AttributeChartPoint {
  n_nonconforming?: number | null
  n_inspected?: number | null
  p?: number
  u?: number
  c?: number
  np?: number
  n?: number
  ucl?: number
  lcl?: number
}

export interface AttributeChartComputationResult {
  pBar?: number
  uBar?: number
  cBar?: number
  npBar?: number
  ucl?: number
  lcl?: number
  signals?: SPCSignal[]
  subgroupStats: AttributeChartStatsPoint[]
}

export interface ChartPaneProps {
  points: AttributeChartPoint[]
}

export interface CapabilityGaugeProps {
  label: string
  value: number | null
  maxValue?: number
  lower95?: number | null
  upper95?: number | null
}

export interface CapabilityTrendChartProps {
  trendData: RollingCapabilityPoint[]
  windowSize: number
}

export interface CorrelationMatrixProps {
  pairs: CorrelationPair[]
  mics: CorrelationMic[]
  onCellClick?: (micAId: string, micBId: string, micAName: string, micBName: string) => void
}

export interface CorrelationScatterProps {
  result: CorrelationScatterResult | null
  loading: boolean
  error: string | null
}

export interface CapabilityMatrixProps {
  rows: ScorecardRow[]
}

export interface IMRChartProps {
  spc: SPCComputationResult | null
  indexedPoints?: IndexedChartPoint[]
  signals?: SPCSignal[]
  mrSignals?: SPCSignal[]
  excludedIndices: Set<number>
  onPointClick?: (index: number) => void
  externalLimits?: LockedLimits | null
  embedded?: boolean
}

export interface XbarRChartProps {
  spc: SPCComputationResult | null
  signals?: SPCSignal[]
  mrSignals?: SPCSignal[]
  externalLimits?: LockedLimits | null
  embedded?: boolean
}

export interface ProcessFlowNodeData extends Record<string, unknown> {
  material_id: string
  material_name?: string | null
  plant_name?: string | null
  total_batches?: number | null
  rejected_batches?: number | null
  rejection_rate_pct?: number | null
  mic_count?: number | null
  mean_value?: number | null
  stddev_value?: number | null
  estimated_cpk?: number | null
  has_ooc_signal?: boolean | null
  last_ooc?: string | null
  status?: 'green' | 'amber' | 'red' | 'grey' | string | null
  is_root?: boolean
  sparkline_values?: number[]
}

export interface ProcessFlowNodeRecord extends ProcessFlowNodeData {
  id: string
}

export interface ProcessFlowEdgeData {
  source: string
  target: string
}

export interface ProcessFlowResult {
  nodes: ProcessFlowNodeRecord[]
  edges: ProcessFlowEdgeData[]
  upstream_depth?: number
  downstream_depth?: number
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

export type SPCTabId = 'overview' | 'flow' | 'charts' | 'scorecard' | 'compare' | 'msa' | 'correlation' | 'multivariate' | 'genie'

export interface OverviewKpis {
  processHealth: number
  avgCpk: number
  oocPoints: number
  affectedBatches: number
}

export interface RecentViolationItem {
  id: number
  time: string
  rule: string
  chart: string
  value: string
}

export interface SPCState {
  selectedMaterial: MaterialRef | null
  selectedPlant: PlantRef | null
  selectedMIC: MicRef | null
  selectedMultivariateMicIds: string[]
  processFlowUpstreamDepth: number
  processFlowDownstreamDepth: number
  dateFrom: string
  dateTo: string
  activeTab: SPCTabId
  globalSearch: string
  isLoading: boolean
  savedViews: SavedView[]
  roleMode: 'operator' | 'engineer'
  kpis: OverviewKpis
  recentViolations: RecentViolationItem[]
  chartTypeOverride: QuantChartType | null
  excludedIndices: Set<number>
  ruleSet: 'weco' | 'nelson'
  excludeOutliers: boolean
  limitsMode: 'live' | 'locked'
  stratifyBy: StratifyByKey | null
  exclusionAudit: ExclusionAuditSnapshot | null
  exclusionDialog: ExclusionDialogState | null
}

export interface SavedView {
  id: string
  name: string
  savedAt: string
  activeTab: SPCTabId
  globalSearch: string
  selectedMaterial: MaterialRef | null
  selectedPlant: PlantRef | null
  selectedMIC: MicRef | null
  selectedMultivariateMicIds: string[]
  processFlowUpstreamDepth: number
  processFlowDownstreamDepth: number
  dateFrom: string
  dateTo: string
  stratifyBy: StratifyByKey | null
}

export type SPCAction =
  | { type: 'SET_MATERIAL'; payload: MaterialRef | null }
  | { type: 'SET_PLANT'; payload: PlantRef | null }
  | { type: 'SET_MIC'; payload: MicRef | null }
  | { type: 'SET_MULTIVARIATE_MIC_IDS'; payload: string[] }
  | { type: 'SET_PROCESS_FLOW_UPSTREAM_DEPTH'; payload: number }
  | { type: 'SET_PROCESS_FLOW_DOWNSTREAM_DEPTH'; payload: number }
  | { type: 'SET_DATE_FROM'; payload: string }
  | { type: 'SET_DATE_TO'; payload: string }
  | { type: 'SET_GLOBAL_SEARCH'; payload: string }
  | { type: 'SET_LOADING'; payload: boolean }
  | { type: 'SET_ROLE_MODE'; payload: SPCState['roleMode'] }
  | { type: 'SET_KPIS'; payload: OverviewKpis }
  | { type: 'SET_RECENT_VIOLATIONS'; payload: RecentViolationItem[] }
  | { type: 'ADD_SAVED_VIEW'; payload: SavedView }
  | { type: 'APPLY_SAVED_VIEW'; payload: SavedView }
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
  | { type: 'SET_STRATIFY_BY'; payload: SPCState['stratifyBy'] }
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
  specDrift: SpecDriftWarning | null
  dataTruncated: boolean
  loading: boolean
  hydrating: boolean
  error: string | null
}
