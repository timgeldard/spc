import { fetchJson } from './client'
import type {
  CompareScorecardResult,
  CorrelationPair,
  CorrelationResult,
  CorrelationScatterResult,
  LockedLimits,
  MSAResult,
  MicRef,
  MultivariateResult,
  PlantRef,
  ProcessFlowResult,
  ScorecardRow,
} from '../spc/types'

function normaliseCorrelationPair(pair: CorrelationPair): CorrelationPair {
  return {
    ...pair,
    mic_a_id: pair.mic_a_id ?? pair.mic_a ?? '',
    mic_b_id: pair.mic_b_id ?? pair.mic_b ?? '',
    pearson_r: pair.pearson_r ?? pair.r ?? null,
    shared_batches: pair.shared_batches ?? pair.n ?? null,
  }
}

export async function fetchPlants(materialId: string, signal?: AbortSignal): Promise<PlantRef[]> {
  const data = await fetchJson<{ plants?: PlantRef[] }>(
    `/api/spc/plants?material_id=${encodeURIComponent(materialId)}`,
    { signal },
  )
  return data.plants ?? []
}

export async function fetchCharacteristics(
  materialId: string,
  plantId: string | null,
  signal?: AbortSignal,
): Promise<{ characteristics: MicRef[]; attrCharacteristics: MicRef[] }> {
  const data = await fetchJson<{ characteristics?: MicRef[]; attr_characteristics?: MicRef[] }>(
    '/api/spc/characteristics',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ material_id: materialId, plant_id: plantId ?? null }),
    },
  )
  return {
    characteristics: data.characteristics ?? [],
    attrCharacteristics: data.attr_characteristics ?? [],
  }
}

export interface DataQualitySummary {
  n_samples: number
  n_batches: number
  n_missing_values: number
  n_unparseable_values: number
  pct_missing: number
  n_outliers_3sigma: number
  mean_value: number | null
  stddev_value: number | null
  first_batch_date: string | null
  last_batch_date: string | null
  median_gap_days: number | null
  p95_gap_days: number | null
  max_gap_days: number | null
  // Phase 2.2: {usage_decision_code: sample_count} when upstream gold view
  // exposes USAGE_DECISION_CODE; null otherwise. UI renders a chip row and
  // enables the rework-exclusion filter only when this is non-null.
  disposition_breakdown?: Record<string, number> | null
}

export async function fetchDataQuality(
  materialId: string,
  micId: string,
  plantId: string | null,
  dateFrom: string | null,
  dateTo: string | null,
  operationId: string | null,
  signal?: AbortSignal,
): Promise<DataQualitySummary> {
  return fetchJson<DataQualitySummary>('/api/spc/data-quality', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    signal,
    body: JSON.stringify({
      material_id: materialId,
      mic_id: micId,
      plant_id: plantId ?? null,
      date_from: dateFrom ?? null,
      date_to: dateTo ?? null,
      operation_id: operationId ?? null,
    }),
  })
}

export async function fetchScorecard(
  materialId: string,
  dateFrom: string | null,
  dateTo: string | null,
  plantId: string | null,
  signal?: AbortSignal,
): Promise<ScorecardRow[]> {
  const data = await fetchJson<{ scorecard?: ScorecardRow[] }>(
    '/api/spc/scorecard',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        material_id: materialId,
        date_from: dateFrom ?? null,
        date_to: dateTo ?? null,
        plant_id: plantId ?? null,
      }),
    },
  )
  return data.scorecard ?? []
}

export async function fetchProcessFlow(
  materialId: string,
  dateFrom: string | null,
  dateTo: string | null,
  upstreamDepth: number,
  downstreamDepth: number,
  signal?: AbortSignal,
): Promise<ProcessFlowResult> {
  return await fetchJson<ProcessFlowResult>(
    '/api/spc/process-flow',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        material_id: materialId,
        date_from: dateFrom ?? null,
        date_to: dateTo ?? null,
        upstream_depth: upstreamDepth,
        downstream_depth: downstreamDepth,
      }),
    },
  )
}

export async function fetchAttributeCharacteristics(
  materialId: string,
  plantId: string | null,
  signal?: AbortSignal,
): Promise<MicRef[]> {
  const data = await fetchJson<{ characteristics?: MicRef[] }>(
    '/api/spc/attribute-characteristics',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({ material_id: materialId, plant_id: plantId ?? null }),
    },
  )
  return data.characteristics ?? []
}

