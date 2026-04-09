import { useState, type ReactNode } from 'react'
import { Button } from '../../components/ui'
import type { ChartDataPoint, LockedLimits } from '../types'
import {
  checkboxLabelClass,
  settingsRailClass,
  settingsRailLabelClass,
  settingsRailRowClass,
  toggleAutoClass,
  toggleButtonActiveClass,
  toggleButtonBaseClass,
  toggleButtonResetClass,
  toggleGroupClass,
  toggleLabelClass,
} from '../uiClasses'

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
  return (
    <div role="radiogroup" aria-label="Chart type" className={toggleGroupClass}>
      <span className={toggleLabelClass} aria-hidden="true">Chart type:</span>
      {(['imr', 'xbar_r'] as const).map(type => (
        <button
          key={type}
          role="radio"
          aria-checked={(override ?? chartType) === type}
          className={`${toggleButtonBaseClass} ${((override ?? chartType) === type) ? toggleButtonActiveClass : ''}`}
          onClick={() => onOverride(type === chartType ? null : type)}
          title={type === 'imr' ? 'Individuals + Moving Range' : 'X-bar + Range'}
        >
          {type === 'imr' ? 'I-MR' : 'X̄-R'}
        </button>
      ))}
      {override && (
        <button className={`${toggleButtonBaseClass} ${toggleButtonResetClass}`} onClick={() => onOverride(null)}>
          Reset to auto
        </button>
      )}
      {chartType && !override && <span className={toggleAutoClass}>auto-detected</span>}
    </div>
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
    <div role="radiogroup" aria-label="Attribute chart type" className={toggleGroupClass}>
      <span className={toggleLabelClass} aria-hidden="true">Chart type:</span>
      {options.map(({ type, label, title }) => (
        <button
          key={type}
          role="radio"
          aria-checked={attrChartType === type}
          className={`${toggleButtonBaseClass} ${attrChartType === type ? toggleButtonActiveClass : ''}`}
          onClick={() => onSet(type)}
          title={title}
        >
          {label}
        </button>
      ))}
    </div>
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
    <div role="radiogroup" aria-label="Rule set" className={toggleGroupClass}>
      <span className={toggleLabelClass} aria-hidden="true">Rules:</span>
      <button
        role="radio"
        aria-checked={ruleSet === 'weco'}
        className={`${toggleButtonBaseClass} ${ruleSet === 'weco' ? toggleButtonActiveClass : ''}`}
        onClick={() => onSet('weco')}
        title="Western Electric rules (4 tests)"
      >
        WECO
      </button>
      <button
        role="radio"
        aria-checked={ruleSet === 'nelson'}
        className={`${toggleButtonBaseClass} ${ruleSet === 'nelson' ? toggleButtonActiveClass : ''}`}
        onClick={() => onSet('nelson')}
        title="Nelson rules (8 tests)"
      >
        Nelson
      </button>
    </div>
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
    <div className={settingsRailClass}>
      <div className={settingsRailLabelClass}>Analysis controls</div>

      {/* ── Always-visible: chart type ── */}
      <div className={settingsRailRowClass}>
        {isAttributeChart ? (
          <AttributeChartTypeToggle attrChartType={attrChartType} onSet={onAttrChartTypeChange} />
        ) : (
          <ChartTypeToggle
            chartType={selectedMicChartType}
            override={chartTypeOverride}
            onOverride={onChartTypeOverride}
          />
        )}
      </div>

      {/* ── Always-visible: exclusion actions ── */}
      {!isAttributeChart && (exclusionCount > 0 || canAutoClean) && (
        <div className={settingsRailRowClass}>
          {exclusionCount > 0 && (
            <Button
              size="sm"
              variant="secondary"
              loading={exclusionsSaving}
              onClick={onRestoreAll}
            >
              Clear {exclusionCount} exclusion{exclusionCount !== 1 ? 's' : ''}
            </Button>
          )}
          {canAutoClean && (
            <Button
              size="sm"
              variant="secondary"
              loading={exclusionsSaving}
              onClick={onAutoClean}
              title="Iteratively remove Rule 1 OOC points to establish Phase I baseline limits"
            >
              Auto-clean Phase I
            </Button>
          )}
        </div>
      )}

      {/* ── Advanced settings disclosure ── */}
      {(hasAdvancedContent || true) && (
        <div className="border-t border-[var(--c-border)] pt-2">
          <button
            className="flex w-full items-center justify-between text-[0.72rem] font-semibold uppercase tracking-[0.05em] text-[var(--c-text-muted)] hover:text-[var(--c-text)] transition-colors"
            aria-expanded={advancedOpen}
            onClick={() => setAdvancedOpen(v => !v)}
          >
            Advanced settings
            <svg
              width="12" height="12" viewBox="0 0 12 12" fill="none"
              className={`transition-transform duration-200 ${advancedOpen ? 'rotate-180' : ''}`}
              aria-hidden="true"
            >
              <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>

          {advancedOpen && (
            <div className="mt-2 space-y-2">
              <div className={settingsRailRowClass}>
                <RuleSetToggle ruleSet={ruleSet} onSet={onRuleSetChange} />
              </div>

              {!isAttributeChart && outlierCount > 0 && (
                <div className={settingsRailRowClass}>
                  <label className={checkboxLabelClass}>
                    <input type="checkbox" checked={excludeOutliers} onChange={onToggleExcludeOutliers} />
                    Exclude outliers ({outlierCount})
                  </label>
                </div>
              )}

              {!isAttributeChart && (
                <div className={settingsRailRowClass}>
                  {lockedLimits && (
                    <Button
                      size="sm"
                      variant={limitsMode === 'locked' ? 'primary' : 'secondary'}
                      onClick={() => onLimitsMode(limitsMode === 'locked' ? 'live' : 'locked')}
                      title={`Locked ${lockedLimits.locked_at?.substring(0, 10) ?? ''} by ${lockedLimits.locked_by ?? 'unknown'}`}
                    >
                      {limitsMode === 'locked' ? 'Locked Limits' : 'Use Locked Limits'}
                    </Button>
                  )}
                  {canLockLimits && limitsMode === 'live' && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={onLockLimits}
                      title="Lock current control limits for Phase II monitoring"
                    >
                      Lock Limits
                    </Button>
                  )}
                  {lockedLimits && limitsMode === 'locked' && (
                    <Button
                      size="sm"
                      variant="danger"
                      onClick={onDeleteLock}
                      title="Remove locked limits"
                    >
                      Delete Lock
                    </Button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {extraContent}
    </div>
  )
}
