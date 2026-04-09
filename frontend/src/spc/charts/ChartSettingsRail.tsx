import { useState, type ReactNode } from 'react'
import {
  Button,
  Checkbox,
  RadioButton,
  RadioButtonGroup,
} from '~/lib/carbon-forms'
import { Accordion, AccordionItem } from '~/lib/carbon-feedback'
import { Stack, Tag, Tile } from '~/lib/carbon-layout'
import type { ChartDataPoint, LockedLimits } from '../types'

export type AttributeChartType = 'p_chart' | 'np_chart' | 'c_chart' | 'u_chart'
export type QuantChartType = 'imr' | 'xbar_r'

function ChartTypeToggle({
  chartType,
  override,
  onOverride,
}: {
  chartType?: string | null
  override: QuantChartType | null
  onOverride: (value: QuantChartType | null) => void
}) {
  const effectiveType = override ?? chartType ?? 'imr'

  return (
    <Stack gap={3}>
      <RadioButtonGroup
        legendText="Chart type"
        name="spc-quant-chart-type"
        orientation="vertical"
        valueSelected={effectiveType}
        onChange={(value) => onOverride(value === chartType ? null : (value as QuantChartType))}
      >
        <RadioButton
          id="spc-quant-chart-imr"
          value="imr"
          labelText="I-MR"
        />
        <RadioButton
          id="spc-quant-chart-xbar-r"
          value="xbar_r"
          labelText="X̄-R"
        />
      </RadioButtonGroup>

      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        {override && (
          <Button kind="ghost" size="sm" onClick={() => onOverride(null)}>
            Reset to auto
          </Button>
        )}
        {chartType && !override && (
          <Tag type="cool-gray" size="sm">
            auto-detected
          </Tag>
        )}
      </div>
    </Stack>
  )
}

function AttributeChartTypeToggle({
  attrChartType,
  onSet,
}: {
  attrChartType: AttributeChartType
  onSet: (value: AttributeChartType) => void
}) {
  const options: Array<{ type: AttributeChartType; label: string; title: string }> = [
    { type: 'p_chart', label: 'P', title: 'Proportion nonconforming (variable sample size)' },
    { type: 'np_chart', label: 'NP', title: 'Number nonconforming (constant sample size)' },
    { type: 'c_chart', label: 'C', title: 'Count of defects per unit (constant area of opportunity)' },
    { type: 'u_chart', label: 'U', title: 'Defects per unit (variable area of opportunity)' },
  ]

  return (
    <RadioButtonGroup
      legendText="Chart type"
      name="spc-attribute-chart-type"
      orientation="vertical"
      valueSelected={attrChartType}
      onChange={(value) => onSet(value as AttributeChartType)}
    >
      {options.map(({ type, label, title }) => (
        <RadioButton
          key={type}
          id={`spc-attribute-chart-${type}`}
          value={type}
          labelText={label}
          title={title}
        />
      ))}
    </RadioButtonGroup>
  )
}

function RuleSetToggle({
  ruleSet,
  onSet,
}: {
  ruleSet: 'weco' | 'nelson'
  onSet: (value: 'weco' | 'nelson') => void
}) {
  return (
    <RadioButtonGroup
      legendText="Rule set"
      name="spc-rule-set"
      orientation="vertical"
      valueSelected={ruleSet}
      onChange={(value) => onSet(value as 'weco' | 'nelson')}
    >
      <RadioButton
        id="spc-rule-set-weco"
        value="weco"
        labelText="WECO"
        title="Western Electric rules (4 tests)"
      />
      <RadioButton
        id="spc-rule-set-nelson"
        value="nelson"
        labelText="Nelson"
        title="Nelson rules (8 tests)"
      />
    </RadioButtonGroup>
  )
}

interface ChartSettingsRailProps {
  ruleSet: 'weco' | 'nelson'
  onRuleSetChange: (value: 'weco' | 'nelson') => void
  selectedMicChartType?: string | null
  chartTypeOverride: QuantChartType | null
  onChartTypeOverride: (value: QuantChartType | null) => void
  attrChartType: AttributeChartType
  onAttrChartTypeChange: (value: AttributeChartType) => void
  isAttributeChart: boolean
  lockedLimits: LockedLimits | null
  limitsMode: 'live' | 'locked'
  onLimitsMode: (value: 'live' | 'locked') => void
  canLockLimits: boolean
  onLockLimits: () => void
  onDeleteLock: () => void
  quantPoints: ChartDataPoint[]
  excludeOutliers: boolean
  onToggleExcludeOutliers: () => void
  exclusionCount: number
  exclusionsSaving: boolean
  onRestoreAll: () => void
  canAutoClean: boolean
  onAutoClean: () => void
  extraContent?: ReactNode
}

