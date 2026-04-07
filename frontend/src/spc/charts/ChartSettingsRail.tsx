import type { ReactNode } from 'react'

import type { ChartDataPoint, LockedLimits } from '../types'
import {
  buttonBaseClass,
  buttonDangerClass,
  buttonPrimaryClass,
  buttonSecondaryClass,
  buttonSmClass,
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
    <div className={toggleGroupClass}>
      <span className={toggleLabelClass}>Chart type:</span>
      {(['imr', 'xbar_r'] as const).map(type => (
        <button
          key={type}
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
    <div className={toggleGroupClass}>
      <span className={toggleLabelClass}>Chart type:</span>
      {options.map(({ type, label, title }) => (
        <button
          key={type}
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
    <div className={toggleGroupClass}>
      <span className={toggleLabelClass}>Rules:</span>
      <button
        className={`${toggleButtonBaseClass} ${ruleSet === 'weco' ? toggleButtonActiveClass : ''}`}
        onClick={() => onSet('weco')}
        title="Western Electric rules (4 tests)"
      >
        WECO
      </button>
      <button
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

  return (
    <div className={settingsRailClass}>
      <div className={settingsRailLabelClass}>Analysis controls</div>
      <div className={settingsRailRowClass}>
        <RuleSetToggle ruleSet={ruleSet} onSet={onRuleSetChange} />
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
      {!isAttributeChart && (
        <>
          <div className={settingsRailRowClass}>
            {lockedLimits && (
              <button
                className={`${buttonBaseClass} ${buttonSmClass} ${limitsMode === 'locked' ? buttonPrimaryClass : buttonSecondaryClass}`}
                onClick={() => onLimitsMode(limitsMode === 'locked' ? 'live' : 'locked')}
                title={`Locked ${lockedLimits.locked_at?.substring(0, 10) ?? ''} by ${lockedLimits.locked_by ?? 'unknown'}`}
              >
                {limitsMode === 'locked' ? 'Locked Limits' : 'Use Locked Limits'}
              </button>
            )}
            {canLockLimits && limitsMode === 'live' && (
              <button
                className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
                onClick={onLockLimits}
                title="Lock current control limits for Phase II monitoring"
              >
                Lock Limits
              </button>
            )}
            {lockedLimits && limitsMode === 'locked' && (
              <button
                className={`${buttonBaseClass} ${buttonSmClass} ${buttonDangerClass}`}
                onClick={onDeleteLock}
                title="Remove locked limits"
              >
                Delete Lock
              </button>
            )}
          </div>
          <div className={settingsRailRowClass}>
            {outlierCount > 0 && (
              <label className={checkboxLabelClass}>
                <input type="checkbox" checked={excludeOutliers} onChange={onToggleExcludeOutliers} />
                Exclude outliers ({outlierCount})
              </label>
            )}
            {exclusionCount > 0 && (
              <button
                className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
                disabled={exclusionsSaving}
                onClick={onRestoreAll}
              >
                Clear {exclusionCount} exclusion{exclusionCount !== 1 ? 's' : ''}
              </button>
            )}
            {canAutoClean && (
              <button
                className={`${buttonBaseClass} ${buttonSmClass} ${buttonSecondaryClass}`}
                disabled={exclusionsSaving}
                onClick={onAutoClean}
                title="Iteratively remove Rule 1 OOC points to establish Phase I baseline limits"
              >
                {exclusionsSaving ? 'Saving…' : 'Auto-clean Phase I'}
              </button>
            )}
          </div>
        </>
      )}
      {extraContent}
    </div>
  )
}
