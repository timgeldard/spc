export const spcQueryKeys = {
  plants: (materialId: string | null | undefined) => ['spc', 'plants', materialId ?? null] as const,
  characteristics: (materialId: string | null | undefined, plantId: string | null | undefined) =>
    ['spc', 'characteristics', materialId ?? null, plantId ?? null] as const,
  attributeCharacteristics: (materialId: string | null | undefined, plantId: string | null | undefined) =>
    ['spc', 'attributeCharacteristics', materialId ?? null, plantId ?? null] as const,
  scorecard: (
    materialId: string | null | undefined,
    dateFrom: string | null | undefined,
    dateTo: string | null | undefined,
    plantId: string | null | undefined,
  ) => ['spc', 'scorecard', materialId ?? null, dateFrom ?? null, dateTo ?? null, plantId ?? null] as const,
  compareScorecard: (
    materialIds: string[] | null | undefined,
    dateFrom: string | null | undefined,
    dateTo: string | null | undefined,
    plantId: string | null | undefined,
  ) => ['spc', 'compareScorecard', [...(materialIds ?? [])].sort(), dateFrom ?? null, dateTo ?? null, plantId ?? null] as const,
  processFlow: (
    materialId: string | null | undefined,
    dateFrom: string | null | undefined,
    dateTo: string | null | undefined,
    upstreamDepth: number,
    downstreamDepth: number,
  ) => ['spc', 'processFlow', materialId ?? null, dateFrom ?? null, dateTo ?? null, upstreamDepth, downstreamDepth] as const,
  correlation: (
    materialId: string | null | undefined,
    plantId: string | null | undefined,
    dateFrom: string | null | undefined,
    dateTo: string | null | undefined,
    minBatches: number | null | undefined,
  ) => ['spc', 'correlation', materialId ?? null, plantId ?? null, dateFrom ?? null, dateTo ?? null, minBatches ?? null] as const,
  correlationScatter: (
    materialId: string | null | undefined,
    micAId: string | null | undefined,
    micBId: string | null | undefined,
    plantId: string | null | undefined,
    dateFrom: string | null | undefined,
    dateTo: string | null | undefined,
  ) => ['spc', 'correlationScatter', materialId ?? null, micAId ?? null, micBId ?? null, plantId ?? null, dateFrom ?? null, dateTo ?? null] as const,
  multivariate: (
    materialId: string | null | undefined,
    micIds: string[] | null | undefined,
    plantId: string | null | undefined,
    dateFrom: string | null | undefined,
    dateTo: string | null | undefined,
  ) => ['spc', 'multivariate', materialId ?? null, [...(micIds ?? [])].sort(), plantId ?? null, dateFrom ?? null, dateTo ?? null] as const,
  lockedLimits: (
    materialId: string | null | undefined,
    micId: string | null | undefined,
    plantId: string | null | undefined,
    chartType: string | null | undefined,
    operationId: string | null | undefined,
  ) => ['spc', 'lockedLimits', materialId ?? null, micId ?? null, plantId ?? null, chartType ?? null, operationId ?? null] as const,
}
