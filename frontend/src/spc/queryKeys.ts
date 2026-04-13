export const spcQueryKeys = {
  plants: (materialId: string | null | undefined) => ['spc', 'plants', materialId ?? null] as const,
  characteristics: (materialId: string | null | undefined, plantId: string | null | undefined) =>
    ['spc', 'characteristics', materialId ?? null, plantId ?? null] as const,
  scorecard: (
    materialId: string | null | undefined,
    dateFrom: string | null | undefined,
    dateTo: string | null | undefined,
    plantId: string | null | undefined,
  ) => ['spc', 'scorecard', materialId ?? null, dateFrom ?? null, dateTo ?? null, plantId ?? null] as const,
  processFlow: (
    materialId: string | null | undefined,
    dateFrom: string | null | undefined,
    dateTo: string | null | undefined,
    upstreamDepth: number,
    downstreamDepth: number,
  ) => ['spc', 'processFlow', materialId ?? null, dateFrom ?? null, dateTo ?? null, upstreamDepth, downstreamDepth] as const,
}
