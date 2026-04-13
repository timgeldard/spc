import { useEffect } from 'react'
import { shallowEqual, useSPCSelector } from '../SPCContext'

/**
 * Keeps window.location.search in sync with the active analysis context.
 *
 * URL params written:
 *   tab        — active module (omitted when 'overview', the default)
 *   mat        — selected material ID
 *   mat_n      — material display name (optional, for breadcrumbs before data loads)
 *   plant      — selected plant ID
 *   plant_n    — plant display name
 *   mic        — selected characteristic (MIC) ID
 *   mic_n      — MIC display name
 *   mic_ct     — MIC chart type (imr / xbar_r / xbar_s / p_chart …)
 *   flow_u     — upstream lineage search depth
 *   flow_d     — downstream lineage search depth
 *   from       — date range start (ISO date string)
 *   to         — date range end
 *
 * Analysis preferences (rule set, outlier exclusion, limits mode) are stored in
 * localStorage via useSPCPreferences — they are per-analyst, not shareable.
 *
 * Reads are handled synchronously at startup by buildInitialState() in SPCContext,
 * so this hook is write-only: state → URL.
 */
export function useSPCUrlSync(): void {
  const {
    activeTab,
    selectedMaterial,
    selectedPlant,
    selectedMIC,
    selectedMultivariateMicIds,
    processFlowUpstreamDepth,
    processFlowDownstreamDepth,
    dateFrom,
    dateTo,
  } = useSPCSelector(
    state => ({
      activeTab: state.activeTab,
      selectedMaterial: state.selectedMaterial,
      selectedPlant: state.selectedPlant,
      selectedMIC: state.selectedMIC,
      selectedMultivariateMicIds: state.selectedMultivariateMicIds,
      processFlowUpstreamDepth: state.processFlowUpstreamDepth,
      processFlowDownstreamDepth: state.processFlowDownstreamDepth,
      dateFrom: state.dateFrom,
      dateTo: state.dateTo,
    }),
    shallowEqual,
  )

  useEffect(() => {
    try {
      const params = new URLSearchParams()

      // Tab — omit default so bare URLs stay clean
      if (activeTab !== 'overview') params.set('tab', activeTab)

      // Material
      if (selectedMaterial?.material_id) {
        params.set('mat', selectedMaterial.material_id)
        if (selectedMaterial.material_name) params.set('mat_n', selectedMaterial.material_name)
      }

      // Plant
      if (selectedPlant?.plant_id) {
        params.set('plant', selectedPlant.plant_id)
        if (selectedPlant.plant_name) params.set('plant_n', selectedPlant.plant_name)
      }

      // Characteristic (MIC)
      if (selectedMIC?.mic_id) {
        params.set('mic', selectedMIC.mic_id)
        if (selectedMIC.operation_id) params.set('op_id', selectedMIC.operation_id)
        if (selectedMIC.mic_name) params.set('mic_n', selectedMIC.mic_name)
        if (selectedMIC.chart_type) params.set('mic_ct', selectedMIC.chart_type)
      }

      if (selectedMultivariateMicIds.length > 0) {
        params.set('mv', selectedMultivariateMicIds.join(','))
      }
      if (processFlowUpstreamDepth !== 4) params.set('flow_u', String(processFlowUpstreamDepth))
      if (processFlowDownstreamDepth !== 3) params.set('flow_d', String(processFlowDownstreamDepth))

      // Date range
      if (dateFrom) params.set('from', dateFrom)
      if (dateTo) params.set('to', dateTo)

      const search = params.toString()
      const url = search ? `?${search}` : window.location.pathname
      window.history.replaceState(null, '', url)
    } catch { /* no window.history (e.g., test environment) */ }
  }, [activeTab, selectedMaterial, selectedPlant, selectedMIC, selectedMultivariateMicIds, processFlowUpstreamDepth, processFlowDownstreamDepth, dateFrom, dateTo])
}
