import { Button } from '~/lib/carbon-forms'
import { Column, Grid, Stack, Tag, Tile } from '~/lib/carbon-layout'
import type { ReactNode } from 'react'

import type { NormalityResult } from '../types'

type StatusTone = 'slate' | 'amber' | 'green' | 'blue'
type SummaryTone = 'slate' | 'green' | 'amber' | 'red'

interface SummaryMetricProps {
  label: string
  value: string
  meta: string
  tone?: SummaryTone
}

export function StatusChip({ children, tone = 'slate' }: { children: ReactNode; tone?: StatusTone }) {
  const type = tone === 'amber'
    ? 'warm-gray'
    : tone === 'green'
      ? 'green'
      : tone === 'blue'
        ? 'blue'
        : 'cool-gray'

  return <Tag type={type} size="sm">{children}</Tag>
}

export function SummaryMetric({
  label,
  value,
  meta,
  tone = 'slate',
}: SummaryMetricProps) {
  const toneStyle = tone === 'green'
    ? { border: '1px solid var(--cds-support-success)', background: 'color-mix(in srgb, var(--cds-support-success) 10%, var(--cds-layer) 90%)' }
    : tone === 'amber'
      ? { border: '1px solid var(--cds-support-warning)', background: 'color-mix(in srgb, var(--cds-support-warning) 12%, var(--cds-layer) 88%)' }
      : tone === 'red'
        ? { border: '1px solid var(--cds-support-error)', background: 'color-mix(in srgb, var(--cds-support-error) 10%, var(--cds-layer) 90%)' }
        : { border: '1px solid var(--cds-border-subtle-01)', background: 'var(--cds-layer-accent-01)' }

  return (
    <Tile style={toneStyle}>
      <Stack gap={2}>
        <div style={{ fontSize: '0.75rem', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase', color: 'var(--cds-text-secondary)' }}>{label}</div>
        <div style={{ fontSize: '1.75rem', fontWeight: 700, lineHeight: 1, color: 'var(--cds-text-primary)' }}>{value}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)' }}>{meta}</div>
      </Stack>
    </Tile>
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
  limitsSourceLabel?: string | null
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
  limitsSourceLabel,
  onExclusionClick,
}: ChartSummaryBarProps) {
  return (
    <Tile>
      <Stack gap={5}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '1rem', flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--cds-text-primary)' }}>{title}</span>
              <span style={{ fontSize: '0.875rem', color: 'var(--cds-text-secondary)' }}>· {materialName}</span>
            </div>
            {inspectionMethod && (
              <div style={{ display: 'flex', gap: '1rem', fontSize: '0.875rem', color: 'var(--cds-text-secondary)', marginTop: '0.5rem' }}>
                <span>Method: {inspectionMethod}</span>
              </div>
            )}
            <div style={{ marginTop: '0.75rem', display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
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
                    <Button
                      kind="ghost"
                      size="sm"
                      onClick={onExclusionClick}
                      title="Click to view excluded points"
                    >
                      {exclusionCount} audited exclusion{exclusionCount === 1 ? '' : 's'}
                    </Button>
                  )
                  : <StatusChip tone="amber">{exclusionCount} audited exclusion{exclusionCount === 1 ? '' : 's'}</StatusChip>
              )}
              {limitsMode === 'locked' && lockedLimits && (
                <StatusChip tone="blue">
                  Limits locked{lockedLimits.locked_at ? ` · ${lockedLimits.locked_at.substring(0, 10)}` : ''}
                </StatusChip>
              )}
              {limitsSourceLabel && (
                <StatusChip tone={limitsSourceLabel === 'Governed' ? 'green' : limitsSourceLabel === 'Locked' ? 'blue' : 'amber'}>
                  Limits: {limitsSourceLabel}
                </StatusChip>
              )}
              {quantNormality?.is_normal === false && <StatusChip tone="amber">Non-normal capability override</StatusChip>}
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem' }}>{actionRail}</div>
        </div>

        <Grid condensed>
          <Column sm={4} md={4} lg={4}>
            <SummaryMetric
              label="Signals"
              value={String(totalSignals)}
              meta={totalSignals > 0 ? 'Investigate assignable causes before interpreting capability' : 'No current signal breaches'}
              tone={totalSignals > 0 ? 'amber' : 'green'}
            />
          </Column>
          <Column sm={4} md={4} lg={4}>
            <SummaryMetric
              label="Excluded points"
              value={String(exclusionCount)}
              meta={exclusionCount > 0 ? 'Persisted with justification and limits snapshot' : 'No active exclusions'}
              tone={exclusionCount > 0 ? 'amber' : 'slate'}
            />
          </Column>
          <Column sm={4} md={4} lg={4}>
            <SummaryMetric
              label="Rule set"
              value={ruleSet === 'nelson' ? 'Nelson 8' : 'WECO'}
              meta="Signal interpretation stays separate from capability evidence"
            />
          </Column>
          <Column sm={4} md={4} lg={4}>
            <SummaryMetric
              label="Capability mode"
              value={quantNormality?.is_normal === false ? 'Empirical' : 'Parametric'}
              meta={quantNormality?.is_normal === false ? 'Non-normal percentiles are active' : 'Standard sigma-based capability'}
              tone={quantNormality?.is_normal === false ? 'amber' : 'green'}
            />
          </Column>
        </Grid>
      </Stack>
    </Tile>
  )
}
