import { Column, Grid, Stack, Tile } from '~/lib/carbon-layout'
import type { ReactNode } from 'react'

import type { SPCComputationResult } from '../types'
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {sections.map(section => {
        const stratumSignalCount = (section.spc?.signals?.length ?? 0) + (section.spc?.mrSignals?.length ?? 0)
        const stratumCapabilityHeadline = getCapabilityHeadline(section.spc)

        return (
          <Tile
            key={section.label}
            role="region"
            aria-label={`Stratum analysis for ${section.label}`}
          >
            <Stack gap={5}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.75rem', flexWrap: 'wrap', paddingBottom: '0.75rem', borderBottom: '1px solid var(--cds-border-subtle-01)' }}>
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
                    {micLabel} · {section.label}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>
                    Stratified by {stratifyBy.replace(/_/g, ' ')} · {section.pointCount} point{section.pointCount !== 1 ? 's' : ''}
                  </div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
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

              <Grid condensed>
                <Column sm={4} md={3} lg={5}>
                  <SummaryMetric
                    label="Points"
                    value={String(section.pointCount)}
                    meta="Data included after the current exclusion and outlier rules"
                    tone="slate"
                  />
                </Column>
                <Column sm={4} md={3} lg={5}>
                  <SummaryMetric
                    label="Signals"
                    value={String(stratumSignalCount)}
                    meta={stratumSignalCount > 0 ? 'Assignable-cause review still required' : 'No active rule breaches'}
                    tone={stratumSignalCount > 0 ? 'amber' : 'green'}
                  />
                </Column>
                <Column sm={4} md={2} lg={6}>
                  <SummaryMetric
                    label="Capability"
                    value={stratumCapabilityHeadline != null ? stratumCapabilityHeadline.value.toFixed(2) : '—'}
                    meta={section.spc?.capability?.capabilityMethod === 'non_parametric' ? 'Empirical percentile method active' : 'Short-term and long-term evidence available'}
                    tone={stratumCapabilityHeadline == null ? 'slate' : stratumCapabilityHeadline.value >= 1.33 ? 'green' : stratumCapabilityHeadline.value >= 1.0 ? 'amber' : 'red'}
                  />
                </Column>
              </Grid>

              {section.spc && (
                <>
                  <div style={{ border: '1px solid var(--cds-border-subtle-01)', background: 'var(--cds-layer)', padding: '1rem' }}>{renderChart(section.spc)}</div>
                  <div style={{ marginTop: '1.25rem', display: 'grid', gap: '1rem' }}>
                    {renderSignals(section.spc)}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>{renderCapability(section.spc)}</div>
                  </div>
                </>
              )}
            </Stack>
          </Tile>
        )
      })}
    </div>
  )
}
