import type { ReactNode } from 'react'
import { Activity, FlaskConical, ShieldCheck } from 'lucide-react'
import { useSPC } from './SPCContext'
import type { StratifyByKey } from './types'
import {
  badgeAmberClass,
  badgeBlueClass,
  badgeGreenClass,
  badgeSlateClass,
  pageActionRailClass,
  pageEyebrowClass,
  pageHeaderClass,
  pageHeaderWrapClass,
  pageStatusRowClass,
  pageSubtitleClass,
  pageTitleClass,
  statusChipClass,
} from './uiClasses'

const TAB_LABELS = {
  flow: 'Process Flow',
  charts: 'Control Charts',
  scorecard: 'Scorecard',
  compare: 'Compare',
  msa: 'MSA',
  correlation: 'Correlation',
} as const

const STRATIFY_LABELS: Record<StratifyByKey, string> = {
  plant_id: 'Plant',
  inspection_lot_id: 'Inspection Lot',
  operation_id: 'Operation',
}

function StatusChip({
  children,
  tone,
  icon,
}: {
  children: ReactNode
  tone: 'slate' | 'blue' | 'green' | 'amber'
  icon?: ReactNode
}) {
  const toneClass = tone === 'blue'
    ? badgeBlueClass
    : tone === 'green'
      ? badgeGreenClass
      : tone === 'amber'
        ? badgeAmberClass
        : badgeSlateClass

  return (
    <span className={`${statusChipClass} ${toneClass}`}>
      {icon}
      {children}
    </span>
  )
}

export default function SPCPageHeader() {
  const { state } = useSPC()
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
    <div className={pageHeaderWrapClass}>
      <div className={pageHeaderClass}>
        <div>
          <div className={pageEyebrowClass}>Operational quality workspace</div>
          <div className={pageTitleClass}>{tabLabel}</div>
          <p className={pageSubtitleClass}>
            {subtitleParts.length > 0
              ? subtitleParts.join(' • ')
              : 'Select a material and analysis scope to begin SPC review.'}
          </p>
          <div className={pageStatusRowClass}>
            {material && (
              <StatusChip tone="slate">Material {material.material_id}</StatusChip>
            )}
            {mic && (
              <StatusChip tone="blue" icon={<Activity size={12} className="mr-1" />}>
                {mic.chart_type === 'p_chart' ? 'Attribute analysis' : 'Variable analysis'}
              </StatusChip>
            )}
            {state.stratifyBy && (
              <StatusChip tone="blue">
                Stratified by {STRATIFY_LABELS[state.stratifyBy]}
              </StatusChip>
            )}
            {exclusions > 0 && (
              <StatusChip tone="amber" icon={<ShieldCheck size={12} className="mr-1" />}>
                {exclusions} exclusion{exclusions === 1 ? '' : 's'} active
              </StatusChip>
            )}
            {state.activeTab === 'charts' && (
              <StatusChip tone="green" icon={<FlaskConical size={12} className="mr-1" />}>
                {state.ruleSet === 'nelson' ? 'Nelson 8 rules' : 'WECO rules'}
              </StatusChip>
            )}
          </div>
        </div>
        <div className={pageActionRailClass}>
          <StatusChip tone="slate">Mode: {state.limitsMode === 'locked' ? 'Locked limits' : 'Live limits'}</StatusChip>
          {state.dateFrom && (
            <StatusChip tone="slate">From {state.dateFrom}</StatusChip>
          )}
          {state.dateTo && (
            <StatusChip tone="slate">To {state.dateTo}</StatusChip>
          )}
        </div>
      </div>
    </div>
  )
}
