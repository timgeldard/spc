import type { ReactNode } from 'react'
import Activity from '@carbon/icons-react/es/Activity.js'
import Chemistry from '@carbon/icons-react/es/Chemistry.js'
import Security from '@carbon/icons-react/es/Security.js'
import { Tag } from '~/lib/carbon-layout'
import { shallowEqual, useSPCSelector } from './SPCContext'
import type { StratifyByKey } from './types'

const TAB_LABELS = {
  overview: 'Overview',
  flow: 'Process Flow',
  charts: 'Control Charts',
  scorecard: 'Scorecard',
  compare: 'Compare',
  msa: 'MSA',
  correlation: 'Correlation',
  multivariate: 'Multivariate SPC',
  genie: 'Databricks Genie',
} as const

const STRATIFY_LABELS: Record<StratifyByKey, string> = {
  plant_id: 'Plant',
  inspection_lot_id: 'Inspection Lot',
  operation_id: 'Operation',
}

const TONE_TYPE = {
  slate: 'cool-gray',
  blue: 'blue',
  green: 'green',
  amber: 'warm-gray',
} as const

function StatusChip({
  children,
  tone,
  icon,
}: {
  children: ReactNode
  tone: 'slate' | 'blue' | 'green' | 'amber'
  icon?: ReactNode
}) {
  return (
    <Tag type={TONE_TYPE[tone]} size="sm">
      {icon}
      {children}
    </Tag>
  )
}

export default function SPCPageHeader() {
  const state = useSPCSelector(
    current => ({
      activeTab: current.activeTab,
      selectedMaterial: current.selectedMaterial,
      selectedMIC: current.selectedMIC,
      exclusionAudit: current.exclusionAudit,
      excludedIndices: current.excludedIndices,
      stratifyBy: current.stratifyBy,
      ruleSet: current.ruleSet,
      limitsMode: current.limitsMode,
      dateFrom: current.dateFrom,
      dateTo: current.dateTo,
      selectedPlant: current.selectedPlant,
    }),
    shallowEqual,
  )
  const tabLabel = TAB_LABELS[state.activeTab]
  const material = state.selectedMaterial
  const mic = state.selectedMIC
  const exclusions = state.exclusionAudit?.excluded_count ?? state.excludedIndices.size

  const subtitleParts: string[] = []
  if (material?.material_name || material?.material_id) {
    subtitleParts.push(material?.material_name ?? material?.material_id ?? '')
  }
  if (mic?.mic_name || mic?.mic_id) {
    subtitleParts.push(mic?.mic_name ?? mic?.mic_id ?? '')
  }
  if (state.selectedPlant?.plant_name || state.selectedPlant?.plant_id) {
    subtitleParts.push(state.selectedPlant?.plant_name ?? state.selectedPlant?.plant_id ?? '')
  }

  return (
    <div style={{ borderBottom: '1px solid var(--cds-border-subtle-01)', background: 'var(--cds-layer)' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', padding: '1.25rem 1.5rem' }}>
        <div>
          <div style={{ fontSize: '0.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: 'var(--cds-text-secondary)' }}>
            Operational quality workspace
          </div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--cds-text-primary)', marginTop: '0.125rem' }}>
            {tabLabel}
          </div>
          <p style={{ marginTop: '0.25rem', maxWidth: '48rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>
            {subtitleParts.length > 0
              ? subtitleParts.join(' • ')
              : 'Select a material and analysis scope to begin SPC review.'}
          </p>
          <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {material && (
              <StatusChip tone="slate">Material {material.material_id}</StatusChip>
            )}
            {mic && (
              <StatusChip tone="blue" icon={<Activity size={12} style={{ marginRight: '0.25rem' }} />}>
                {mic.chart_type === 'p_chart' ? 'Attribute analysis' : 'Variable analysis'}
              </StatusChip>
            )}
            {state.stratifyBy && (
              <StatusChip tone="blue">
                Stratified by {STRATIFY_LABELS[state.stratifyBy]}
              </StatusChip>
            )}
            {exclusions > 0 && (
              <StatusChip tone="amber" icon={<Security size={12} style={{ marginRight: '0.25rem' }} />}>
                {exclusions} exclusion{exclusions === 1 ? '' : 's'} active
              </StatusChip>
            )}
            {state.activeTab === 'charts' && (
              <StatusChip tone="green" icon={<Chemistry size={12} style={{ marginRight: '0.25rem' }} />}>
                {state.ruleSet === 'nelson' ? 'Nelson 8 rules' : 'WECO rules'}
              </StatusChip>
            )}
          </div>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>
          <StatusChip tone="slate">Mode: {state.limitsMode === 'locked' ? 'Locked limits' : 'Live limits'}</StatusChip>
          {(state.dateFrom || state.dateTo) && (
            <StatusChip tone="slate">
              {state.dateFrom && state.dateTo
                ? `${state.dateFrom} → ${state.dateTo}`
                : state.dateFrom
                  ? `From ${state.dateFrom}`
                  : `To ${state.dateTo}`}
            </StatusChip>
          )}
        </div>
      </div>
    </div>
  )
}
