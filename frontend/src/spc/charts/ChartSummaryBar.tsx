import type { ReactNode } from 'react'

import type { NormalityResult } from '../types'
import {
  badgeAmberClass,
  badgeBlueClass,
  badgeGreenClass,
  badgeSlateClass,
  chartsHeaderClass,
  chartsHeaderRightClass,
  chartsHeaderTopClass,
  chartsMaterialClass,
  chartsMicMetaClass,
  chartsTitleClass,
  metricCardClass,
  metricCardLabelClass,
  metricCardMetaClass,
  metricCardValueClass,
  metricGridClass,
  statusChipClass,
} from '../uiClasses'

type StatusTone = 'slate' | 'amber' | 'green' | 'blue'
type SummaryTone = 'slate' | 'green' | 'amber' | 'red'

interface SummaryMetricProps {
  label: string
  value: string
  meta: string
  tone?: SummaryTone
}

export function StatusChip({ children, tone = 'slate' }: { children: ReactNode; tone?: StatusTone }) {
  const toneClass = tone === 'amber'
    ? badgeAmberClass
    : tone === 'green'
      ? badgeGreenClass
      : tone === 'blue'
        ? badgeBlueClass
        : badgeSlateClass

  return <span className={`${statusChipClass} ${toneClass}`}>{children}</span>
}

export function SummaryMetric({
  label,
  value,
  meta,
  tone = 'slate',
}: SummaryMetricProps) {
  const toneClass = tone === 'green'
    ? 'border-[#8FE2BE] bg-[#DAF5E9]'              /* Jade */
    : tone === 'amber'
      ? 'border-[#FDE79D] bg-[#FEF3CE]'            /* Sunrise */
      : tone === 'red'
        ? 'border-[#FAB799] bg-[#FCDBCC]'          /* Sunset */
        : 'border-[var(--c-border)] bg-[#F4F4EA]'  /* Stone/Slate */

  return (
    <div className={`${metricCardClass} ${toneClass}`}>
      <div className={metricCardLabelClass}>{label}</div>
      <div className={metricCardValueClass}>{value}</div>
      <div className={metricCardMetaClass}>{meta}</div>
    </div>
  )
}

interface ChartSummaryBarProps {
  title: string
  materialName: string
  inspectionMethod?: string | null
  chartFamilyLabel: string
  totalSignals: number
  exclusionCount: number
  capabilityHeadline: number | null
  capabilityHeadlineLabel?: 'Cpk' | 'Ppk' | 'Capability' | null
  stratifyLabel?: string | null
  quantNormality?: NormalityResult | null
  ruleSet: 'weco' | 'nelson'
  actionRail?: ReactNode
  lockedLimits?: { locked_at?: string | null; locked_by?: string | null } | null
  limitsMode?: 'live' | 'locked'
  onExclusionClick?: () => void
}

export default function ChartSummaryBar({
  title,
  materialName,
  inspectionMethod,
  chartFamilyLabel,
  totalSignals,
  exclusionCount,
  capabilityHeadline,
  capabilityHeadlineLabel,
  stratifyLabel,
  quantNormality,
  ruleSet,
  actionRail,
  lockedLimits,
  limitsMode,
  onExclusionClick,
}: ChartSummaryBarProps) {
  return (
    <div className={chartsHeaderClass}>
      <div className={chartsHeaderTopClass}>
        <div>
          <span className={chartsTitleClass}>{title}</span>
          <span className={chartsMaterialClass}> · {materialName}</span>
          {inspectionMethod && (
            <div className={chartsMicMetaClass}>
              <span>Method: {inspectionMethod}</span>
            </div>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusChip tone="blue">{chartFamilyLabel}</StatusChip>
            <StatusChip tone={totalSignals > 0 ? 'amber' : 'green'}>
              {totalSignals > 0 ? `${totalSignals} active signal${totalSignals === 1 ? '' : 's'}` : 'No active signals'}
            </StatusChip>
            {capabilityHeadline != null && (
              <StatusChip tone={capabilityHeadline >= 1.33 ? 'green' : capabilityHeadline >= 1.0 ? 'amber' : 'slate'}>
                Headline {capabilityHeadlineLabel ?? 'Capability'} {capabilityHeadline.toFixed(2)}
              </StatusChip>
            )}
            {stratifyLabel && <StatusChip tone="blue">Stratified by {stratifyLabel}</StatusChip>}
            {exclusionCount > 0 && (
              onExclusionClick
                ? (
                  <button
                    onClick={onExclusionClick}
                    className={`${statusChipClass} ${badgeAmberClass} hover:opacity-80 transition-opacity`}
                    title="Click to view excluded points"
                  >
                    {exclusionCount} audited exclusion{exclusionCount === 1 ? '' : 's'}
                  </button>
                )
                : <StatusChip tone="amber">{exclusionCount} audited exclusion{exclusionCount === 1 ? '' : 's'}</StatusChip>
            )}
            {limitsMode === 'locked' && lockedLimits && (
              <StatusChip tone="blue">
                🔒 Limits locked{lockedLimits.locked_at ? ` · ${lockedLimits.locked_at.substring(0, 10)}` : ''}
              </StatusChip>
            )}
            {quantNormality?.is_normal === false && <StatusChip tone="amber">Non-normal capability override</StatusChip>}
          </div>
        </div>
        <div className={chartsHeaderRightClass}>{actionRail}</div>
      </div>

      <div className={metricGridClass}>
        <SummaryMetric
          label="Signals"
          value={String(totalSignals)}
          meta={totalSignals > 0 ? 'Investigate assignable causes before interpreting capability' : 'No current signal breaches'}
          tone={totalSignals > 0 ? 'amber' : 'green'}
        />
        <SummaryMetric
          label="Excluded points"
          value={String(exclusionCount)}
          meta={exclusionCount > 0 ? 'Persisted with justification and limits snapshot' : 'No active exclusions'}
          tone={exclusionCount > 0 ? 'amber' : 'slate'}
        />
        <SummaryMetric
          label="Rule set"
          value={ruleSet === 'nelson' ? 'Nelson 8' : 'WECO'}
          meta="Signal interpretation stays separate from capability evidence"
        />
        <SummaryMetric
          label="Capability mode"
          value={quantNormality?.is_normal === false ? 'Empirical' : 'Parametric'}
          meta={quantNormality?.is_normal === false ? 'Non-normal percentiles are active' : 'Standard sigma-based capability'}
          tone={quantNormality?.is_normal === false ? 'amber' : 'green'}
        />
      </div>
    </div>
  )
}