export default function ChartSettingsRail({
  ruleSet,
  onRuleSetChange,
  selectedMicChartType,
  chartTypeOverride,
  onChartTypeOverride,
  attrChartType,
  onAttrChartTypeChange,
  isAttributeChart,
  lockedLimits,
  limitsMode,
  onLimitsMode,
  canLockLimits,
  onLockLimits,
  onDeleteLock,
  quantPoints,
  excludeOutliers,
  onToggleExcludeOutliers,
  exclusionCount,
  exclusionsSaving,
  onRestoreAll,
  canAutoClean,
  onAutoClean,
  extraContent,
}: ChartSettingsRailProps) {
  const outlierCount = quantPoints.filter(point => point.is_outlier).length
  const [advancedOpen, setAdvancedOpen] = useState(false)

  const hasAdvancedContent = !isAttributeChart && (
    outlierCount > 0 || lockedLimits != null || canLockLimits
  )

  return (
    <Tile>
      <Stack gap={5}>
        <p
          style={{
            margin: 0,
            fontSize: '0.75rem',
            fontWeight: 600,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: 'var(--cds-text-secondary)',
          }}
        >
          Analysis controls
        </p>

        {isAttributeChart ? (
          <AttributeChartTypeToggle attrChartType={attrChartType} onSet={onAttrChartTypeChange} />
        ) : (
          <ChartTypeToggle
            chartType={selectedMicChartType}
            override={chartTypeOverride}
            onOverride={onChartTypeOverride}
          />
        )}

        {!isAttributeChart && (exclusionCount > 0 || canAutoClean) && (
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {exclusionCount > 0 && (
              <Button
                kind="secondary"
                size="sm"
                disabled={exclusionsSaving}
                onClick={onRestoreAll}
              >
                Clear {exclusionCount} exclusion{exclusionCount !== 1 ? 's' : ''}
              </Button>
            )}
            {canAutoClean && (
              <Button
                kind="secondary"
                size="sm"
                disabled={exclusionsSaving}
                onClick={onAutoClean}
                title="Iteratively remove Rule 1 OOC points to establish Phase I baseline limits"
              >
                Auto-clean Phase I
              </Button>
            )}
          </div>
        )}

        <Accordion align="start">
          <AccordionItem
            open={advancedOpen}
            onHeadingClick={() => setAdvancedOpen((value) => !value)}
            title={hasAdvancedContent ? 'Advanced settings' : 'Advanced settings (limited)'}
          >
            <Stack gap={5}>
              <RuleSetToggle ruleSet={ruleSet} onSet={onRuleSetChange} />

              {!isAttributeChart && outlierCount > 0 && (
                <Checkbox
                  id="spc-exclude-outliers"
                  labelText={`Exclude outliers (${outlierCount})`}
                  checked={excludeOutliers}
                  onChange={onToggleExcludeOutliers}
                />
              )}

              {!isAttributeChart && (
                <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  {lockedLimits && (
                    <Button
                      kind={limitsMode === 'locked' ? 'primary' : 'secondary'}
                      size="sm"
                      onClick={() => onLimitsMode(limitsMode === 'locked' ? 'live' : 'locked')}
                      title={`Locked ${lockedLimits.locked_at?.substring(0, 10) ?? ''} by ${lockedLimits.locked_by ?? 'unknown'}`}
                    >
                      {limitsMode === 'locked' ? 'Locked Limits' : 'Use Locked Limits'}
                    </Button>
                  )}
                  {canLockLimits && limitsMode === 'live' && (
                    <Button
                      kind="secondary"
                      size="sm"
                      onClick={onLockLimits}
                      title="Lock current control limits for Phase II monitoring"
                    >
                      Lock Limits
                    </Button>
                  )}
                  {lockedLimits && limitsMode === 'locked' && (
                    <Button
                      kind="danger"
                      size="sm"
                      onClick={onDeleteLock}
                      title="Remove locked limits"
                    >
                      Delete Lock
                    </Button>
                  )}
                </div>
              )}
            </Stack>
          </AccordionItem>
        </Accordion>

        {extraContent}
      </Stack>
    </Tile>
  )
}
