import type { ReactNode } from 'react'

import type { SPCComputationResult } from '../types'
import { chartsMainClass, comparisonGridClass, strataSectionClass, strataSectionHeaderClass, strataSectionMetaClass, strataSectionTitleClass } from '../uiClasses'
import { StatusChip, SummaryMetric } from './ChartSummaryBar'

export interface StratumSection {
  label: string
  pointCount: number
  spc: SPCComputationResult | null
}

function getCapabilityHeadline(spc: SPCComputationResult | null): { label: 'Cpk' | 'Ppk'; value: number } | null {
  const cpk = spc?.capability?.cpk
  if (cpk != null) return { label: 'Cpk', value: cpk }
  const ppk = spc?.capability?.ppk
  if (ppk != null) return { label: 'Ppk', value: ppk }
  return null
}

interface StratificationPanelProps {
  micLabel: string
  stratifyBy: string
  sections: StratumSection[]
  renderChart: (spc: SPCComputationResult) => ReactNode
  renderSignals: (spc: SPCComputationResult) => ReactNode
  renderCapability: (spc: SPCComputationResult) => ReactNode
}

export default function StratificationPanel({
  micLabel,
  stratifyBy,
  sections,
  renderChart,
  renderSignals,
  renderCapability,
}: StratificationPanelProps) {
  if (sections.length <= 1) return null

  return (
    <div className="flex flex-col gap-5">
      {sections.map(section => {
        const stratumSignalCount = (section.spc?.signals?.length ?? 0) + (section.spc?.mrSignals?.length ?? 0)
        const stratumCapabilityHeadline = getCapabilityHeadline(section.spc)

        return (
          <section
            key={section.label}
            className={strataSectionClass}
            role="region"
            aria-label={`Stratum analysis for ${section.label}`}
          >
            <div className={strataSectionHeaderClass}>
              <div>
                <div className={strataSectionTitleClass}>
                  {micLabel} · {section.label}
                </div>
                <div className={strataSectionMetaClass}>
                  Stratified by {stratifyBy.replace(/_/g, ' ')} · {section.pointCount} point{section.pointCount !== 1 ? 's' : ''}
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <StatusChip tone={stratumSignalCount > 0 ? 'amber' : 'green'}>
                  {stratumSignalCount > 0 ? `${stratumSignalCount} signal${stratumSignalCount === 1 ? '' : 's'}` : 'No active signals'}
                </StatusChip>
                {stratumCapabilityHeadline != null && (
                  <StatusChip tone={stratumCapabilityHeadline.value >= 1.33 ? 'green' : stratumCapabilityHeadline.value >= 1.0 ? 'amber' : 'slate'}>
                    Headline {stratumCapabilityHeadline.label} {stratumCapabilityHeadline.value.toFixed(2)}
                  </StatusChip>
                )}
              </div>
            </div>

            <div className="mb-5 grid gap-3 md:grid-cols-3">
              <SummaryMetric
                label="Points"
                value={String(section.pointCount)}
                meta="Data included after the current exclusion and outlier rules"
                tone="slate"
              />
              <SummaryMetric
                label="Signals"
                value={String(stratumSignalCount)}
                meta={stratumSignalCount > 0 ? 'Assignable-cause review still required' : 'No active rule breaches'}
                tone={stratumSignalCount > 0 ? 'amber' : 'green'}
              />
              <SummaryMetric
                label="Capability"
                value={stratumCapabilityHeadline != null ? stratumCapabilityHeadline.value.toFixed(2) : '—'}
                meta={section.spc?.capability?.capabilityMethod === 'non_parametric' ? 'Empirical percentile method active' : 'Short-term and long-term evidence available'}
                tone={stratumCapabilityHeadline == null ? 'slate' : stratumCapabilityHeadline.value >= 1.33 ? 'green' : stratumCapabilityHeadline.value >= 1.0 ? 'amber' : 'red'}
              />
            </div>

            {section.spc && (
              <>
                <div className={chartsMainClass}>{renderChart(section.spc)}</div>
                <div className={`mt-5 ${comparisonGridClass}`}>
                  {renderSignals(section.spc)}
                  <div className="flex flex-col gap-4">{renderCapability(section.spc)}</div>
                </div>
              </>
            )}
          </section>
        )
      })}
    </div>
  )
}
