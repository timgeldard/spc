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
    ? 'border-emerald-200 bg-emerald-50'
    : tone === 'amber'
      ? 'border-amber-200 bg-amber-50'
      : tone === 'red'
        ? 'border-red-200 bg-red-50'
        : 'border-[var(--c-border)] bg-slate-50/80'

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
  stratifyLabel?: string | null
  quantNormality?: NormalityResult | null
  ruleSet: 'weco' | 'nelson'
  actionRail?: ReactNode
}

export default function ChartSummaryBar({
  title,
  materialName,
  inspectionMethod,
  chartFamilyLabel,
  totalSignals,
  exclusionCount,
  capabilityHeadline,
  stratifyLabel,
  quantNormality,
  ruleSet,
  actionRail,
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
                Headline Cpk {capabilityHeadline.toFixed(2)}
              </StatusChip>
            )}
            {stratifyLabel && <StatusChip tone="blue">Stratified by {stratifyLabel}</StatusChip>}
            {exclusionCount > 0 && <StatusChip tone="amber">{exclusionCount} audited exclusion{exclusionCount === 1 ? '' : 's'}</StatusChip>}
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