export async function fetchCompareScorecard(
  materialIds: string[],
  dateFrom: string | null,
  dateTo: string | null,
  plantId: string | null,
  signal?: AbortSignal,
): Promise<CompareScorecardResult> {
  return await fetchJson<CompareScorecardResult>(
    '/api/spc/compare-scorecard',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        material_ids: materialIds,
        date_from: dateFrom ?? null,
        date_to: dateTo ?? null,
        plant_id: plantId ?? null,
      }),
    },
  )
}

export async function fetchCorrelation(
  materialId: string,
  plantId: string | null,
  dateFrom: string | null,
  dateTo: string | null,
  minBatches: number,
  signal?: AbortSignal,
): Promise<CorrelationResult> {
  const data = await fetchJson<CorrelationResult>(
    '/api/spc/correlation',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        material_id: materialId,
        plant_id: plantId ?? null,
        date_from: dateFrom ?? null,
        date_to: dateTo ?? null,
        min_batches: minBatches,
      }),
    },
  )
  return { ...data, pairs: (data.pairs ?? []).map(normaliseCorrelationPair) }
}

export async function fetchCorrelationScatter(
  materialId: string,
  micAId: string,
  micBId: string,
  plantId: string | null,
  dateFrom: string | null,
  dateTo: string | null,
  signal?: AbortSignal,
): Promise<CorrelationScatterResult> {
  return await fetchJson<CorrelationScatterResult>(
    '/api/spc/correlation-scatter',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        material_id: materialId,
        mic_a_id: micAId,
        mic_b_id: micBId,
        plant_id: plantId ?? null,
        date_from: dateFrom ?? null,
        date_to: dateTo ?? null,
      }),
    },
  )
}

export async function fetchMultivariate(
  materialId: string,
  micIds: string[],
  plantId: string | null,
  dateFrom: string | null,
  dateTo: string | null,
  signal?: AbortSignal,
): Promise<MultivariateResult> {
  return await fetchJson<MultivariateResult>(
    '/api/spc/multivariate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        material_id: materialId,
        mic_ids: Array.from(new Set(micIds)).slice(0, 8),
        plant_id: plantId ?? null,
        date_from: dateFrom ?? null,
        date_to: dateTo ?? null,
      }),
    },
  )
}

export async function calculateMSA(
  measurementData: Array<Array<Array<number | null>>>,
  tolerance: number,
  method: 'average_range' | 'anova',
  signal?: AbortSignal,
): Promise<MSAResult> {
  return await fetchJson<MSAResult>(
    '/api/spc/msa/calculate',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        measurement_data: measurementData,
        tolerance,
        method,
      }),
    },
  )
}

export async function fetchLockedLimits(
  materialId: string,
  micId: string,
  chartType: string,
  plantId: string | null,
  operationId: string | null,
  unifiedMicKey: string | null,
  signal?: AbortSignal,
): Promise<LockedLimits | null> {
  const params = new URLSearchParams({
    material_id: materialId,
    mic_id: micId,
    chart_type: chartType,
  })
  if (plantId) params.append('plant_id', plantId)
  if (operationId) params.append('operation_id', operationId)
  if (unifiedMicKey) params.append('unified_mic_key', unifiedMicKey)
  const data = await fetchJson<{ locked_limits?: LockedLimits | null }>(
    `/api/spc/locked-limits?${params.toString()}`,
    { signal },
  )
  return data.locked_limits ?? null
}

export async function saveLockedLimits(
  materialId: string,
  micId: string,
  chartType: string,
  plantId: string | null,
  operationId: string | null,
  unifiedMicKey: string | null,
  limits: LockedLimits,
): Promise<void> {
  await fetchJson(
    '/api/spc/locked-limits',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        material_id: materialId,
        mic_id: micId,
        plant_id: plantId ?? null,
        operation_id: operationId ?? null,
        unified_mic_key: unifiedMicKey ?? limits.unified_mic_key ?? null,
        chart_type: chartType,
        ...limits,
      }),
    },
  )
}

export async function deleteLockedLimits(
  materialId: string,
  micId: string,
  chartType: string,
  plantId: string | null,
  operationId: string | null,
  unifiedMicKey: string | null,
): Promise<void> {
  await fetchJson(
    '/api/spc/locked-limits',
    {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        material_id: materialId,
        mic_id: micId,
        plant_id: plantId ?? null,
        operation_id: operationId ?? null,
        unified_mic_key: unifiedMicKey ?? null,
        chart_type: chartType,
      }),
    },
  )
}
