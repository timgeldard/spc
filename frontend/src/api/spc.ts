import { fetchJson } from './client'
import type { MicRef, PlantRef, ProcessFlowResult, ScorecardRow } from '../spc/types'

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
